# ADR 0080 — A lixeira: o que foi apagado é visto, restaurado, e expira

- Data: 2026-10-10
- Fonte: o mantenedor, em sessão em 2026-10-10, sobre o que acontece com um
  arquivo apagado no servidor e no computador: *"Eu acho que faz sentido
  sim a gente ter uma lixeira e com tempo de expiração isso é possível
  voltar. Aí eu imagino que a gente vai ter que ter um mecanismo, né, de
  rollback disso daí, né, de voltar."* Escrita por Fable 5.1 a pedido do
  mantenedor (*"bota uma instância do Fable aí pra escrever isso"*), uma
  troca dos papéis da [0032](0032-author-and-reviewer-roles.md) como a
  [0073](0073-self-hosted-server-first.md) foi; a ser lida por Opus 5.5
  antes de ser aceita.
- Relacionados: [0048](0048-file-operations-in-ui.md) (um apagamento é uma
  mudança para `.trash/` na raiz da pasta, a lixeira do Obsidian, mantendo
  o caminho relativo, ` (n)` em colisão — inalterado aqui),
  [0012](0012-files-are-source-of-truth.md), [0011](0011-config-outside-tree-index-as-cache.md)
  (estado fora da pasta), [0043](0043-placeholder-guard.md) (um
  placeholder nunca é um apagamento; nenhum vai para a lixeira),
  [0044](0044-verso-fs-semantics.md) (entradas ocultas não são
  percorridas: a lixeira não é indexada nem listada), [0070](0070-what-travels-with-the-folder.md)
  (item 3, nomes que todo sistema guarda), [0073](0073-self-hosted-server-first.md)
  (item 7, salas; o Status dela deixa "histórico, atribuição e recuperação
  de uma mudança ou exclusão de outro membro" `[ABERTO]` — esta ADR
  responde à recuperação de uma exclusão), [0074](0074-accounts-and-access-on-the-server.md)
  (papéis, o registro de auditoria), [0075](0075-server-packaging-and-storage.md)
  (item 4, o espaço que uma pasta ocupa; item 6, configuração pelo
  ambiente), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (cotas; a página da pasta no console), [0079](0079-sync-a-local-folder-with-a-server.md)
  (item 9, apagamentos pelo sync; item 4, o registro de mudanças),
  [0081](0081-sharing-between-people-on-one-universo.md) (um
  compartilhamento vê a lixeira do que foi compartilhado),
  [0035](0035-cross-cutting-requirements.md) (os dois idiomas,
  acessibilidade).
- Status no briefing: ausente; ao ser aceita.

## Contexto

O que existe. Desde a [0048](0048-file-operations-in-ui.md) um apagamento
no Verso é uma mudança para `.trash/` na raiz da pasta aberta, mantendo o
caminho relativo da entrada e acrescentando ` (2)`, ` (3)`… quando o nome
já está lá (o `trash` do `verso-fs`, o único jeito de o core apagar). O app
desktop faz isso numa pasta local; o servidor faz nas pastas dele, em todo
caminho de escrita — uma janela, o sync de um aparelho, um token, o MCP.
Um apagamento que atravessa o sync é feito do outro lado do mesmo jeito: o
sync do app move o arquivo para o `.trash/` da pasta local, e o diálogo
diz isso ("eles vão para a lixeira da pasta").

O que não existe: um jeito de ver o que está na lixeira, de trazer algo de
volta, ou de a lixeira um dia encolher. `.trash/` é um diretório oculto,
então a varredura não o lista ([0044](0044-verso-fs-semantics.md)): não é
indexado, não aparece na árvore, não sincroniza — a lixeira de cada lado é
a sua — e não é contado. A cota do servidor ([0077](0077-the-server-administration-console-and-folder-quotas.md)
item 5) soma o registro que o sync guarda da pasta, que vem da listagem do
índice, então a lixeira fica **fora da cota e cresce para sempre**: 306 MB
no servidor de teste depois de uma tarde de uso. Restaurar hoje é abrir a
pasta no disco e mover o arquivo à mão, o que num servidor é o shell do
admin. A ajuda pública do Obsidian descreve a mesma forma — um ajuste que
manda os arquivos apagados para a pasta `.trash`, sem visão no app —, então
o Verso está em paridade com ele, e abaixo do que um app de notas de
várias pessoas precisa: a exclusão de outro membro não se recupera pela
janela (o `[ABERTO]` da [0073](0073-self-hosted-server-first.md)).

