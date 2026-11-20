import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { blankAgency, executeAgency, hydrateAgency } from '../agency-model.mjs';
import { createCanonicalTemplates, pranchetaPresets } from '../prancheta-model.mjs';
import { nav as subaccountNav } from '../ui/screens.js';
import { agencyNav } from '../ui/agency-data.js';

test('Prancheta: Workspace initializes with empty pranchetaFiles array and hydrates cleanly', () => {
  const ws = blank('Subconta Teste');
  assert.ok(Array.isArray(ws.pranchetaFiles), 'pranchetaFiles should be an array');
  assert.equal(ws.pranchetaFiles.length, 0);

  const raw = blank('Teste');
  delete raw.pranchetaFiles;
  const hydrated = hydrateWorkspace(raw);
  assert.ok(Array.isArray(hydrated.pranchetaFiles));
});

test('Prancheta: Creates, updates, duplicates, and deletes designs in a subaccount', () => {
  const ws = blank('Subconta Marketing');

  // 1. Create design
  const designId = execute(ws, {
    type: 'prancheta-save',
    data: {
      name: 'Carrossel Lançamento',
      format: 'instagram-carousel',
      width: 1080,
      height: 1350,
      pages: [
        {
          id: 'slide-1',
          name: 'Capa',
          background: '#101014',
          nodes: [
            { id: 'title-1', type: 'TEXT', text: 'Chegou o Novo Produto', x: 80, y: 300, fontSize: 64 }
          ]
        }
      ]
    }
  });

  assert.ok(designId);
  assert.equal(ws.pranchetaFiles.length, 1);
  const created = ws.pranchetaFiles[0];
  assert.equal(created.id, designId);
  assert.equal(created.name, 'Carrossel Lançamento');
  assert.equal(created.format, 'instagram-carousel');
  assert.equal(created.width, 1080);
  assert.equal(created.height, 1350);
  assert.equal(created.pages.length, 1);

  // 2. Update design
  const updatedId = execute(ws, {
    type: 'prancheta-save',
    id: designId,
    data: {
      name: 'Carrossel Lançamento - Versão 2',
      format: 'instagram-carousel',
      width: 1080,
      height: 1350,
      pages: [
        ...created.pages,
        { id: 'slide-2', name: 'Benefícios', background: '#17171E', nodes: [] }
      ]
    }
  });

  assert.equal(updatedId, designId);
  assert.equal(ws.pranchetaFiles.length, 1);
  assert.equal(ws.pranchetaFiles[0].name, 'Carrossel Lançamento - Versão 2');
  assert.equal(ws.pranchetaFiles[0].pages.length, 2);

  // 3. Duplicate design
  const copyId = execute(ws, {
    type: 'prancheta-duplicate',
    id: designId
  });

  assert.ok(copyId);
  assert.notEqual(copyId, designId);
  assert.equal(ws.pranchetaFiles.length, 2);
  const duplicated = ws.pranchetaFiles.find(f => f.id === copyId);
  assert.ok(duplicated);
  assert.equal(duplicated.name, 'Carrossel Lançamento - Versão 2 (Cópia)');
  assert.equal(duplicated.pages.length, 2);

  // 4. Delete original design
  const deletedId = execute(ws, {
    type: 'prancheta-delete',
    id: designId
  });

  assert.equal(deletedId, designId);
  assert.equal(ws.pranchetaFiles.length, 1);
  assert.equal(ws.pranchetaFiles[0].id, copyId);
});

test('Prancheta: Subaccounts maintain strictly isolated design files', () => {
  const subcontaA = blank('Subconta Restaurante');
  const subcontaB = blank('Subconta Imobiliária');

  const idA = execute(subcontaA, {
    type: 'prancheta-save',
    data: { name: 'Cardápio Semanal', format: 'story-reels', width: 1080, height: 1920 }
  });

  const idB = execute(subcontaB, {
    type: 'prancheta-save',
    data: { name: 'Imóvel em Destaque', format: 'instagram-feed', width: 1080, height: 1080 }
  });

  assert.equal(subcontaA.pranchetaFiles.length, 1);
  assert.equal(subcontaA.pranchetaFiles[0].id, idA);
  assert.equal(subcontaA.pranchetaFiles[0].name, 'Cardápio Semanal');

  assert.equal(subcontaB.pranchetaFiles.length, 1);
  assert.equal(subcontaB.pranchetaFiles[0].id, idB);
  assert.equal(subcontaB.pranchetaFiles[0].name, 'Imóvel em Destaque');

  // Verify subconta A cannot access or delete subconta B's design
  assert.throws(() => {
    execute(subcontaA, { type: 'prancheta-delete', id: idB });
  }, /Design não encontrado/);
});

