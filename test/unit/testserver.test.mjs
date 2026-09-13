// Testserverens portvalg. Den fejl, der testes for her, kostede to hele
// testkørsler 2026-09-13: to sessioner kørte suiten samtidig, den ene overtog
// den andens port, og da den første blev færdig og lukkede sin server, fejlede
// resten af testene med ERR_CONNECTION_REFUSED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, svarer } from '../testserver.mjs';

const offentlig = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const tavs = { log: () => {} };

test('en anden sessions server bliver ikke taget for vores egen', async () => {
  // «Den anden session». Den serverer nøjagtig den samme forside som os, så
  // et svar med id="apps" kan ikke bruges til at skelne.
  const fremmed = await startServer(4831, offentlig, tavs);
  assert.ok(fremmed, 'kunne starte den fremmede server');
  try {
    // Vi beder om præcis dens port. Før rettelsen fik vi den udleveret sammen
    // med en python, der allerede var død.
    const min = await startServer(fremmed.port, offentlig, tavs);
    assert.ok(min, 'vi fik en server');
    try {
      assert.notEqual(min.port, fremmed.port, 'vi rykkede videre til en ledig port');
      assert.equal(min.server.exitCode, null, 'og vores egen python lever');
      assert.ok(await svarer(min.port), 'og svarer på sin egen port');
    } finally { min.server.kill(); }
  } finally { fremmed.server.kill(); }
});

test('en lukket server svarer ikke', async () => {
  const s = await startServer(4851, offentlig, tavs);
  assert.ok(s, 'serveren kom op');
  assert.ok(await svarer(s.port), 'og svarer, mens den lever');
  s.server.kill();
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await svarer(s.port), false, 'men ikke bagefter – det er sådan run.mjs opdager det');
});
