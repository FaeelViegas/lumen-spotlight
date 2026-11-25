import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import { BaseProvider } from './baseProvider.js';
import { computeFuzzyMatch } from '../core/ranking.js';

/**
 * Provedor de Aplicativos (.desktop nativos, Flatpak e Snap).
 * Mantém índice em memória atualizado via sinal `installed-changed` do `Shell.AppSystem`,
 * garantindo resposta em < 5 ms por tecla digitada.
 */
export class AppsProvider extends BaseProvider {
    constructor() {
        super('apps', 'Aplicativos', null);
        this._appSystem = Shell.AppSystem.get_default();
        this._cachedApps = [];
        this._installedChangedId = this._appSystem.connect('installed-changed', () => {
            this._rebuildCache();
        });
        this._rebuildCache();
    }

    _detectOriginBadge(desktopId, filename) {
        if (!filename)
            return '';
        if (filename.includes('/flatpak/'))
            return 'Flatpak';
        if (filename.includes('/snapd/') || filename.startsWith('/var/lib/snapd'))
            return 'Snap';
        return '';
    }

    _rebuildCache() {
        const appInfos = Gio.AppInfo.get_all();
        const entries = [];

        for (const appInfo of appInfos) {
            if (!appInfo.should_show())
                continue;

            const id = appInfo.get_id();
            const name = appInfo.get_display_name() || appInfo.get_name() || id;
            const description = appInfo.get_description() || '';
            const filename = typeof appInfo.get_filename === 'function' ? appInfo.get_filename() : '';
            const keywords = typeof appInfo.get_keywords === 'function' ? (appInfo.get_keywords() || []) : [];
            const genericName = typeof appInfo.get_generic_name === 'function' ? (appInfo.get_generic_name() || '') : '';
            const origin = this._detectOriginBadge(id, filename);

            entries.push({
                id: `app:${id}`,
                desktopId: id,
                title: name,
                subtitle: origin ? `${origin} • ${description || genericName || id}` : (description || genericName || id),
                keywords: [...keywords, genericName, id.replace(/\.desktop$/i, '')].filter(Boolean),
                gicon: appInfo.get_icon(),
                iconName: 'application-x-executable-symbolic',
                filename,
                origin,
                appInfo,
            });
        }

        this._cachedApps = entries;
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const results = [];
        for (const entry of this._cachedApps) {
            const titleMatch = computeFuzzyMatch(query, entry.title);
            const kwMatch = computeFuzzyMatch(query, entry.keywords.join(' '));
            if (titleMatch.score <= 0 && kwMatch.score <= 0)
                continue;

            results.push({
                id: entry.id,
                providerId: this.id,
                category: 'apps',
                categoryLabel: 'Aplicativos',
                title: entry.title,
                subtitle: entry.subtitle,
                keywords: entry.keywords,
                gicon: entry.gicon,
                iconName: entry.iconName,
                clipboardText: entry.filename || entry.desktopId,
                preview: {
                    type: 'app',
                    title: entry.title,
                    subtitle: entry.origin || 'Aplicativo do Sistema',
                    description: entry.subtitle,
                    gicon: entry.gicon,
                    metadata: [
                        { label: 'ID Desktop', value: entry.desktopId },
                        { label: 'Origem', value: entry.origin || 'Pacote do Sistema (.deb)' },
                        ...(entry.filename ? [{ label: 'Arquivo', value: entry.filename }] : []),
                    ],
                },
                onActivate: () => {
                    const shellApp = this._appSystem.lookup_app(entry.desktopId);
                    if (shellApp)
                        shellApp.activate();
                    else
                        entry.appInfo.launch([], null);
                },
                onCtrlActivate: () => {
                    if (entry.filename) {
                        const parent = Gio.File.new_for_path(entry.filename).get_parent();
                        if (parent)
                            Gio.AppInfo.launch_default_for_uri(parent.get_uri(), null);
                    }
                },
            });
        }

        return results;
    }

    destroy() {
        if (this._installedChangedId && this._appSystem) {
            this._appSystem.disconnect(this._installedChangedId);
            this._installedChangedId = 0;
        }
        this._cachedApps = [];
    }
}
