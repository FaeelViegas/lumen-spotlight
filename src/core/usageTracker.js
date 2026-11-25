import GLib from 'gi://GLib';

/**
 * Rastreia frequência e recência de itens acionados pelo usuário.
 * Utiliza gravação em lote assíncrona no GSettings para não realizar I/O síncrono
 * no momento da ativação do resultado.
 */
export class UsageTracker {
    constructor(settingsManager) {
        this._settingsManager = settingsManager;
        this._stats = this._loadStats();
        this._flushTimeoutId = 0;
    }

    _loadStats() {
        try {
            const raw = this._settingsManager.raw.get_string('usage-stats');
            const parsed = JSON.parse(raw);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch {
            return {};
        }
    }

    getStats() {
        return this._stats;
    }

    recordActivation(itemId) {
        if (!itemId)
            return;

        const current = this._stats[itemId] || { count: 0, lastUsed: 0 };
        this._stats[itemId] = {
            count: current.count + 1,
            lastUsed: Date.now(),
        };

        // Limita o dicionário aos 300 itens mais recentes para manter o GSettings enxuto
        const keys = Object.keys(this._stats);
        if (keys.length > 300) {
            keys.sort((a, b) => (this._stats[b].lastUsed || 0) - (this._stats[a].lastUsed || 0));
            for (const oldKey of keys.slice(300))
                delete this._stats[oldKey];
        }

        this._scheduleFlush();
    }

    clearStats() {
        this._stats = {};
        if (this._settingsManager?.raw)
            this._settingsManager.raw.set_string('usage-stats', '{}');
    }

    _scheduleFlush() {
        if (this._flushTimeoutId !== 0)
            return;

        this._flushTimeoutId = GLib.timeout_add(GLib.PRIORITY_LOW, 1500, () => {
            this._flushTimeoutId = 0;
            if (this._settingsManager?.raw)
                this._settingsManager.raw.set_string('usage-stats', JSON.stringify(this._stats));
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._flushTimeoutId !== 0) {
            GLib.Source.remove(this._flushTimeoutId);
            this._flushTimeoutId = 0;
        }
        if (this._settingsManager?.raw) {
            try {
                this._settingsManager.raw.set_string('usage-stats', JSON.stringify(this._stats));
            } catch {
                // Ignora erro caso o schema já tenha sido destruído
            }
        }
        this._settingsManager = null;
    }
}
