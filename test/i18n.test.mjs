import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, setLanguage, tr, langToggle, PT, ES, PT_TO_ES, translateText } from '../ui/i18n.js';
import { COUNTRIES, getCountry, formatLocalNumber, parsePhone, phoneField } from '../ui/phone-input.js';
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

test('Phone input detects country, DDI and formats DDD automatically', () => {
  // Brazilian raw 11 digits (Luiz's number from settings: 31985869015)
  const luiz = parsePhone('31985869015');
  assert.equal(luiz.country.iso, 'BR');
  assert.equal(luiz.country.dial, '+55');
  assert.equal(luiz.formattedLocal, '(31) 98586-9015');
  assert.equal(luiz.fullValue, '+55 (31) 98586-9015');

  // Brazilian raw 10 digits landline (3132124000)
  const landline = parsePhone('3132124000');
  assert.equal(landline.country.iso, 'BR');
  assert.equal(landline.formattedLocal, '(31) 3212-4000');

  // International full E.164 with +55
  const fullBr = parsePhone('+55 (31) 98586-9015');
  assert.equal(fullBr.country.iso, 'BR');
  assert.equal(fullBr.formattedLocal, '(31) 98586-9015');

  // Prefix without plus (5531985869015)
  const dial55 = parsePhone('5531985869015');
  assert.equal(dial55.country.iso, 'BR');
  assert.equal(dial55.formattedLocal, '(31) 98586-9015');

  // Mexico (+52)
  const mx = parsePhone('+52 55 1234 5678');
  assert.equal(mx.country.iso, 'MX');
  assert.equal(mx.country.dial, '+52');
  assert.equal(mx.formattedLocal, '(55) 1234-5678');

  // Argentina (+54)
  const ar = parsePhone('+54 11 4321 5678');
  assert.equal(ar.country.iso, 'AR');
  assert.equal(ar.country.dial, '+54');
  assert.equal(ar.formattedLocal, '(11) 4321-5678');

  // United States (+1)
  const us = parsePhone('+1 555 123 4567');
  assert.equal(us.country.iso, 'US');
  assert.equal(us.country.dial, '+1');
  assert.equal(us.formattedLocal, '(555) 123-4567');

  // Colombia (+57)
  const co = parsePhone('+57 300 123 4567');
  assert.equal(co.country.iso, 'CO');
  assert.equal(co.formattedLocal, '300 123 4567');

  // Chile (+56)
  const cl = parsePhone('+56 9 1234 5678');
  assert.equal(cl.country.iso, 'CL');
  assert.equal(cl.formattedLocal, '9 1234 5678');

  // phoneField HTML rendering
  const html = phoneField({ name: 'phone', label: 'Telefone', value: '31985869015', id: 'test-phone' });
  assert.match(html, /data-phone-field/);
  assert.match(html, /data-phone-country/);
  assert.match(html, /value="\+55" data-iso="BR" selected/);
  assert.match(html, /value="\(31\) 98586-9015"/);
  assert.match(html, /<input type="hidden" name="phone" data-phone-hidden value="\+55 \(31\) 98586-9015">/);

  // Spanish translation of phoneField label and country selector
  setLanguage('es');
  const htmlEs = phoneField({ name: 'phone', label: 'Telefone', value: '31985869015', id: 'test-phone-es' });
  assert.match(htmlEs, /<span>Teléfono<\/span>/);
  assert.match(htmlEs, /aria-label="Código de país"/);
  setLanguage('pt');
});
