// Documentos e contratos: the messages behind each personal signing link. The model queues them in the
// workspace outbox; the server delivers by e-mail (Resend) and, when chosen, by WhatsApp, and records
// the outcome in the document's audit trail.

const httpsOrigin = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.origin : ''; } catch { return ''; } };

/** Plain-text bodies (no HTML: nothing from the document is interpreted by the mail client). */
export function documentMessage(item, link) {
  const sender = item.sender || 'Soci';
  if (item.what === 'estimate') {
    if (item.kind === 'document-owner') {
      const what = item.event === 'accepted' ? 'foi aceito' : 'foi recusado';
      return { subject: `Orçamento ${item.title} ${what}`, text: `O orçamento ${item.title} ${what}.\n\nAbra Pagamentos → Orçamentos na Soci para ver os detalhes.` };
    }
    return { subject: item.subject || `${sender} enviou o orçamento ${item.title}`,
      text: `Olá, ${item.name}.\n\n${sender} enviou o orçamento ${item.title} para você.${item.message ? `\n\n${item.message}` : ''}\n\nVeja, escolha os itens opcionais e aprove ou recuse pelo link:\n${link}` };
  }
  if (item.kind === 'document-owner') {
    const what = item.event === 'completed' ? 'foi assinado por todos' : 'foi recusado';
    return { subject: `“${item.title}” ${what}`, text: `O documento “${item.title}” ${what}.\n\nAbra Pagamentos → Documentos e contratos na Soci para ver os detalhes e a trilha de auditoria.` };
  }
  if (item.final) {
    return { subject: `Cópia final: ${item.title}`, text: `Olá, ${item.name}.\n\nO documento “${item.title}”, enviado por ${sender}, foi assinado por todos.${item.pays ? ' Falta o pagamento: pelo mesmo link você paga por Pix ou cartão.' : ''}\n\nAbra a cópia final com o certificado de conclusão:\n${link}\n\nGuarde este e-mail: o link é pessoal.` };
  }
  const verb = item.role === 'approver' ? 'aprovar' : 'assinar';
  return {
    subject: item.subject || `${sender} enviou “${item.title}” para você ${verb}`,
    text: `Olá, ${item.name}.\n\n${sender} enviou o documento “${item.title}” para você ${verb}.${item.message ? `\n\n${item.message}` : ''}\n\nAbra pelo link pessoal:\n${link}\n\nNão encaminhe este link: ele identifica você na assinatura.`
  };
}

export function documentMailer({ key = process.env.RESEND_API_KEY, from = process.env.PORTAL_EMAIL_FROM, publicOrigin = process.env.PORTAL_PUBLIC_ORIGIN || process.env.SOCIAL_PUBLIC_URL, request = fetch } = {}) {
  const fallback = httpsOrigin(publicOrigin);
  return {
    configured: Boolean(key && from),
    linkOf: item => item.path ? `${httpsOrigin(item.origin) || fallback}${item.path}` : '',
    async email(to, { subject, text }, idempotency) {
      if (!key || !from) return 'e-mail não configurado (RESEND_API_KEY e PORTAL_EMAIL_FROM)';
      const response = await request('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotency },
        body: JSON.stringify({ from, to: [to], subject, text })
      }).catch(() => null);
      return response?.ok ? 'e-mail enviado' : `e-mail não enviado${response ? ` (HTTP ${response.status})` : ''}`;
    }
  };
}
