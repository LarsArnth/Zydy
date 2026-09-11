// Kører alle spil-tests mod én lokal server.
//
//   node test/run.mjs                 (kræver `playwright` i node_modules)
//   PLAYWRIGHT=/sti/til/playwright/index.mjs node test/run.mjs
//
// Hver test i test/*.test.mjs starter en headless Chromium med iPhone-profil,
// spiller spillet igennem via UI og window.GAME og gemmer et screenshot i
// test/shots/. Serveren er Pythons http.server på port 4180.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const PORT = process.env.PORT ?? '4180';

const server = spawn('python3', ['-m', 'http.server', PORT, '-d', path.join(root, 'public')], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));

const only = process.argv.slice(2);
const tests = readdirSync(here).filter(f => f.endsWith('.test.mjs') && (!only.length || only.some(o => f.includes(o)))).sort();
let failed = 0;
for (const t of tests) {
  const code = await new Promise(res => {
    const p = spawn(process.execPath, [path.join(here, t)], {
      stdio: 'inherit', cwd: root,
      env: { ...process.env, BASE: `http://localhost:${PORT}` },
    });
    p.on('exit', res);
  });
  if (code !== 0) { failed++; console.error(`FEJL: ${t}`); }
}
server.kill();
console.log(failed ? `${failed} test(s) fejlede` : `Alle ${tests.length} tests grønne`);
process.exit(failed ? 1 : 0);
