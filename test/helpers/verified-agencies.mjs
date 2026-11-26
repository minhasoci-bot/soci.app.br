// Testes anteriores ao celular confirmado: as agências criadas pelo login já nascem em teste,
// para que o portão da cobrança (agency-billing-model.mjs) não esconda o que o teste quer ver.
export function verifiedAgencies(store) {
  return {
    ...store,
    insert: (id, state, ...rest) => {
      if (/^agency-/.test(id) && state?.billing) Object.assign(state.billing, { status: 'Trial', trialEndsAt: '2999-01-01T00:00:00.000Z' });
      return store.insert(id, state, ...rest);
    }
  };
}
