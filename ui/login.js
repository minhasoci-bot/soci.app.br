(() => {
  const button = document.querySelector('#google-signin-btn');
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
    label.textContent = busy ? 'Conectando ao Google…' : 'Continuar com Google';
  };

  button.addEventListener('click', async () => {
    if (request) return;
    request = new AbortController();
    showStatus('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next }),
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
  });
})();
