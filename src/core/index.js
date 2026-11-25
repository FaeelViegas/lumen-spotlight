import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Faz o parse de filtros inline da consulta de arquivos:
 * - `kind:pdf`, `kind:imagem`, `kind:pasta`, `kind:codigo`
 * - `in:Documentos`, `in:Downloads`
 * - `modified:hoje`, `modified:ontem`, `modified:semana`, `modified:mes`
 *
 * @param {string} rawQuery
 * @param {number} [nowSec]
 * @returns {{ term: string, kind: string|null, inDir: string|null, minMtime: number|null, hasFileFilter: boolean }}
 */
export function parseFileSearchQuery(rawQuery, nowSec = Math.floor(Date.now() / 1000)) {
    let kind = null;
    let inDir = null;
    let minMtime = null;
    let hasFileFilter = false;

    const remainingTokens = [];
    const tokens = String(rawQuery || '').trim().split(/\s+/);

    for (const token of tokens) {
        const lower = token.toLowerCase();
        if (lower.startsWith('kind:') && token.length > 5) {
            kind = token.slice(5);
            hasFileFilter = true;
        } else if (lower.startsWith('in:') && token.length > 3) {
            inDir = token.slice(3);
            hasFileFilter = true;
        } else if (lower.startsWith('modified:') && token.length > 9) {
            const period = lower.slice(9);
            hasFileFilter = true;
            if (period === 'hoje' || period === 'today')
                minMtime = nowSec - 86400;
            else if (period === 'ontem' || period === 'yesterday')
                minMtime = nowSec - 86400 * 2;
            else if (period === 'semana' || period === 'week' || period === '7d')
                minMtime = nowSec - 86400 * 7;
            else if (period === 'mes' || period === 'mês' || period === 'month' || period === '30d')
                minMtime = nowSec - 86400 * 30;
        } else {
            remainingTokens.push(token);
        }
    }

    return {
        term: remainingTokens.join(' ').trim(),
        kind,
        inDir,
        minMtime,
        hasFileFilter,
    };
}

/**
 * Motor híbrido de indexação e busca de arquivos:
 * 1. Mantém um subprocesso persistente Python3 (`indexerDaemon.py`) com SQLite FTS5 + WAL.
 * 2. Monitora os diretórios principais do usuário via `Gio.FileMonitor` para atualizar o índice em tempo real.
 * 3. Combina resultados com o `localsearch` (Tracker 3) quando disponível no sistema.
 */
export class FileIndexManager {
    constructor(settingsManager, extensionPath) {
        this._settings = settingsManager;
        this._extensionPath = extensionPath;
        this._subprocess = null;
        this._stdinStream = null;
        this._stdoutStream = null;
        this._pendingRequests = new Map();
        this._requestSeq = 0;
        this._monitors = [];
        this._syncTimerId = 0;
        this._isDestroyed = false;
    }

