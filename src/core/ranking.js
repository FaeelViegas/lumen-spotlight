/**
 * Motor de busca fuzzy e cálculo de relevância (Spotlight Ranking Engine).
 * Combina correspondência exata, prefixo de palavra, subsequência fuzzy contínua,
 * frequência histórica e recência (decaimento exponencial).
 * Inclui filtro rigoroso de compacidade para evitar falsos positivos quando a
 * consulta tem >= 3 caracteres (ex.: impedir que "inso" case com "Remmina" ou "LibreOffice").
 */

export function normalizeText(text) {
    if (!text)
        return '';
    return String(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Calcula a pontuação de correspondência fuzzy entre uma consulta e um alvo textual.
 * Retorna 0 se todos os caracteres da consulta não aparecerem em ordem no alvo
 * ou se o espalhamento for muito alto (falso positivo).
 *
 * @param {string} rawQuery Consulta digitada pelo usuário
 * @param {string} rawTarget Texto candidato (ex.: título ou subtítulo)
 * @returns {{ score: number, matchedIndices: number[] }}
 */
export function computeFuzzyMatch(rawQuery, rawTarget) {
    const query = normalizeText(rawQuery);
    const target = normalizeText(rawTarget);

    if (!query || !target)
        return { score: 0, matchedIndices: [] };

    if (query === target) {
        return {
            score: 1000,
            matchedIndices: Array.from({ length: target.length }, (_, i) => i),
        };
    }

    if (target.startsWith(query)) {
        const lengthPenalty = Math.min(80, (target.length - query.length) * 1.5);
        return {
            score: 880 - lengthPenalty,
            matchedIndices: Array.from({ length: query.length }, (_, i) => i),
        };
    }

    // Verifica se alguma palavra interna começa exatamente com a consulta
    const words = target.split(/[\s\-_./]+/);
    let wordOffset = 0;
    for (const word of words) {
        if (!word)
            continue;
        const idx = target.indexOf(word, wordOffset);
        if (word.startsWith(query) && idx >= 0) {
            return {
                score: 760 - Math.min(60, idx * 2),
                matchedIndices: Array.from({ length: query.length }, (_, i) => idx + i),
            };
        }
        wordOffset = idx >= 0 ? idx + word.length : wordOffset;
    }

    // Substring exata contínua em qualquer posição (ex.: "relatorio" dentro de "meu_relatorio_2026.pdf")
    const substrIdx = target.indexOf(query);
    if (substrIdx >= 0 && query.length >= 2) {
        return {
            score: 640 - Math.min(80, substrIdx * 2),
            matchedIndices: Array.from({ length: query.length }, (_, i) => substrIdx + i),
        };
    }

    // Subsequência de iniciais de palavras (ex.: "fwb" -> "Firefox Web Browser")
    const wordStarts = [];
    for (let i = 0; i < target.length; i++) {
        if (i === 0 || /[\s\-_./]/.test(target[i - 1])) {
            if (!/[\s\-_./]/.test(target[i]))
                wordStarts.push(i);
        }
    }

    let initQIdx = 0;
    const initMatched = [];
    for (const wIdx of wordStarts) {
        if (initQIdx < query.length && target[wIdx] === query[initQIdx]) {
            initMatched.push(wIdx);
            initQIdx++;
        }
    }
    if (initQIdx === query.length && query.length >= 2) {
        return {
            score: 520 - Math.min(60, initMatched[0] * 2),
            matchedIndices: initMatched,
        };
    }

    // Subsequência fuzzy (pequenas abreviações de uma mesma palavra, ex.: "termnl" -> "terminal")
    let qIdx = 0;
    let score = 0;
    let consecutiveCount = 0;
    let maxConsecutive = 0;
    const matchedIndices = [];

    for (let tIdx = 0; tIdx < target.length && qIdx < query.length; tIdx++) {
        if (target[tIdx] === query[qIdx]) {
            matchedIndices.push(tIdx);

            const isStartOfString = tIdx === 0;
            const prevChar = tIdx > 0 ? target[tIdx - 1] : '';
            const isWordBoundary = isStartOfString || /[\s\-_./]/.test(prevChar);

            if (isStartOfString)
                score += 65;
            else if (isWordBoundary)
                score += 50;
            else if (consecutiveCount > 0)
                score += 35 + Math.min(25, consecutiveCount * 5);
            else
                score += 8;

            consecutiveCount++;
            if (consecutiveCount > maxConsecutive)
                maxConsecutive = consecutiveCount;
            qIdx++;
        } else {
            consecutiveCount = 0;
            if (matchedIndices.length > 0)
                score -= 2.5;
        }
    }

    if (qIdx < query.length)
        return { score: 0, matchedIndices: [] };

    const span = matchedIndices[matchedIndices.length - 1] - matchedIndices[0] + 1;
    const compactness = query.length / Math.max(1, span);

    // Filtro anti-ruído: para consultas de 3+ letras que não são substrings diretas nem iniciais,
    // exige alta compacidade (>= 0.65) e ao menos 2 letras consecutivas.
    if (query.length >= 3) {
        const isTightFuzzy = compactness >= 0.65 && maxConsecutive >= 2;
        if (!isTightFuzzy)
            return { score: 0, matchedIndices: [] };
    }

    const finalScore = Math.round(score * (0.5 + 0.5 * compactness));
    if (finalScore < 75)
        return { score: 0, matchedIndices: [] };

    return {
        score: finalScore,
        matchedIndices,
    };
}

const CATEGORY_WEIGHTS = {
    calculator: 260,
    converter: 250,
    snippets: 210,
    apps: 190,
    system: 185,
    windows: 175,
    files: 170,
    clipboard: 155,
    dictionary: 145,
    emoji: 125,
    web: 100,
    plugins: 130,
};

export function scoreResultItem(item, query, usageStats = {}, nowMs = Date.now()) {
    if (typeof item.explicitScore === 'number')
        return item.explicitScore;

    const titleMatch = computeFuzzyMatch(query, item.title || '');
    const keywordsText = Array.isArray(item.keywords) ? item.keywords.join(' ') : '';
    const keywordMatch = computeFuzzyMatch(query, keywordsText);

    // Só avalia o subtítulo completo para arquivos/snippets, evitando que descrições longas de apps gerem ruído
    const allowSubtitleMatch = item.category === 'files' || item.category === 'snippets';
    const subtitleMatch = allowSubtitleMatch
        ? computeFuzzyMatch(query, item.subtitle || '')
        : { score: 0 };

    const bestTextScore = Math.max(
        titleMatch.score,
        Math.round(keywordMatch.score * 0.8),
        Math.round(subtitleMatch.score * 0.65)
    );

    if (bestTextScore <= 0)
        return 0;

    const categoryBonus = CATEGORY_WEIGHTS[item.category] ?? 100;

    let usageBonus = 0;
    const stat = usageStats[item.id];
    if (stat && stat.count > 0) {
        const frequencyBoost = Math.min(180, Math.log2(stat.count + 1) * 45);
        const ageHours = Math.max(0, (nowMs - (stat.lastUsed || 0)) / (1000 * 3600));
        const recencyFactor = Math.exp(-ageHours / 72);
        const recencyBoost = Math.round(140 * recencyFactor);
        usageBonus = Math.round(frequencyBoost + recencyBoost);
    }

    return bestTextScore + categoryBonus + usageBonus + (item.priorityBoost || 0);
}

export function rankAndFilterResults(results, query, usageStats = {}, maxResults = 10) {
    const nowMs = Date.now();
    const scored = [];

    for (const item of results) {
        const score = scoreResultItem(item, query, usageStats, nowMs);
        if (score > 0)
            scored.push({ ...item, score });
    }

    scored.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });

    return scored.slice(0, maxResults);
}
