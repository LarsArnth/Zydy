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
// spilfejl, men er en portkollision. Derfor tjekker vi, at det er vores egen
// forside, der svarer, og prøver ellers den næste port.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const oensket = Number(process.env.PORT ?? '4180');

/** Er det vores egen public/index.html, der svarer på porten? */
async function voresServer(port) {
  try {
    const svar = await fetch(`http://localhost:${port}/`, { cache: 'no-store' });
    return svar.ok && (await svar.text()).includes('id="apps"');
  } catch (e) { return false; }
}

/** Starter serveren på den første ledige port fra den ønskede og opefter. */
async function startServer() {
  for (let port = oensket; port < oensket + 20; port++) {
    const p = spawn('python3', ['-m', 'http.server', String(port), '-d', path.join(root, 'public')], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 600));
    if (await voresServer(port)) return { server: p, port };
    p.kill();
    console.error(`Port ${port} er optaget af noget andet – prøver ${port + 1}.`);
  }
  console.error(`Kunne ikke få en testserver op fra port ${oensket}.`);
  process.exit(1);
}

const { server, port: PORT } = await startServer();

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
