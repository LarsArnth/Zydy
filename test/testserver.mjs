// Testserveren, som alle browser-testene kører imod.
//
// Portvalget bor i sin egen fil, fordi det er den del af testopsætningen, der
// har gjort rigtig skade. Lars kører rutinemæssigt flere sessioner på én gang,
// og så er der flere testkørsler om de samme porte.
//
// Fælden er, at *alle* worktrees serverer den samme forside. Tjekker man kun,
// om der kommer et svar med `id="apps"`, kan man ikke se forskel på sin egen
// server og en anden sessions – og så kører man videre på dens port. Vores egen
// python er død stille, fordi porten var optaget, og når den anden session
// bliver færdig og lukker sin server, fejler alle resterende tests med
// ERR_CONNECTION_REFUSED. Det ligner tyve spilfejl, men er en portkollision.
// Det væltede to hele testkørsler 2026-09-13.
//
// Derfor er det afgørende tjek ikke «svarer porten?», men «lever *vores* egen
// python stadig?». Python afslutter med det samme (kode 1), hvis porten er
// optaget, så de to ting kan skelnes.
import { spawn } from 'node:child_process';

/** Svarer der en Zydy-forside på porten? */
export async function svarer(port) {
  try {
    const svar = await fetch(`http://localhost:${port}/`, { cache: 'no-store' });
    return svar.ok && (await svar.text()).includes('id="apps"');
  } catch (e) { return false; }
}

/**
 * Starter en server på den første port fra `oensket` og opefter, som vi selv
 * får lov at binde. Returnerer `{ server, port }` – eller `null`, hvis ingen af
 * portene var ledige.
 */
export async function startServer(oensket, rod, { porte = 20, log = console.error } = {}) {
  for (let port = oensket; port < oensket + porte; port++) {
    const fundet = await proevPort(port, rod);
    if (fundet) return fundet;
    log(`Port ${port} er optaget af noget andet – prøver ${port + 1}.`);
  }
  return null;
}

/*
  Serveren er Pythons egen http.server — men startet i hånden, fordi `python3 -m
  http.server` lytter med en kø på kun **fem** ventende forbindelser
  (`request_queue_size` i socketserver). To browsere på forsiden på én gang
  åbner let et dusin forbindelser i samme nu (service workeren henter selv 6
  filer ad gangen), og så løber køen over: macOS afviser resten, browseren siger
  ERR_CONNECTION_RESET / ERR_SOCKET_NOT_CONNECTED, og en tilfældig .js-fil
  bliver aldrig indlæst. Det ligner en fejl i spillet — window.Beskeder eller
  window.Grupper er «undefined» — men er bare en fuld kø. Tests som
  beskeder/grupper/opkald faldt på skift på det.

  Resten er magen til CLI'ens egen opsætning: to tråde om det, og en dobbelt
  stak, så både ::1 og 127.0.0.1 svarer. Og som CLI'en afslutter den med det
  samme (kode 1), hvis porten er optaget — det er dét, portvalget nedenfor
  bygger på.
*/
const PYTHON = `
import contextlib, socket, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Server(ThreadingHTTPServer):
    request_queue_size = 128          # CPython's standard er 5 – alt for lidt til to browsere
    address_family = socket.AF_INET6 if socket.has_ipv6 else socket.AF_INET
    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()

port, rod = int(sys.argv[1]), sys.argv[2]
Server(('', port), partial(SimpleHTTPRequestHandler, directory=rod)).serve_forever()
`;

/** Ét portforsøg: start python, og bliv kun ved, hvis det er vores egen, der svarer. */
async function proevPort(port, rod) {
  const p = spawn('python3', ['-c', PYTHON, String(port), rod], { stdio: 'ignore' });
  let lever = true;
  p.on('exit', () => { lever = false; });

  // Op til fire sekunder. På en maskine, der kører to testsuiter i forvejen, er
  // python ikke nødvendigvis oppe efter et halvt.
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (!lever) return null;                 // porten var optaget – python gav op
    if (!(await svarer(port))) continue;
    // Svaret kan være kommet fra en fremmed server, mens vores egen python
    // endnu ikke havde nået at opdage, at porten var taget. Giv den lov at dø
    // først, før vi tror på, at serveren er vores.
    await new Promise(r => setTimeout(r, 300));
    if (!lever) return null;
    return { server: p, port };
  }
  p.kill();
  return null;
}
