import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function resolveTregToken() {
  if (process.env.TREG_TOKEN?.trim()) return process.env.TREG_TOKEN.trim();
  try {
    const cfgPath = path.join(os.homedir(), '.treg', 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg?.token?.trim()) return cfg.token.trim();
    }
  } catch {}
  return '';
}

export const tregToken = resolveTregToken();
export const tregConfigured = Boolean(tregToken);

const TREG_BASE = 'https://treg.to';

/**
 * Valida um token do Treg e obtém os dados da conta / equipe / saldo
 */
export async function verifyTregToken(token) {
  const candidate = String(token || resolveTregToken()).trim();
  if (!candidate) return { valid: false, error: 'Token não informado.' };
  try {
    const res = await fetch(`${TREG_BASE}/home`, {
      method: 'GET',
      headers: {
        'X-Treg-Token': candidate
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: 'Token do Treg inválido ou expirado.' };
      }
      return { valid: false, error: `Treg respondeu HTTP ${res.status}` };
    }
    const data = await res.json();
    const balanceUsd = typeof data.balance_micro === 'number' ? (data.balance_micro / 1e6).toFixed(2) : '0.00';
    return {
      valid: true,
      account: data.account || '',
      team: data.team || '',
      role: data.role || '',
      balanceUsd,
      balanceMicro: data.balance_micro || 0,
      toolsCount: data.catalog_tools || '4200+'
    };
  } catch (err) {
    return { valid: false, error: err.message || 'Falha ao conectar com o Treg' };
  }
}

export async function callTregEndpoint(endpointId, payload, { method = 'POST', maxCost = 0.50, token } = {}) {
  const activeToken = String(token || resolveTregToken()).trim();
  if (!activeToken) throw new Error('Token do Treg não configurado. Conecte sua chave em Configurações do chat → Conectores.');

  const headers = {
    'Content-Type': 'application/json',
    'X-Treg-Token': activeToken,
    'X-Treg-Route-Max-Cost': String(maxCost),
    'X-Treg-Meta': 'source=soci-agent'
  };

  const res = await fetch(`${TREG_BASE}/call/${endpointId}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(35000)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Erro na API do Treg (${res.status}): ${errText.slice(0, 300)}`);
  }

  return await res.json();
}

/**
 * Pesquisa estabelecimentos e empresas no Google Maps via Treg
 */
export async function searchGoogleBusinesses(query, { country = 'br', language = 'pt', token } = {}) {
  const data = await callTregEndpoint('treg.google.serp.maps', { q: query, country, language }, { maxCost: 0.10, token });
  const rawPlaces = data?.output?.places || data?.places || [];
  const places = [];

  for (const item of rawPlaces) {
    const title = item.title || item.name;
    if (!title) continue;
    places.push({
      placeId: item.place_id || item.id || '',
      name: title,
      address: item.address || item.snippet || '',
      phone: item.phone || '',
      category: item.category || (Array.isArray(item.additional_categories) ? item.additional_categories[0] : '') || '',
      rating: item.rating?.value ?? (typeof item.rating === 'number' ? item.rating : null),
      reviewsCount: item.rating?.votes_count ?? (typeof item.reviews === 'number' ? item.reviews : null),
      website: item.url || item.website || '',
      instagram: item.url?.includes('instagram.com') ? item.url : (item.contact_url?.includes('instagram.com') ? item.contact_url : null),
      latitude: item.latitude || null,
      longitude: item.longitude || null,
      status: item.work_hours?.current_status || (item.is_claimed ? 'Verificado no Google' : '')
    });
  }

  return places.slice(0, 15);
}

/**
 * Pesquisa negócios, lojas e contas no Instagram por palavra-chave / cidade via Treg
 */
export async function searchInstagramBusinesses(query, { token } = {}) {
  const data = await callTregEndpoint('treg.instagram.search.users', { q: query }, { maxCost: 0.10, token });
  const rawUsers = data?.output?.users || data?.users || [];
  const results = [];

  for (const u of rawUsers) {
    const username = u.username || u.user?.username;
    if (!username) continue;
    results.push({
      username: username.replace(/^@/, ''),
      name: u.full_name || u.user?.full_name || username,
      bio: (u.biography || u.user?.biography || '').slice(0, 300),
      followers: u.follower_count ?? u.followers ?? u.user?.follower_count ?? null,
      url: u.url || `https://www.instagram.com/${username}/`,
      category: u.category_name || u.user?.category_name || '',
      externalUrl: u.external_url || u.user?.external_url || ''
    });
  }

  return results.slice(0, 15);
}

/**
 * Consulta o perfil público detalhado de um usuário do Instagram via Treg
 */
export async function getInstagramProfile(username, { token } = {}) {
  const cleanUsername = String(username || '')
    .replace(/^@/, '')
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//, '')
    .replace(/\/+$/, '')
    .trim();

  const data = await callTregEndpoint('treg.instagram.user.profile', { username: cleanUsername }, { maxCost: 0.10, token });
  const out = data?.output || {};

  return {
    username: out.username || cleanUsername,
    name: out.full_name || '',
    bio: out.biography || '',
    followers: out.followers ?? null,
    following: out.following ?? null,
    postsCount: out.posts_count ?? null,
    url: `https://www.instagram.com/${out.username || cleanUsername}/`,
    isBusiness: out.is_business_account || out.is_professional_account || false
  };
}

/**
 * Adaptador para o módulo de prospecção da Soci (compatível com placesSearch)
 */
export async function placesSearchTreg(keywords, location, { token } = {}) {
  const list = Array.isArray(keywords) ? keywords : [keywords];
  const allResults = [];
  const seen = new Set();

  for (const kw of list.slice(0, 3)) {
    const q = `${kw} em ${location}`;
    try {
      const places = await searchGoogleBusinesses(q, { token });
      for (const p of places) {
        if (!p.placeId || seen.has(p.placeId)) continue;
        seen.add(p.placeId);
        allResults.push({
          placeId: p.placeId,
          name: p.name,
          address: p.address,
          category: p.category,
          rating: p.rating,
          reviews: p.reviewsCount,
          phone: p.phone,
          website: p.website
        });
      }
    } catch (err) {
      console.warn(`[treg] Erro ao buscar "${q}":`, err.message);
    }
  }

  return allResults;
}
