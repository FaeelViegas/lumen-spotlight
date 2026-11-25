import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { BaseProvider } from './baseProvider.js';

/**
 * Tabelas de conversão de unidades físicas (comprimento, massa, volume, dados, velocidade, área, tempo)
 * e moedas (com cache offline em GSettings e atualização opcional).
 */

const UNIT_ALIASES = {
    // Comprimento (base: metro)
    m: { group: 'length', factor: 1, label: 'm' },
    metro: { group: 'length', factor: 1, label: 'm' },
    metros: { group: 'length', factor: 1, label: 'm' },
    km: { group: 'length', factor: 1000, label: 'km' },
    quilometro: { group: 'length', factor: 1000, label: 'km' },
    quilometros: { group: 'length', factor: 1000, label: 'km' },
    cm: { group: 'length', factor: 0.01, label: 'cm' },
    centimetro: { group: 'length', factor: 0.01, label: 'cm' },
    centimetros: { group: 'length', factor: 0.01, label: 'cm' },
    mm: { group: 'length', factor: 0.001, label: 'mm' },
    mi: { group: 'length', factor: 1609.344, label: 'mi' },
    mile: { group: 'length', factor: 1609.344, label: 'mi' },
    miles: { group: 'length', factor: 1609.344, label: 'mi' },
    milha: { group: 'length', factor: 1609.344, label: 'mi' },
    milhas: { group: 'length', factor: 1609.344, label: 'mi' },
    ft: { group: 'length', factor: 0.3048, label: 'ft' },
    pe: { group: 'length', factor: 0.3048, label: 'ft' },
    pes: { group: 'length', factor: 0.3048, label: 'ft' },
    feet: { group: 'length', factor: 0.3048, label: 'ft' },
    in: { group: 'length', factor: 0.0254, label: 'in' },
    pol: { group: 'length', factor: 0.0254, label: 'in' },
    polegada: { group: 'length', factor: 0.0254, label: 'in' },
    polegadas: { group: 'length', factor: 0.0254, label: 'in' },
    yd: { group: 'length', factor: 0.9144, label: 'yd' },

    // Massa (base: grama)
    g: { group: 'mass', factor: 1, label: 'g' },
    grama: { group: 'mass', factor: 1, label: 'g' },
    gramas: { group: 'mass', factor: 1, label: 'g' },
    kg: { group: 'mass', factor: 1000, label: 'kg' },
    quilo: { group: 'mass', factor: 1000, label: 'kg' },
    quilos: { group: 'mass', factor: 1000, label: 'kg' },
    mg: { group: 'mass', factor: 0.001, label: 'mg' },
    lb: { group: 'mass', factor: 453.59237, label: 'lb' },
    lbs: { group: 'mass', factor: 453.59237, label: 'lb' },
    libra: { group: 'mass', factor: 453.59237, label: 'lb' },
    libras: { group: 'mass', factor: 453.59237, label: 'lb' },
    oz: { group: 'mass', factor: 28.349523125, label: 'oz' },
    onca: { group: 'mass', factor: 28.349523125, label: 'oz' },
    oncas: { group: 'mass', factor: 28.349523125, label: 'oz' },

    // Volume (base: litro)
    l: { group: 'volume', factor: 1, label: 'L' },
    litro: { group: 'volume', factor: 1, label: 'L' },
    litros: { group: 'volume', factor: 1, label: 'L' },
    ml: { group: 'volume', factor: 0.001, label: 'mL' },
    gal: { group: 'volume', factor: 3.785411784, label: 'gal' },
    galao: { group: 'volume', factor: 3.785411784, label: 'gal' },
    galoes: { group: 'volume', factor: 3.785411784, label: 'gal' },

    // Dados digitais (base: byte)
    b: { group: 'data', factor: 1, label: 'B' },
    byte: { group: 'data', factor: 1, label: 'B' },
    bytes: { group: 'data', factor: 1, label: 'B' },
    kb: { group: 'data', factor: 1024, label: 'KB' },
    mb: { group: 'data', factor: 1024 ** 2, label: 'MB' },
    gb: { group: 'data', factor: 1024 ** 3, label: 'GB' },
    tb: { group: 'data', factor: 1024 ** 4, label: 'TB' },

    // Temperatura
    c: { group: 'temp', code: 'C', label: '°C' },
    celsius: { group: 'temp', code: 'C', label: '°C' },
    f: { group: 'temp', code: 'F', label: '°F' },
    fahrenheit: { group: 'temp', code: 'F', label: '°F' },
    k: { group: 'temp', code: 'K', label: 'K' },
    kelvin: { group: 'temp', code: 'K', label: 'K' },
};

