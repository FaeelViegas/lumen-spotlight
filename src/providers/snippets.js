import GLib from 'gi://GLib';

import { BaseProvider } from './baseProvider.js';
import { computeFuzzyMatch } from '../core/ranking.js';

/**
 * Expande variáveis dinâmicas de um snippet (`{{DATE_ISO}}`, `{{TIME}}`, `{{UUID}}`).
 */
export function expandSnippetVariables(template) {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString('pt-BR');
    return String(template || '')
        .replace(/\{\{DATE_ISO\}\}/g, isoDate)
        .replace(/\{\{TIME\}\}/g, timeStr)
        .replace(/\{\{UUID\}\}/g, () => GLib.uuid_string_random());
}

/**
 * Provedor de Snippets e Ações Rápidas personalizáveis (prefixo `;` ou busca direta).
 */
export class SnippetsProvider extends BaseProvider {
    constructor(settingsManager, copyToClipboardCallback) {
        super('snippets', 'Snippets e Ações Rápidas', null);
        this._settings = settingsManager;
        this._copyCallback = copyToClipboardCallback;
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const trimmed = query.trim();
        const isTriggerMode = trimmed.startsWith(';');
        const snippets = this._settings.getCustomSnippets();
        const results = [];

        for (let i = 0; i < snippets.length; i++) {
            const snip = snippets[i];
            if (!snip || !snip.title)
                continue;

            const trigger = snip.trigger || `;${snip.title.toLowerCase()}`;
            if (isTriggerMode && trimmed.length === 1) {
                results.push(this._buildItem(snip, trigger, 950 - i));
                continue;
            }

            const trigMatch = computeFuzzyMatch(trimmed, trigger);
            const titleMatch = computeFuzzyMatch(trimmed, snip.title);
            const best = Math.max(trigMatch.score, titleMatch.score);
            if (best > 0)
                results.push(this._buildItem(snip, trigger, isTriggerMode ? 800 + best : undefined));
        }

        return results;
    }

    _buildItem(snip, trigger, explicitScore) {
        const expanded = expandSnippetVariables(snip.content);
        const oneLine = expanded.replace(/\s+/g, ' ').slice(0, 80);

        return {
            id: `snippet:${trigger}`,
            providerId: this.id,
            category: 'snippets',
            categoryLabel: 'Snippets e Ações Rápidas',
            title: `${snip.title} (${trigger})`,
            subtitle: `${oneLine} • Enter copia para a área de transferência`,
            keywords: [trigger, snip.description || ''],
            iconName: 'insert-text-symbolic',
            clipboardText: expanded,
            explicitScore,
            preview: {
                type: 'text',
                title: snip.title,
                subtitle: `Gatilho: ${trigger}`,
                textContent: expanded,
                metadata: [
                    { label: 'Gatilho', value: trigger },
                    { label: 'Descrição', value: snip.description || 'Snippet personalizado' },
                ],
            },
            onActivate: () => {
                this._copyCallback?.(expandSnippetVariables(snip.content));
            },
        };
    }
}
