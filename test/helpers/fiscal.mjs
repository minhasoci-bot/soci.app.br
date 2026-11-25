// A valid fiscal record (cadastro fiscal), required before a gateway is connected for the first time.
export const demoFiscal = { person: 'pj', name: 'Loja Exemplo Ltda', taxId: '11222333000181', regime: 'simples', email: 'fiscal@example.com',
  address: { zip: '30110000', street: 'Rua A', number: '1', district: 'Centro', city: 'Belo Horizonte', ibge: '3106200', state: 'MG' } };
export const saveFiscal = { type: 'fiscal', data: demoFiscal };
