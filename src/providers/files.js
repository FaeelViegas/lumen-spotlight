import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { BaseProvider } from './baseProvider.js';
import { parseFileSearchQuery } from '../core/index.js';

/**
 * Formata bytes em representação legível (KB, MB, GB).
 */
export function formatFileSize(bytes) {
    if (!bytes || bytes <= 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const val = bytes / Math.pow(1024, i);
    return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

/**
 * Provedor de Arquivos e Pastas.
 * Utiliza `FileIndexManager` (SQLite FTS5 + LocalSearch CLI + FileMonitor) e suporta
 * filtros ricos: `kind:pdf`, `in:Documentos`, `modified:hoje`.
 */
export class FilesProvider extends BaseProvider {
    constructor(fileIndexManager) {
        super('files', 'Arquivos e Pastas', null);
        this._indexManager = fileIndexManager;
    }

    matchesQuery(query) {
        if (!query || query.trim().length < 2)
            return false;
        const trimmed = query.trim();
        if (trimmed.startsWith(':') || trimmed.startsWith(';'))
            return false;
        return true;
    }

    _resolveIconName(item) {
        if (item.isDir)
            return 'folder-symbolic';
        const mime = item.mimeType || '';
        if (mime.startsWith('image/'))
            return 'image-x-generic-symbolic';
        if (mime === 'application/pdf')
            return 'x-office-document-symbolic';
        if (mime.startsWith('audio/'))
            return 'audio-x-generic-symbolic';
        if (mime.startsWith('video/'))
            return 'video-x-generic-symbolic';
        if (mime.startsWith('text/'))
            return 'text-x-generic-symbolic';
        return 'text-x-generic-symbolic';
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const parsed = parseFileSearchQuery(query);
        const rawItems = await this._indexManager.search(query, 12, cancellable);
        if (cancellable?.is_cancelled())
            return [];

        const homeDir = GLib.get_home_dir();

        return rawItems.map((item, idx) => {
            const displayParent = item.parentDir.startsWith(homeDir)
                ? `~${item.parentDir.slice(homeDir.length)}`
                : item.parentDir;

            const subtitle = item.snippet
                ? `${displayParent} — "${item.snippet}"`
                : displayParent;

            const modifiedStr = item.mtime
                ? new Date(item.mtime * 1000).toLocaleString('pt-BR')
                : 'Desconhecido';

            return {
                id: `file:${item.path}`,
                providerId: this.id,
                category: 'files',
                categoryLabel: 'Arquivos e Pastas',
                title: item.name,
                subtitle,
                keywords: [item.ext, displayParent, parsed.term].filter(Boolean),
                iconName: this._resolveIconName(item),
                filePath: item.path,
                clipboardText: item.path,
                explicitScore: parsed.hasFileFilter ? 600 - idx * 10 : undefined,
                preview: {
                    type: 'file',
                    filePath: item.path,
                    mimeType: item.mimeType,
                    isDir: item.isDir,
                    title: item.name,
                    subtitle: displayParent,
                    snippet: item.snippet,
                    metadata: [
                        { label: 'Caminho', value: displayParent },
                        { label: 'Tipo', value: item.isDir ? 'Pasta' : (item.mimeType || item.ext) },
                        ...(!item.isDir ? [{ label: 'Tamanho', value: formatFileSize(item.size) }] : []),
                        { label: 'Modificado', value: modifiedStr },
                    ],
                },
                onActivate: () => {
                    const uri = Gio.File.new_for_path(item.path).get_uri();
                    Gio.AppInfo.launch_default_for_uri(uri, null);
                },
                onCtrlActivate: () => {
                    // Ctrl+Enter revela o arquivo selecionando-o no gerenciador de arquivos (org.freedesktop.FileManager1)
                    const uri = Gio.File.new_for_path(item.path).get_uri();
                    Gio.DBus.session.call(
                        'org.freedesktop.FileManager1',
                        '/org/freedesktop/FileManager1',
                        'org.freedesktop.FileManager1',
                        'ShowItems',
                        new GLib.Variant('(ass)', [[uri], '']),
                        null,
                        Gio.DBusCallFlags.NONE,
                        -1,
                        null,
                        (conn, res) => {
                            try {
                                conn.call_finish(res);
                            } catch {
                                const parent = Gio.File.new_for_path(item.path).get_parent();
                                if (parent)
                                    Gio.AppInfo.launch_default_for_uri(parent.get_uri(), null);
                            }
                        }
                    );
                },
            };
        });
    }
}
