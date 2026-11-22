// Telefonia (2.4) pela Twilio: a conta da plataforma (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) compra os números das
// subcontas, liga, grava e consulta números (Lookup). A Twilio chama os webhooks /api/phone/twilio/* assinados com
// X-Twilio-Signature; as respostas são TwiML montado aqui.
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.twilio.com/2010-04-01';
const LOOKUP = 'https://lookups.twilio.com/v2/PhoneNumbers';
const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export const twilioConfigured = (env = process.env) => Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);

/** E.164 for Brazil by default: "(11) 99999-0000" → +5511999990000. '' when it does not look like a phone. */
export function e164(value, country = '55') {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  if (digits.startsWith('00')) return digits.length >= 10 ? `+${digits.slice(2)}` : '';
  if (digits.length === 10 || digits.length === 11) return `+${country}${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  return '';
}

/** X-Twilio-Signature: base64 HMAC-SHA1 of the full URL followed by the POST params sorted by name (name+value). */
export function twilioSignature(url, params, token) {
  const data = Object.keys(params || {}).sort().reduce((acc, key) => acc + key + (params[key] ?? ''), url);
  return createHmac('sha1', token).update(data).digest('base64');
}
export function twilioSignatureValid(url, params, signature, token = process.env.TWILIO_AUTH_TOKEN) {
  if (!token || !signature) return false;
  const expected = Buffer.from(twilioSignature(url, params, token)), given = Buffer.from(String(signature));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---- TwiML ----
const attrs = options => Object.entries(options || {}).filter(([, value]) => value !== undefined && value !== '' && value !== null)
  .map(([key, value]) => ` ${key}="${xml(value)}"`).join('');
export const twiml = {
  say: (text, { voice = 'Polly.Camila', language = 'pt-BR' } = {}) => `<Say${attrs({ voice, language })}>${xml(String(text).slice(0, 3000))}</Say>`,
  play: url => `<Play>${xml(url)}</Play>`,
  pause: seconds => `<Pause${attrs({ length: seconds })}/>`,
  gather: ({ action, digits = 1, timeout = 6, prompt = '', finishOnKey = '#' }) => `<Gather${attrs({ input: 'dtmf', action, method: 'POST', numDigits: digits, timeout, finishOnKey, actionOnEmptyResult: 'true' })}>${prompt}</Gather>`,
  dial: (numbers, { action, callerId, timeout = 20, record = false } = {}) => `<Dial${attrs({ action, method: 'POST', callerId, timeout, ...(record ? { record: 'record-from-answer-dual' } : {}) })}>${[].concat(numbers).map(n => `<Number>${xml(n)}</Number>`).join('')}</Dial>`,
  record: ({ action, maxLength = 120, transcribe = false } = {}) => `<Record${attrs({ action, method: 'POST', maxLength, playBeep: 'true', ...(transcribe ? { transcribe: 'true' } : {}) })}/>`,
  // Voice AI: listens to the caller's speech (Twilio transcribes it) and posts SpeechResult to `action`.
  listen: ({ action, language = 'pt-BR', prompt = '', timeout = 6 }) => `<Gather${attrs({ input: 'speech', action, method: 'POST', language, speechTimeout: 'auto', timeout, actionOnEmptyResult: 'true' })}>${prompt}</Gather>`,
  redirect: url => `<Redirect method="POST">${xml(url)}</Redirect>`,
  // Power dialer: the member's line and each contact join the same conference room.
  conference: (room, { endOnExit = false, beep = false, waitUrl = '', status = '' } = {}) => `<Dial><Conference${attrs({ startConferenceOnEnter: 'true', endConferenceOnExit: endOnExit ? 'true' : 'false', beep: beep ? 'true' : 'false', waitUrl, statusCallback: status, statusCallbackEvent: status ? 'end' : '' })}>${xml(room)}</Conference></Dial>`,
  hangup: () => '<Hangup/>',
  response: (...verbs) => `<?xml version="1.0" encoding="UTF-8"?><Response>${verbs.flat().filter(Boolean).join('')}</Response>`
};

/** The Twilio REST client of the platform account (one instance per request is cheap). */
export function twilioClient({ sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, request = fetch } = {}) {
  const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
  async function call(method, url, form) {
    if (!sid || !token) throw Object.assign(new Error('Telefonia não configurada (TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN).'), { status: 409 });
    const response = await request(url, { method, signal: AbortSignal.timeout(15000), headers: { Authorization: auth, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined })
      .catch(() => { throw Object.assign(new Error('A Twilio não respondeu.'), { status: 502 }); });
    const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(`Twilio: ${body.message || `HTTP ${response.status}`}`), { status: response.status === 404 ? 404 : 502, code: body.code });
    return body;
  }
  const account = `${API}/Accounts/${encodeURIComponent(sid || '')}`;
  return {
    /** Local numbers for sale: by area code (DDD) or digits contained. */
    async search({ country = 'BR', areaCode = '', contains = '', limit = 20 } = {}) {
      const query = new URLSearchParams({ PageSize: String(Math.min(limit, 30)), VoiceEnabled: 'true' });
      if (areaCode) query.set('Contains', `+55${String(areaCode).replace(/\D/g, '').slice(0, 2)}*`);
      if (contains) query.set('Contains', String(contains).replace(/[^\d*]/g, '').slice(0, 12));
      const body = await call('GET', `${account}/AvailablePhoneNumbers/${encodeURIComponent(country)}/Local.json?${query}`);
      return (body.available_phone_numbers || []).map(row => ({ number: row.phone_number, friendly: row.friendly_name, locality: row.locality || row.region || '' }));
    },
    buy: (number, hooks) => call('POST', `${account}/IncomingPhoneNumbers.json`, { PhoneNumber: number, VoiceUrl: hooks.voice, VoiceMethod: 'POST', StatusCallback: hooks.status, StatusCallbackMethod: 'POST', FriendlyName: hooks.name || number, ...(hooks.bundle ? { BundleSid: hooks.bundle } : {}), ...(hooks.address ? { AddressSid: hooks.address } : {}) }),
    release: numberSid => call('DELETE', `${account}/IncomingPhoneNumbers/${encodeURIComponent(numberSid)}.json`),
    /** An outbound call: Twilio dials `to` and asks `url` for the TwiML once it is answered. */
    dial: ({ to, from, url, status, machineDetection = '', timeout = 25 }) => call('POST', `${account}/Calls.json`, {
      To: to, From: from, Url: url, Method: 'POST', StatusCallback: status, StatusCallbackMethod: 'POST', Timeout: String(timeout),
      ...(status ? { StatusCallbackEvent: 'completed' } : {}), ...(machineDetection ? { MachineDetection: machineDetection, AsyncAmd: 'false' } : {})
    }),
    hangup: callSid => call('POST', `${account}/Calls/${encodeURIComponent(callSid)}.json`, { Status: 'completed' }),
    /** Lookup v2: valid or not, and the line type (mobile, landline, voip…). */
    async lookup(number) {
      const body = await call('GET', `${LOOKUP}/${encodeURIComponent(number)}?Fields=line_type_intelligence`);
      return { valid: Boolean(body.valid), number: body.phone_number || number, country: body.country_code || '', lineType: body.line_type_intelligence?.type || '', carrier: body.line_type_intelligence?.carrier_name || '' };
    },
    /** The recording audio (MP3), streamed by the server to signed-in users only. */
    recording: async recordingUrl => {
      if (!/^https:\/\/api\.twilio\.com\//.test(String(recordingUrl))) throw Object.assign(new Error('Gravação inválida.'), { status: 400 });
      const response = await request(`${recordingUrl}.mp3`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20000) }).catch(() => null);
      if (!response?.ok) throw Object.assign(new Error('Gravação indisponível.'), { status: 404 });
      return Buffer.from(await response.arrayBuffer());
    }
  };
}