const DEFAULT_CURRENCY_RATES = {
    USD: 1.0,
    BRL: 5.65,
    EUR: 0.92,
    GBP: 0.78,
    JPY: 152.4,
    CAD: 1.38,
    AUD: 1.51,
    CHF: 0.87,
    ARS: 985.0,
    BTC: 0.0000148,
};

const CURRENCY_ALIASES = {
    usd: 'USD',
    dolar: 'USD',
    dolares: 'USD',
    brl: 'BRL',
    real: 'BRL',
    reais: 'BRL',
    eur: 'EUR',
    euro: 'EUR',
    euros: 'EUR',
    gbp: 'GBP',
    libraesterlina: 'GBP',
    jpy: 'JPY',
    iene: 'JPY',
    ienes: 'JPY',
    cad: 'CAD',
    aud: 'AUD',
    chf: 'CHF',
    ars: 'ARS',
    peso: 'ARS',
    pesos: 'ARS',
    btc: 'BTC',
    bitcoin: 'BTC',
};

function normalizeUnitToken(tok) {
    return String(tok || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^°/, '')
        .toLowerCase()
        .trim();
}

function convertTemperature(value, fromCode, toCode) {
    if (fromCode === toCode)
        return value;

    let celsius = value;
    if (fromCode === 'F')
        celsius = (value - 32) * (5 / 9);
    else if (fromCode === 'K')
        celsius = value - 273.15;

    if (toCode === 'C')
        return celsius;
    if (toCode === 'F')
        return celsius * (9 / 5) + 32;
    if (toCode === 'K')
        return celsius + 273.15;
    return null;
}

/**
 * Executa a conversão de uma expressão como `10 km em milhas`, `100 usd em brl` ou `100 c to f`.
 *
 * @param {string} rawQuery
 * @param {Record<string, number>} [currencyRates]
 * @returns {{ value: number, formatted: string, fromLabel: string, toLabel: string, isCurrency: boolean, rateInfo?: string } | null}
 */
export function evaluateConversion(rawQuery, currencyRates = DEFAULT_CURRENCY_RATES) {
    const cleaned = String(rawQuery || '').trim();
    const match = cleaned.match(
        /^([+-]?\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ÿ°]+)\s+(?:em|para|in|to)\s+([a-zA-ZÀ-ÿ°]+)$/i
    );
    if (!match)
        return null;

    const amount = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(amount))
        return null;

    const fromKey = normalizeUnitToken(match[2]);
    const toKey = normalizeUnitToken(match[3]);

    // 1. Verifica moedas
    const fromCurr = CURRENCY_ALIASES[fromKey];
    const toCurr = CURRENCY_ALIASES[toKey];
    if (fromCurr && toCurr) {
        const rates = { ...DEFAULT_CURRENCY_RATES, ...(currencyRates || {}) };
        const rFrom = rates[fromCurr];
        const rTo = rates[toCurr];
        if (!rFrom || !rTo)
            return null;

        const inUsd = amount / rFrom;
        const resultValue = inUsd * rTo;
        const decimals = toCurr === 'BTC' ? 6 : 2;
        const formatted = `${resultValue.toFixed(decimals)} ${toCurr}`;
        const unitRate = (1 / rFrom) * rTo;

        return {
            value: Number(resultValue.toFixed(decimals)),
            formatted,
            fromLabel: `${amount} ${fromCurr}`,
            toLabel: toCurr,
            isCurrency: true,
            rateInfo: `1 ${fromCurr} = ${unitRate.toFixed(decimals === 6 ? 6 : 4)} ${toCurr}`,
        };
    }

    // 2. Verifica unidades físicas
    const fromUnit = UNIT_ALIASES[fromKey];
    const toUnit = UNIT_ALIASES[toKey];
    if (!fromUnit || !toUnit || fromUnit.group !== toUnit.group)
        return null;

    let resultValue;
    if (fromUnit.group === 'temp') {
        resultValue = convertTemperature(amount, fromUnit.code, toUnit.code);
    } else {
        const baseValue = amount * fromUnit.factor;
        resultValue = baseValue / toUnit.factor;
    }

    if (resultValue === null || !Number.isFinite(resultValue))
        return null;

    const rounded = Number(resultValue.toFixed(4));
    return {
        value: rounded,
        formatted: `${rounded} ${toUnit.label}`,
        fromLabel: `${amount} ${fromUnit.label}`,
        toLabel: toUnit.label,
        isCurrency: false,
    };
}

