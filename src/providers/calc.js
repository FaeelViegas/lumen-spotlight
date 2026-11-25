import { BaseProvider } from './baseProvider.js';

/**
 * Avaliador matemático recursivo descendente seguro (Zero `eval` / Zero `Function`).
 * Suporta:
 * - Operadores: `+`, `-`, `*`, `/`, `%` (módulo ou porcentagem), `^` ou `**` (potência)
 * - Expressões em português/inglês: `15% de 800`, `20% of 450`
 * - Funções científicas: `sqrt`, `cbrt`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `log`, `ln`, `abs`, `round`, `floor`, `ceil`, `exp`
 * - Constantes: `pi`, `e`, `tau`, `phi`
 */

const CONSTANTS = {
    pi: Math.PI,
    'π': Math.PI,
    e: Math.E,
    tau: Math.PI * 2,
    phi: (1 + Math.sqrt(5)) / 2,
};

const FUNCTIONS = {
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    sin: x => Math.sin(x),
    cos: x => Math.cos(x),
    tan: x => Math.tan(x),
    asin: x => Math.asin(x),
    acos: x => Math.acos(x),
    atan: x => Math.atan(x),
    ln: Math.log,
    log: Math.log10,
    log2: Math.log2,
    abs: Math.abs,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    exp: Math.exp,
};

/**
 * Pré-processa expressões naturais como `15% de 800` ou números com vírgula decimal.
 */
function preprocessExpression(raw) {
    let expr = String(raw || '').trim();
    if (!expr)
        return '';

    // Converte "15% de 800" ou "15,5% de 800" em "((15/100)*(800))"
    const percentOfMatch = expr.match(/^([+-]?\d+(?:[.,]\d+)?)\s*%\s*(?:de|of)\s+(.+)$/i);
    if (percentOfMatch) {
        const pct = percentOfMatch[1].replace(',', '.');
        const rest = percentOfMatch[2].replace(/,/g, '.');
        return `((${pct} / 100) * (${rest}))`;
    }

    // Substitui vírgulas decimais quando cercadas por dígitos (ex.: 3,14 -> 3.14)
    expr = expr.replace(/(\d),(\d)/g, '$1.$2');
    expr = expr.replace(/\*\*/g, '^');
    expr = expr.replace(/×/g, '*').replace(/÷/g, '/');
    return expr;
}

function tokenizeMath(expr) {
    const tokens = [];
    let i = 0;

    while (i < expr.length) {
        const ch = expr[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }

        if (/\d|\./.test(ch)) {
            let numStr = '';
            let dotCount = 0;
            while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) {
                if (expr[i] === '.')
                    dotCount++;
                if (dotCount > 1)
                    return null;
                numStr += expr[i++];
            }
            const value = Number(numStr);
            if (!Number.isFinite(value))
                return null;
            tokens.push({ type: 'number', value });
            continue;
        }

        if (/[a-zA-Zπ]/.test(ch)) {
            let ident = '';
            while (i < expr.length && /[a-zA-Z0-9π]/.test(expr[i]))
                ident += expr[i++];
            tokens.push({ type: 'ident', value: ident.toLowerCase() });
            continue;
        }

        if ('+-*/^()%'.includes(ch)) {
            tokens.push({ type: 'op', value: ch });
            i++;
            continue;
        }

        return null;
    }

    return tokens;
}

/**
 * Avalia uma expressão matemática com segurança e retorna `number` ou `null` se inválida.
 * @param {string} rawInput
 * @returns {number | null}
 */
