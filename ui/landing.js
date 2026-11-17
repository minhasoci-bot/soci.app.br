(() => {
  const dialog = document.querySelector("#login-dialog");
  const signIn = document.querySelector("#google-signin-btn");
  const navButton = document.querySelector("#nav-google-btn");
  const status = document.querySelector("#login-status");
  const label = signIn.querySelector("span");
  const params = new URLSearchParams(location.search);
  const rawNext = params.get("next");
  const requestedPath = (!rawNext || rawNext === "/app" || rawNext === "/app/") ? "/app#agency/dashboard" : rawNext;
  const isLoginPage = location.pathname === "/login";
  const next = requestedPath + (isLoginPage && !requestedPath.includes("#") ? location.hash : "");
  const failureMessage = "Não foi possível entrar com Google. Tente novamente.";
  let request = null;
  let returnFocus = null;

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function setBusy(busy) {
    signIn.disabled = busy;
    signIn.setAttribute("aria-busy", String(busy));
    label.textContent = busy ? "Conectando ao Google…" : "Continuar com Google";
  }

  async function startGoogleLogin() {
    if (request) return;
    const controller = new AbortController();
    request = controller;
    showStatus("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (response.ok && result?.url) {
        location.assign(result.url);
        return;
      }
      showStatus(result?.error || failureMessage);
    } catch {
      if (controller.signal.aborted) return;
      showStatus(failureMessage);
    }
    request = null;
    setBusy(false);
    signIn.focus();
  }

  navButton.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (dialog.open) return;
    returnFocus = navButton;
    dialog.showModal();
    startGoogleLogin();
  });
  signIn.addEventListener("click", startGoogleLogin);
  document.querySelector("#close-login").addEventListener("click", () => dialog.close());
  let pressedBackdrop = false;
  dialog.addEventListener("pointerdown", event => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener("click", event => {
    if (!pressedBackdrop || event.target !== dialog) return;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    request?.abort();
    request = null;
    setBusy(false);
    showStatus("");
    returnFocus?.focus();
    returnFocus = null;
  });
  addEventListener("pageshow", event => {
    if (!event.persisted) return;
    request?.abort();
    request = null;
    setBusy(false);
  });

  if (isLoginPage) {
    dialog.showModal();
    if (params.has("error")) showStatus(failureMessage);
  }
  try {
    if (localStorage.getItem("go.google_user")) localStorage.removeItem("go.user");
    localStorage.removeItem("go.google_user");
  } catch {}
})();
