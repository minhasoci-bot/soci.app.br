# soci: Importar do GHL

Extensão do Chrome que leva uma subconta do GHL (com o snapshot da agência carregado) para a soci como um setup em
**Setups de conta → Importados**. Passo a passo para quem usa: <https://doc.soci.app.br/agencia/importar-do-ghl/>.

## Como funciona

1. Na soci, **Importar do GHL** gera um código de 9 caracteres que vale 30 minutos e serve uma vez.
2. Com a subconta aberta no GHL (`…/location/<id>/…`), a extensão injeta `reader.js` na aba, no mundo `MAIN`, e lê tudo
   com o cliente HTTP do próprio app do GHL. Só faz `GET`: nada é criado, salvo ou apagado no GHL.
3. A leitura vai para a soci em pedaços (`POST /api/ghl-import/part`, cabeçalho `X-Soci-Import-Code`) e fecha com
   `POST /api/ghl-import/done`. A janela da soci conduz a conversão a partir daí.

A soci nunca recebe senha, token ou cookie do GHL: a extensão envia só os dados lidos.

## Permissões

- `activeTab` e `scripting`: ler a aba do GHL quando você clica na extensão (funciona também com domínio próprio do GHL).
- `storage`: lembrar o endereço da soci (campo **Avançado**).
- `host_permissions`: só a soci (`soci.app.br`) e o computador local, para testes.

## Carregar sem a loja (desenvolvimento)

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. **Carregar sem compactação** e escolha esta pasta (`extensions/ghl-import`).
3. Para testar com a soci local (`npm start`), abra **Avançado** e use `http://localhost:<porta>`.

Testes: `node --test test/ghl-extension.test.mjs` (leitor e manifesto) e `node --test test/ghl-import.test.mjs` (rotas).
