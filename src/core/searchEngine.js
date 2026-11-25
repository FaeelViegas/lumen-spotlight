import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { rankAndFilterResults } from './ranking.js';

/**
 * Coordenador central de busca (SearchEngine).
 * Gerencia debounce configurável (30-60 ms), cancelamento automático de buscas obsoletas
 * via `Gio.Cancellable`, execução imediata de provedores em memória (< 50 ms) e
 * atualização progressiva quando provedores assíncronos de I/O (arquivos/rede) finalizam.
 */
export class SearchEngine {
    constructor(settingsManager, usageTracker, pluginManager) {
        this._settings = settingsManager;
        this._usageTracker = usageTracker;
        this._pluginManager = pluginManager;
        this._fastProviders = [];
        this._asyncProviders = [];
        this._activeCancellable = null;
        this._debounceTimeoutId = 0;
        this._searchGeneration = 0;
    }

    registerProvider(provider, { isAsyncIO = false } = {}) {
        if (isAsyncIO)
            this._asyncProviders.push(provider);
        else
            this._fastProviders.push(provider);
    }

    cancelCurrentSearch() {
        if (this._debounceTimeoutId !== 0) {
            GLib.Source.remove(this._debounceTimeoutId);
            this._debounceTimeoutId = 0;
        }
        if (this._activeCancellable) {
            this._activeCancellable.cancel();
            this._activeCancellable = null;
        }
    }

    /**
     * Dispara uma busca para o texto informado, emitindo primeiros resultados rápidos
     * imediatamente e resultados assíncronos após o debounce de 30-60ms.
     *
     * @param {string} rawQuery Texto digitado pelo usuário
     * @param {(results: Array<object>, meta: { isPartial: boolean, elapsedMs: number }) => void} onResultsCallback
     */
    search(rawQuery, onResultsCallback) {
        this.cancelCurrentSearch();
        const query = (rawQuery || '').trim();
        const generation = ++this._searchGeneration;

        if (!query) {
            onResultsCallback([], { isPartial: false, elapsedMs: 0 });
            return;
        }

        const startUs = GLib.get_monotonic_time();
        const cancellable = new Gio.Cancellable();
        this._activeCancellable = cancellable;

        const maxResults = this._settings.getMaxResults();
        const usageStats = this._usageTracker.getStats();

        // Verifica se a consulta usa um prefixo exclusivo (ex.: `:emoji`, `;snippet`, `g busca`)
        const allProviders = [
            ...this._fastProviders,
            ...this._asyncProviders,
            ...this._pluginManager.getPlugins(),
        ];

        const exclusivePrefixProviders = allProviders.filter(
            p => p.prefix && query.toLowerCase().startsWith(p.prefix.toLowerCase())
        );

        const activeFast = exclusivePrefixProviders.length > 0
            ? this._fastProviders.filter(p => exclusivePrefixProviders.includes(p))
            : this._fastProviders.filter(p => p.matchesQuery(query));

        const activeAsync = exclusivePrefixProviders.length > 0
            ? [
                ...this._asyncProviders.filter(p => exclusivePrefixProviders.includes(p)),
                ...this._pluginManager.getPlugins().filter(p => exclusivePrefixProviders.includes(p)),
            ]
            : [
                ...this._asyncProviders.filter(p => p.matchesQuery(query)),
                ...this._pluginManager.getPlugins().filter(p => p.matchesQuery(query)),
            ];

        // Fase 1: Provedores rápidos em memória (< 50 ms garantidos)
        Promise.all(
            activeFast.map(p =>
                p.search(query, cancellable).catch(err => {
                    if (!cancellable.is_cancelled())
                        console.warn(`[Lumen] Erro no provedor rápido ${p.id}:`, err);
                    return [];
                })
            )
        ).then(fastArrays => {
            if (cancellable.is_cancelled() || generation !== this._searchGeneration)
                return;

            const fastFlat = fastArrays.flat();
            const rankedFast = rankAndFilterResults(fastFlat, query, usageStats, maxResults * 2);
            const elapsedFastMs = (GLib.get_monotonic_time() - startUs) / 1000;

            const hasPendingAsync = activeAsync.length > 0;
            onResultsCallback(rankedFast.slice(0, maxResults), {
                isPartial: hasPendingAsync,
                elapsedMs: elapsedFastMs,
            });

            if (!hasPendingAsync)
                return;

            // Fase 2: Debounce de 30-60 ms para provedores pesados (Arquivos, Rede, Plugins)
            const debounceMs = this._settings.getDebounceMs();
            this._debounceTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                debounceMs,
                () => {
                    this._debounceTimeoutId = 0;
                    if (cancellable.is_cancelled() || generation !== this._searchGeneration)
                        return GLib.SOURCE_REMOVE;

                    Promise.all(
                        activeAsync.map(p =>
                            p.search(query, cancellable).catch(err => {
                                if (!cancellable.is_cancelled())
                                    console.warn(`[Lumen] Erro no provedor assíncrono ${p.id}:`, err);
                                return [];
                            })
                        )
                    ).then(asyncArrays => {
                        if (cancellable.is_cancelled() || generation !== this._searchGeneration)
                            return;

                        const combined = [...fastFlat, ...asyncArrays.flat()];
                        const finalRanked = rankAndFilterResults(
                            combined,
                            query,
                            usageStats,
                            maxResults
                        );
                        const totalElapsedMs = (GLib.get_monotonic_time() - startUs) / 1000;
                        onResultsCallback(finalRanked, {
                            isPartial: false,
                            elapsedMs: totalElapsedMs,
                        });
                    });

                    return GLib.SOURCE_REMOVE;
                }
            );
        });
    }

    destroy() {
        this.cancelCurrentSearch();
        for (const p of this._fastProviders)
            p.destroy?.();
        for (const p of this._asyncProviders)
            p.destroy?.();
        this._fastProviders = [];
        this._asyncProviders = [];
    }
}
