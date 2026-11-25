// Formulário público (/form/<subconta>/<formulário>): a página (?embed=1 para iframe, ?preview=1 para quem está logado),
// o envio com as regras de destino (mensagem, resultado do quiz ou redirecionamento) e o evento Lead do pixel.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { outcomeOf, resolveDestination } from '../destinations.mjs';
import { hasPixels } from '../tracking.mjs';
import { formOpen, formPage, readAnswers } from '../ui/form-fields.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createFormRoutes(deps) {
  const { store, ready, error, workspaceSegment, change, formBody, leave, publicAccountPolicy, withPixels, workspaceAccess } = deps;
  const formPath = new RegExp(`^/form/${workspaceSegment}/([0-9a-f-]{36})/?$`);
  return async function formRoutes({ req, res, p, method, url }) {
    const formRoute = p.match(formPath);
    if (formRoute) {
      await ready;
      const [, workspace, formId] = formRoute;
      const embed = url.searchParams.get('embed') === '1', preview = url.searchParams.get('preview') === '1';
      if (preview) {
        await workspaceAccess(req, res, workspace, { modules: ['sites'], hide: true });
      }
      const active = await publicAccountPolicy(workspace, method === 'POST', 'sites');
      const state = await store.load(workspace);
      const form = state.forms.find(item => item.id === formId);
      if (!form || (!form.active && !preview)) throw error('Este formulário não está publicado.',404);
      const outside = [form.onSubmit, ...(form.routes || []).map(rule => rule.dest)].some(dest => dest?.action === 'redirect');
      const page = (status, options) => {
        const [headers, body] = withPixels(preview ? null : state, workspace, { 'Content-Type':'text/html; charset=utf-8', 'Referrer-Policy':'same-origin',
          'Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'${outside ? ' https: http:' : ''}; frame-ancestors *` },
          formPage(form, { action:`/form/${workspace}/${formId}${embed ? '?embed=1' : preview ? '?preview=1' : ''}`,
          customFields:state.customFields || [], embed, brand:state.profile?.name || '', ...options }));
        res.writeHead(status, headers);
        return res.end(method === 'HEAD' ? undefined : body);
      };
      if (!formOpen(form)) return page(200, { notice:{ title:'Formulário encerrado', text:form.schedule?.closedMessage || 'Este formulário não está recebendo respostas agora.' } });
      if (method === 'GET' || method === 'HEAD') {
        if (active && method === 'GET' && !preview && form.active) await Promise.resolve().then(() => change(workspace,{ type:'form-view', id:formId })).catch(() => {});
        const values = Object.fromEntries([...url.searchParams].filter(([key]) => !['embed','preview','__path'].includes(key)).map(([key, value]) => [key, value.slice(0,500)]));
        return page(200, { values });
      }
      if (!form.active) throw error('Publique o formulário para receber respostas.',403);
      const input = await formBody(req);
      const read = readAnswers(form, input, state.customFields || []);
      if (!read.ok) return page(422, { values:read.values, errors:read.errors });
      await publicAccountPolicy(workspace, true, 'sites');
      let sent;
      try { sent = await change(workspace,{ type:'submit', id:formId, data:{ ...input, _vid:'', _source:embed ? 'Incorporado' : 'Link' } }); }
      catch (failure) { return page(failure.status && failure.status < 500 ? 422 : 500, { values:read.values, errors:{ _form:failure.status && failure.status < 500 ? failure.message : 'Não foi possível enviar agora. Tente de novo.' } }); }
      const { qualified, dest } = outcomeOf(form, read), after = await store.load(workspace);
      // Só o lead qualificado conta como Lead no pixel, e depois de o envio ser aceito.
      const event = qualified && hasPixels(after.tracking) ? `lead.${sent.id}` : '';
      const target = resolveDestination(after, workspace, dest, { event, link:(after.bookingLinks || []).findLast(row => row.submissionId === sent.id)?.token || '' });
      if (target) return leave(res, after, workspace, target, { embed, event });
      const tier = read.result?.tierDetail, own = (form.routes || []).some(rule => rule.dest === dest) && dest.action === 'message' ? dest.message : '';
      if (read.result) return page(200, { event, notice:{ result:read.result, text:own || tier?.message || form.onSubmit?.message || '', cta:tier?.ctaUrl ? { url:tier.ctaUrl, label:tier.ctaLabel } : null } });
      return page(200, { event, notice:{ title:'Obrigado!', text:own || form.onSubmit?.message || 'Recebemos suas respostas.' } });
    }
    return NEXT_ROUTE;
  };
}
