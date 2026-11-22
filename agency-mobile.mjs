// App mobile white-label (6.6, D2: included in the agency plan). Soci is a web platform, so the mobile app is a
// branded installable app (PWA): Android and iOS add it to the home screen with the agency's name, icon and colors.
// It opens the platform in "app mode": a bottom tab bar with the modules the agency chose (and its own URL modules)
// and push notifications (Web Push). For the stores, the agency gets a package built from the same app — a Trusted
// Web Activity for Google Play (Bubblewrap) and the PWABuilder project for the App Store — published with the
// agency's own developer accounts.
import { mobileModules } from './ui/agency-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const picture = (value, label, limit) => {
  if (!value) return '';
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) fail(`${label}: use uma imagem PNG.`);
  if (value.length > limit) fail(`${label}: imagem grande demais (até ${Math.round(limit * 0.75 / 1024)} KB).`);
  return value;
};
const httpsUrl = (value, label) => { const v = str(value, 300); if (v && !/^https:\/\/[^\s]+$/i.test(v)) fail(`${label}: use um endereço https://.`); return v; };
const packageName = (value, label) => { const v = str(value, 120).toLowerCase(); if (v && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(v)) fail(`${label}: use o formato br.com.agencia.app.`); return v; };
const fingerprint = value => { const v = String(value || '').trim().toUpperCase(); return /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(v) ? v : ''; };

/** Where each module opens inside the platform. */
export const mobileRoutes = { dashboard: 'dashboard', conversations: 'conversations', contacts: 'contacts', opportunities: 'opportunities', calendars: 'calendars', payments: 'payments', reputation: 'reputation' };
export const mobileLabels = { dashboard: 'Painel', conversations: 'Conversas', contacts: 'Contatos', opportunities: 'Oportunidades', calendars: 'Calendários', payments: 'Pagamentos', reputation: 'Avaliações' };
export const mobileIcons = { dashboard: 'grid', conversations: 'chat', contacts: 'contacts', opportunities: 'leads', calendars: 'cal', payments: 'pay', reputation: 'star' };

export const mobileStoreDefaults = () => ({ icon: '', icon192: '', icon512: '', status: 'draft', version: 0, publishedAt: '',
  store: { developer: '', supportEmail: '', supportUrl: '', privacyUrl: '', androidPackage: '', iosBundle: '', fingerprints: [], domain: '' } });

/** Fills the fields older agencies do not have (they only had name, colors, login title and modules). */
export function mobileOf(state) {
  const prior = state.mobileApp || {}, base = mobileStoreDefaults();
  state.mobileApp = { appName: 'My Agency', primary: '#1570ef', accent: '#12b76a', loginTitle: 'Welcome back', hidden: [], order: mobileModules.map(m => m[0]), custom: [], ...base, ...prior, store: { ...base.store, ...(prior.store || {}) } };
  return state.mobileApp;
}

