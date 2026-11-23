import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { App as Editor } from "./editor/App";
import { selectedTop } from "./editor/actions";
import { exportBlob, renderDocumentThumbnail } from "./editor/io/export";
import { bindPersistence, compactDocument, normalizeDocument, saveLocalCopy } from "./editor/io/persist";
import { createEmptyDocument } from "./editor/model/defaults";
import type { DocumentData } from "./editor/model/types";
import { store } from "./editor/store/store";
import { createSociRepo, type PranchetaFile } from "./repo";
import { PranchetaSession } from "./session";
import "./editor/styles/tokens.css";
import "./editor/styles/app.css";
import "./soci.css";

const params = new URLSearchParams(location.search);
const workspace = params.get("workspace") || "agency";
const isAgency = workspace === "agency";
const repo = createSociRepo(workspace);
const embedded = window.parent !== window;
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente.";

/** Avisa a soci (janela de fora) sobre o que aconteceu no editor. */
function notify(message: Record<string, unknown>) {
  if (embedded) window.parent.postMessage({ source: "prancheta-editor", ...message }, location.origin);
}

function setFileParam(id: string) {
  const url = new URL(location.href);
  url.searchParams.set("file", id);
  history.replaceState(null, "", url);
}

const blobToDataUri = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** A arte enviada para fora: a seleção, ou o primeiro frame da página, ou a página inteira. */
async function renderArt(): Promise<string> {
  store.finishTextEditing();
  let ids = selectedTop();
  if (!ids.length) {
    const page = store.page;
    const frame = page.children.find((id) => store.state.doc.nodes[id]?.type === "FRAME" && store.state.doc.nodes[id]?.visible);
    ids = frame ? [frame] : page.children.filter((id) => store.state.doc.nodes[id]?.visible);
  }
  if (!ids.length) throw new Error("A página está vazia. Desenhe algo antes de enviar.");
  const blob = await exportBlob(ids, { format: "PNG", scale: 1 });
  if (!blob) throw new Error("Não foi possível gerar a imagem.");
  return blobToDataUri(blob);
}

