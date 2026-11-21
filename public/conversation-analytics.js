// Conversas → Análises → Visão geral: message volume per channel and per day, first-response time,
// who is still waiting for an answer and who answers (team, automations, AI). The SLA tab next to it
// measures the same conversations against the targets set in Configurações.

const ORIGIN = { human: 'Equipe', '': 'Equipe', workflow: 'Automações', agent: 'Agentes de IA', ai: 'Agentes de IA' };
const DAY = 864e5;
const median = list => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Minutes as "45 s", "12 min", "3 h 05" or "2 d 4 h". */
export function duration(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) { const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`; }
  const d = Math.floor(minutes / 1440), h = Math.round((minutes % 1440) / 60); return `${d} d${h ? ` ${h} h` : ''}`;
}

/**
 * Numbers for one period. A "first response" is the time from the first customer message that is waiting
 * (no reply yet on that contact and channel) to the next outbound message on the same contact and channel.
 * Internal notes never count, as messages or as answers.
 */
export function conversationStats(state, { days = 30, channel = '', now = Date.now(), timeZone } = {}) {
  const since = days === 'all' ? 0 : now - Number(days) * DAY;
  const all = (state.messages || []).filter(m => m.channel !== 'Note' && m.origin !== 'internal' && (!channel || m.channel === channel))
    .sort((a, b) => String(a.created).localeCompare(String(b.created)));
  const inPeriod = all.filter(m => Date.parse(m.created) >= since && Date.parse(m.created) <= now);
  const firstSeen = new Map();
  for (const m of all) if (!firstSeen.has(m.contactId)) firstSeen.set(m.contactId, Date.parse(m.created));

  const waiting = new Map(), responses = [], perChannel = new Map(), byOrigin = new Map();
  const row = name => { if (!perChannel.has(name)) perChannel.set(name, { channel: name, received: 0, sent: 0, times: [] }); return perChannel.get(name); };
  for (const m of all) {
    const key = `${m.contactId}:${m.channel}`, at = Date.parse(m.created), counted = at >= since && at <= now;
    if (m.direction === 'Inbound') {
      if (counted) row(m.channel).received++;
      if (!waiting.has(key)) waiting.set(key, { first: m, last: m }); else waiting.get(key).last = m;
      continue;
    }
    if (counted) { row(m.channel).sent++; const origin = ORIGIN[m.origin ?? ''] || 'Outros'; byOrigin.set(origin, (byOrigin.get(origin) || 0) + 1); }
    const open = waiting.get(key)?.first;
    if (!open) continue;
    waiting.delete(key);
    const start = Date.parse(open.created);
    if (start < since || start > now) continue;
    const minutes = Math.max(0, (at - start) / 60000);
    responses.push({ minutes, channel: m.channel, origin: m.origin || 'human' });
    row(m.channel).times.push(minutes);
  }
  // Waiting since the first unanswered message; the preview is the latest one.
  const pending = [...waiting.values()].filter(({ first }) => Date.parse(first.created) <= now)
    .map(({ first, last }) => ({ contactId: first.contactId, channel: first.channel, since: first.created, minutes: (now - Date.parse(first.created)) / 60000, body: String(last.body || '').slice(0, 140) }))
    .sort((a, b) => b.minutes - a.minutes);

  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' });
  const span = days === 'all' ? Math.min(90, Math.max(1, Math.ceil((now - (inPeriod[0] ? Date.parse(inPeriod[0].created) : now)) / DAY) + 1)) : Math.min(90, Number(days));
  const series = [];
  for (let i = span - 1; i >= 0; i--) series.push({ day: fmt.format(new Date(now - i * DAY)), received: 0, sent: 0 });
  const index = new Map(series.map((item, i) => [item.day, i]));
  for (const m of inPeriod) { const i = index.get(fmt.format(new Date(m.created))); if (i !== undefined) series[i][m.direction === 'Inbound' ? 'received' : 'sent']++; }

  const times = responses.map(r => r.minutes);
  const contacts = new Set(inPeriod.map(m => m.contactId));
  return {
    conversations: contacts.size,
    newConversations: [...contacts].filter(id => firstSeen.get(id) >= since).length,
    received: inPeriod.filter(m => m.direction === 'Inbound').length,
    sent: inPeriod.filter(m => m.direction === 'Outbound').length,
    responses: responses.length,
    medianResponse: median(times),
    averageResponse: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    withinHour: times.length ? times.filter(t => t <= 60).length / times.length : null,
    waiting: pending,
    series,
    channels: [...perChannel.values()].map(item => ({ channel: item.channel, received: item.received, sent: item.sent, median: median(item.times) }))
      .filter(item => item.received || item.sent).sort((a, b) => (b.received + b.sent) - (a.received + a.sent)),
    origins: [...byOrigin].map(([origin, count]) => ({ origin, count })).sort((a, b) => b.count - a.count)
  };
}

/** Grouped bars (received and sent per day) as inline SVG, sized by viewBox so it scales with the card. */
export function volumeChart(series) {
  const max = Math.max(1, ...series.flatMap(d => [d.received, d.sent]));
  const w = 720, hgt = 180, pad = 22, slot = (w - pad) / series.length, bar = Math.max(1.5, Math.min(14, slot / 2 - 1.5));
  const y = v => hgt - 18 - (v / max) * (hgt - 32);
  const bars = series.map((d, i) => {
    const x = pad + i * slot + slot / 2;
    const label = `${d.day.split('-').reverse().slice(0, 2).join('/')}: ${d.received} recebidas, ${d.sent} enviadas`;
    return `<g><title>${label}</title><rect x="${(x - bar - 0.5).toFixed(1)}" y="${y(d.received).toFixed(1)}" width="${bar.toFixed(1)}" height="${(hgt - 18 - y(d.received)).toFixed(1)}" rx="2" class="ca-in"/>`
      + `<rect x="${(x + 0.5).toFixed(1)}" y="${y(d.sent).toFixed(1)}" width="${bar.toFixed(1)}" height="${(hgt - 18 - y(d.sent)).toFixed(1)}" rx="2" class="ca-out"/></g>`;
  }).join('');
  const step = Math.ceil(series.length / 8);
  const ticks = series.map((d, i) => (i % step === 0 && series.length - 1 - i >= step / 2) || i === series.length - 1 ? `<text x="${(pad + i * slot + slot / 2).toFixed(1)}" y="${hgt - 4}" text-anchor="middle">${d.day.split('-').reverse().slice(0, 2).join('/')}</text>` : '').join('');
  return `<svg class="ca-chart" viewBox="0 0 ${w} ${hgt}" role="img" aria-label="Mensagens recebidas e enviadas por dia"><text x="0" y="12" class="ca-max">${max}</text><line x1="${pad}" x2="${w}" y1="${hgt - 18}" y2="${hgt - 18}" class="ca-axis"/>${bars}${ticks}</svg>`;
}
