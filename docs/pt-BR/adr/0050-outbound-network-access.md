# ADR 0050 — Acesso de saída à rede a partir da janela

- Data: 2026-09-23
- Fonte: `docs/review/phase-2.md` §6, item 5;
  [0049](0049-phase-2-scope-widened.md), Consequências
- Status no briefing: não consta
- Revisões: 2026-09-29 — revisado por duas decisões do mantenedor, tomadas na
  sessão, cada uma num ADR próprio; o texto abaixo fica como foi decidido em
  2026-09-23. A [0055](0055-in-app-updater.md) é a decisão própria do
  atualizador, que a segunda Consequência pedia: o app checa os releases do
  projeto ao abrir, com um ajuste para desligar.
  A [0056](0056-embedded-web-pages.md) acrescenta um quinto jeito aos quatro
  que a Decisão enumera: uma página web embutida numa nota, buscada pelo
  proxy do host.

## Contexto

Nada da Fase 1 acessava a rede. A janela da Fase 2 acessa, de quatro jeitos
que vieram com os pedidos do mantenedor
([0049](0049-phase-2-scope-widened.md)): uma nota web carrega a página numa
web view; um link http(s) clicado na janela abre a página numa janela própria;
o ícone de uma nota web é pedido ao site; uma imagem que a nota traz da web
carrega quando a nota é mostrada. A primeira versão pedia cada ícone a um
terceiro, o que a leitura da Opus de 2026-09-23 achou e foi removido. Nenhuma
decisão dizia o que o app pode pedir à rede: a
[0027](0027-runtime-capabilities.md), Proposta, só nomeia uma permissão
`net:fetch`.

## Decisão

Decidido em 2026-09-23 pelo mantenedor, sobre a recomendação do autor
(`docs/review/phase-2.md` §6, item 5; a resposta: *"a e b ok"*):

1. **O Verso só pede à rede endereços escritos nas notas do usuário, ou
   clicados pelo usuário.** Sem telemetria, sem servidor próprio, e sem
   terceiro no lugar de um site: o ícone de um site é pedido ao site.
2. **Os quatro jeitos ficam**: a página de uma nota web, um link clicado (numa
   janela própria), o ícone de uma nota web, uma imagem remota numa nota.
3. **Um ajuste "carregar conteúdo remoto" cobre os dois que não precisam de
   clique**: o ícone de uma nota web, pedido assim que uma lista ou uma aba
   mostra a nota, e uma imagem remota, carregada quando a nota é mostrada.
   Desligado, nada chega à rede até um clique — uma imagem remota vira um link
   para ela, um estilo inline perde o que buscaria, e uma nota web mostra um
   globo no lugar do ícone do site.
4. **A propriedade `url` mantém o significado que o Verso lhe deu**: uma nota
   cujo frontmatter tem um `url` http(s) é uma nota web. Esse significado não
   muda nada no arquivo, e o Obsidian não dá significado nenhum à propriedade;
   a página só abre sozinha quando a nota não tem corpo, e senão num clique.

## Consequências

- O core nunca acessa a rede ([0026](0026-core-ui-contract-inviolable-rules.md));
  a janela só acessa pelos quatro jeitos acima.
- Pelo mesmo princípio, uma checagem de atualização — um pedido a um servidor
  do Verso — não é permitida; um atualizador precisaria de uma decisão
  própria.
- O ajuste é uma preferência, não uma fronteira. A política de segurança de
  conteúdo da janela continua permitindo imagens `https:`, e o ajuste é
  aplicado onde a janela limpa o HTML do core (`app/ui/src/sanitize.ts`) e
  onde desenha o ícone de uma nota web. Um plugin ou um servidor que busque
  algo, depois da Fase 2, precisa do `net:fetch` da
  [0027](0027-runtime-capabilities.md) ou de uma decisão própria.
- Uma nota feita em outro lugar com a propriedade `url` — por uma ferramenta
  de recorte, uma exportação de favoritos — vira nota web no Verso; o texto
  continua como está, e a página só abre num clique quando a nota tem corpo.
- **Provisório — o padrão do ajuste.** Ele vem ligado, como a janela se
  comportava antes de o ajuste existir e como o Obsidian carrega imagens
  remotas. O mantenedor pediu o ajuste sem dizer o padrão; o padrão é do
  autor, e o mantenedor pode escolher desligado.

## Alternativas descartadas

- Pedir os ícones a um terceiro (`icons.duckduckgo.com`), como a primeira
  versão fazia — removido depois da leitura da Opus de 2026-09-23
  (`docs/review/phase-2.md`): contava a esse terceiro todo site sobre o qual o
  usuário guarda uma nota.
- Um ajuste para cada um dos quatro jeitos — levantado na
  [0049](0049-phase-2-scope-widened.md) ("se cada um precisa de um ajuste") e
  não escolhido: abrir uma nota web e clicar num link já são o pedido do
  usuário.

## Status

Aceito em 2026-09-23. O padrão do ajuste: provisório (Consequências).
Revisado em 2026-09-29 pela [0055](0055-in-app-updater.md) (a checagem de
atualização) e pela [0056](0056-embedded-web-pages.md) (páginas web
embutidas).
