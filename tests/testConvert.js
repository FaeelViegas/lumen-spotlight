import { evaluateConversion } from '../src/providers/convert.js';

export function runConverterTests(assert, assertEqual) {
    const kmToMi = evaluateConversion('10 km em milhas');
    assert(kmToMi !== null, 'Deve converter 10 km em milhas');
    assert(Math.abs(kmToMi.value - 6.2137) < 0.001, '10 km deve ser aproximadamente 6.2137 mi');

    const cToF = evaluateConversion('100 c em f');
    assert(cToF !== null, 'Deve converter 100 °C em °F');
    assertEqual(cToF.value, 212, '100 °C deve ser exatamente 212 °F');

    const gbToMb = evaluateConversion('2 gb em mb');
    assert(gbToMb !== null, 'Deve converter 2 GB em MB');
    assertEqual(gbToMb.value, 2048, '2 GB deve ser 2048 MB');

    const customRates = { USD: 1.0, BRL: 5.5, EUR: 0.9 };
    const usdToBrl = evaluateConversion('100 usd em brl', customRates);
    assert(usdToBrl !== null && usdToBrl.isCurrency, 'Deve converter 100 USD em BRL');
    assertEqual(usdToBrl.value, 550, '100 USD a 5.50 deve resultar em 550 BRL');

    const invalid = evaluateConversion('10 km em litros');
    assertEqual(invalid, null, 'Unidades de grandezas incompatíveis devem retornar null');
}
