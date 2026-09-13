// Worker for zydy.dk: serverer de statiske filer fra public/ og de små API'er
//   /api/highscore/<spil>   topliste (src/highscore.mjs)
//   /api/aktivitet/<spil>   spilstarter og "spiller nu" (src/aktivitet.mjs)
//   /api/oversigt           samlet status til forsiden (src/aktivitet.mjs)
//   /api/ideer              idéer til nye spil og ønsker til dem der findes (src/ideer.mjs)
//   /api/venner             hvem der er venner med hvem på forsiden (src/venner.mjs)
//   /api/rum                to venner der spiller det samme spil sammen (src/rum.mjs)
//   /api/beskeder           to venner der skriver sammen (src/beskeder.mjs)
// Kun /api/* rammer koden her (wrangler.jsonc: run_worker_first); alt andet går
// direkte til filerne, og ukendte stier under /api/ falder tilbage til dem via env.ASSETS.
import { haandterApi, d1Lager } from './highscore.mjs';
import { haandterAktivitet, d1Aktivitet } from './aktivitet.mjs';
import { haandterIdeer, d1Ideer } from './ideer.mjs';
import { haandterVenner, d1Venner } from './venner.mjs';
import { haandterRum, d1Rum } from './rum.mjs';
import { haandterBeskeder, d1Beskeder } from './beskeder.mjs';

export default {
  async fetch(request, env) {
    const hs = d1Lager(env.DB);
    const venner = d1Venner(env.DB);
    const beskeder = d1Beskeder(env.DB);
    const svar = await haandterAktivitet(request, d1Aktivitet(env.DB), hs)
      || await haandterIdeer(request, d1Ideer(env.DB))
      || await haandterVenner(request, venner, beskeder)
      || await haandterRum(request, d1Rum(env.DB), venner)
      || await haandterBeskeder(request, beskeder, venner)
      || await haandterApi(request, hs);
    return svar || env.ASSETS.fetch(request);
  },
};
