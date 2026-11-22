// Labs (7.2): experimental features the agency offers to its sub-accounts, shared by the server and the screens.
// The agency picks a mode for each feature; its choice is copied into every sub-account (state.labs.offered),
// and a sub-account turns on the ones left to it (state.labs.on). Nothing here is on unless someone turns it on.

// [key, title, what it does, where it shows up]
export const labCatalog = [
  ['conversation-reply', 'Sugestão de resposta com IA', 'Em Conversas, a IA escreve um rascunho de resposta a partir das últimas mensagens do contato. A equipe revisa e envia.', 'Conversas'],
  ['conversation-summary', 'Resumo da conversa com IA', 'Em Conversas, um botão resume o histórico com o contato: o que ele pediu, o que foi combinado e o que ainda falta.', 'Conversas'],
  ['contact-duplicates', 'Bloquear contatos duplicados', 'Ao criar ou editar um contato, recusa um e-mail ou telefone que outro contato já usa e diz qual é.', 'Contatos']
];

export const labModes = [['off', 'Desligado'], ['optin', 'Cada subconta escolhe'], ['all', 'Ligado em todas']];

export const labKeys = labCatalog.map(([key]) => key);
export const labOffered = (s, key) => s?.labs?.offered?.[key] || 'off';
export const labOn = (s, key) => {
  const mode = labOffered(s, key);
  return mode === 'all' || (mode === 'optin' && s?.labs?.on?.[key] === true);
};
