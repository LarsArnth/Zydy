// Kører alle spil-tests mod én lokal server.
//
//   node test/run.mjs                 (kræver `playwright` i node_modules)
//   PLAYWRIGHT=/sti/til/playwright/index.mjs node test/run.mjs
//
// Hver test i test/*.test.mjs starter en headless Chromium med iPhone-profil,
// spiller spillet igennem via UI og window.GAME og gemmer et screenshot i
// test/shots/. Serveren er Pythons http.server på port 4180.
//
// Kører der allerede noget på porten – en anden session, eller en server der er
// blevet hængende fra en worktree, som siden er fjernet – så *fejler python
// stille*, og alle tests rammer den fremmede server i stedet. Det ligner 22
// spilfejl, men er en portkollision. Portvalget ligger derfor i testserver.mjs,
// som holder øje med, at det er vores egen python, der har porten.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startServer, svarer } from './testserver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const oensket = Number(process.env.PORT ?? '4180');
const offentlig = path.join(root, 'public');

/** Rejser serveren – eller giver op med en forklaring, man kan bruge til noget. */
async function rejsServer() {
  const ny = await startServer(oensket, offentlig);
  if (ny) return ny;
  console.error(`Kunne ikke få en testserver op fra port ${oensket}.`);
  process.exit(1);
}

let aktuel = await rejsServer();

const only = process.argv.slice(2);
const tests = readdirSync(here).filter(f => f.endsWith('.test.mjs') && (!only.length || only.some(o => f.includes(o)))).sort();
let failed = 0;
for (const t of tests) {
  // Er serveren faldet fra undervejs, så start en ny frem for at lade resten af
  // testene fejle med ERR_CONNECTION_REFUSED – den fejl siger intet om spillene.
  if (!(await svarer(aktuel.port))) {
    console.error('Testserveren svarer ikke længere – starter en ny.');
    aktuel.server.kill();
    aktuel = await rejsServer();
  }
  const code = await new Promise(res => {
    const p = spawn(process.execPath, [path.join(here, t)], {
      stdio: 'inherit', cwd: root,
      env: { ...process.env, BASE: `http://localhost:${aktuel.port}` },
    });
    p.on('exit', res);
  });
  if (code !== 0) { failed++; console.error(`FEJL: ${t}`); }
}
aktuel.server.kill();
console.log(failed ? `${failed} test(s) fejlede` : `Alle ${tests.length} tests grønne`);
process.exit(failed ? 1 : 0);
