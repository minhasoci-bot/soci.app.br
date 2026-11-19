# Catálogo de Traduções / Locales do Soci

Este diretório contém os catálogos completos de tradução de toda a plataforma Soci.

## Idiomas Disponíveis
- **Português (Brasil)**: `pt.json` (Idioma canônico / padrão)
- **Español Latinoamericano**: `es.json` (es-419)

---

## Como Adicionar um Novo Idioma no Futuro (Ex: Inglês 'en', Francês 'fr')

Para adicionar qualquer novo idioma à plataforma, o processo é simples e 100% modular:

### Passo 1: Criar o arquivo de tradução
Copie o arquivo canônico `pt.json` com o código do novo idioma (ex.: `en.json` ou `fr.json`):
```bash
cp ui/locales/pt.json ui/locales/en.json
cp ui/locales/pt.json public/locales/en.json
```

### Passo 2: Traduzir os valores
No novo arquivo `en.json`, mantenha as chaves em português idênticas e substitua os valores pelo texto traduzido no idioma de destino.
Exemplo:
```json
{
  "Configurações": "Settings",
  "Meu perfil": "My profile",
  "Salvar alterações": "Save changes"
}
```

### Passo 3: Registrar o idioma em `i18n.js`
Abra `ui/i18n.js` (e `public/i18n.js`) e adicione o idioma na lista `languages`:
```javascript
import enDict from './locales/en.json' with { type: 'json' }; // ou carregado via registerLanguage

export const languages = [
  { id: 'pt', label: 'Português', flag: 'PT' },
  { id: 'es', label: 'Español Latino', flag: 'ES' },
  { id: 'en', label: 'English', flag: 'EN' } // Novo idioma aqui!
];

registerLanguage('en', {
  label: 'English',
  flag: 'EN',
  translations: enDict
});
```

Pronto! O seletor visual na barra superior (`langToggle`), o menu de configurações e o sistema de tradução automática do DOM (`translateDom`) passarão a suportar o novo idioma instantaneamente.
