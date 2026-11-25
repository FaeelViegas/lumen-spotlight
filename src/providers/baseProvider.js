/**
 * Interface base para todos os provedores de busca do Lumen e de terceiros.
 * Define o contrato padrão:
 * - id: identificador único do provedor
 * - prefix: prefixo opcional de ativação exclusiva (ex.: ':', ';', 'g ')
 * - search(query, cancellable): retorna Promise<Array<ResultItem>>
 * - activate(result, modifiers): executa a ação principal ou secundária (Ctrl+Enter)
 */
export class BaseProvider {
    constructor(id, title, prefix = null) {
        this.id = id;
        this.title = title;
        this.prefix = prefix;
    }

    /**
     * Indica se este provedor deve responder à consulta atual.
     * @param {string} query
     * @returns {boolean}
     */
    matchesQuery(query) {
        if (!query || !query.trim())
            return false;
        if (!this.prefix)
            return true;
        return query.trim().toLowerCase().startsWith(this.prefix.toLowerCase());
    }

    /**
     * Executa a busca assíncrona respeitando cancelamento via Gio.Cancellable.
     * @param {string} _query
     * @param {import('gi://Gio').default.Cancellable} _cancellable
     * @returns {Promise<Array<object>>}
     */
    async search(_query, _cancellable) {
        return [];
    }

    /**
     * Ativa o resultado selecionado.
     * @param {object} result
     * @param {{ ctrlKey?: boolean, shiftKey?: boolean }} [modifiers]
     */
    activate(result, modifiers = {}) {
        if (modifiers.ctrlKey && typeof result.onCtrlActivate === 'function') {
            result.onCtrlActivate();
            return;
        }
        if (typeof result.onActivate === 'function')
            result.onActivate();
    }

    destroy() {
        // Implementado pelas subclasses que mantêm sinais, caches ou monitores
    }
}
