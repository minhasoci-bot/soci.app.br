// Shared by the server and the editors that offer Content AI.
export const contentKinds = ['social', 'email', 'blog', 'gbp'];

export const contentActions = [
  ['improve', 'Melhorar o texto'],
  ['shorten', 'Encurtar'],
  ['expand', 'Expandir'],
  ['grammar', 'Corrigir gramática'],
  ['tone', 'Mudar o tom'],
  ['translate-es', 'Traduzir para espanhol'],
  ['translate-pt', 'Traduzir para português']
];

export const contentTones = [
  ['profissional', 'Profissional'],
  ['descontraido', 'Descontraído'],
  ['inspirador', 'Inspirador'],
  ['divertido', 'Divertido'],
  ['urgente', 'Urgente'],
  ['educativo', 'Educativo'],
  ['empatico', 'Empático']
];

// Module a user needs to use Content AI in each editor.
export const contentModule = { social: 'marketing', email: 'marketing', blog: 'sites', gbp: 'reputation' };