export class ConverterProvider extends BaseProvider {
    constructor(settingsManager, copyToClipboardCallback) {
        super('converter', 'Conversor de Unidades e Moedas', null);
        this._settings = settingsManager;
        this._copyCallback = copyToClipboardCallback;
        this._rates = { ...DEFAULT_CURRENCY_RATES };
        this._updatedAt = 0;
        this._loadCache();
    }

    _loadCache() {
        try {
            const raw = this._settings.raw.get_string('currency-rates-cache');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.rates === 'object') {
                this._rates = { ...DEFAULT_CURRENCY_RATES, ...parsed.rates };
                this._updatedAt = parsed.updatedAt || 0;
            }
        } catch {
            this._rates = { ...DEFAULT_CURRENCY_RATES };
        }
    }

    /**
     * Atualiza taxas de câmbio em segundo plano apenas se `enable-online-currency` (Opt-in) estiver ativo.
     */
    async refreshRatesOnlineIfEnabled() {
        if (!this._settings.getEnableOnlineCurrency())
            return;

        // Evita atualizar mais de uma vez a cada 6 horas
        if (Date.now() - this._updatedAt < 6 * 3600 * 1000)
            return;

        try {
            const proc = Gio.Subprocess.new(
                ['curl', '-fsSL', '--max-time', '4', 'https://open.er-api.com/v6/latest/USD'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.communicate_utf8_async(null, null, (source, res) => {
                try {
                    const [ok, stdout] = source.communicate_utf8_finish(res);
                    if (!ok || !stdout)
                        return;
                    const data = JSON.parse(stdout);
                    if (data && typeof data.rates === 'object') {
                        this._rates = { ...this._rates, ...data.rates };
                        this._updatedAt = Date.now();
                        this._settings.raw.set_string(
                            'currency-rates-cache',
                            JSON.stringify({
                                updatedAt: this._updatedAt,
                                base: 'USD',
                                rates: this._rates,
                            })
                        );
                    }
                } catch {
                    // Mantém cache offline silenciosamente
                }
            });
        } catch {
            // Ignora caso curl não esteja presente
        }
    }

    async search(query, cancellable) {
        if (cancellable?.is_cancelled())
            return [];

        const conv = evaluateConversion(query, this._rates);
        if (!conv)
            return [];

        if (conv.isCurrency && this._settings.getEnableOnlineCurrency())
            this.refreshRatesOnlineIfEnabled();

        const modeBadge = conv.isCurrency
            ? (this._settings.getEnableOnlineCurrency() ? 'Cotação Online + Cache' : 'Cache Offline Local')
            : 'Conversão Exata';

        return [
            {
                id: 'convert:inline',
                providerId: this.id,
                category: 'converter',
                categoryLabel: 'Conversor',
                title: `${conv.fromLabel} = ${conv.formatted}`,
                subtitle: `${conv.rateInfo ? `${conv.rateInfo} • ` : ''}${modeBadge} • Enter copia`,
                iconName: 'view-refresh-symbolic',
                clipboardText: String(conv.value),
                explicitScore: 1340,
                preview: {
                    type: 'converter',
                    title: conv.formatted,
                    subtitle: `De ${conv.fromLabel}`,
                    metadata: [
                        { label: 'Valor Numérico', value: String(conv.value) },
                        { label: 'Modo', value: modeBadge },
                        ...(conv.rateInfo ? [{ label: 'Taxa Aplicada', value: conv.rateInfo }] : []),
                    ],
                },
                onActivate: () => {
                    this._copyCallback?.(String(conv.value));
                },
            },
        ];
    }
}