/** 'mobile-app-store': icon and the data the stores ask for (developer, support, privacy, package ids, signing). */
export function saveMobileStore(state, d) {
  const app = mobileOf(state);
  const keep = (key, label, limit) => d[key] === undefined ? app[key] : d[key] === 'remove' ? '' : picture(d[key], label, limit);
  const email = str(d.supportEmail ?? app.store.supportEmail, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('E-mail de suporte inválido.');
  Object.assign(app, { icon: keep('icon', 'Ícone', 700000), icon512: keep('icon512', 'Ícone 512', 400000), icon192: keep('icon192', 'Ícone 192', 120000) });
  app.store = {
    developer: str(d.developer ?? app.store.developer, 80), supportEmail: email, supportUrl: httpsUrl(d.supportUrl ?? app.store.supportUrl, 'Site de suporte'),
    privacyUrl: httpsUrl(d.privacyUrl ?? app.store.privacyUrl, 'Política de privacidade'), androidPackage: packageName(d.androidPackage ?? app.store.androidPackage, 'Pacote Android'),
    iosBundle: packageName(d.iosBundle ?? app.store.iosBundle, 'Bundle ID do iOS'), domain: str(d.domain ?? app.store.domain, 200).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    fingerprints: [...new Set((Array.isArray(d.fingerprints) ? d.fingerprints : String(d.fingerprints ?? app.store.fingerprints.join('\n')).split(/[\s,]+/)).map(fingerprint).filter(Boolean))].slice(0, 5)
  };
  return app;
}

/** 'mobile-app-publish': the app goes live (needs the icon); every publish raises the version. */
export function publishMobile(state) {
  const app = mobileOf(state);
  if (!app.icon) fail('Envie o ícone do app (1024 × 1024) antes de publicar.');
  Object.assign(app, { status: 'published', version: (app.version || 0) + 1, publishedAt: new Date().toISOString() });
  return app;
}

/** What the platform needs to draw the app mode (public once published). */
export function mobileConfig(app, id) {
  const visible = app.order.filter(key => mobileRoutes[key] && !app.hidden.includes(key));
  return { id, name: app.appName, primary: app.primary, accent: app.accent, version: app.version, icon: app.icon192 || app.icon ? `/mobile/${id}/icon-192.png?v=${app.version}` : '',
    modules: visible.map(key => ({ key, label: mobileLabels[key] || mobileModules.find(row => row[0] === key)?.[1] || key, route: mobileRoutes[key], icon: mobileIcons[key] })),
    custom: (app.custom || []).map(item => ({ label: item.label, url: item.url })) };
}

export function mobileManifest(app, id) {
  const icon = (size, key) => app[key] ? [{ src: `/mobile/${id}/icon-${size}.png?v=${app.version}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' }] : [];
  return { id: `/mobile/${id}/`, name: app.appName, short_name: app.appName.slice(0, 12), description: app.loginTitle || app.appName, start_url: `/mobile/${id}/?source=app`, scope: '/',
    display: 'standalone', orientation: 'portrait', background_color: '#ffffff', theme_color: app.primary, lang: 'pt-BR',
    icons: [...icon(192, 'icon192'), ...icon(512, 'icon512'), ...icon(1024, 'icon')] };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const mobileCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** The install and sign-in screen; opened from the home screen it goes straight into the app mode. */
export function mobileLaunchPage(app, id, { preview = false } = {}) {
  const target = `/app?shell=mobile&agency=${encodeURIComponent(id)}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(app.appName)}</title><meta name="theme-color" content="${esc(app.primary)}"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(app.appName.slice(0, 12))}">
${preview ? '' : `<link rel="manifest" href="/mobile/${esc(id)}/manifest.webmanifest">`}${app.icon192 || app.icon ? `<link rel="icon" href="/mobile/${esc(id)}/icon-192.png?v=${app.version}"><link rel="apple-touch-icon" href="/mobile/${esc(id)}/icon-512.png?v=${app.version}">` : ''}
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;background:linear-gradient(160deg,${esc(app.primary)},${esc(app.accent)});color:#111}
main{width:min(420px,calc(100% - 32px));background:#fff;border-radius:24px;padding:32px 24px;display:grid;gap:14px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.mark{width:84px;height:84px;border-radius:20px;margin:0 auto}h1{margin:0;font-size:24px}p{margin:0;color:#555}
.btn{display:block;text-decoration:none;background:${esc(app.primary)};color:#fff;border:0;border-radius:14px;padding:15px;font:600 16px system-ui,sans-serif}
.ghost{background:#fff;color:${esc(app.primary)};border:1px solid ${esc(app.primary)}}small{color:#666}[hidden]{display:none}</style></head>
<body><main>${app.icon ? `<img class="mark" src="/mobile/${esc(id)}/icon-512.png?v=${app.version}" alt="">` : ''}<h1>${esc(app.appName)}</h1><p>${esc(app.loginTitle || '')}</p>
<a class="btn" href="${esc(target)}">Entrar</a>
${preview ? '' : `<button class="btn ghost" id="install" hidden>Instalar o app</button>
<small id="ios" hidden>No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.</small>
<small id="android">No Android: use “Instalar app” no menu do Chrome.</small>`}</main>${preview ? '' : `<script>
if('serviceWorker' in navigator)navigator.serviceWorker.register('/mobile/${esc(id)}/sw.js',{scope:'/mobile/${esc(id)}/'}).catch(function(){});
var standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;if(standalone)location.replace(${JSON.stringify(target)});
var ios=/iphone|ipad|ipod/i.test(navigator.userAgent);document.getElementById('ios').hidden=!ios;document.getElementById('android').hidden=ios;
var ask;addEventListener('beforeinstallprompt',function(e){e.preventDefault();ask=e;document.getElementById('install').hidden=false;});
document.getElementById('install').onclick=function(){if(ask){ask.prompt();ask=null;this.hidden=true;}};
</script>`}</body></html>`;
}

/** The service worker: installability, and the push notifications (opened on tap at their link). */
export function mobileWorker(id) {
  return `self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',function(){});
self.addEventListener('push',function(e){var d={};try{d=e.data?e.data.json():{};}catch(x){d={body:e.data&&e.data.text()};}
e.waitUntil(self.registration.showNotification(d.title||'Nova notificação',{body:d.body||'',icon:'/mobile/${id}/icon-192.png',badge:'/mobile/${id}/icon-192.png',tag:d.tag||undefined,data:{url:d.url||'/app'}}));});
self.addEventListener('notificationclick',function(e){e.notification.close();var url=(e.notification.data&&e.notification.data.url)||'/app';
e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){for(var i=0;i<list.length;i++){if('focus' in list[i]){list[i].navigate(url);return list[i].focus();}}return self.clients.openWindow(url);}));});`;
}

/**
 * The store package: the Bubblewrap config (Google Play, Trusted Web Activity), the Digital Asset Links file the
 * agency's domain serves, and what the App Store and Google Play ask for. The agency builds and submits it with its
 * own developer accounts (D2).
 */
export function storePackage(app, id, origin) {
  const host = app.store.domain || new URL(origin).host, base = `https://${host}`;
  const missing = [
    !app.icon && 'ícone 1024 × 1024', app.status !== 'published' && 'publicar o app', !app.store.androidPackage && 'pacote Android', !app.store.iosBundle && 'Bundle ID do iOS',
    !app.store.developer && 'nome do desenvolvedor', !app.store.supportEmail && 'e-mail de suporte', !app.store.privacyUrl && 'política de privacidade', !app.store.fingerprints.length && 'impressão SHA-256 da chave de assinatura Android'
  ].filter(Boolean);
  const twaManifest = {
    packageId: app.store.androidPackage, host, name: app.appName, launcherName: app.appName.slice(0, 12), display: 'standalone', orientation: 'portrait',
    themeColor: app.primary, navigationColor: app.primary, backgroundColor: '#FFFFFF', enableNotifications: true, startUrl: `/mobile/${id}/?source=app`,
    iconUrl: `${base}/mobile/${id}/icon-512.png`, maskableIconUrl: `${base}/mobile/${id}/icon-512.png`, webManifestUrl: `${base}/mobile/${id}/manifest.webmanifest`,
    appVersionName: `1.0.${app.version || 0}`, appVersionCode: Math.max(1, app.version || 0), signingKey: { path: './android.keystore', alias: 'android' }, generatorApp: 'soci'
  };
  const assetlinks = app.store.androidPackage && app.store.fingerprints.length
    ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: app.store.androidPackage, sha256_cert_fingerprints: app.store.fingerprints } }] : [];
  return {
    ready: !missing.length, missing, host, twaManifest, assetlinks, assetlinksUrl: `${base}/.well-known/assetlinks.json`, manifestUrl: `${base}/mobile/${id}/manifest.webmanifest`,
    listing: { name: app.appName, developer: app.store.developer, supportEmail: app.store.supportEmail, supportUrl: app.store.supportUrl, privacyUrl: app.store.privacyUrl, iosBundle: app.store.iosBundle },
    steps: [
      'Google Play: instale o Bubblewrap (npm i -g @bubblewrap/cli), salve twa-manifest.json numa pasta e rode "bubblewrap build". Envie o .aab no Play Console da agência.',
      `Copie a impressão SHA-256 da chave de assinatura (Play Console → Integridade do app) para a Soci; o arquivo ${base}/.well-known/assetlinks.json passa a liberar o app em tela cheia.`,
      `App Store: em pwabuilder.com, abra ${base}/mobile/${id}/ e baixe o pacote iOS com o Bundle ID ${app.store.iosBundle || '(defina)'}; abra no Xcode, assine com a conta Apple Developer da agência e envie pelo App Store Connect.`,
      'Nas duas lojas, use o nome, o e-mail e os links de suporte e privacidade acima. Cada nova publicação na Soci atualiza o app sem novo envio (o conteúdo vem da web).'
    ]
  };
}

/** /.well-known/assetlinks.json: the published app of the agency whose domain is this host. */
export function assetLinksFor(agencies, host) {
  const clean = String(host || '').toLowerCase().split(':')[0];
  for (const agency of agencies) {
    const app = agency?.mobileApp;
    if (app?.status === 'published' && app.store?.domain === clean && app.store.androidPackage && app.store.fingerprints?.length) {
      return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: app.store.androidPackage, sha256_cert_fingerprints: app.store.fingerprints } }];
    }
  }
  return null;
}
