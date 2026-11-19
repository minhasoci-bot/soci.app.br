import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, setLanguage, tr, langToggle, PT, ES, PT_TO_ES, translateText } from '../ui/i18n.js';
import { chatDefaults } from '../ui/chat-widget-data.js';
import { studioTemplates, starterProject } from '../ui/studio-data.js';
import { blank, execute } from '../model.mjs';
import { agentDraft } from '../ui/agents-data.js';
import { newField } from '../ui/form-fields.js';

test('i18n defaults to Portuguese (pt) and allows switching to Latin American Spanish (es)', () => {
  setLanguage('pt');
  assert.equal(getLanguage(), 'pt');

  // When in Portuguese
  assert.equal(tr('Open'), 'Em aberto');
  assert.equal(tr('Won'), 'Ganha');
  assert.equal(tr('Criar curso'), 'Criar curso');
  assert.equal(tr('Painel de controle'), 'Painel de controle');
  assert.equal(tr('Conversas'), 'Conversas');
  assert.equal(tr('Configurações'), 'Configurações');

  // Switch to Latin American Spanish
  setLanguage('es');
  assert.equal(getLanguage(), 'es');

  assert.equal(tr('Open'), 'Abierta');
  assert.equal(tr('Won'), 'Ganada');
  assert.equal(tr('Criar curso'), 'Crear curso');
  assert.equal(tr('Painel de controle'), 'Panel de control');
  assert.equal(tr('Conversas'), 'Conversaciones');
  assert.equal(tr('Configurações'), 'Configuraciones');
  assert.equal(tr('Contatos'), 'Contactos');
  assert.equal(tr('Oportunidades'), 'Oportunidades');
  assert.equal(tr('Pagamentos'), 'Pagos');
  assert.equal(tr('Automações'), 'Automatizaciones');
  assert.equal(tr('Sites'), 'Sitios web');
  assert.equal(tr('Subcontas'), 'Subcuentas');
  assert.equal(tr('Salvar'), 'Guardar');
  assert.equal(tr('Cancelar'), 'Cancelar');
  assert.equal(tr('Excluir'), 'Eliminar');
  assert.equal(tr('Nova aula'), 'Nueva lección');
  assert.equal(tr('Módulos'), 'Módulos');
  assert.equal(tr('Novo formulário'), 'Nuevo formulario');
  assert.equal(tr('Novo fluxo'), 'Nuevo flujo');
  assert.equal(tr('Novo artigo'), 'Nuevo artículo');
  assert.equal(tr('Novo produto'), 'Nuevo producto');

  // Agency settings and complete form fields translation
  assert.equal(tr('Gerencie dados da empresa, equipe, faturamento, integrações e conformidade.'), 'Administre datos de la empresa, equipo, facturación, integraciones y cumplimiento.');
  assert.equal(tr('Meu perfil'), 'Mi perfil');
  assert.equal(tr('Empresa e marca'), 'Empresa y marca');
  assert.equal(tr('Equipe'), 'Equipo');
  assert.equal(tr('Faturamento e carteira'), 'Facturación y cartera');
  assert.equal(tr('Serviços de e-mail'), 'Servicios de correo electrónico');
  assert.equal(tr('E-mails do sistema'), 'Correos electrónicos del sistema');
  assert.equal(tr('Workflow: recursos premium'), 'Flujos de trabajo: funciones prémium');
  assert.equal(tr('Dados pessoais'), 'Datos personales');
  assert.equal(tr('Nome'), 'Nombre');
  assert.equal(tr('Sobrenome'), 'Apellido');
  assert.equal(tr('Salvar perfil'), 'Guardar perfil');
  assert.equal(tr('Dados da empresa'), 'Datos de la empresa');
  assert.equal(tr('Nome da empresa'), 'Nombre de la empresa');
  assert.equal(tr('Salvar dados da empresa'), 'Guardar datos de la empresa');
  assert.equal(tr('Membros da equipe'), 'Miembros del equipo');
  assert.equal(tr('Adicionar usuário'), 'Agregar usuario');
  assert.equal(tr('Plano da agência'), 'Plan de la agencia');
  assert.equal(tr('Saldo da carteira'), 'Saldo de la cartera');
  assert.equal(tr('Seções de configurações'), 'Secciones de configuraciones');

  // Dynamic text translation in Spanish
  assert.equal(translateText('12 contatos'), '12 contactos');
  assert.equal(translateText('5 oportunidades'), '5 oportunidades');
  assert.equal(translateText('3 cursos'), '3 cursos');
  assert.equal(translateText('10 aulas'), '10 lecciones');

  // Switch back to Portuguese
  setLanguage('pt');
  assert.equal(getLanguage(), 'pt');
  assert.equal(tr('Painel de controle'), 'Painel de controle');
});

test('langToggle generates the switcher pill markup', () => {
  setLanguage('pt');
  const togglePt = langToggle();
  assert.match(togglePt, /data-lang-choice="pt"/);
  assert.match(togglePt, /data-lang-choice="es"/);
  assert.match(togglePt, /class="lang-btn active" data-lang-choice="pt"/);

  setLanguage('es');
  const toggleEs = langToggle();
  assert.match(toggleEs, /class="lang-btn active" data-lang-choice="es"/);
  setLanguage('pt');
});

test('All new creations are born ready with Spanish and Portuguese support', () => {
  // Chat widget defaults are born with bilingual headings/greetings
  const chat = chatDefaults();
  assert.match(chat.name, /Chat do site \/ Chat del sitio/);
  assert.match(chat.heading, /Fale com a gente \/ Contáctenos/);
  assert.match(chat.agentName, /Equipe \/ Equipo/);

  // Form fields are born with bilingual options and prompts
  const radio = newField('radio');
  assert.deepEqual(radio.options, ['Opção 1 / Opción 1', 'Opção 2 / Opción 2', 'Opção 3 / Opción 3']);
  const heading = newField('heading');
  assert.match(heading.label, /Fale com a gente \/ Contáctenos/);

  // Studio templates support both languages
  const landing = studioTemplates.find(t => t[0] === 'landing');
  assert.ok(landing);
  assert.match(landing[1], /Página de vendas/);

  // Starter project
  const project = starterProject('Brief for startup', 'landing');
  assert.ok(project.name);
  assert.equal(project.blocks.length, 3);
});
