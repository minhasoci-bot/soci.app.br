/**
 * Whether this process runs the one-minute scheduler (automations, posts, campaigns) by itself.
 * On Supabase the official cron already calls /api/social/cron every minute, so a server started on
 * someone's machine stays quiet unless GO_LOCAL_SCHEDULER=1 asks for it. A serverless process never runs it.
 */
export function localScheduler(kind, env = process.env) {
  if (env.VERCEL) return false;
  return kind !== 'Supabase' || env.GO_LOCAL_SCHEDULER === '1';
}

/** What the console says at startup: the database in use and the scheduler. Only the host of the URL, never a key. */
export function startupLines({ backend, scheduler, env = process.env, dbPath = '' }) {
  const remote = backend === 'Supabase';
  const place = remote ? URL.parse(env.SUPABASE_URL || '')?.host : dbPath;
  const state = scheduler
    ? `ligado, a cada minuto.${remote ? ' Atenção: ele executa automações, publicações e campanhas neste banco, em paralelo ao cron de /api/social/cron.' : ''}`
    : `desligado. Este servidor não executa automações, publicações nem campanhas${remote ? '; quem executa é o cron de /api/social/cron. Para ligar aqui, use GO_LOCAL_SCHEDULER=1.' : '.'}`;
  return [`Banco: ${backend}${place ? ` (${place})` : ''}`, `Agendador: ${state}`];
}