Uma contradição a registrar, não a resolver aqui: o item 9 da
[0079](0079-sync-a-local-folder-with-a-server.md) diz que um apagamento
que o sync faz no computador vai "para a lixeira do sistema"; o código e o
diálogo mandam para o `.trash/` da pasta, como todo outro apagamento no
Verso. O item 9 desta ADR recomenda um dos dois e pede que o mantenedor
diga. *(Resolvido em 2026-10-10: o `.trash/` da pasta, item 9; a 0079
revista no mesmo dia.)*

## Decisão

Proposta (2026-10-10); aceita em 2026-10-11 (Status). Cada `[ABERTO]`
trouxe uma recomendação; o mantenedor decidiu. Itens abertos respondidos
em 2026-10-10 (Status).

1. **A lixeira continua sendo `.trash/` na raiz da pasta**, no computador e
   no servidor, com as regras da [0048](0048-file-operations-in-ui.md)
   inalteradas: o caminho relativo mantido, ` (n)` em colisão, uma pasta
   inteira apagada como subárvore. É a convenção do Obsidian, então uma
   pasta aberta pelos dois apps tem uma lixeira só, e nada da
   [0012](0012-files-are-source-of-truth.md) vai para um banco: os bytes
   de um arquivo apagado estão no disco, na pasta, onde uma pessoa com um
   gerenciador de arquivos os alcança sem o Verso.
2. **O que se sabe de uma entrada mora fora da pasta** ([0011](0011-config-outside-tree-index-as-cache.md)):
   o caminho original, quando foi apagada, por quem (num servidor: a
   conta; no computador: este aparelho, ou o sync nomeando o aparelho cuja
   mudança carregou), o tamanho, e quando expira. No servidor, uma tabela
   no banco do servidor; no desktop, o registro da pasta no diretório de
   configuração. É um **cache**, reconstruído de `.trash/`: uma entrada que
   ninguém registrou — feita pelo Obsidian, à mão, por um Verso mais
   antigo, ou já lá quando esta ADR sair — é achada por uma varredura de
   `.trash/` (o único lugar em que uma varredura entra num diretório
   oculto, pelo nome, como `.space/waypoints.json` é lido pelo nome,
   [0062](0062-focuses.md) D7), listada com a data desconhecida, e o
   relógio dela começa quando foi vista pela primeira vez. **Nada que já
   está numa lixeira é apagado na atualização**; os 306 MB expiram depois
   da retenção contada da primeira varredura.
3. **Retenção.** Uma entrada além da retenção é removida do disco, de vez,
   por uma varredura ao abrir a pasta e uma vez por dia enquanto ela está
   aberta (no servidor: ao iniciar e diariamente, por pasta). A remoção é
   um apagamento simples de um caminho sob `.trash/` e nada mais: um
   symlink lá é removido, nunca seguido (a regra de servidor da
   [0044](0044-verso-fs-semantics.md)); diretórios vazios que sobram sob
   `.trash/` são podados; cada remoção é uma linha do log e, no servidor,
   do registro de auditoria. `[ABERTO]`: o padrão. Recomendado: **30
   dias**, como o Notion, o Google Drive e o Finder guardam — decidido em
   2026-10-10: 30 dias. Configurável:
   - no servidor, `VERSO_TRASH_DAYS` é o padrão de toda pasta (30 quando
     não definido; `0` quer dizer nunca expirar), e a página da pasta no
     console define o valor da própria pasta, como define a cota
     ([0077](0077-the-server-administration-console-and-folder-quotas.md)
     item 5); `[ABERTO]` se o dono de uma pasta também pode mudá-lo pela
     janela — recomendado: o dono pode **encurtar**, só o admin alonga ou
     desliga a expiração, já que o espaço é de quem hospeda — decidido
     em 2026-10-10: o dono pode encurtá-la pela janela; só o admin a
     alonga ou desliga a expiração;
   - no desktop, um ajuste de cada pasta local, "Guardar arquivos apagados
     por", com 30 dias como padrão e "para sempre" como opção — o disco é
     da própria pessoa; o ajuste é a camada da pessoa da
     [0070](0070-what-travels-with-the-folder.md), não escrito na pasta.
