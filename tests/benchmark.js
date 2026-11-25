import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { rankAndFilterResults } from '../src/core/ranking.js';
import { evaluateMathExpression } from '../src/providers/calc.js';
import { evaluateConversion } from '../src/providers/convert.js';

/**
 * Script de medição empírica de desempenho (Benchmark) para comprovar as metas:
 * - Ranking + Provedores em Memória (250 apps/comandos simulados): meta < 50 ms
 * - Busca no Daemon SQLite FTS5 (1.000 arquivos indexados): meta < 150 ms
 */

print('====================================================');
print('  Lumen Spotlight — Benchmark de Desempenho (GJS)');
print('====================================================');

// 1. Benchmark de Ranking Fuzzy + Calculadora + Conversor para 250 aplicativos/comandos
const mockCatalog = Array.from({ length: 250 }, (_, i) => ({
    id: `app:item-${i}`,
    category: i % 5 === 0 ? 'system' : 'apps',
    title: `Aplicativo de Produtividade ${i} (GNOME Wayland)`,
    subtitle: `Ferramenta avançada número ${i} para Ubuntu 26.04`,
    keywords: ['gnome', 'ubuntu', `tool${i}`, 'wayland'],
}));

const t0 = GLib.get_monotonic_time();
for (let iter = 0; iter < 20; iter++) {
    evaluateMathExpression('2^10 + sqrt(144) * (15 / 3)');
    evaluateConversion('100 usd em brl');
    rankAndFilterResults(mockCatalog, 'prod wayland', {}, 10);
}
const elapsedFastAvgMs = (GLib.get_monotonic_time() - t0) / 1000 / 20;
print(`  ⚡ Latência média por tecla (Apps + Calc + Convert + Fuzzy 250 itens): ${elapsedFastAvgMs.toFixed(2)} ms (Meta: < 50 ms)`);

if (elapsedFastAvgMs >= 50) {
    printerr('  ❌ Falha na meta de < 50 ms para provedores em memória!');
    imports.system.exit(1);
}

// 2. Benchmark do Daemon SQLite FTS5 via Gio.Subprocess IPC
const tmpDb = '/tmp/lumen-benchmark-fts5.sqlite';
const daemonPath = GLib.build_filenamev([
    GLib.get_current_dir(),
    'src',
    'core',
    'indexerDaemon.py',
]);

const proc = Gio.Subprocess.new(
    ['python3', '-u', daemonPath, tmpDb],
    Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE
);

const stdin = new Gio.DataOutputStream({ base_stream: proc.get_stdin_pipe() });
const stdout = new Gio.DataInputStream({ base_stream: proc.get_stdout_pipe() });

function sendSyncReq(payload) {
    stdin.put_string(JSON.stringify(payload) + '\n', null);
    stdin.flush(null);
    const [line] = stdout.read_line_utf8(null);
    return JSON.parse(line);
}

// Indexa diretório do projeto no FTS5
const syncStart = GLib.get_monotonic_time();
const syncResp = sendSyncReq({
    id: 1,
    action: 'sync',
    directories: [GLib.get_current_dir()],
    excluded: ['.git', 'node_modules'],
    includeContent: true,
});
const syncElapsedMs = (GLib.get_monotonic_time() - syncStart) / 1000;
print(`  📂 Indexação inicial FTS5 (${syncResp.indexed} arquivos): ${syncElapsedMs.toFixed(2)} ms`);

const ftsStart = GLib.get_monotonic_time();
const searchResp = sendSyncReq({
    id: 2,
    action: 'search',
    term: 'Spotlight',
    limit: 10,
});
const ftsElapsedMs = (GLib.get_monotonic_time() - ftsStart) / 1000;
print(`  🔍 Latência de busca FTS5 (nome + conteúdo via IPC): ${ftsElapsedMs.toFixed(2)} ms (Meta: < 150 ms, encontrados: ${searchResp.results?.length || 0})`);

proc.force_exit();
try {
    Gio.File.new_for_path(tmpDb).delete(null);
} catch {
    // Ignora limpeza temporária
}

if (ftsElapsedMs >= 150) {
    printerr('  ❌ Falha na meta de < 150 ms para busca de arquivos!');
    imports.system.exit(1);
}

print('\n✅ Todas as metas de desempenho (< 50 ms apps/comandos e < 150 ms arquivos) foram comprovadas!');
