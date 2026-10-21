# ADR 0105 — Links de leitura sem conta: uma pasta ou uma nota de um UniVerso, abertos a quem tiver o link

- Data: 2026-10-20
- Fonte: um amigo do mantenedor, repassado em 2026-10-20: poder publicar
  ou compartilhar notas como uma wiki para outras pessoas — jogadores —
  lerem, sem pagar o Obsidian Publish. Perguntado entre um link sem conta
  no UniVerso e um site estático exportado do app, o mantenedor: *"nesse
  caso A. Link de leitura sem conta, no UniVerso faz mais sentido"*. Na
  mesma troca: *"onde no escopo está compartilhamento a nível de arquivo
  em vez de pasta?"* — respondida pelo item 2. Escrita por Opus 5.5; a
  ser lida pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0073](0073-self-hosted-server-first.md),
  [0081](0081-sharing-between-people-on-one-universo.md) (item 4: links
  que qualquer um pode abrir, "agora não"; item 17: um documento só, "fora
  da primeira versão", um compartilhamento só de leitura de uma nota
  primeiro, se pedido — ambos revistos aqui),
  [0087](0087-secret-blocks-hidden-from-readers.md) (o que um leitor
  recebe), [0083](0083-security-hardening-of-universo.md),
  [0076](0076-the-window-on-every-screen.md),
  [0035](0035-cross-cutting-requirements.md).
- Status no briefing: ausente.
- Revisões: 2026-10-21 — o mantenedor marcou as opções do questionário de
  decisões de 2026-10-20 (respondido em 2026-10-21), 0105.2 a 0105.8, todas
  como recomendadas: todo `[PROPOSTO]` vira `[DECIDIDO 2026-10-21]`, e a ADR
  é Aceita. Nada está construído.

## Contexto

Um mestre de jogo guarda a campanha numa pasta de um UniVerso e quer que
os jogadores leiam o mundo — lugares, pessoas, facções, o diário das
sessões — sem que cada um crie uma conta. O Obsidian responde com o
Publish, um serviço pago. O Verso já tem a maior parte do que uma página
de leitura precisa: um UniVerso serve uma pasta a uma conta que só pode
ler, e a serve como uma **projeção sem blocos secretos** em todo lugar —
tela, busca, bytes de sincronização, contagens
([0087](0087-secret-blocks-hidden-from-readers.md)). O que ele não tem é
um leitor sem conta: a [0081](0081-sharing-between-people-on-one-universo.md)
item 4 decidiu em 2026-10-10 que links que qualquer um pode abrir eram
"agora não", porque um servidor de notas privadas começa sem eles.

Um site estático exportado do app era o outro caminho — sem servidor,
qualquer hospedagem gratuita, mas uma nova exportação a publicar a cada
mudança. O mantenedor escolheu o link.

## Decisão

Aceita (2026-10-21). O item 1 é a escolha do mantenedor, `[DECIDIDO
2026-10-20]`; o resto é `[DECIDIDO 2026-10-21]`, cada um a opção que ele
marcou no questionário de 2026-10-20.

1. **Um link de leitura, no UniVerso, sem precisar de conta.** `[DECIDIDO
   2026-10-20]`. Quem tem o link lê, num navegador, o que ele aponta, pela
   mesma janela web que uma conta de leitor usa, sem nenhuma forma de
   escrever. Isto revisa o "agora não" do item 4 da
   [0081](0081-sharing-between-people-on-one-universo.md).

2. **Para o que um link aponta: uma pasta, ou uma nota.** `[DECIDIDO
   2026-10-21]` (0105.2, opção A; responde também a metade de leitura da
   permissão por nota deixada em aberto na
   [0073](0073-self-hosted-server-first.md)): uma pasta (com o que está sob ela) ou **uma única nota**. Uma nota
   sozinha é o compartilhamento só de leitura de um documento que o item
   17 da [0081](0081-sharing-between-people-on-one-universo.md)
   recomendou "se pedido": sendo só de leitura, não precisa de lugar para
   anexos nem para notas novas; as imagens e notas que ela incorpora são
   servidas com ela; um link para fora do que foi compartilhado aparece
   como texto simples, "não compartilhado". Compartilhar uma nota **para
   escrever** fica onde o item 17 o deixou.

