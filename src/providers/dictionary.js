import { BaseProvider } from './baseProvider.js';
import { normalizeText } from '../core/ranking.js';

/**
 * Dicionário e tradutor rápido PT-BR <-> EN embutido (100% offline por padrão),
 * ativado com `def <termo>`, `dicionario <termo>`, `traduzir <termo>` ou `tr <termo>`.
 */
const BUILTIN_DICTIONARY = {
    algoritmo: {
        pos: 'substantivo masculino',
        def: 'Sequência finita de instruções bem definidas e não ambíguas para resolver um problema ou executar um cálculo.',
        en: 'algorithm',
    },
    assincrono: {
        pos: 'adjetivo',
        def: 'Que não ocorre ao mesmo tempo; em computação, operação que não bloqueia a thread principal enquanto aguarda conclusão.',
        en: 'asynchronous',
    },
    compilador: {
        pos: 'substantivo masculino',
        def: 'Programa que traduz código-fonte escrito em linguagem de alto nível para código de máquina ou bytecode.',
        en: 'compiler',
    },
    concorrencia: {
        pos: 'substantivo feminino',
        def: 'Propriedade de sistemas nos quais várias computações são executadas em períodos sobrepostos.',
        en: 'concurrency',
    },
    desempenho: {
        pos: 'substantivo masculino',
        def: 'Medida da eficiência, velocidade de resposta e uso de recursos de um sistema.',
        en: 'performance',
    },
    efemero: {
        pos: 'adjetivo',
        def: 'De curta duração; passageiro, transitório.',
        en: 'ephemeral',
    },
    heuristica: {
        pos: 'substantivo feminino',
        def: 'Método prático ou atalho mental usado para resolver problemas rapidamente quando uma solução ótima exata é custosa.',
        en: 'heuristic',
    },
    idempotente: {
        pos: 'adjetivo',
        def: 'Operação que pode ser aplicada múltiplas vezes sem alterar o resultado além da aplicação inicial.',
        en: 'idempotent',
    },
    latencia: {
        pos: 'substantivo feminino',
        def: 'Intervalo de tempo entre o estímulo de entrada e a resposta correspondente de um sistema.',
        en: 'latency',
    },
    paradigma: {
        pos: 'substantivo masculino',
        def: 'Modelo, padrão ou estrutura conceitual que orienta a prática de uma ciência ou estilo de programação.',
        en: 'paradigm',
    },
    resiliencia: {
        pos: 'substantivo feminino',
        def: 'Capacidade de um sistema ou indivíduo de se adaptar e recuperar-se rapidamente de falhas ou adversidades.',
        en: 'resilience',
    },
    ubiquo: {
        pos: 'adjetivo',
        def: 'Que está ou pode estar presente em todos os lugares ao mesmo tempo; onipresente.',
        en: 'ubiquitous',
    },
};

export class DictionaryProvider extends BaseProvider {
    constructor(settingsManager, copyToClipboardCallback) {
        super('dictionary', 'Dicionário e Tradução', null);
        this._settings = settingsManager;
        this._copyCallback = copyToClipboardCallback;
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const trimmed = query.trim();
        const match = trimmed.match(/^(?:def|define|dicionario|dicionário|tr|traduzir)\s+(.+)$/i);
        const termRaw = match ? match[1].trim() : trimmed;
        const termKey = normalizeText(termRaw);

        // Procura por chave direta em português ou equivalente em inglês
        let foundEntry = BUILTIN_DICTIONARY[termKey] ? { word: termRaw, ...BUILTIN_DICTIONARY[termKey] } : null;
        if (!foundEntry) {
            for (const [ptWord, data] of Object.entries(BUILTIN_DICTIONARY)) {
                if (normalizeText(data.en) === termKey) {
                    foundEntry = {
                        word: data.en,
                        pos: `inglês → português (${ptWord})`,
                        def: data.def,
                        en: ptWord,
                    };
                    break;
                }
            }
        }

        if (!foundEntry)
            return [];

        return [
            {
                id: `dict:${termKey}`,
                providerId: this.id,
                category: 'dictionary',
                categoryLabel: 'Dicionário e Tradução',
                title: `${foundEntry.word} (${foundEntry.pos}) — EN/PT: ${foundEntry.en}`,
                subtitle: foundEntry.def,
                iconName: 'accessories-dictionary-symbolic',
                clipboardText: `${foundEntry.word}: ${foundEntry.def}`,
                explicitScore: match ? 1280 : 790,
                preview: {
                    type: 'text',
                    title: foundEntry.word,
                    subtitle: `${foundEntry.pos} • Tradução: ${foundEntry.en}`,
                    textContent: foundEntry.def,
                    metadata: [
                        { label: 'Tradução', value: foundEntry.en },
                        { label: 'Fonte', value: 'Léxico Local Offline (Lumen)' },
                    ],
                },
                onActivate: () => {
                    this._copyCallback?.(foundEntry.def);
                },
            },
        ];
    }
}
