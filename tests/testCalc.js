import { evaluateMathExpression } from '../src/providers/calc.js';

export function runCalculatorTests(assert, assertEqual) {
    assertEqual(evaluateMathExpression('2^10 + sqrt(144)'), 1036, 'Deve avaliar potência e raiz quadrada');
    assertEqual(evaluateMathExpression('15% de 800'), 120, 'Deve avaliar porcentagem natural em português');
    assertEqual(evaluateMathExpression('20% of 450'), 90, 'Deve avaliar porcentagem natural em inglês');
    assertEqual(evaluateMathExpression('(10 + 5) * 3 - 9 / 3'), 42, 'Deve respeitar precedência e parênteses');
    assertEqual(evaluateMathExpression('0.1 + 0.2'), 0.3, 'Deve corrigir imprecisão de ponto flutuante IEEE 754');
    assertEqual(evaluateMathExpression('3,5 * 2'), 7, 'Deve suportar vírgula decimal padrão pt-BR');
    assertEqual(evaluateMathExpression('cos(0) + ln(e)'), 2, 'Deve suportar funções trigonométricas e constantes');
    assertEqual(evaluateMathExpression('10 / 0'), null, 'Divisão por zero deve retornar null com segurança');
    assertEqual(evaluateMathExpression('42'), null, 'Número isolado sem operador não deve acionar calculadora');
    assertEqual(evaluateMathExpression('import("fs")'), null, 'Tentativa de injeção de código deve retornar null');
}
