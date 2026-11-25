import { computeFuzzyMatch, rankAndFilterResults, normalizeText } from '../src/core/ranking.js';
import { parseFileSearchQuery } from '../src/core/index.js';

export function runRankingTests(assert, assertEqual) {
    assertEqual(normalizeText('Configurações de Áudio'), 'configuracoes de audio', 'Deve remover acentos na normalização');

    const exact = computeFuzzyMatch('firefox', 'Firefox');
    const prefix = computeFuzzyMatch('fire', 'Firefox Web Browser');
    const fuzzy = computeFuzzyMatch('fwb', 'Firefox Web Browser');
    const miss = computeFuzzyMatch('xyz', 'Firefox Web Browser');
    const noisy = computeFuzzyMatch('inso', 'Remmina Remote Desktop Client');

    assert(exact.score > prefix.score, 'Correspondência exata deve pontuar acima de prefixo');
    assert(prefix.score > fuzzy.score, 'Prefixo deve pontuar acima de subsequência fuzzy');
    assert(fuzzy.score > 0, 'Subsequência de iniciais deve retornar pontuação positiva');
    assertEqual(miss.score, 0, 'Consulta inexistente deve pontuar zero');
    assertEqual(noisy.score, 0, 'Consulta inso não deve casar com softwares sem relação como Remmina');

    const now = Date.now();
    const usageStats = {
        'app:frequent': { count: 25, lastUsed: now - 60000 },
        'app:rare': { count: 1, lastUsed: now - 86400000 * 30 },
    };

    const items = [
        { id: 'app:rare', category: 'apps', title: 'Terminal Antigo', subtitle: 'Emulador' },
        { id: 'app:frequent', category: 'apps', title: 'Terminal Principal', subtitle: 'Emulador' },
    ];

    const ranked = rankAndFilterResults(items, 'term', usageStats, 5);
    assertEqual(ranked.length, 2, 'Ambos os itens devem corresponder ao prefixo term');
    assertEqual(ranked[0].id, 'app:frequent', 'O item mais frequente e recente deve ficar no topo');

    // Teste de parser de filtros de arquivos (kind:, in:, modified:)
    const parsed = parseFileSearchQuery('relatorio anual kind:pdf in:Documentos modified:hoje', 1760900000);
    assertEqual(parsed.term, 'relatorio anual', 'Termo limpo deve extrair apenas as palavras de busca');
    assertEqual(parsed.kind, 'pdf', 'Filtro kind:pdf deve ser extraído');
    assertEqual(parsed.inDir, 'Documentos', 'Filtro in:Documentos deve ser extraído');
    assertEqual(parsed.minMtime, 1760900000 - 86400, 'Filtro modified:hoje deve subtrair 86400s');
    assertEqual(parsed.hasFileFilter, true, 'Deve sinalizar presença de filtro de arquivo');
}