4. **Onde se vê.** Uma visão **Lixeira** da pasta — *Trash* — na janela, a
   mesma no app desktop e no navegador (e portanto no celular,
   [0076](0076-the-window-on-every-screen.md)): uma lista das entradas com
   o nome, o caminho original, o tamanho, quando foi apagada e por quem, e
   quando expira; com busca; ordenada por data, a mais nova primeiro.
   Aberta pelo menu da raiz da árvore de arquivos e pela paleta de
   comandos, e pelos ajustes da pasta, que mostram o tamanho e a contagem
   da lixeira ao lado do espaço da pasta ([0075](0075-server-packaging-and-storage.md)
   item 4). `[ABERTO]`: se a árvore também mostra uma linha *Lixeira* no
   pé, como a barra lateral do Notion. Recomendado: **sem linha na
   árvore** na primeira versão — a árvore são os arquivos da pasta, e a
   lixeira não é um deles — com o menu, a paleta e os ajustes chegando a
   ela — decidido em 2026-10-10: sem linha Lixeira na árvore. No console, a página da pasta mostra o tamanho, a contagem e a
   retenção da lixeira, com "Esvaziar a lixeira" para o admin; a Visão
   geral soma a lixeira do servidor aos totais.
5. **Restaurar.** Uma entrada volta ao caminho original, com os pais
   refeitos se sumiram. Quando o caminho está ocupado, ela é posta ao lado
   como `<nome> (restaurado <aaaa-mm-dd>).<ext>` — no idioma da pessoa,
   com caracteres que todo sistema guarda ([0070](0070-what-travels-with-the-folder.md)
   item 3), como a cópia de conflito do item 8 da
   [0079](0079-sync-a-local-folder-with-a-server.md) é nomeada — e a
   janela diz para onde foi. Uma pasta apagada restaura como subárvore.
   Restaurar é uma mudança de lugar dentro da pasta, com a verificação da
   invariante 11 no destino; nada é reescrito.
6. **Restaurar e o sync** ([0079](0079-sync-a-local-folder-with-a-server.md)).
   Para o sync, restaurar é **um arquivo que voltou**, nunca o desfazer do
   apagamento: o apagamento foi registrado e feito em todo lugar, e as
   bases foram descartadas dos dois lados (item 9 e o estado do aparelho).
   Restaurado no servidor, o registro de mudanças anota uma escrita de
   quem restaurou; cada aparelho vê um arquivo que só o servidor tem e o
   copia (item 7); um aparelho que tinha movido a própria cópia para o
   `.trash/` local guarda aquela entrada até expirar — uma duplicata
   inofensiva, não um conflito. Restaurado no computador, o arquivo
   reaparece na pasta local e o sync o manda como arquivo novo. Restaurar
   para dentro de uma sala de edição simultânea ([0073](0073-self-hosted-server-first.md)
   item 7) é uma mudança de fora, como qualquer escrita. A lixeira em si
   nunca sincroniza: é oculta, e sincronizar os bytes de arquivos já
   apagados dobraria o espaço e o tráfego à toa — o mesmo apagamento
   enche as duas lixeiras com os mesmos bytes, e qualquer lado restaura.
7. **Quem vê e faz o quê, num servidor.** A lixeira de uma pasta é vista
   por quem pode escrever nela — editores e donos; um leitor não apaga
   nada e não vê lixeira. Qualquer escritor **restaura** qualquer coisa;
   "apagar agora" e "esvaziar a lixeira" são do **dono** (e do admin,
   pelo console): ações irreversíveis ficam com quem responde pela pasta.
   Toda entrada diz quem apagou; restaurar, apagar agora e esvaziar estão
   no registro de auditoria ([0074](0074-accounts-and-access-on-the-server.md)
   item 9), que o dono lê. Um compartilhamento ([0081](0081-sharing-between-people-on-one-universo.md))
   vê as entradas cujo caminho original está dentro do que foi
   compartilhado, e nada mais da lixeira da pasta. No computador a pessoa
   é a dona e faz tudo.
