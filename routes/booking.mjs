// Rota pública da Agenda de serviços (/agendar/<subconta>, com ?embed=1 para o iframe): a página de agendamento
// (serviço, dia e horário livre, sem script) e o envio do formulário, que marca o horário e leva ao destino
// configurado no serviço ou mostra a confirmação.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { resolveDestination } from '../destinations.mjs';
import { bookingCsp, bookingEmbedCsp, bookingPage, bookingView, clockIn, zoneOf } from '../scheduling-model.mjs';
import { hasPixels } from '../tracking.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createBookingRoutes(deps) {
  const { store, ready, error, workspaceSegment, allowSign, change, flushLater, formBody, leave, publicAccountPolicy, withPixels } = deps;
  const bookingPath = new RegExp(`^/agendar/${workspaceSegment}/?$`);
  return async function bookingRoutes({ req, res, p, method, url }) {
    // Agenda de serviços: the public booking page (choose a service, a day and a free time; no script).
    const booking = p.match(bookingPath);
    if (booking && ['GET', 'HEAD', 'POST'].includes(method)) {
      await ready;
      const [, workspace] = booking;
      await publicAccountPolicy(workspace, method === 'POST', 'calendars');
      const q = url.searchParams, base = `/agendar/${workspace}`, embed = q.get('embed') === '1';
      let done = null, failure = '', status = 200, form = {};
      if (method === 'POST') {
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
        form = await formBody(req);
        const one = value => Array.isArray(value) ? value[0] : value;
        try {
          const result = await change(workspace, { type: 'scheduling-book', data: { serviceId: one(form.servico), start: one(form.inicio), name: one(form.nome), email: one(form.email), phone: one(form.telefone), address: one(form.endereco), notes: one(form.notas), units: one(form.unidades), quantity: one(form.qtd), link: one(form.link) } });
          flushLater(workspace);
          const after = await store.load(workspace), zone = zoneOf(after), booked = result.id;
          const event = hasPixels(after.tracking) ? `schedule.${booked.id}` : '';
          const target = resolveDestination(after, workspace, after.services.find(x => x.id === one(form.servico))?.after, { event });
          if (target) return leave(res, after, workspace, target, { embed, event });
          done = { event, service: booked.service, staff: booked.staff, when: `${new Intl.DateTimeFormat('pt-BR', { timeZone: zone, weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(booked.start))} às ${clockIn(Date.parse(booked.start), zone)}` };
        } catch (failed) {
          if (!failed.status || failed.status >= 500) throw failed;
          failure = failed.message; status = failed.status;
        }
      }
      const one2 = value => Array.isArray(value) ? value[0] : value;
      const view = bookingView(await store.load(workspace), { serviceId: String(form.servico || q.get('servico') || ''), day: String(q.get('dia') || ''), units: Number(form.unidades || q.get('unidades')) || 1, quantity: Number(form.qtd || q.get('qtd')) || 1, link: String(one2(form.link) || q.get('link') || '') });
      if (!view) throw error('O agendamento online desta empresa está desligado.', 404);
      const [bookingHeaders, bookingBody] = withPixels(await store.load(workspace), workspace, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'same-origin', 'Content-Security-Policy':embed ? bookingEmbedCsp : bookingCsp }, bookingPage(view, { base, done, error: failure, form, embed }));
      res.writeHead(status, bookingHeaders);
      return res.end(method === 'HEAD' ? undefined : bookingBody);
    }
    return NEXT_ROUTE;
  };
}
