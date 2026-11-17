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
  if (req.headers['x-matched-path']) {
    req.url = req.headers['x-matched-path'];
  } else if (req.headers['x-forwarded-url']) {
    req.url = req.headers['x-forwarded-url'];
  }
  const server = await getApp();
  server.emit('request', req, res);
}
