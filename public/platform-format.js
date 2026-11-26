// Números da página Plataforma e dos alertas, no formato brasileiro. Usado pelo servidor e pelo navegador.
const MB = 1024 * 1024, GB = 1024 * MB;
const decimals = (value, digits) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Um valor com a sua unidade: bytes em MB ou GB, dólares, contagens, dias ou porcentagem. Sem valor, um travessão. */
export function formatAmount(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  if (unit === 'bytes') return n >= GB ? `${decimals(n / GB, 1)} GB` : `${decimals(n / MB, 1)} MB`;
  if (unit === 'usd') return `US$ ${decimals(n, 2)}`;
  if (unit === 'days') return `${Math.round(n)} ${Math.round(n) === 1 ? 'dia' : 'dias'}`;
  if (unit === 'percent') return `${Math.round(n)}%`;
  return Math.round(n).toLocaleString('pt-BR');
}

/** 'YYYY-MM-DD' → 'DD/MM'. */
export const dayMonth = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
