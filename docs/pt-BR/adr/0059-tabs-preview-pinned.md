# ADR 0059 — Abas: uma aba de pré-visualização por padrão, abas fixas compactas, a aba escolhida emenda na página

- Data: 2026-09-30
- Fonte: o mantenedor, em sessão, em 2026-09-30 (registrado em 2026-10-01,
  quando se viu que as decisões só estavam escritas no changelog): "Hoje,
  quando a gente clica em qualquer documento, pasta, ele já abre uma aba nova
  com aquele conteúdo. […] no VS Code, ele só abre de fato uma aba nova quando
  eu dou dois cliques. Se eu dou clique só, ele abre numa aba temporária. […]
  Eu queria essa possibilidade e queria inclusive que esse fosse o padrão, mas
  que tivesse a opção de a cada clique abrir uma aba nova. Aí você precisa
  avaliar em onde coloca essa configuração." — "quando pina no Chrome, por
  exemplo, todo texto do nome da aba, ele se contrai. Eu queria que isso
  acontecesse também." — "Eu queria que a linha horizontal que fica embaixo
  da aba, ela não ficasse visível enquanto estivesse embaixo da aba
  selecionada. É igual acontece com Obsidian."
- Status no briefing: ausente

## Contexto

Até 2026-09-30, todo clique num arquivo — na árvore, na visão de uma pasta,
na busca, no abrir rápido — abria uma aba nova, e alguns cliques de navegação
deixavam uma fila de abas para fechar. As abas fixas mantinham o nome
inteiro, e a aba selecionada ficava sublinhada pela própria linha da barra de
abas.

## Decisão

**Decidido em 2026-09-30 pelo mantenedor**, em sessão:

1. **Uma aba de pré-visualização é o padrão.** Um clique num arquivo de uma
   lista (a árvore, a visão de uma pasta, a busca, o abrir rápido) o abre
   numa aba temporária, com o nome em itálico; o próximo clique a substitui.
   Dois cliques, uma edição ou fixar a mantêm como aba comum.
2. **Um ajuste a desliga**: desligado, cada clique abre uma aba nova, como
   antes. Onde ele fica foi deixado ao autor: Ajustes › Editor › "Abas de
   pré-visualização", ligado por padrão.
3. **Uma aba fixa é compacta**: só o ícone, o nome ao passar o mouse, como
   a aba fixa de um navegador.
4. **A aba escolhida emenda na página**: sem linha embaixo dela, como no
   Obsidian.

## Consequências

- As entradas "Abas de pré-visualização" e "Abas fixas são compactas" do
  changelog (Não lançado) descrevem este ADR.
- O cofre de exemplo o ensina: nota "13 - Abas, Painéis, Áreas e Janelas"
  ([ADR 0058](0058-demo-vault-as-tutorial.md)).

## Alternativas descartadas

- **Uma aba nova a cada clique como padrão.** O comportamento de antes deste
  ADR; mantido como a posição desligada do ajuste, não como padrão, pela
  palavra do mantenedor.