test('Prancheta: Export to Mídia Drive creates file in subaccount files gallery', () => {
  const ws = blank('Subconta Vendas');
  const mockPngUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const designId = execute(ws, {
    type: 'prancheta-save',
    data: {
      name: 'Banner Black Friday',
      format: 'banner-web',
      width: 1920,
      height: 1080,
      thumbnail: mockPngUri
    }
  });

  assert.equal(ws.files.length, 0);

  const fileId = execute(ws, {
    type: 'prancheta-export-media',
    id: designId,
    data: {
      name: 'Banner Black Friday Export'
    }
  });

  assert.ok(fileId);
  assert.equal(ws.files.length, 1);
  const mediaFile = ws.files[0];
  assert.equal(mediaFile.id, fileId);
  assert.equal(mediaFile.name, 'Banner Black Friday Export.png');
  assert.equal(mediaFile.data, mockPngUri);
  assert.equal(mediaFile.type, 'image/png');
});

test('Prancheta: Send to Social Planner creates draft post with exported media', () => {
  const ws = blank('Subconta Social');
  const mockPngUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const designId = execute(ws, {
    type: 'prancheta-save',
    data: {
      name: 'Post Dica do Dia',
      format: 'instagram-feed',
      thumbnail: mockPngUri
    }
  });

  assert.equal(ws.socialPosts.length, 0);

  const result = execute(ws, {
    type: 'prancheta-to-social',
    id: designId,
    data: {
      body: 'Confira a dica de hoje para acelerar seu negócio digital.'
    }
  });

  assert.ok(result.fileId);
  assert.ok(result.postId);
  assert.equal(ws.socialPosts.length, 1);
  const post = ws.socialPosts[0];
  assert.equal(post.id, result.postId);
  assert.equal(post.status, 'Draft');
  assert.equal(post.channel, 'Instagram');
  assert.equal(post.body, 'Confira a dica de hoje para acelerar seu negócio digital.');
  assert.equal(post.media.length, 1);
  assert.equal(post.media[0].fileId, result.fileId);
});

test('Prancheta: Creates design from Canonical Templates (Método HEAD)', () => {
  const ws = blank('Subconta Agência');

  const designId = execute(ws, {
    type: 'prancheta-template',
    data: {
      templateId: 'template-head-carousel'
    }
  });

  assert.ok(designId);
  assert.equal(ws.pranchetaFiles.length, 1);
  const design = ws.pranchetaFiles[0];
  assert.equal(design.name, 'Carrossel Método HEAD');
  assert.equal(design.format, 'instagram-carousel');
  assert.equal(design.width, 1080);
  assert.equal(design.height, 1350);
  assert.equal(design.pages.length, 3);
  assert.equal(design.pages[0].name, 'Lâmina 1 · Gancho');
  assert.equal(design.pages[1].name, 'Lâmina 2 · Tensão');
  assert.equal(design.pages[2].name, 'Lâmina 3 · CTA Final');
});

