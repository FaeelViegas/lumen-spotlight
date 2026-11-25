import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { BaseProvider } from './baseProvider.js';
import { computeFuzzyMatch } from '../core/ranking.js';

/**
 * Provedor de Histórico da Área de Transferência (Opt-in).
 * Respeita rigorosamente a privacidade:
 * - Desativado por padrão (`enable-clipboard-history = false`).
 * - Ignora cópias feitas quando a janela em foco pertence a um gerenciador de senhas
 *   listado em `clipboard-excluded-apps` (KeePassXC, Bitwarden, 1Password, Secrets, Seahorse).
 * - Mantém dados apenas em memória volátil da sessão e expõe comando rápido para limpar.
 */
export class ClipboardProvider extends BaseProvider {
    constructor(settingsManager, copyToClipboardCallback) {
        super('clipboard', 'Área de Transferência', null);
        this._settings = settingsManager;
        this._copyCallback = copyToClipboardCallback;
        this._history = [];
        this._pollTimerId = 0;
        this._lastSample = '';
        this._windowTracker = Shell.WindowTracker.get_default();

        this._settingsChangedId = this._settings.connectChanged('enable-clipboard-history', () => {
            this._syncPollingState();
        });
        this._syncPollingState();
    }

    _syncPollingState() {
        if (this._settings.getEnableClipboardHistory()) {
            this._startPolling();
        } else {
            this._stopPolling();
            this.clearHistory();
        }
    }

    _isFocusedAppExcluded() {
        try {
            const focusWindow = global.display.get_focus_window();
            if (!focusWindow)
                return false;

            const wmClass = (focusWindow.get_wm_class() || '').toLowerCase();
            const app = this._windowTracker.get_window_app(focusWindow);
            const appId = (app?.get_id() || '').toLowerCase();
            const excludedList = this._settings.getClipboardExcludedApps();

            return excludedList.some(pattern => {
                const p = pattern.toLowerCase();
                return wmClass.includes(p) || appId.includes(p);
            });
        } catch {
            return false;
        }
    }

    _startPolling() {
        if (this._pollTimerId !== 0)
            return;

        const clipboard = St.Clipboard.get_default();
        this._pollTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 2, () => {
            if (!this._settings.getEnableClipboardHistory())
                return GLib.SOURCE_REMOVE;

            if (this._isFocusedAppExcluded())
                return GLib.SOURCE_CONTINUE;

            clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clip, text) => {
                if (!text || typeof text !== 'string')
                    return;

                const trimmed = text.trim();
                if (!trimmed || trimmed === this._lastSample || trimmed.length > 4096)
                    return;

                this._lastSample = trimmed;
                this._addEntry(trimmed);
            });

            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopPolling() {
        if (this._pollTimerId !== 0) {
            GLib.Source.remove(this._pollTimerId);
            this._pollTimerId = 0;
        }
    }

    _addEntry(text) {
        this._history = this._history.filter(item => item.text !== text);
        this._history.unshift({
            text,
            timestamp: Date.now(),
        });

        const maxItems = this._settings.getClipboardMaxItems();
        if (this._history.length > maxItems)
            this._history.length = maxItems;
    }

    clearHistory() {
        this._history = [];
        this._lastSample = '';
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled() || !this._settings.getEnableClipboardHistory())
            return [];

        const qLower = query.trim().toLowerCase();
        const isGenericClipQuery =
            qLower.startsWith('clip') ||
            qLower.startsWith('copia') ||
            qLower.startsWith('area de transferencia') ||
            qLower.startsWith('hist');

        const results = [];

        if (isGenericClipQuery && this._history.length > 0) {
            results.push({
                id: 'clip:clear-all',
                providerId: this.id,
                category: 'clipboard',
                categoryLabel: 'Área de Transferência (Opt-in)',
                title: 'Limpar Histórico da Área de Transferência',
                subtitle: `Remove todos os ${this._history.length} itens armazenados em memória`,
                iconName: 'edit-clear-all-symbolic',
                clipboardText: '',
                explicitScore: 910,
                onActivate: () => this.clearHistory(),
            });
        }

        for (let i = 0; i < this._history.length; i++) {
            const entry = this._history[i];
            const oneLine = entry.text.replace(/\s+/g, ' ').slice(0, 95);
            const match = computeFuzzyMatch(query, entry.text);

            if (!isGenericClipQuery && match.score <= 0)
                continue;

            const timeStr = new Date(entry.timestamp).toLocaleTimeString('pt-BR');

            results.push({
                id: `clip:${i}`,
                providerId: this.id,
                category: 'clipboard',
                categoryLabel: 'Área de Transferência (Opt-in)',
                title: oneLine,
                subtitle: `Copiado às ${timeStr} • Enter copia novamente`,
                iconName: 'edit-paste-symbolic',
                clipboardText: entry.text,
                explicitScore: isGenericClipQuery ? 850 - i * 5 : undefined,
                preview: {
                    type: 'text',
                    title: 'Item da Área de Transferência',
                    subtitle: `Capturado às ${timeStr}`,
                    textContent: entry.text,
                    metadata: [
                        { label: 'Caracteres', value: String(entry.text.length) },
                        { label: 'Armazenamento', value: 'Somente RAM (Sessão Atual)' },
                    ],
                },
                onActivate: () => {
                    this._copyCallback?.(entry.text);
                },
            });
        }

        return results;
    }

    destroy() {
        this._stopPolling();
        this.clearHistory();
    }
}
