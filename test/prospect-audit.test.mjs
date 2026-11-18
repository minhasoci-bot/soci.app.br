import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml, auditSignals, auditableUrl, blockedAddress, collectProspectAudit, reputationScore, websiteHealth } from '../prospect-audit.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const html = `<!doctype html><html lang="pt-BR"><head><title>Clínica Sorriso | Dentista em Campinas</title>
<meta name="description" content="Clínica odontológica em Campinas com implantes, clareamento e ortodontia. Agende sua avaliação.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="https://sorriso.example/">
<meta property="og:title" content="Clínica Sorriso"><script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>
<script>fbq('init','123')</script><script type="application/ld+json">{}</script><link href="/wp-content/themes/x.css"></head>
<body><h1>Clínica Sorriso</h1><img src="a.jpg" alt="Fachada"><a href="https://wa.me/5519999999999">WhatsApp</a>
<a href="https://www.instagram.com/clinicasorriso/">Instagram</a><a href="https://facebook.com/sharer.php?u=x">Compartilhar</a>
<a href="/politica-de-privacidade">Privacidade</a><div>Usamos cookies. <button>Aceitar</button></div></body></html>`;

test('HTML analysis detects SEO, compliance, stack and social profiles', () => {
  const result = analyzeHtml(html,{ url:'https://sorriso.example/',headers:{ 'strict-transport-security':'max-age=1' },httpRedirectsToHttps:true,sitemap:true,robots:false });
  const ok = (rows,key) => rows.find(row => row.key === key).ok;
  assert.equal(ok(result.seo,'title'),true);
  assert.equal(ok(result.seo,'description'),true);
  assert.equal(ok(result.seo,'h1'),true);
  assert.equal(ok(result.seo,'robots'),false);
  assert.equal(ok(result.security,'hsts'),true);
  assert.equal(ok(result.compliance,'privacy'),true);
  assert.equal(ok(result.compliance,'consent'),true);
  assert.equal(ok(result.compliance,'terms'),false);
  assert.deepEqual(result.stack.map(item => item.key).sort(),['ga4','metaPixel','schema','whatsapp','wordpress'].sort());
  assert.deepEqual(result.social.map(item => item.network),['instagram']);
});

test('Website health weights speed 40% and the other pillars 20% each', () => {
  const pass = [{ ok:true }], fail = [{ ok:false }];
  assert.equal(websiteHealth({ performance:{ score:50 },seo:pass,security:pass,compliance:fail }),60);
  assert.equal(websiteHealth({ performance:null,seo:pass,security:fail,compliance:[{ ok:null }] }),50);
  assert.equal(reputationScore(null,10),null);
  assert.ok(reputationScore(4.8,250) > reputationScore(4.8,3));
});

test('Audit targets reject private networks and unusual ports', () => {
  for (const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.0.1','172.20.0.1','::1','fd00::1','::ffff:127.0.0.1','100.64.0.1']) assert.equal(blockedAddress(ip),true,ip);
  assert.equal(blockedAddress('8.8.8.8'),false);
  assert.equal(auditableUrl('http://169.254.169.254/latest'),null);
  assert.equal(auditableUrl('https://example.com:8080'),null);
  assert.equal(auditableUrl('http://intranet.local'),null);
  assert.equal(auditableUrl('ftp://example.com'),null);
  assert.equal(auditableUrl('empresa.com.br').href,'https://empresa.com.br/');
});

test('Collector combines site, PageSpeed and live Google profile without keeping raw profile content', async () => {
  const pages = {
    'https://sorriso.example/':{ status:200,url:'https://sorriso.example/',headers:{},text:html,body:Buffer.from(html),ttfb:200 },
    'http://sorriso.example/':{ status:200,url:'https://sorriso.example/',headers:{},text:'',body:Buffer.alloc(0),ttfb:10 },
    'https://sorriso.example/sitemap.xml':{ status:200,url:'',headers:{},text:'<urlset></urlset>',body:Buffer.alloc(0) },
    'https://sorriso.example/robots.txt':{ status:404,url:'',headers:{},text:'',body:Buffer.alloc(0) }
  };
  const audit = await collectProspectAudit({ name:'Clínica Sorriso',city:'Campinas',website:'sorriso.example' },{
    places:true,lookupPlace:async () => 'ChIJ-found',
    details:async () => ({ businessStatus:'OPERATIONAL',nationalPhoneNumber:'(19) 3333-3333',websiteUri:'https://sorriso.example',rating:4.9,userRatingCount:120,photos:new Array(10).fill({}),primaryType:'dentist' }),
    page:async url => pages[String(url.href || url)] || Promise.reject(new Error('offline')),
    speed:async (url,strategy) => ({ score:strategy === 'mobile' ? 40 : 90,lcp:'3,1 s' })
  });
  assert.equal(audit.placeId,'ChIJ-found');
  assert.equal(audit.website.health.performance.score,55);
  assert.equal(audit.website.health.parts.security,75);
  assert.equal(audit.reputation.source,'google');
  assert.equal(JSON.stringify(audit).includes('3333-3333'),false);
  const signals = auditSignals(audit);
  assert.equal(signals.ads,7);
  assert.equal(signals.social,2.5);
  assert.ok(signals.listings > 7);
});

async function start(prospectAudit) {
  const { server, host } = makeServer({ allowLocalAccess:true,auth:null,store:createSqliteStore(':memory:'),port:0,prospectAudit });
  await new Promise((resolve,reject) => { server.on('error',reject); server.listen(0,host,resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (op,id,data) => {
    const r = await fetch(base+'/api/agency/prospecting-action',{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify({ op,id,data }) });
    return { status:r.status,body:await r.json() };
  };
  return { base,call,close:() => new Promise(resolve => server.close(resolve)) };
}

test('Generating an audit applies the server-collected audit, keeps manual overrides and ignores client-supplied audit data', async t => {
  const fake = { checkedAt:'2026-11-18T00:00:00.000Z',placeId:'ChIJ-auto',website:{ url:'https://x.example/',reachable:true,health:{ score:62,parts:{} } },stack:[],social:[] };
  let seen = null;
  const local = await start(async row => { seen = row; return fake; }); t.after(local.close);
  const saved = await local.call('save','',{ name:'Empresa X',website:'x.example',audit:'on' });
  assert.equal(saved.status,200);
  const id = saved.body.result;
  assert.equal(seen.name,'Empresa X');
  let row = saved.body.agency.prospects.find(item => item.id === id);
  assert.equal(row.report.signals.website,6.2);
  assert.equal(row.placeId,'ChIJ-auto');
  const audited = await local.call('audit',id,{ score_website:'9',audit:{ website:{ health:{ score:100 } } } });
  row = audited.body.agency.prospects.find(item => item.id === id);
  assert.equal(row.report.signals.website,9);
  assert.equal(row.report.audit.website.health.score,62);
  const sections = audited.body.agency.prospecting.sections.map(item => item.key);
  assert.ok(sections.includes('health') && sections.includes('stack'));
  const share = await local.call('share',id);
  const page = await (await fetch(local.base+'/prospecting/report/'+share.body.result)).text();
  assert.match(page,/Saúde do site/);
  assert.match(page,/62/);
});