8. **A lixeira e a cota.** `[ABERTO]`; a troca é esta. Contar a lixeira na
   cota quebra a promessa do item 5 da [0077](0077-the-server-administration-console-and-folder-quotas.md)
   de que um apagamento é sempre permitido para que uma pasta cheia possa
   diminuir — com a lixeira contada, apagar não libera nada até a lixeira
   ser esvaziada, e a pessoa que bate na cota é empurrada a destruir de
   vez. Não contar deixa uma pasta ocupar a cota mais o que foi apagado
   nos últimos 30 dias, o que um membro pode usar para encher o disco de
   quem hospeda escrevendo e apagando em laço. Recomendado: **mostrada,
   não contada, limitada pela expiração**, com uma trava: quando só a
   lixeira de uma pasta passa da cota da pasta, as entradas mais antigas
   expiram antes da hora até ela não passar mais — dito na página da
   pasta, nunca em silêncio. Um servidor sem cotas não tem trava além da
   retenção — decidido em 2026-10-10: mostrada, não contada na cota, com a
   trava: quando só a lixeira de uma pasta passa da cota dela, as entradas
   mais antigas expiram antes da hora, dito na página da pasta.
9. **Um apagamento feito pelo sync no computador vai para o `.trash/` da
   pasta**, como o código faz hoje e como todo apagamento no Verso faz,
   para que seja visto e restaurado na mesma visão e as duas lixeiras do
   item 6 se espelhem. Isso contradiz as palavras do item 9 da
   [0079](0079-sync-a-local-folder-with-a-server.md) ("a lixeira do
   sistema"); `[ABERTO]`, do mantenedor resolver. Recomendado: a lixeira
   da pasta, com uma linha de Revisões na 0079 e nenhuma mudança de
   código — decidido em 2026-10-10: um apagamento feito pelo sync vai para
   o `.trash/` da pasta; o item 9 da 0079 revisto no mesmo dia.
10. **Agentes.** Um apagamento pelo MCP ([0066](0066-mcp-sees-boards-relations-properties-bases.md))
    vai para a lixeira como já vai; restaurar não é exposto ao MCP nesta
    ADR.
11. **Os dois idiomas, acessibilidade** ([0035](0035-cross-cutting-requirements.md)):
    a visão é uma lista com linha de cabeçalho, cada entrada uma linha
    cujas ações se alcançam pelo teclado e têm nome para um leitor de tela
    ("Restaurar *nome*", "Apagar *nome* agora"); uma ação irreversível
    pergunta antes, na página, com a contagem e o tamanho; restaurar
    anuncia para onde o arquivo foi; os ajustes e o console dizem a
    retenção em palavras ("arquivos apagados ficam guardados por 30
    dias"). pt-BR e inglês em tudo; testes de ponta a ponta no harness
    para a visão, o restaurar ao lado de um nome ocupado e a expiração, e
    a suíte do servidor para os papéis e o console.
12. **Uma versão que a escrita de um aparelho substituiu é guardada** —
    decidido em 2026-10-10. Quando a escrita de um aparelho substitui um
    arquivo no servidor, o servidor guarda a versão substituída na
    lixeira da pasta, com o nome `substituída por <aparelho>`, e ela se
    restaura como qualquer entrada (item 5). É a mitigação para o
    salvamento velho de um programa de fora, o limite conhecido que a
    [0079](0079-sync-a-local-folder-with-a-server.md) registra
    (Consequências; o achado F18 da campanha de sync): um programa que
    salva um buffer do arquivo inteiro mais velho do que o que o sync
    baixou sobrescreve a versão mais nova, e nenhum sync de arquivos
    consegue saber.

## Consequências

- O `verso-fs` ganha uma varredura de `.trash/` pelo nome (a regra do
  oculto inalterada no resto), um restaurar (uma mudança de lugar
  confinada para fora de `.trash/`, invariante 11 no destino), e uma
  remoção definitiva confinada a `.trash/`, cada um com seus testes; o
  `verso-core` e o `verso-service` ganham os comandos da lixeira — listar,
  restaurar, apagar agora, esvaziar — e a varredura de expiração; os tipos
  do contrato são gerados como sempre (invariante 3).
- O banco do servidor ganha a tabela da lixeira e a retenção de uma pasta;
  a página da pasta no console e a Visão geral mostram a lixeira; uma
  variável nova, `VERSO_TRASH_DAYS`, documentada em
  `docs/reference/server-install.md` com as outras ([0075](0075-server-packaging-and-storage.md)
  item 6).
- A janela ganha a visão Lixeira, o ajuste da pasta e os textos; o cofre
  de exemplo a ensina ([0058](0058-demo-vault-as-tutorial.md)); o
  changelog ganha a sua linha.
- O `[ABERTO]` da [0073](0073-self-hosted-server-first.md) sobre recuperar
  a exclusão de outro membro é respondido pelos itens 5 e 7 quando esta
  ADR for aceita, com uma linha de Revisões lá; histórico e atribuição de
  uma **mudança** seguem abertos, o próximo passo que o mantenedor nomeou
  ([0081](0081-sharing-between-people-on-one-universo.md), Consequências).
- Um guardrail da feature, visto falhando primeiro ([0029](0029-guardrails-in-ci.md)):
  um teste de que a varredura de expiração não remove nada fora de
  `.trash/`, nada antes da hora, e não segue symlink.

## Alternativas descartadas

- **O registro de um apagamento escrito dentro da pasta** (levantada pelo
  autor: um arquivo ao lado em `.trash/` ou em `.verso/`): o Obsidian e um
  gerenciador de arquivos apagam sem escrevê-lo, então estaria errado
  sempre que a pasta fosse compartilhada com outro app; o registro é um
  cache fora da pasta, e o próprio `.trash/` é a verdade.
- **Sincronizar a lixeira** (levantada pelo autor): os bytes de um arquivo
  apagado atravessando de novo, e o espaço dobrado em cada aparelho.
- **A lixeira do sistema no computador** (levantada pelas palavras do
  item 9 da [0079](0079-sync-a-local-folder-with-a-server.md), e pela
  [0048](0048-file-operations-in-ui.md) como opção): fora do alcance do
  Verso, então sem visão, sem restaurar, sem expiração próprias do Verso;
  e não uma lixeira por pasta. O item 9 deixa a escolha ao mantenedor,
  que escolheu a lixeira da pasta em 2026-10-10.
- **Apagamento definitivo com um desfazer na janela** (levantada pelo
  autor): um desfazer mora na memória de uma janela; um apagamento de
  outro membro, do sync ou de um agente não tem janela em que ser
  desfeito.

## Status

**Aceita (2026-10-11).** Itens abertos respondidos em 2026-10-10 como
recomendado; lida por Opus 5.5 (o handoff de 2026-10-10 e a leitura das
respostas); aceita pelo mantenedor em 2026-10-11 (*"Mas eu tinha
confirmado"* às recomendações). Nenhum item `[ABERTO]` segue aberto.

**Construída na noite de 2026-10-11 para 12** (8ad89d2, 9c10495,
02903f1, 173cf7e e f3edc42, com o item 12; a correção 5b5fb9c). As
perguntas em aberto que a construção levantou foram mandadas ao
mantenedor na mesma noite e esperam as respostas: se uma versão
substituída é guardada só quando a escrita de um aparelho a substituiu
(item 12); a faixa de dias que o dono pode definir (item 3); onde mora a
retenção de uma pasta do desktop; uma restauração diante da cota da
pasta (item 8); e o nome do aparelho numa exclusão feita pelo sync.

Proposta em 2026-10-10. A ser lida por Opus 5.5 antes de ser aceita. Para
o mantenedor, cada um com uma recomendação: o padrão da retenção (item 3;
30 dias); se o dono muda a retenção de uma pasta pela janela (item 3; só
encurtar); se a árvore mostra uma linha Lixeira (item 4; não); se a
lixeira conta na cota (item 8; mostrada, não contada, as mais antigas
expirando antes quando só a lixeira passa da cota); e para onde vai um
apagamento feito pelo sync no computador (item 9; a lixeira da pasta, uma
linha de Revisões na 0079).

Itens abertos respondidos em 2026-10-10. O mantenedor, em sessão, às recomendações acima: *"Gostei das recomendações, pode seguir"* —
cada `[ABERTO]` decidido como recomendado, no lugar (itens 3, 4, 8 e 9),
e o item 12 acrescentado, a mitigação do limite conhecido da 0079.