3. **Quem faz um link.** `[DECIDIDO 2026-10-21]` (0105.3a, opção A): o
   **dono** da pasta, como em todo
   compartilhamento ([0081](0081-sharing-between-people-on-one-universo.md)
   item 4: um autor por compartilhamento no registro de auditoria); pelo
   painel de compartilhamento da pasta e pelo menu de uma nota ("Copiar
   link de leitura…"). O **administrador** pode desligar o recurso inteiro
   no servidor; ele começa **desligado** num servidor novo e é ligado no
   console `[DECIDIDO 2026-10-21]` (0105.3b, opção A), de modo que um servidor de notas privadas segue
   como estava até alguém escolher.

4. **O que o leitor recebe.** `[DECIDIDO 2026-10-21]` (0105.4, opção A,
   sem também baixar a pasta como zip): a projeção de leitor da
   [0087](0087-secret-blocks-hidden-from-readers.md) — nenhum bloco
   `[!secret]` em lugar algum: a página, a busca, os backlinks, o grafo,
   as contagens; só o que o link aponta; notas, quadros, mapas e
   statblocks desenhados só para leitura (um dado pode rolar na janela do
   próprio leitor e não é escrito em lugar nenhum; nenhum marcador ou
   marca pode ser mudado); sem sala, sem presença, sem sincronização, sem
   histórico, sem MCP, sem baixar a pasta inteira. A busca e os backlinks
   cobrem só o que foi compartilhado.

5. **O link em si.** `[DECIDIDO 2026-10-21]` (0105.5, opção A, com senha e
   validade): um token imprevisível de 256 bits no
   caminho (`/r/<token>`), guardado só como hash; mostrado inteiro uma
   vez quando feito (e copiável de novo pelo painel enquanto vive); a
   página envia `Referrer-Policy: no-referrer` e `X-Robots-Tag: noindex`,
   e pede aos buscadores que fiquem longe. Um link pode ter uma
   **validade** (nenhuma por padrão; 1 dia, 7 dias, 30 dias ou uma data)
   e uma **senha** (nenhuma por padrão). O painel lista todo link vivo da
   pasta, com o que ele aponta, quando foi feito, sua validade e quando
   foi aberto pela última vez; **revogar** o encerra na hora, páginas
   abertas incluídas.

6. **Limites e abuso.** `[DECIDIDO 2026-10-21]` (0105.6, opção A): um
   pedido anônimo tem ritmo por
   token e por endereço como as outras rotas do servidor
   ([0083](0083-security-hardening-of-universo.md) item 7); uma senha
   errada conta como entrada recusada — a linha de log que o fail2ban lê
   e o balde que avisa o dono por e-mail (0083 itens 1 e 2); toda rota
   atrás de um link é só de leitura e recusa qualquer outra coisa antes
   de o núcleo agir; os cabeçalhos do item 9 valem; um link nunca revela o
   caminho da pasta, o e-mail do dono nem outros membros.

7. **O que a janela mostra ao dono.** `[DECIDIDO 2026-10-21]` (0105.7,
   opção A, a marca e o aviso de segredos): uma nota ou pasta com
   um link de leitura vivo leva uma pequena marca na árvore, para que
   ninguém esqueça que uma página está aberta ao mundo; fazer um link para
   uma pasta que tem blocos secretos diz, antes de ele ser feito, quantas
   notas os têm e que os leitores não os verão.

8. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md))
   `[DECIDIDO 2026-10-21]` (0105.8, opção A): a página de leitura no idioma do navegador do leitor, pt-BR ou EN; as
   palavras do painel nos dois; a página usável por teclado e leitor de
   tela, como a janela web é ([0076](0076-the-window-on-every-screen.md)).

## Consequências

- Servidor: uma tabela de links de leitura (hash do token, pasta e
  caminho de destino, tipo pasta ou nota, feito por, feito em, validade,
  hash da senha, última abertura, revogado em); as rotas `/r/<token>`; a
  projeção de leitor reaproveitada; a chave no console; as linhas de
  auditoria; o modelo de ameaças ganha uma linha.
- Janela: o painel nos ajustes de compartilhamento da pasta e "Copiar link
  de leitura…" no menu de uma nota; a marca na árvore; a janela web só de
  leitura alcançada por um link.
- A [0081](0081-sharing-between-people-on-one-universo.md) ganha uma
  linha de Revisões para os itens 4 e 17.
- O site estático exportado do app não é construído; pode vir depois para
  quem não tem servidor.

## Alternativas descartadas

- **Um site estático exportado do app** (o caminho do Obsidian Publish e
  do Quartz): considerado com o mantenedor em 2026-10-20; ele escolheu o
  link por ora. Não precisa de servidor, mas toda mudança é uma nova
  exportação.

## Status

Aceita (2026-10-21). Item 1 decidido pelo mantenedor em 2026-10-20, os
itens 2–8 em 2026-10-21. Nada está construído.
