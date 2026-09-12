// Worker for zydy.dk: serverer de statiske filer fra public/ og de små API'er
//   /api/highscore/<spil>   topliste (src/highscore.mjs)
//   /api/aktivitet/<spil>   spilstarter og "spiller nu" (src/aktivitet.mjs)
//   /api/oversigt           samlet status til forsiden (src/aktivitet.mjs)
//   /api/ideer              idéer til nye spil og ønsker til dem der findes (src/ideer.mjs)
// Kun /api/* rammer koden her (wrangler.jsonc: run_worker_first); alt andet går
// direkte til filerne, og ukendte stier under /api/ falder tilbage til dem via env.ASSETS.
import { haandterApi, d1Lager } from './highscore.mjs';
import { haandterAktivitet, d1Aktivitet } from './aktivitet.mjs';
import { haandterIdeer, d1Ideer } from './ideer.mjs';

export default {
  async fetch(request, env) {
    const hs = d1Lager(env.DB);
    const svar = await haandterAktivitet(request, d1Aktivitet(env.DB), hs)
      || await haandterIdeer(request, d1Ideer(env.DB))
      || await haandterApi(request, hs);
    return svar || env.ASSETS.fetch(request);
  },
};