export function evaluateMathExpression(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw || raw.length > 160)
        return null;

    // Evita avaliar números puros isolados sem operadores nem funções
    const isSingleNumber = /^[+-]?\d+(?:[.,]\d+)?$/.test(raw);
    if (isSingleNumber)
        return null;

    const preprocessed = preprocessExpression(raw);
    const tokens = tokenizeMath(preprocessed);
    if (!tokens || tokens.length === 0)
        return null;

    let pos = 0;

    function peek() {
        return tokens[pos] || null;
    }

    function consume() {
        return tokens[pos++] || null;
    }

    function parseExpression() {
        let left = parseTerm();
        if (left === null)
            return null;

        while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
            const op = consume().value;
            const right = parseTerm();
            if (right === null)
                return null;
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    function parseTerm() {
        let left = parsePower();
        if (left === null)
            return null;

        while (
            peek() &&
            peek().type === 'op' &&
            (peek().value === '*' || peek().value === '/' || peek().value === '%')
        ) {
            const op = consume().value;
            const right = parsePower();
            if (right === null)
                return null;
            if (op === '*') {
                left *= right;
            } else if (op === '/') {
                if (right === 0)
                    return null;
                left /= right;
            } else {
                if (right === 0)
                    return null;
                left %= right;
            }
        }
        return left;
    }

    function parsePower() {
        const base = parseUnary();
        if (base === null)
            return null;

        if (peek() && peek().type === 'op' && peek().value === '^') {
            consume();
            const exponent = parsePower(); // Associativo à direita
            if (exponent === null)
                return null;
            return Math.pow(base, exponent);
        }
        return base;
    }

    function parseUnary() {
        if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
            const op = consume().value;
            const val = parseUnary();
            if (val === null)
                return null;
            return op === '-' ? -val : val;
        }
        return parsePostfix();
    }

    function parsePostfix() {
        let val = parsePrimary();
        if (val === null)
            return null;

        // Suporte a sufixo de porcentagem unário (ex.: `50%` = 0.5 quando não seguido por número)
        if (
            peek() &&
            peek().type === 'op' &&
            peek().value === '%' &&
            (!tokens[pos + 1] || tokens[pos + 1].type === 'op')
        ) {
            consume();
            val /= 100;
        }
        return val;
    }

    function parsePrimary() {
        const tok = peek();
        if (!tok)
            return null;

        if (tok.type === 'number') {
            consume();
            return tok.value;
        }

        if (tok.type === 'ident') {
            consume();
            if (Object.prototype.hasOwnProperty.call(CONSTANTS, tok.value))
                return CONSTANTS[tok.value];

            const fn = FUNCTIONS[tok.value];
            if (!fn)
                return null;

            const next = consume();
            if (!next || next.type !== 'op' || next.value !== '(')
                return null;

            const arg = parseExpression();
            if (arg === null)
                return null;

            const close = consume();
            if (!close || close.type !== 'op' || close.value !== ')')
                return null;

            return fn(arg);
        }

        if (tok.type === 'op' && tok.value === '(') {
            consume();
            const val = parseExpression();
            if (val === null)
                return null;
            const close = consume();
            if (!close || close.type !== 'op' || close.value !== ')')
                return null;
            return val;
        }

        return null;
    }

    const result = parseExpression();
    if (result === null || pos !== tokens.length || !Number.isFinite(result))
        return null;

    // Arredonda imprecisões de ponto flutuante IEEE 754 (ex.: 0.1 + 0.2 -> 0.3)
    return Number(result.toPrecision(12));
}

export function formatMathNumber(value) {
    if (!Number.isFinite(value))
        return '';
    if (Number.isInteger(value))
        return value.toString();
    return Number(value.toFixed(8)).toString();
}

export class CalculatorProvider extends BaseProvider {
    constructor(copyToClipboardCallback) {
        super('calculator', 'Calculadora', null);
        this._copyCallback = copyToClipboardCallback;
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const val = evaluateMathExpression(query);
        if (val === null)
            return [];

        const formatted = formatMathNumber(val);
        const localized = val.toLocaleString('pt-BR', { maximumFractionDigits: 8 });

        return [
            {
                id: 'calc:inline',
                providerId: this.id,
                category: 'calculator',
                categoryLabel: 'Calculadora',
                title: `= ${localized}`,
                subtitle: `${query.trim()} • Pressione Enter para copiar`,
                iconName: 'accessories-calculator-symbolic',
                clipboardText: formatted,
                explicitScore: 1350,
                preview: {
                    type: 'calculator',
                    title: localized,
                    subtitle: `Expressão: ${query.trim()}`,
                    metadata: [
                        { label: 'Padrão ( copiar )', value: formatted },
                        { label: 'Hexadecimal', value: Number.isInteger(val) && val >= 0 ? `0x${val.toString(16).toUpperCase()}` : 'N/A' },
                        { label: 'Binário', value: Number.isInteger(val) && val >= 0 && val <= 65535 ? `0b${val.toString(2)}` : 'N/A' },
                        { label: 'Notação Científica', value: val.toExponential(4) },
                    ],
                },
                onActivate: () => {
                    this._copyCallback?.(formatted);
                },
            },
        ];
    }
}
