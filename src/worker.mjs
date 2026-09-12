// Worker for zydy.dk: serverer de statiske filer fra public/ og højscore-API'et
// på /api/highscore/<spil> (se src/highscore.mjs). Kun /api/* rammer koden her
// (wrangler.jsonc: run_worker_first); alt andet går direkte til filerne, og
// ukendte stier under /api/ falder tilbage til dem via env.ASSETS.
import { haandterApi, d1Lager } from './highscore.mjs';

export default {
  async fetch(request, env) {
    const svar = await haandterApi(request, d1Lager(env.DB));
    return svar || env.ASSETS.fetch(request);
  },
};
