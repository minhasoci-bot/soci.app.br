(() => {
  const button = document.querySelector('#google-signin-btn');
  const accounts = document.querySelector('#login-accounts');
  const label = button.querySelector('span');
  const status = document.querySelector('#login-status');
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/app#agency/dashboard';
  const failure = 'Não foi possível entrar com Google. Tente novamente.';
  let request;

  // White Label: aberta no domínio de uma agência, a tela de entrada mostra o nome e o logotipo dela.
  fetch('/api/marca').then(response => response.ok ? response.json() : {}).then(brand => {
    if (!brand?.name) return;
    const mark = document.querySelector('.brand');
    mark.setAttribute('aria-label', brand.name);
    mark.textContent = '';
    if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(brand.logo || '')) {
      const logo = Object.assign(document.createElement('img'), { src: brand.logo, alt: brand.name });
      logo.className = 'brand-logo';
      mark.append(logo);
    } else mark.textContent = brand.name;
    document.title = `Entrar · ${brand.name}`;
  }).catch(() => {});

  const showStatus = message => {
    status.textContent = message;
    status.hidden = !message;
  };
  const setBusy = busy => {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    label.textContent = busy ? 'Conectando ao Google…' : accounts.hidden ? 'Continuar com Google' : 'Usar outra conta Google';
    for (const account of accounts.querySelectorAll('button')) account.disabled = busy;
  };

  const withGoogle = async account => {
    if (request) return;
    request = new AbortController();
    showStatus('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next, account }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)])
      });
      const result = await response.json();
      if (response.ok && result?.url) {
        location.assign(result.url);
        return;
      }
      showStatus(result?.error || failure);
    } catch {
      showStatus(failure);
    }
    request = null;
    setBusy(false);
    button.focus();
  };
  button.addEventListener('click', () => withGoogle());

  // Contas já conectadas neste navegador: entram sem passar pelo Google. A sessão que terminou pede só o Google dela.
  const openAccount = async row => {
    if (request) return;
    if (!row.connected) return withGoogle(row.id);
    setBusy(true);
    showStatus('');
    try {
      const response = await fetch('/api/auth/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }) });
      const result = await response.json();
      if (response.ok) { location.assign(params.get('next') ? next : result.url); return; }
      if (result.code === 'ACCOUNT_SIGNED_OUT') { row.connected = false; setBusy(false); return withGoogle(row.id); }
      showStatus(result.error || failure);
    } catch {
      showStatus(failure);
    }
    setBusy(false);
  };
  const accountButton = row => {
    const item = document.createElement('li'), el = document.createElement('button'), text = document.createElement('span');
    el.type = 'button';
    el.className = 'login-account';
    const face = document.createElement(row.picture ? 'img' : 'i');
    if (row.picture) Object.assign(face, { src: row.picture, alt: '', referrerPolicy: 'no-referrer' }); else face.textContent = row.name.slice(0, 1).toUpperCase();
    for (const [tag, value] of [['b', row.name], ['small', row.email], ...(row.connected ? [] : [['em', 'Entrar de novo']])]) {
      const part = document.createElement(tag);
      part.textContent = value;
      text.append(part);
    }
    el.append(face, text);
    el.addEventListener('click', () => openAccount(row));
    item.append(el);
    return item;
  };
  if (params.get('error')) showStatus(params.get('error') === 'limite' ? 'Este navegador já tem o máximo de contas. Entre em uma delas e remova outra pelo menu do perfil.' : failure);
  fetch('/api/auth/accounts').then(response => response.ok ? response.json() : null).then(list => {
    const rows = [...(list?.current ? [{ ...list.current, connected: true }] : []), ...(list?.others || [])];
    if (!rows.length) return;
    accounts.append(...rows.map(accountButton));
    accounts.hidden = false;
    setBusy(Boolean(request));
  }).catch(() => { /* sem a lista, o Google continua disponível */ });
})();
