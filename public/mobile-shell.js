// App mobile white-label (6.6): the "app mode" of the platform. Opened from the agency's installed app
// (/app?shell=mobile&agency=<id>), it draws a bottom tab bar with the modules the agency chose, a "Mais" sheet with
// the rest and the agency's URL modules, and lets the member turn on push notifications on this device.
import { icon as i } from './icons.js';
import { tr } from './i18n.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const KEY = 'soci-mobile-shell';
const keyBytes = base64 => { const raw = atob((base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, ch => ch.charCodeAt(0)); };

/** The agency app id when the platform runs in app mode (remembered for the session of the installed app). */
export function shellAgency() {
  const params = new URLSearchParams(location.search);
  let id = params.get('shell') === 'mobile' ? params.get('agency') || '' : '';
  try { if (id) sessionStorage.setItem(KEY, id); else id = sessionStorage.getItem(KEY) || ''; } catch {}
  return /^[\w-]{1,60}$/.test(id) ? id : '';
}

export async function installMobileShell({ c, api, url, flash }) {
  const id = shellAgency();
  if (!id) return;
  let config;
  try { config = await fetch(`/mobile/${encodeURIComponent(id)}/config.json`).then(r => r.ok ? r.json() : null); } catch {}
  if (!config) return;
  document.body.classList.add('mobile-shell');
  document.documentElement.style.setProperty('--shell-primary', config.primary);
  const style = document.createElement('style');
  style.textContent = `body.mobile-shell .sidebar{display:none}body.mobile-shell .shell,body.mobile-shell .shell.wide{grid-template-columns:minmax(0,1fr)}
body.mobile-shell #screen{padding-bottom:84px}.shell-tabs{position:fixed;left:0;right:0;bottom:0;z-index:71;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;background:#fff;border-top:1px solid #e5e7eb;padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
.shell-tabs a,.shell-tabs button{display:grid;justify-items:center;gap:2px;font:600 11px system-ui,sans-serif;color:#64748b;text-decoration:none;background:none;border:0;padding:4px}
.shell-tabs .on{color:var(--shell-primary)}.shell-sheet{position:fixed;inset:auto 0 0 0;z-index:70;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.2);padding:18px 18px calc(90px + env(safe-area-inset-bottom));display:grid;gap:8px}
.shell-sheet[hidden]{display:none}.shell-sheet a,.shell-sheet button{display:flex;gap:10px;align-items:center;padding:12px;border-radius:12px;background:#f8fafc;border:0;color:#0f172a;text-decoration:none;font:600 15px system-ui,sans-serif;text-align:left}`;
  document.head.append(style);
  const tabs = config.modules.slice(0, 4), more = config.modules.slice(4);
  const bar = document.createElement('nav'), sheet = document.createElement('div');
  bar.className = 'shell-tabs'; bar.setAttribute('aria-label', config.name);
  sheet.className = 'shell-sheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', tr('Mais'));
  const draw = () => {
    const view = location.hash.slice(1).split('/')[0];
    bar.innerHTML = tabs.map(m => `<a href="#${h(m.route)}" class="${view === m.route ? 'on' : ''}" ${view === m.route ? 'aria-current="page"' : ''}>${i(m.icon, 22)}<span>${h(tr(m.label))}</span></a>`).join('')
      + `<button type="button" data-shell-more aria-expanded="${!sheet.hidden}">${i('menu', 22)}<span>${h(tr('Mais'))}</span></button>`;
  };
  sheet.innerHTML = more.map(m => `<a href="#${h(m.route)}" data-shell-close>${i(m.icon, 18)} ${h(tr(m.label))}</a>`).join('')
    + config.custom.map(m => `<a href="${h(m.url)}" target="_blank" rel="noopener" data-shell-close>${i('link', 18)} ${h(m.label)}</a>`).join('')
    + `<button type="button" data-shell-push>${i('bell', 18)} ${h(tr('Ativar notificações neste celular'))}</button>`;
  document.body.append(bar, sheet);
  draw();
  addEventListener('hashchange', draw);
  document.addEventListener('click', async event => {
    if (event.target.closest('[data-shell-more]')) { sheet.hidden = !sheet.hidden; draw(); return; }
    if (event.target.closest('[data-shell-close]')) { sheet.hidden = true; draw(); return; }
    if (!event.target.closest('[data-shell-push]')) return;
    sheet.hidden = true; draw();
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error(tr('Este celular não aceita notificações por aqui. No iPhone, instale o app na Tela de Início primeiro.'));
      const { key } = await api('/api/push/key');
      if (!key) throw new Error(tr('As notificações ainda não foram configuradas pela agência.'));
      if (await Notification.requestPermission() !== 'granted') throw new Error(tr('Permita as notificações para este app nas configurações do celular.'));
      const reg = await navigator.serviceWorker.register(`/mobile/${id}/sw.js`, { scope: `/mobile/${id}/` });
      const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await api(url('/api/push/subscribe'), { subscription: sub.toJSON(), app: id });
      flash(tr('Notificações ativadas: você recebe as novas mensagens desta subconta.'));
    } catch (error) { flash(error.message, true); }
  });
  return config;
}
