// Contatos → Lixeira (6b.5): deleted contacts kept for 60 days with what was deleted with them; restore, delete
// forever, or empty the trash.
import { icon } from './icons.js';
import { badge, fmt, h } from './screens.js';

const DAYS = 60, DAY = 86400000;

export function trashView(c) {
  const rows = [...(c.s.contactTrash || [])].filter(row => Date.now() - Date.parse(row.deletedAt) < DAYS * DAY).reverse();
  const q = (c.query || '').toLowerCase();
  const shown = rows.filter(row => !q || `${row.contact.name} ${row.contact.email} ${row.contact.phone}`.toLowerCase().includes(q));
  const count = row => Object.values(row.related || {}).reduce((sum, list) => sum + list.length, 0);
  return `<p class="dim crm-intro">Contatos excluídos ficam aqui por ${DAYS} dias, com as tarefas, oportunidades, mensagens, agendamentos e faturas que foram junto. Restaurar devolve tudo.</p>
    <div class="toolbar"><label class="search">${icon('search', 16)}<input id="page-search" value="${h(c.query)}" placeholder="Buscar na lixeira…" aria-label="Buscar na lixeira" autocomplete="off"></label>
      ${rows.length ? `<button type="button" class="danger plain" data-tr="empty">${icon('trash', 15)} Esvaziar lixeira</button>` : ''}</div>
    <div class="surface table-shell"><table><thead><tr><th scope="col">Contato</th><th scope="col">Excluído em</th><th scope="col">Sai da lixeira em</th><th scope="col">Registros junto</th><th scope="col"></th></tr></thead><tbody>
      ${shown.map(row => { const left = Math.max(0, Math.ceil((Date.parse(row.deletedAt) + DAYS * DAY - Date.now()) / DAY));
        return `<tr><td><b>${h(row.contact.name)}</b><br><small>${h(row.contact.email || row.contact.phone || '—')}</small></td><td>${h(fmt(row.deletedAt, c.s.profile.timezone, true))}</td>
          <td>${left <= 7 ? badge(`${left} dias`, 'red') : `${left} dias`}</td><td>${count(row)}</td>
          <td class="right"><button type="button" class="primary" data-tr="restore" data-id="${h(row.id)}">${icon('undo', 15)} Restaurar</button> <button type="button" class="danger plain" data-tr="purge" data-id="${h(row.id)}">Excluir de vez</button></td></tr>`; }).join('')}</tbody></table>
      ${shown.length ? '' : `<div class="empty">${icon('trash', 26)}<strong>${rows.length ? 'Nada encontrado' : 'Lixeira vazia'}</strong><p>${rows.length ? 'Tente outra busca.' : 'Os contatos excluídos aparecem aqui por 60 dias.'}</p></div>`}</div>`;
}

export function installContactTrash({ c, mutate, flash, render }) {
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-tr]');
    if (!el || c.view !== 'contacts' || c.tab !== 'trash') return;
    const act = el.dataset.tr;
    try {
      if (act === 'restore') { await mutate({ type: 'contact-restore', id: el.dataset.id }); render(); flash('Contato restaurado com os registros dele.'); }
      if (act === 'purge') { if (!confirm('Excluir este contato de vez? Não dá para desfazer.')) return; await mutate({ type: 'contact-trash-purge', id: el.dataset.id }); render(); flash('Excluído de vez.'); }
      if (act === 'empty') { if (!confirm('Esvaziar a lixeira? Os contatos saem de vez e não dá para desfazer.')) return; await mutate({ type: 'contact-trash-empty' }); render(); flash('Lixeira esvaziada.'); }
    } catch (error) { flash(error.message, true); }
  });
}
