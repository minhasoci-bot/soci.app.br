import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsReport, businessReport, exchangeGoogle, useGoogleFetch } from '../google-integrations.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const scope = 'openid email https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/business.manage';

function fakeGoogle(calls = []) {
  return async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return reply({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope });
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) return reply({});
    if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) return reply({ email: 'dono@clinica.example' });
    if (url.startsWith('https://analyticsadmin.googleapis.com/v1beta/accountSummaries')) return reply({ accountSummaries: [{ displayName: 'Clínica', propertySummaries: [{ property: 'properties/123', displayName: 'Site da clínica' }] }] });
    if (url.startsWith('https://mybusinessaccountmanagement.googleapis.com/v1/accounts')) return reply({ accounts: [{ name: 'accounts/9', accountName: 'Clínica' }] });
    if (url.includes('mybusinessbusinessinformation.googleapis.com/v1/accounts/9/locations')) return reply({ locations: [{ name: 'locations/55', title: 'Clínica Centro', storefrontAddress: { addressLines: ['Rua A, 10'], locality: 'Belo Horizonte' } }] });
    if (url.startsWith('https://analyticsdata.googleapis.com/v1beta/properties/123:runReport')) {
      const month = new Date().toISOString().slice(0, 7).replace('-', '');
      return reply({ rows: [{ dimensionValues: [{ value: month }], metricValues: [{ value: '120' }, { value: '80' }, { value: '300' }] }] });
    }
    if (url.startsWith('https://businessprofileperformance.googleapis.com/v1/locations/55:fetchMultiDailyMetricsTimeSeries')) {
      const day = new Date(Date.now() - 86_400_000);
      const date = { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() };
      const series = (dailyMetric, value) => ({ dailyMetric, timeSeries: { datedValues: [{ date, value: String(value) }] } });
      return reply({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [series('BUSINESS_IMPRESSIONS_MOBILE_MAPS', 40), series('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 10), series('CALL_CLICKS', 3), series('WEBSITE_CLICKS', 5), series('BUSINESS_DIRECTION_REQUESTS', 2)] }] });
    }
    return reply({ error: { message: 'unexpected ' + url } }, 404);
  };
}

test('GA4 report fills 12 months and totals sessions, users and views', async () => {
  useGoogleFetch(fakeGoogle());
  const report = await analyticsReport('token', 'properties/123');
  assert.equal(report.months.length, 12);
  assert.deepEqual(report.totals, { sessions: 120, users: 80, views: 300 });
  assert.equal(report.months.at(-1).sessions, 120);
  await assert.rejects(analyticsReport('token', 'properties/../x'), /inválida/);
});

test('Business Profile report sums impressions and actions over 30 days', async () => {
  useGoogleFetch(fakeGoogle());
  const report = await businessReport('token', 'locations/55');
  assert.deepEqual(report.totals, { views: 50, calls: 3, website: 5, directions: 2 });
  assert.equal(report.days.length, 30);
  assert.equal(report.days.at(-1).views, 50);
});

test('Exchange keeps working when one Google product is not available', async () => {
  useGoogleFetch(async (input, options) => String(input).startsWith('https://mybusinessaccountmanagement')
    ? reply({ error: { message: 'Business Profile API has not been used in project 1', status: 'PERMISSION_DENIED' } }, 403)
    : fakeGoogle()(input, options));
  process.env.GOOGLE_CLIENT_ID = 'client'; process.env.GOOGLE_CLIENT_SECRET = 'secret';
  const found = await exchangeGoogle({ code: 'code', redirectUri: 'http://x/cb' });
  assert.equal(found.properties.length, 1);
  assert.deepEqual(found.locations, []);
  assert.match(found.errors.business, /não está liberada/);
});

test('A sub-account connects Google, picks a property and location, reads data and disconnects', async t => {
  process.env.GOOGLE_CLIENT_ID = 'client'; process.env.GOOGLE_CLIENT_SECRET = 'secret';
  const calls = [];
  useGoogleFetch(fakeGoogle(calls));
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const get = path => fetch(base + path, { redirect: 'manual' });
  const post = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

  assert.equal((await (await get('/api/google/workspace/status?workspace=demo')).json()).connected, false);
  const start = await get('/api/google/workspace/connect?workspace=demo');
  assert.equal(start.status, 302);
  const consent = new URL(start.headers.get('location'));
  assert.equal(consent.host, 'accounts.google.com');
  assert.match(consent.searchParams.get('scope'), /analytics\.readonly/);
  const state = consent.searchParams.get('state');

  const callback = await (await get(`/api/google/callback?state=${state}&code=abc`)).text();
  assert.match(callback, /Conta Google conectada/);
  assert.match(await (await get(`/api/google/callback?state=${state}&code=abc`)).text(), /expirou/);

  const status = await (await get('/api/google/workspace/status?workspace=demo&data=1')).json();
  assert.equal(status.connected, true);
  assert.equal(status.email, 'dono@clinica.example');
  assert.equal(status.gaProperty, 'properties/123');
  assert.equal(status.gbpLocation, 'locations/55');
  assert.equal(status.data.ga.totals.sessions, 120);
  assert.equal(status.data.gbp.totals.calls, 3);
  assert.equal(JSON.stringify(status).includes('access-1'), false);

  const cleared = await post('/api/google/workspace/select?workspace=demo', { gaProperty: '', gbpLocation: 'locations/55' });
  assert.equal(cleared.gaProperty, '');
  assert.equal(cleared.data.ga, null);
  const rejected = await post('/api/google/workspace/select?workspace=demo', { gaProperty: 'properties/999' });
  assert.match(rejected.error, /Escolha uma propriedade/);

  const off = await post('/api/google/workspace/disconnect?workspace=demo', {});
  assert.equal(off.connected, false);
  assert.ok(calls.some(call => call.url.startsWith('https://oauth2.googleapis.com/revoke')));
});
