import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Gerenciador de plugins e provedores externos.
 * Permite tanto registro programático (via API global `global.lumenPluginRegistry`)
 * quanto carregamento automático de módulos ES (`*.js`) em `~/.local/share/lumen/plugins/`.
 *
 * Contrato de cada plugin:
 * {
 *   id: string,
 *   title?: string,
 *   prefix?: string | null,
 *   search(query, cancellable): Promise<Array<ResultItem>>,
 *   activate(result, modifiers): void,
 *   destroy?(): void
 * }
 */
export class PluginManager {
    constructor() {
        this._plugins = new Map();
    }

    registerPlugin(plugin) {
        if (!plugin || typeof plugin.id !== 'string' || typeof plugin.search !== 'function')
            throw new Error('Plugin inválido: precisa conter id (string) e search(query, cancellable)');

        const normalized = {
            id: plugin.id,
            title: plugin.title || plugin.id,
            prefix: plugin.prefix || null,
            matchesQuery(query) {
                if (!query || !query.trim())
                    return false;
                if (!this.prefix)
                    return true;
                return query.trim().toLowerCase().startsWith(this.prefix.toLowerCase());
            },
            search: plugin.search.bind(plugin),
            activate: typeof plugin.activate === 'function'
                ? plugin.activate.bind(plugin)
                : result => result?.onActivate?.(),
            destroy: typeof plugin.destroy === 'function'
                ? plugin.destroy.bind(plugin)
                : () => {},
        };

        this._plugins.set(normalized.id, normalized);
        return normalized.id;
    }

    unregisterPlugin(pluginId) {
        const existing = this._plugins.get(pluginId);
        if (existing) {
            try {
                existing.destroy();
            } catch (e) {
                console.warn(`[Lumen] Erro ao destruir plugin ${pluginId}:`, e);
            }
            this._plugins.delete(pluginId);
        }
    }

    getPlugins() {
        return Array.from(this._plugins.values());
    }

    /**
     * Carrega plugins em ES Modules presentes no diretório do usuário
     * `~/.local/share/lumen/plugins/`.
     */
    async loadUserPlugins() {
        const pluginDirPath = GLib.build_filenamev([
            GLib.get_user_data_dir(),
            'lumen',
            'plugins',
        ]);
        const dirFile = Gio.File.new_for_path(pluginDirPath);
        if (!dirFile.query_exists(null))
            return;

        try {
            const enumerator = await new Promise((resolve, reject) => {
                dirFile.enumerate_children_async(
                    'standard::name,standard::type',
                    Gio.FileQueryInfoFlags.NONE,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (source, res) => {
                        try {
                            resolve(source.enumerate_children_finish(res));
                        } catch (err) {
                            reject(err);
                        }
                    }
                );
            });

            while (true) {
                const infos = await new Promise((resolve, reject) => {
                    enumerator.next_files_async(16, GLib.PRIORITY_DEFAULT, null, (source, res) => {
                        try {
                            resolve(source.next_files_finish(res));
                        } catch (err) {
                            reject(err);
                        }
                    });
                });

                if (!infos || infos.length === 0)
                    break;

                for (const info of infos) {
                    const name = info.get_name();
                    if (!name.endsWith('.js'))
                        continue;

                    const fileUri = dirFile.get_child(name).get_uri();
                    try {
                        const mod = await import(fileUri);
                        const instance = typeof mod.createPlugin === 'function'
                            ? mod.createPlugin()
                            : mod.default;
                        if (instance)
                            this.registerPlugin(instance);
                    } catch (err) {
                        console.warn(`[Lumen] Falha ao carregar plugin ${name}:`, err);
                    }
                }
            }
        } catch (err) {
            console.warn('[Lumen] Erro ao listar diretório de plugins:', err);
        }
    }

    destroy() {
        for (const pluginId of Array.from(this._plugins.keys()))
            this.unregisterPlugin(pluginId);
        this._plugins.clear();
    }
}
