// Certificates and badges: categories, visual styles and the ready-made templates, shared by the server
// (certificate-model.mjs) and the Certificados screen.

export const credentialKinds = [['certificate', 'Certificado'], ['badge', 'Badge']];
export const certificateCategories = [['completion', 'Conclusão'], ['milestone', 'Marco'], ['event', 'Evento'], ['training', 'Treinamento']];
export const certificateStyles = [['classico', 'Clássico'], ['moderno', 'Moderno'], ['minimalista', 'Minimalista']];

/** Starting points for a new template, by category. */
export const certificateStarters = {
  completion: { title: 'Certificado de conclusão', lead: 'Certificamos que', verb: 'concluiu', body: '' },
  milestone: { title: 'Certificado de conquista', lead: 'Reconhecemos que', verb: 'alcançou o marco', body: '' },
  event: { title: 'Certificado de participação', lead: 'Certificamos que', verb: 'participou de', body: '' },
  training: { title: 'Certificado de treinamento', lead: 'Certificamos que', verb: 'completou o treinamento', body: '' }
};
export const badgeStarter = { title: 'Badge de reconhecimento', lead: 'Concedido a', verb: 'por', body: '' };
