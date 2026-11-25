import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { BaseProvider } from './baseProvider.js';

/**
 * Provedor de Busca na Web com prefixos configuráveis (`g`, `ddg`, `yt`, `gh`, `wiki`).
 * Só é acionado quando o usuário digita explicitamente `<prefixo> <termo>`,
 * sinalizando claramente que abrirá o navegador externo.
 */
export class WebSearchProvider extends BaseProvider {
    constructor(settingsManager) {
        super('web', 'Busca na Web', null);
        this._settings = settingsManager;
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled() || !this._settings.getEnableWebSearch())
            return [];

        const trimmed = query.trim();
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx <= 0)
            return [];

        const prefix = trimmed.slice(0, spaceIdx).toLowerCase();
        const searchTerm = trimmed.slice(spaceIdx + 1).trim();
        if (!searchTerm)
            return [];

        const engines = this._settings.getWebSearchEngines();
        const engine = engines[prefix];
        if (!engine || !engine.url)
            return [];

        const encoded = encodeURIComponent(searchTerm);
        const targetUrl = engine.url.replace('%s', encoded);

        return [
            {
                id: `web:${prefix}:${searchTerm}`,
                providerId: this.id,
                category: 'web',
                categoryLabel: 'Busca na Web (Online)',
                title: `Buscar "${searchTerm}" no ${engine.name}`,
                subtitle: `[Online] Abre no navegador padrão • ${targetUrl}`,
                iconName: engine.icon || 'web-browser-symbolic',
                clipboardText: targetUrl,
                explicitScore: 1320,
                preview: {
                    type: 'web',
                    title: `${engine.name}: "${searchTerm}"`,
                    subtitle: 'Recurso Online Externo',
                    description: 'Esta ação abrirá o seu navegador padrão com a URL abaixo.',
                    metadata: [
                        { label: 'Provedor', value: engine.name },
                        { label: 'Prefixo', value: prefix },
                        { label: 'URL Destino', value: targetUrl },
                        { label: 'Privacidade', value: 'Nenhuma requisição enviada até pressionar Enter' },
                    ],
                },
                onActivate: () => {
                    Gio.AppInfo.launch_default_for_uri(targetUrl, null);
                },
            },
        ];
    }
}
