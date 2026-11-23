# QA Report — 2026-11-23

| Verificação | Resultado | Como |
|---|---|---|
| Build | PASS | `npx astro build` — 36 páginas |
| Testes de saída (17) | PASS 17/17 | `npm run check` (`tests/output.test.mjs`): lang, H1 único, title/description/canonical, links internos, termos proibidos, marcador ⇒ noindex e fora do sitemap, CTA → `soci.app.br/login`, JSON-LD válido, um FAQPage por página, og:image existente, pink fora do texto, hubs e órfãs, H1 da home |
| Gate de design (kit) na home | OPEN — 1 exceção registrada | `gate.mjs` 3 rodadas: 44 → 6 → 1 FAIL; exceção `copy-headings` (título de card com verbo em pt-BR) em `.taste-skill/waivers.json` |
| Rolagem lateral 320/390/768 | PASS | home, hub, funcionalidade, solução, FAQ, privacidade, planos |
| Menu mobile | PASS | abre (`aria-expanded=true`) e fecha com Escape |
| Abas da jornada | PASS | seta → muda aba, painel e tela juntos, foco acompanha |
| Filtro de funcionalidades | PASS | "Atender" mostra 4 de 17; "Todas" volta a 17; sem JS a lista é completa |
| Console | PASS | sem erros na home e páginas internas |
| Reduced motion | NÃO VERIFICADO por emulação | o kit trata `prefers-reduced-motion`; o navegador embutido não emula essa preferência |
| Contraste | PASS (tokens) | ação `#b8008a` com texto claro ≈ 5,6:1; pink `#ff00bb` só em superfícies (teste) |
