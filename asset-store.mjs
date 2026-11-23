// Imagens grandes fora do documento da agência.
// Logos e ícones chegavam em base64 dentro do JSON da agência (até ~75% do tamanho do documento),
// e toda alteração lia e regravava esses bytes. Agora, ao gravar a agência, cada imagem em base64
// de pelo menos ASSET_MIN bytes vira uma linha própria, identificada pelo SHA-256 do conteúdo, e o
// documento guarda só o endereço /asset/<hash>.<ext>. Linhas iguais são gravadas uma vez só.
import { createHash } from 'node:crypto';

export const ASSET_MIN = 8 * 1024;
const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+=*)$/;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME = Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime]));
export const ASSET_PATH = /^\/asset\/([0-9a-f]{64})\.(png|jpg|webp|gif)$/;

export const isAssetUrl = value => typeof value === 'string' && ASSET_PATH.test(value);
export const assetRowId = hash => `media-asset-${hash}`;

/** Imagem em base64 grande o bastante para sair do documento, ou null. */
export function splitDataImage(value) {
  if (typeof value !== 'string' || value.length < ASSET_MIN || !value.startsWith('data:image/')) return null;
  const match = value.match(DATA_IMAGE);
  if (!match) return null;
  const [, mime, data] = match;
  const hash = createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex');
  return { hash, mime, data, url: `/asset/${hash}.${EXT[mime]}` };
}

/**
 * Troca, em todo o objeto (no lugar), as imagens grandes em base64 pelo endereço do asset.
 * Devolve as imagens encontradas (por hash), para gravar com saveAssets.
 */
export function extractAssets(root, found = new Map()) {
  const visit = value => {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const asset = splitDataImage(value[i]);
        if (asset) { found.set(asset.hash, asset); value[i] = asset.url; } else if (value[i] && typeof value[i] === 'object') visit(value[i]);
      }
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        const asset = splitDataImage(value[key]);
        if (asset) { found.set(asset.hash, asset); value[key] = asset.url; } else if (value[key] && typeof value[key] === 'object') visit(value[key]);
      }
    }
  };
  visit(root);
  return found;
}

/** Grava as imagens encontradas (uma linha por conteúdo; repetir é inofensivo). */
export async function saveAssets(store, found) {
  for (const { hash, mime, data } of found.values()) {
    await store.insert(assetRowId(hash), { profile: { name: 'Imagem' }, mime, data });
  }
}

/** Bytes e tipo de uma imagem guardada em base64 ou como asset; null se não existir. */
export async function assetBytes(store, value) {
  if (typeof value !== 'string' || !value) return null;
  const inline = value.match(DATA_IMAGE);
  if (inline) return { mime: inline[1], bytes: Buffer.from(inline[2], 'base64') };
  const match = value.match(ASSET_PATH);
  if (!match) return null;
  const row = await Promise.resolve().then(() => store.load(assetRowId(match[1]))).catch(error => {
    if (error.status === 404) return null;
    throw error;
  });
  if (!row || MIME[match[2]] !== row.mime || typeof row.data !== 'string') return null;
  return { mime: row.mime, bytes: Buffer.from(row.data, 'base64') };
}
