// Rota pública dos certificados e selos da área de membros (/certificado/<subconta>/<código>): a página que qualquer
// pessoa com o código abre para ver e conferir o certificado.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { certificateCsp, certificatePage } from '../course-credentials.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createCertificateRoutes(deps) {
  const { store, ready, error, workspaceSegment, publicAccountPolicy } = deps;
  const certificatePath = new RegExp(`^/certificado/${workspaceSegment}/([0-9A-F]{12})/?$`);
  return async function certificateRoutes({ res, p, method }) {
    // Certificates and badges: a public page anyone with the code can open to see and verify it.
    const certificate = p.match(certificatePath);
    if (certificate && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, code] = certificate;
      await publicAccountPolicy(workspace, false, 'memberships');
      const state = await store.load(workspace);
      const row = (state.credentialsIssued || []).find(item => item.code === code);
      if (!row) throw error('Certificado não encontrado.',404);
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex', 'Content-Security-Policy':certificateCsp });
      return res.end(method === 'HEAD' ? undefined : certificatePage(state, row));
    }
    return NEXT_ROUTE;
  };
}
