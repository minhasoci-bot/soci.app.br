import { makeServer } from '../server.mjs';
import { supabaseFromEnv } from '../storage.mjs';

let appInstance = null;

async function getApp() {
  if (!appInstance) {
    const store = supabaseFromEnv();
    const instance = makeServer(store ? { store } : {});
    await instance.ready;
    appInstance = instance.server;
  }
  return appInstance;
}

export default async function handler(req, res) {
  if (req.url.startsWith('/debug')) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      url: req.url,
      headers: req.headers
    }, null, 2));
  }
  const server = await getApp();
  server.emit('request', req, res);
}