function SaveIndicator({ session }: { session: PranchetaSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const label = state.kind === "saved" ? "Salvo na soci" : state.kind === "saving" ? "Salvando…" : state.kind === "dirty" ? "Alterações por salvar" : "Não salvo";
  return <span className={`pr-save pr-save--${state.kind}`} role="status">{label}</span>;
}

function SaveProblem({ session, onCopy, onReload, busy }: { session: PranchetaSession; onCopy: () => void; onReload: () => void; busy: boolean }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  if (state.kind !== "error" && state.kind !== "conflict") return null;
  return (
    <div className="pr-banner" role="alert">
      <p>{state.message} Seu trabalho continua aberto.</p>
      <button className="pr-btn pr-btn--accent" disabled={busy} onClick={() => void session.forceSave()}>Tentar salvar agora</button>
      <button className="pr-btn" disabled={busy} onClick={onCopy}>Salvar como cópia</button>
      <button className="pr-btn" onClick={saveLocalCopy}>Baixar JSON</button>
      {state.kind === "conflict" && <button className="pr-btn" disabled={busy} onClick={onReload}>Reabrir versão salva</button>}
    </div>
  );
}

function Root() {
  const [session, setSession] = useState<PranchetaSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef<PranchetaSession | null>(null);
  const release = useRef<(() => void) | null>(null);
  const operation = useRef(false);
  const actions = useRef({ create: (_doc?: DocumentData) => {} });

  const install = useCallback((file: PranchetaFile) => {
    const document = compactDocument(normalizeDocument(file.document));
    current.current?.dispose();
    release.current?.();
    store.load(document);
    const next = new PranchetaSession(repo, { ...file, document });
    current.current = next;
    release.current = bindPersistence({
      save: () => next.save(),
      create: () => actions.current.create(),
      import: async (doc) => actions.current.create(doc),
    });
    next.start();
    setFileParam(file.id);
    notify({ type: "opened", id: file.id });
    setSession(next);
  }, []);

  useEffect(() => {
    const id = params.get("file");
    if (!id) { setError("Nenhuma arte foi indicada."); return; }
    repo.getFile(id).then(install, (reason) => setError(messageOf(reason)));
    return () => { current.current?.dispose(); release.current?.(); };
  }, [install]);

  const run = async (action: () => Promise<void>, flush = true) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      store.finishTextEditing();
      if (flush && current.current && !await current.current.save()) return;
      await action();
    } catch (reason) {
      store.toast(messageOf(reason));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const create = (document: DocumentData = createEmptyDocument()) => run(async () => {
    let thumb: string | null = null;
    try { thumb = await renderDocumentThumbnail(document); } catch { /* segue sem miniatura */ }
    install(await repo.createFile(compactDocument(document), thumb));
    store.toast("Nova arte criada.");
  });
  actions.current.create = (doc) => { void create(doc); };

  const close = () => run(async () => {
    const active = current.current;
    let thumbnail: string | null = null;
    try { thumbnail = await renderDocumentThumbnail(store.state.doc); } catch { /* fecha mesmo sem miniatura */ }
    active?.dispose();
    if (embedded) {
      notify({ type: "close", id: active?.id, thumbnail });
      return;
    }
    if (active && thumbnail) await repo.saveThumbnail(active.id, thumbnail);
    location.href = isAgency ? "/app#agency/prancheta" : `/app?workspace=${encodeURIComponent(workspace)}#prancheta`;
  });

  const toDrive = () => run(async () => {
    if (!current.current) return;
    const data = await renderArt();
    await repo.exportToMedia(current.current.id, store.state.doc.name, data);
    store.toast("Imagem salva no Mídia Drive.");
    notify({ type: "changed" });
  });

  const toSocial = () => run(async () => {
    if (!current.current) return;
    const data = await renderArt();
    await repo.sendToSocial(current.current.id, store.state.doc.name, data);
    store.toast("Rascunho criado no Social Planner.");
    notify({ type: "changed" });
  });

  // A galeria pode abrir a arte já pedindo o envio (?action=drive|social).
  const pendingAction = useRef(isAgency ? null : params.get("action"));
  useEffect(() => {
    if (!session || !pendingAction.current) return;
    const action = pendingAction.current;
    pendingAction.current = null;
    const url = new URL(location.href);
    url.searchParams.delete("action");
    history.replaceState(null, "", url);
    // Espera as fontes e o primeiro desenho antes de exportar.
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
      if (action === "drive") void toDrive();
      if (action === "social") void toSocial();
    }));
  }, [session]);

  const preserveCopy = () => run(async () => {
    const document = structuredClone(compactDocument(store.state.doc));
    document.name = `${document.name.slice(0, 140)} — cópia`;
    install(await repo.createFile(document));
    store.toast("Seu trabalho foi salvo numa nova arte.");
  }, false);

  const reload = () => {
    if (!session || !window.confirm("Reabrir a versão salva? As alterações que ainda não foram salvas serão descartadas.")) return;
    void run(async () => install(await repo.getFile(session.id)), false);
  };

  if (error) {
    return (
      <div className="pr-state">
        <h1>Não foi possível abrir a Prancheta</h1>
        <p>{error}</p>
        <button className="pr-btn pr-btn--accent" onClick={() => embedded ? notify({ type: "close" }) : history.back()}>Voltar para as artes</button>
      </div>
    );
  }
  if (!session) return <div className="pr-state" role="status"><span className="pr-spinner" aria-hidden="true" />Abrindo a arte…</div>;

  return (
    <div className="prancheta-root">
      <SaveProblem session={session} onCopy={() => void preserveCopy()} onReload={reload} busy={busy} />
      <div className="prancheta-editor" inert={busy || undefined}>
        <Editor
          key={session.instanceId}
          onBack={() => void close()}
          busy={busy}
          saveSlot={<SaveIndicator session={session} />}
          actionsSlot={isAgency ? null : <>
            <button className="pr-head-btn" onClick={() => void toDrive()} disabled={busy} title="Salva a seleção (ou o primeiro frame) como PNG no Mídia Drive da subconta">Mídia Drive</button>
            <button className="pr-head-btn pr-head-btn--accent" onClick={() => void toSocial()} disabled={busy} title="Cria um rascunho no Social Planner com a seleção (ou o primeiro frame)">Criar post</button>
          </>}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
