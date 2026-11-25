# Diagramação das páginas

Entrega de 25/11/2026. Vale para a agência e para a subconta. As regras ficam em `ui/page-layout.css`, que carrega antes de `button-system.css` e `liquid-glass.css`.

## Regras

1. **A página usa a largura toda.** Formulário não encolhe para 760 px nem deixa vazio à direita.
2. **Um assunto por seção.** Título e explicação à esquerda, campos à direita. Abaixo de 1100 px o título sobe; abaixo de 640 px os campos viram uma coluna.
3. **A ação principal fica no rodapé do cartão**, à direita, sempre visível. A mensagem de erro ou sucesso fica no mesmo rodapé, à esquerda.
4. **Cartão nunca fica dentro de cartão.** O painel das abas é transparente; o conteúdo traz os próprios cartões.
5. **Estado vazio é um cartão**, com ícone, frase e o botão que resolve.
6. **Indicador**: rótulo, número e nota nesta ordem, alinhados pelo topo.
7. **Segundo nível de abas e seletor de período** usam o mesmo visual segmentado. Botão primário é só para ação.
8. **Busca e filtros ficam numa linha**; no celular quebram.

## Peças

| Classe | Uso |
| --- | --- |
| `.surface.settings-form.set-form` | Formulário de página. |
| `.surface.set-card` | Cartão que não é formulário, com a mesma grade. |
| `.set-section` › `.set-head` + `.set-body` | Uma seção. Botão secundário da seção vai no `.set-head`. |
| `.set-body.is-list`, `.is-pairs`, `.field-grid.is-three` | Lista de linhas, pares de campos e três colunas. |
| `.set-foot` | Rodapé: `.form-status`, secundários e, por último, o `.primary`. |
| `.set-form.is-narrow` | Formulário ao lado de uma prévia: título em cima dos campos. |
| `.seg` com botões `aria-pressed` | Seletor de período ou filtro. |
| `.stack` | Blocos empilhados com o espaço padrão. |

```html
<form class="surface settings-form set-form" data-ag-form="exemplo">
  <section class="set-section">
    <header class="set-head"><h2>Título</h2><p class="dim">Explicação em uma frase.</p></header>
    <div class="set-body"><div class="field-grid">…</div></div>
  </section>
  <footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar</button></footer>
</form>
```

Formulários dentro de diálogos continuam com `.settings-form` simples.

## Celular e tema escuro

- Barra que rola na horizontal fica dentro de um contêiner com `min-width:0`; grade de uma coluna usa `minmax(0,1fr)`, nunca `1fr`.
- Até 860 px, `.table-shell` dentro de painel rola na horizontal.
- Cor sempre por token `--g-*`. `--surface`, `--soft`, `--muted` e `--accent` não existem e caem num valor fixo do tema claro.
- O menu da agência começa fechado até 700 px.
