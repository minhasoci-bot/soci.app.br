import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { editKnowledgeBase } from '../ai-model.mjs';

const ler = caminho => readFile(new URL(`../${caminho}`, import.meta.url), 'utf8');

test('base de conhecimento nova nasce com um nome só, sem "Nova base / Nueva base"', () => {
  const state = {};
  editKnowledgeBase(state, 'create', {});
  assert.equal(state.knowledgeBases[0].name, 'Nova base de conhecimento');
});

test('a tela cria a base com o nome no idioma de quem está usando', async () => {
  const hub = await ler('ui/agent-hub.js');
  assert.match(hub, /request\('kb-create', \{ name: tr\('Nova base de conhecimento'\) \}\)/);
  const { default: es } = await import('../ui/locales/es.js');
  assert.equal(es['Nova base de conhecimento'], 'Nueva base de conocimiento');
});

test('o exemplo de mensagem do envio fala do tipo certo de documento', async () => {
  const { exemploDeMensagem } = await import('../ui/documents.js');
  assert.equal(exemploDeMensagem('proposal'), 'Olá! Segue a proposta conforme conversamos.');
  assert.equal(exemploDeMensagem('contract'), 'Olá! Segue o contrato conforme conversamos.');
  assert.equal(exemploDeMensagem('document'), 'Olá! Segue o documento conforme conversamos.');
  const { default: es } = await import('../ui/locales/es.js');
  for (const kind of ['proposal', 'contract', 'document']) assert.ok(exemploDeMensagem(kind) in es, `${kind} sem espanhol`);
});

test('formulário novo nasce com o botão "Enviar", sem repetir a palavra', async () => {
  const forms = await ler('ui/forms.js');
  assert.doesNotMatch(forms, /Enviar \/ Enviar/);
  assert.match(forms, /: 'Enviar',/);
});
