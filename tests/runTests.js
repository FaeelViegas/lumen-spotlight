import { runRankingTests } from './testRanking.js';
import { runCalculatorTests } from './testCalc.js';
import { runConverterTests } from './testConvert.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        print(`  ✅ PASS: ${message}`);
    } else {
        failed++;
        printerr(`  ❌ FAIL: ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    if (actual === expected) {
        passed++;
        print(`  ✅ PASS: ${message} (${JSON.stringify(actual)})`);
    } else {
        failed++;
        printerr(`  ❌ FAIL: ${message} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
    }
}

print('====================================================');
print('  Lumen Spotlight — Suíte de Testes Unitários (GJS)');
print('====================================================');

print('\n[1/3] Testando Motor de Ranking Fuzzy & Filtros...');
runRankingTests(assert, assertEqual);

print('\n[2/3] Testando Parser recursivo da Calculadora...');
runCalculatorTests(assert, assertEqual);

print('\n[3/3] Testando Conversor de Unidades e Moedas...');
runConverterTests(assert, assertEqual);

print('\n----------------------------------------------------');
print(`Resumo: ${passed} aprovados, ${failed} falharam.`);
print('----------------------------------------------------');

if (failed > 0)
    imports.system.exit(1);
