// "Para onde vai": mensagem, endereço, página de um funil ou agenda. Usado ao enviar um formulário, nas regras de
// destino por resposta e depois de agendar um serviço. O servidor confere tudo em destinations.mjs.
const h = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const destinationLabels = { default: 'Seguir o destino padrão', message: 'Mostrar mensagem', redirect: 'Ir para um endereço', page: 'Ir para uma página de funil ou site', booking: 'Ir para a agenda' };

// Páginas de cada funil ou site, como "projeto|caminho".
function pageOptions(s, dest) {
  const current = dest.siteId ? `${dest.siteId}|${dest.page || 'index'}` : '';
  const groups = (s.studioProjects || []).filter(project => project.pages?.length).map(project => `<optgroup label="${h(project.name)}${project.publishedAt ? '' : ' (não publicado)'}">${project.pages.map(page => {
    const value = `${project.id}|${page.slug}`;
    return `<option value="${h(value)}"${value === current ? ' selected' : ''}>${h(page.name)}</option>`;
  }).join('')}</optgroup>`);
  const known = (s.studioProjects || []).some(project => project.id === dest.siteId && project.pages?.some(page => page.slug === (dest.page || 'index')));
  return `<option value="">Escolha a página</option>${current && !known ? `<option value="${h(current)}" selected>Página excluída</option>` : ''}${groups.join('')}`;
}

/** `attrs(key)` gives the attributes of each control; keys: action, message, url, target, serviceId. */
export function destinationField({ s }, dest = {}, { attrs, actions = ['message', 'redirect', 'page', 'booking'], label = 'Destino', messageHint = 'Recebemos suas respostas.' }) {
  const action = actions.includes(dest.action) ? dest.action : actions[0];
  const part = (key, body) => `<div data-dest-for="${key}"${key === action ? '' : ' hidden'}>${body}</div>`;
  const services = (s.services || []).filter(service => service.kind !== 'rental');
  return `<div class="dest" data-dest><label>${h(label)}<select data-dest-action ${attrs('action')}>${actions.map(key => `<option value="${key}"${key === action ? ' selected' : ''}>${destinationLabels[key]}</option>`).join('')}</select></label>
    ${actions.includes('message') ? part('message', `<label>Mensagem<textarea rows="2" maxlength="600" placeholder="${h(messageHint)}" ${attrs('message')}>${h(dest.message)}</textarea></label>`) : ''}
    ${actions.includes('redirect') ? part('redirect', `<label>Endereço<input type="url" maxlength="600" placeholder="https://www.exemplo.com.br/obrigado" value="${h(dest.url)}" ${attrs('url')}></label>`) : ''}
    ${actions.includes('page') ? part('page', `<label>Página<select ${attrs('target')}>${pageOptions(s, dest)}</select></label><p class="dim">O visitante só chega nela com o funil publicado; antes disso, vê a mensagem padrão.</p>`) : ''}
    ${actions.includes('booking') ? part('booking', `<label>Serviço<select ${attrs('serviceId')}><option value="">Escolha o serviço</option>${services.map(service => `<option value="${h(service.id)}"${service.id === dest.serviceId ? ' selected' : ''}>${h(service.name)}</option>`).join('')}</select></label><p class="dim">O lead chega com os dados que digitou já preenchidos. Precisa da página de agendamento ligada em Calendários.</p>`) : ''}</div>`;
}

/** The destination read from the controls; `get(key)` gives each value. */
export function readDestination(get) {
  const [siteId = '', page = ''] = String(get('target') || '').split('|');
  return { action: get('action') || 'message', message: get('message') || '', url: get('url') || '', siteId, page, serviceId: get('serviceId') || '' };
}

export function syncDestination(select) {
  for (const part of select.closest('[data-dest]').querySelectorAll('[data-dest-for]')) part.hidden = part.dataset.destFor !== select.value;
}
if (typeof document !== 'undefined') document.addEventListener('change', event => { if (event.target.matches?.('[data-dest-action]')) syncDestination(event.target); });
