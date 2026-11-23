(() => {
  const button = document.querySelector('#google-signin-btn');
  const label = button.querySelector('span');
  const status = document.querySelector('#login-status');
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/app#agency/dashboard';
  const failure = 'Não foi possível entrar com Google. Tente novamente.';
  let request;

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