    start() {
        if (this._isDestroyed || this._subprocess)
            return;

        const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'lumen']);
        GLib.mkdir_with_parents(cacheDir, 0o755);
        const dbPath = GLib.build_filenamev([cacheDir, 'files-fts5.sqlite']);
        const daemonScript = GLib.build_filenamev([
            this._extensionPath,
            'src',
            'core',
            'indexerDaemon.py',
        ]);

        try {
            // Uso estrito de vetor de argumentos (sem shell) por segurança
            this._subprocess = Gio.Subprocess.new(
                ['python3', '-u', daemonScript, dbPath],
                Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_SILENCE
            );

            this._stdinStream = new Gio.DataOutputStream({
                base_stream: this._subprocess.get_stdin_pipe(),
            });
            this._stdoutStream = new Gio.DataInputStream({
                base_stream: this._subprocess.get_stdout_pipe(),
            });

            this._readLoop();
            this._setupFileMonitors();

            // Agenda indexação incremental em segundo plano após a inicialização da UI
            this._syncTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 2, () => {
                this._syncTimerId = 0;
                this.triggerBackgroundSync();
                return GLib.SOURCE_REMOVE;
            });
        } catch (err) {
            console.warn('[Lumen] Falha ao iniciar daemon SQLite FTS5:', err);
        }
    }

    _readLoop() {
        if (!this._stdoutStream || this._isDestroyed)
            return;

        this._stdoutStream.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
            try {
                const [lineBytes] = stream.read_line_finish_utf8(res);
                if (lineBytes === null)
                    return;

                const parsed = JSON.parse(lineBytes);
                const pending = this._pendingRequests.get(parsed.id);
                if (pending) {
                    this._pendingRequests.delete(parsed.id);
                    pending.resolve(parsed);
                }
            } catch {
                // Ignora linhas truncadas caso o processo esteja encerrando
            }

            if (!this._isDestroyed && this._stdoutStream)
                this._readLoop();
        });
    }

    _sendRequest(payload, cancellable = null) {
        if (!this._stdinStream || this._isDestroyed)
            return Promise.resolve({ ok: false, results: [] });

        const id = ++this._requestSeq;
        const message = JSON.stringify({ ...payload, id }) + '\n';

        return new Promise(resolve => {
            let cancelId = 0;
            if (cancellable) {
                cancelId = cancellable.connect(() => {
                    this._pendingRequests.delete(id);
                    resolve({ ok: false, cancelled: true, results: [] });
                });
            }

            this._pendingRequests.set(id, {
                resolve: response => {
                    if (cancellable && cancelId)
                        cancellable.disconnect(cancelId);
                    resolve(response);
                },
            });

            try {
                this._stdinStream.put_string(message, null);
                this._stdinStream.flush(null);
            } catch {
                this._pendingRequests.delete(id);
                resolve({ ok: false, results: [] });
            }
        });
    }

    triggerBackgroundSync() {
        if (this._isDestroyed)
            return;

        this._sendRequest({
            action: 'sync',
            directories: this._settings.getSearchDirectories(),
            excluded: this._settings.getExcludedDirectories(),
            includeContent: this._settings.getEnableFileContentSearch(),
        });
    }

    _setupFileMonitors() {
        this._clearMonitors();
        const roots = this._settings.getSearchDirectories();
        const userSpecialDirs = [
            GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS),
            GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD),
            GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP),
            GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES),
        ].filter(Boolean);

        const watchedPaths = new Set([...roots, ...userSpecialDirs]);

        for (const dirPath of watchedPaths) {
            try {
                const file = Gio.File.new_for_path(dirPath);
                if (!file.query_exists(null))
                    continue;

                const monitor = file.monitor_directory(
                    Gio.FileMonitorFlags.WATCH_MOVES,
                    null
                );
                const sigId = monitor.connect('changed', (_mon, changedFile, otherFile, eventType) => {
                    const path = changedFile?.get_path();
                    if (!path || path.split('/').some(part => part.startsWith('.')))
                        return;

                    if (
                        eventType === Gio.FileMonitorEvent.CREATED ||
                        eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                        eventType === Gio.FileMonitorEvent.MOVED_IN
                    ) {
                        this._sendRequest({
                            action: 'upsert',
                            path,
                            includeContent: this._settings.getEnableFileContentSearch(),
                        });
                    } else if (
                        eventType === Gio.FileMonitorEvent.DELETED ||
                        eventType === Gio.FileMonitorEvent.MOVED_OUT
                    ) {
                        this._sendRequest({ action: 'remove', path });
                    } else if (eventType === Gio.FileMonitorEvent.RENAMED && otherFile) {
                        this._sendRequest({ action: 'remove', path });
                        this._sendRequest({
                            action: 'upsert',
                            path: otherFile.get_path(),
                            includeContent: this._settings.getEnableFileContentSearch(),
                        });
                    }
                });

                this._monitors.push({ monitor, sigId });
            } catch {
                // Ignora diretórios sem permissão de monitoramento inotify
            }
        }
    }

    /**
     * Consulta complementar via `localsearch search` (Tracker 3) se disponível no sistema.
     */
    async _queryLocalSearchCLI(term, limit, cancellable) {
        if (!term || term.length < 3)
            return [];

        return new Promise(resolve => {
            try {
                const proc = Gio.Subprocess.new(
                    ['localsearch', 'search', '--disable-color', '-l', String(limit), term],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
                );

                proc.communicate_utf8_async(null, cancellable, (source, res) => {
                    try {
                        const [, stdout] = source.communicate_utf8_finish(res);
                        if (!stdout) {
                            resolve([]);
                            return;
                        }

                        const items = [];
                        for (const line of stdout.split('\n')) {
                            const trimmed = line.trim();
                            if (!trimmed.startsWith('file://'))
                                continue;
                            const file = Gio.File.new_for_uri(trimmed.split(/\s+/)[0]);
                            const path = file.get_path();
                            if (!path)
                                continue;
                            items.push({
                                path,
                                name: file.get_basename(),
                                parentDir: file.get_parent()?.get_path() || '',
                                ext: '',
                                isDir: false,
                                mtime: 0,
                                size: 0,
                                snippet: '',
                                mimeType: 'application/octet-stream',
                            });
                        }
                        resolve(items);
                    } catch {
                        resolve([]);
                    }
                });
            } catch {
                resolve([]);
            }
        });
    }

    async search(rawQuery, limit = 12, cancellable = null) {
        const parsed = parseFileSearchQuery(rawQuery);
        if (!parsed.term && !parsed.hasFileFilter)
            return [];

        const excludedExts =
            this._settings.getHideCodeFiles() && !parsed.kind
                ? this._settings.getExcludedFileExtensions()
                : [];
        const excludedSet = new Set(excludedExts.map(e => e.toLowerCase()));

        const [sqliteResp, trackerItems] = await Promise.all([
            this._sendRequest(
                {
                    action: 'search',
                    term: parsed.term,
                    kind: parsed.kind,
                    inDir: parsed.inDir,
                    minMtime: parsed.minMtime,
                    excludedExts,
                    limit,
                },
                cancellable
            ),
            parsed.hasFileFilter
                ? Promise.resolve([])
                : this._queryLocalSearchCLI(parsed.term, 8, cancellable),
        ]);

        const mergedMap = new Map();
        for (const item of sqliteResp?.results || [])
            mergedMap.set(item.path, item);

        for (const item of trackerItems) {
            const dotIdx = item.name.lastIndexOf('.');
            const ext = dotIdx >= 0 ? item.name.slice(dotIdx).toLowerCase() : '';
            if (excludedSet.size > 0 && excludedSet.has(ext))
                continue;
            if (!mergedMap.has(item.path))
                mergedMap.set(item.path, item);
        }

        return Array.from(mergedMap.values()).slice(0, limit);
    }

    _clearMonitors() {
        for (const { monitor, sigId } of this._monitors) {
            monitor.disconnect(sigId);
            monitor.cancel();
        }
        this._monitors = [];
    }

    destroy() {
        this._isDestroyed = true;
        if (this._syncTimerId !== 0) {
            GLib.Source.remove(this._syncTimerId);
            this._syncTimerId = 0;
        }
        this._clearMonitors();

        for (const [, pending] of this._pendingRequests)
            pending.resolve({ ok: false, results: [] });
        this._pendingRequests.clear();

        try {
            this._stdinStream?.close(null);
            this._stdoutStream?.close(null);
            this._subprocess?.force_exit();
        } catch {
            // Subprocesso já finalizado
        }
        this._subprocess = null;
        this._stdinStream = null;
        this._stdoutStream = null;
    }
}
