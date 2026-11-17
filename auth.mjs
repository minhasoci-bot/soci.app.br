import { createHash, randomBytes } from 'node:crypto';

const failure = (message, status) => Object.assign(new Error(message), { status });
const ACCESS = 'go_access';
const REFRESH = 'go_refresh';
const GOOGLE_FLOW = 'go_google_flow';
const DAY = 86400;

export function afterLogin(next) {
  if (typeof next !== 'string' || next.length > 512 || /[\r\n]/.test(next)) return '/app';
  return ['/app','/app/','/painel','/painel/'].includes(next.split(/[?#]/,1)[0]) ? next : '/app';
}

export function accountProfile(user) {
  const { full_name, avatar_url } = user.user_metadata || {};
  const name = typeof full_name === 'string' && full_name.trim() ? full_name.trim().slice(0,100) : user.email;
  const picture = typeof avatar_url === 'string' && /^https:\/\//i.test(avatar_url) ? avatar_url.slice(0,1024) : '';
  return { id: user.id, email: user.email, name, picture };
}

function cookieName(req, name) {
  return process.env.VERCEL || req.socket?.encrypted ? '__Host-' + name : name;
}

function readCookie(req, name) {
  const prefix = cookieName(req, name) + '=';
  return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length) || '';
}

function writeCookie(req, res, name, value, age) {
  const key = cookieName(req, name);
  const secure = key.startsWith('__Host-') ? '; Secure' : '';
  res.appendHeader('Set-Cookie', `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`);
}

function clearSession(req, res) {
  for (const name of [ACCESS, REFRESH, GOOGLE_FLOW]) writeCookie(req, res, name, '', 0);
}

function saveSession(req, res, session) {
  if (!session.access_token || !session.refresh_token) throw failure('O Supabase não retornou uma sessão válida.',502);
  writeCookie(req, res, ACCESS, session.access_token, Math.max(1, Math.floor(Number(session.expires_in) || 3600)));
  writeCookie(req, res, REFRESH, session.refresh_token, 30 * DAY);
}

function buildFlow(next) {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, next: afterLogin(next), challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function googleUser(user, verifiedToken) {
  if (!user?.email || !user.email_confirmed_at || user.is_anonymous ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(user.id || '') ||
      !user.identities?.some(identity => identity.provider === 'google')) return null;
  // Only read AMR after Supabase validates or issues this access token.
  try {
    const claims = JSON.parse(Buffer.from(verifiedToken.split('.')[1], 'base64url').toString('utf8'));
    return claims.amr?.some(entry => entry.method === 'oauth') ? user : null;
  } catch {
    return null;
  }
}

export function createSupabaseAuth({ projectUrl, publishableKey, request = fetch }) {
  const base = new URL(projectUrl);
  if (base.origin !== base.href.slice(0,-1) || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base.origin) || !publishableKey) {
    throw new Error('Set SUPABASE_URL to the HTTPS project origin and SUPABASE_PUBLISHABLE_KEY to its public key.');
  }

  function endpoint(path, query) {
    const target = new URL(`/auth/v1/${path}`, base);
    target.search = new URLSearchParams(query);
    return target;
  }

  async function call(path, { query, body, token } = {}) {
    let response;
    try {
      response = await request(endpoint(path, query), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          apikey: publishableKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw failure('Não foi possível conectar ao Supabase. Tente de novo.',503);
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (response.ok && data) return data;
    const message = response.status === 429 ? 'Muitas tentativas. Aguarde e tente de novo.' : response.status >= 500
      ? 'O Supabase não conseguiu concluir a solicitação. Tente de novo.'
      : 'Não foi possível autenticar. Tente de novo.';
    throw failure(message, response.ok ? 502 : response.status);
  }

  const grant = (type, body) => call('token', { query: { grant_type: type }, body });
  async function refresh(req, res, token) {
    try {
      const session = await grant('refresh_token', { refresh_token: token });
      if (!googleUser(session.user, session.access_token)) {
        clearSession(req,res);
        return null;
      }
      saveSession(req,res,session);
      return session;
    } catch (error) {
      if (![400,401,403].includes(error.status)) throw error;
      clearSession(req,res);
      return null;
    }
  }

  return {
    hasSession: req => Boolean(readCookie(req,ACCESS) || readCookie(req,REFRESH)),
    async user(req,res) {
      const token = readCookie(req,ACCESS);
      if (token) {
        try { return googleUser(await call('user',{ token }), token); }
        catch (error) { if (![401,403].includes(error.status)) throw error; }
      }
      const refreshToken = readCookie(req,REFRESH);
      return refreshToken ? (await refresh(req,res,refreshToken))?.user : null;
    },
    async google(req,res,origin,next) {
      const settings = await call('settings');
      if (!settings.external?.google) throw failure('O login com Google ainda não está habilitado no Supabase.',503);
      const { verifier, challenge, next: destination } = buildFlow(next);
      const flow = Buffer.from(JSON.stringify({ verifier, next: destination })).toString('base64url');
      writeCookie(req,res,GOOGLE_FLOW,flow,600);
      return endpoint('authorize', {
        provider: 'google',
        redirect_to: `${origin}/api/auth/callback/google`,
        code_challenge: challenge,
        code_challenge_method: 's256',
        prompt: 'select_account'
      }).href;
    },
    async callback(req,res,params,destination = (_user,next) => next) {
      const stored = readCookie(req,GOOGLE_FLOW);
      writeCookie(req,res,GOOGLE_FLOW,'',0);
      const code = params.get('code');
      const retry = '/login?error=google';
      if (!stored || !code || code.length > 512 || params.has('error')) return retry;
      try {
        const flow = JSON.parse(Buffer.from(stored,'base64url').toString('utf8'));
        if (!/^[a-zA-Z0-9_-]{43}$/.test(flow.verifier)) return retry;
        const session = await grant('pkce',{ auth_code: code, code_verifier: flow.verifier });
        if (!googleUser(session.user, session.access_token)) return retry;
        const next = await destination(accountProfile(session.user), afterLogin(flow.next));
        saveSession(req,res,session);
        return afterLogin(next);
      } catch {
        return retry;
      }
    },
    async logout(req,res) {
      try {
        let token = readCookie(req,ACCESS);
        const refreshToken = readCookie(req,REFRESH);
        if (!token && refreshToken) token = (await refresh(req,res,refreshToken))?.access_token;
        if (token) await call('logout',{ query: { scope: 'local' },body: {},token });
      } finally {
        clearSession(req,res);
      }
    }
  };
}

export function authFromEnv(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  return createSupabaseAuth({ projectUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
}
