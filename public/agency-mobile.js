// Visão da agência → Aplicativo móvel (6.6): icon, store data, publish, the install link and the store package.
import { readFile, squarePng } from './agency-desktop.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function mobileStoreCard(app, origin, agencyId) {
  const store = { developer: '', supportEmail: '', supportUrl: '', privacyUrl: '', androidPackage: '', iosBundle: '', fingerprints: [], domain: '', ...(app.store || {}) };
  const link = `${origin}/mobile/${agencyId}/`, published = app.status === 'published';
  const missing = [!app.icon && 'ícone', !published && 'publicar', !store.androidPackage && 'pacote Android', !store.iosBundle && 'Bundle ID do iOS', !store.developer && 'desenvolvedor',
    !store.supportEmail && 'e-mail de suporte', !store.privacyUrl && 'política de privacidade', !store.fingerprints.length && 'impressão SHA-256'].filter(Boolean);
  return `<section class="surface set-card mobile-store"><div class="set-section"><header class="set-head"><h2>Publicação do app</h2>${published ? `<span class="badge green">Publicado · versão ${h(app.version)}</span>` : '<span class="badge">Rascunho</span>'}
      <button class="secondary" data-ag="mobile-publish">${published ? 'Publicar nova versão' : 'Publicar app'}</button></header><div class="set-body">
    <p class="dim">Incluso no plano da agência. O app é instalável no Android e no iPhone pelo link abaixo e abre a Soci no modo app: barra de módulos embaixo, seus módulos de URL e notificações push. Para as lojas, gere o pacote e publique com as suas contas de desenvolvedor da Apple e do Google.</p>
    ${published ? `<div class="inline-gap"><code>${h(link)}</code><button class="secondary" data-ag="mobile-copy" data-id="${h(link)}">Copiar link de instalação</button><a class="secondary" href="${h(link)}" target="_blank" rel="noopener">Abrir</a></div>` : ''}</div></div>
    <form class="settings-form set-form" data-ag-form="mobile-app-store"><section class="set-section"><header class="set-head"><h2>Dados das lojas</h2><p class="dim">O que a Apple e o Google pedem para publicar o app com o nome da agência.</p></header><div class="set-body">
      <label>Ícone do app (1024 × 1024, PNG)${app.icon ? ' <span class="badge green">enviado</span>' : ''}<input name="iconFile" type="file" accept="image/png"></label>
      <div class="field-grid">
        <label>Desenvolvedor (como aparece nas lojas)<input name="developer" maxlength="80" value="${h(store.developer)}"></label>
        <label>E-mail de suporte<input name="supportEmail" type="email" maxlength="120" value="${h(store.supportEmail)}"></label>
        <label>Site de suporte<input name="supportUrl" type="url" placeholder="https://" value="${h(store.supportUrl)}"></label>
        <label>Política de privacidade<input name="privacyUrl" type="url" placeholder="https://" value="${h(store.privacyUrl)}"></label>
        <label>Domínio do app (opcional, apontado para a Soci)<input name="domain" placeholder="app.suaagencia.com.br" value="${h(store.domain)}"></label>
        <label>Pacote Android<input name="androidPackage" placeholder="br.com.suaagencia.app" value="${h(store.androidPackage)}"></label>
        <label>Bundle ID do iOS<input name="iosBundle" placeholder="br.com.suaagencia.app" value="${h(store.iosBundle)}"></label>
      </div>
      <label>Impressões SHA-256 da chave de assinatura Android (Play Console → Integridade do app), uma por linha<textarea name="fingerprints" rows="2" placeholder="AB:CD:…">${h(store.fingerprints.join('\n'))}</textarea></label>
      ${missing.length ? `<p class="dim">Para as lojas ainda falta: ${h(missing.join(', '))}.</p>` : '<p><span class="badge green">Pronto para as lojas</span></p>'}
      <details><summary>Como publicar nas lojas</summary><ol>
      <li>Google Play: instale o Bubblewrap (<code>npm i -g @bubblewrap/cli</code>), coloque o <code>twa-manifest.json</code> do pacote numa pasta e rode <code>bubblewrap build</code>. Envie o arquivo .aab no Play Console da agência.</li>
      <li>Cole aqui a impressão SHA-256 da chave de assinatura; a Soci passa a servir <code>/.well-known/assetlinks.json</code> no domínio do app e ele abre em tela cheia.</li>
      <li>App Store: em pwabuilder.com, abra o link de instalação, baixe o pacote iOS com o Bundle ID acima, assine no Xcode com a conta Apple Developer da agência e envie pelo App Store Connect.</li>
      <li>Cada nova publicação na Soci atualiza o app instalado, sem novo envio às lojas.</li>
    </ol></details></div></section>
      <footer class="set-foot"><p class="form-status" role="alert"></p><button type="button" class="secondary" data-ag="mobile-package">Baixar pacote das lojas</button><button class="primary">Salvar dados das lojas</button></footer>
    </form>
  </section>`;
}

export async function readMobileStore(form) {
  const f = form.elements;
  const data = { developer: f.developer.value, supportEmail: f.supportEmail.value, supportUrl: f.supportUrl.value, privacyUrl: f.privacyUrl.value, domain: f.domain.value,
    androidPackage: f.androidPackage.value, iosBundle: f.iosBundle.value, fingerprints: f.fingerprints.value };
  const iconFile = f.iconFile.files[0];
  if (iconFile) { const raw = await readFile(iconFile); data.icon = await squarePng(raw, 1024); data.icon512 = await squarePng(raw, 512); data.icon192 = await squarePng(raw, 192); }
  return data;
}