test('Prancheta: HTTP API routes (/api/prancheta/*) work with subaccount isolation', async (t) => {
  const { makeServer } = await import('../server.mjs');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };

  // 1. Get canonical templates
  const tplRes = await send('/api/prancheta/templates?workspace=demo');
  assert.equal(tplRes.status, 200);
  assert.ok(Array.isArray(tplRes.body.templates));
  assert.ok(tplRes.body.templates.some(tpl => tpl.id === 'template-head-carousel'));
  assert.ok(Array.isArray(tplRes.body.presets));

  // 2. Create a new design via API in demo subaccount
  const createRes = await send('/api/prancheta/files?workspace=demo', {
    name: 'Post Promocional API',
    format: 'instagram-feed',
    width: 1080,
    height: 1080,
    thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  });
  assert.equal(createRes.status, 200);
  assert.ok(createRes.body.id);
  const designId = createRes.body.id;

  // 3. Get single file with full DocumentData representation
  const fileRes = await send(`/api/prancheta/file?workspace=demo&id=${designId}`);
  assert.equal(fileRes.status, 200);
  assert.equal(fileRes.body.id, designId);
  assert.equal(fileRes.body.name, 'Post Promocional API');
  assert.ok(fileRes.body.document);
  assert.equal(fileRes.body.document.version, 1);

  // 3b. Save full vector DocumentData (as sent by Steam LAB editor)
  const steamDoc = {
    version: 1,
    name: 'Steam Vector Art',
    pages: [{ id: 'p1', name: 'Page 1', children: ['n1'], background: '#101014' }],
    nodes: {
      n1: { id: 'n1', type: 'FRAME', name: 'Root Frame', x: 0, y: 0, width: 1080, height: 1080 }
    },
    images: {}
  };
  const saveSteamRes = await send('/api/prancheta/save?workspace=demo', {
    name: 'Steam Vector Art',
    document: steamDoc
  });
  assert.equal(saveSteamRes.status, 200);
  assert.ok(saveSteamRes.body.id);
  const steamFileRes = await send(`/api/prancheta/file?workspace=demo&id=${saveSteamRes.body.id}`);
  assert.equal(steamFileRes.body.name, 'Steam Vector Art');
  assert.equal(steamFileRes.body.document.nodes.n1.name, 'Root Frame');

  // 3c. List designs
  const listRes = await send('/api/prancheta/files?workspace=demo');
  assert.equal(listRes.status, 200);
  assert.ok(listRes.body.files.some(f => f.id === designId));

  // 4. Duplicate design
  const dupRes = await send('/api/prancheta/duplicate?workspace=demo', { id: designId });
  assert.equal(dupRes.status, 201);
  assert.ok(dupRes.body.id);

  // 5. Export to Mídia Drive
  const exportRes = await send('/api/prancheta/export-media?workspace=demo', {
    id: designId,
    name: 'Arte Exportada API'
  });
  assert.equal(exportRes.status, 200);
  assert.ok(exportRes.body.fileId);

  // 6. Delete design
  const delRes = await send('/api/prancheta/delete?workspace=demo', { id: designId });
  assert.equal(delRes.status, 200);
  assert.ok(!delRes.body.files.some(f => f.id === designId));
});

test('Prancheta: Located in Agency navigation and NOT in Subaccount navigation', () => {
  // Subaccount nav must NOT contain prancheta
  assert.equal(subaccountNav.some(item => item[0] === 'prancheta'), false, 'Subaccount nav must not contain prancheta');

  // Agency nav MUST contain prancheta
  const agencyPrancheta = agencyNav.find(item => item[0] === 'prancheta');
  assert.ok(agencyPrancheta, 'Agency nav must contain prancheta');
  assert.equal(agencyPrancheta[1], 'Prancheta');
  assert.equal(agencyPrancheta[2], 'palette');
});

test('Prancheta: Agency initializes, hydrates and executes prancheta CRUD actions', () => {
  const agency = blankAgency();
  assert.ok(Array.isArray(agency.pranchetaFiles), 'Agency should have pranchetaFiles array');
  assert.equal(agency.pranchetaFiles.length, 0);

  const raw = { ...blankAgency() };
  delete raw.pranchetaFiles;
  const hydrated = hydrateAgency(raw);
  assert.ok(Array.isArray(hydrated.pranchetaFiles));

  // 1. Create artwork in agency
  const fileId = executeAgency(agency, {
    type: 'prancheta-save',
    data: {
      name: 'Carrossel Branding Agência',
      format: 'instagram-carousel',
      width: 1080,
      height: 1350,
      pages: [
        {
          id: 'slide-1',
          name: 'Capa',
          background: '#101014',
          nodes: [
            { id: 't1', type: 'TEXT', text: 'Identidade da Agência', x: 80, y: 200, fontSize: 50 }
          ]
        }
      ]
    }
  });

  assert.ok(fileId);
  assert.equal(agency.pranchetaFiles.length, 1);
  assert.equal(agency.pranchetaFiles[0].name, 'Carrossel Branding Agência');

  // 2. Duplicate artwork
  const copyId = executeAgency(agency, {
    type: 'prancheta-duplicate',
    id: fileId
  });
  assert.ok(copyId);
  assert.equal(agency.pranchetaFiles.length, 2);
  assert.equal(agency.pranchetaFiles[0].name, 'Carrossel Branding Agência (Cópia)');

  // 3. Create from template
  const tplId = executeAgency(agency, {
    type: 'prancheta-template',
    data: { templateId: 'template-head-carousel' }
  });
  assert.ok(tplId);
  assert.equal(agency.pranchetaFiles.length, 3);
  assert.equal(agency.pranchetaFiles[0].name, 'Carrossel Método HEAD');

  // 4. Delete artwork
  executeAgency(agency, {
    type: 'prancheta-delete',
    id: copyId
  });
  assert.equal(agency.pranchetaFiles.length, 2);
  assert.ok(!agency.pranchetaFiles.some(f => f.id === copyId));
});

