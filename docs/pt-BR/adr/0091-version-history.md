# ADR 0091 — Histórico de versões: quem mudou um arquivo, quando, e trazer uma versão de volta

- Data: 2026-10-14
- Fonte: o mantenedor, em 2026-10-10, fechando a [0081](0081-sharing-between-people-on-one-universo.md):
  *"num próximo passo… histórico de mudança de arquivos… não esquece"*. A
  leitura de 2026-10-14 em sessão o listou entre as decisões em aberto
  que mudam o produto e o recomendou como obrigatório na V1; perguntado
  se entra na V1, o mantenedor respondeu que sim naquela noite e, sobre a
  lista inteira: *"VAI SER TUDO NA V1"*. Escrita por Opus 5.5; a ser lida
  pelo outro modelo antes de ser aceita
  ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0073](0073-self-hosted-server-first.md) (o Status dela
  deixa "histórico e atribuição de uma mudança de outro membro"
  `[ABERTO]`), [0080](0080-the-trash-with-expiry-and-restore.md) (a
  recuperação de um apagamento; a versão que a escrita de um aparelho
  substituiu, item 12; a lixeira diante da cota, item 8), [0079](0079-sync-a-local-folder-with-a-server.md)
  (item 4, o registro de mudanças), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (uma sala escreve o arquivo), [0081](0081-sharing-between-people-on-one-universo.md),
  [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (cotas), [0011](0011-config-outside-tree-index-as-cache.md),
  [0012](0012-files-are-source-of-truth.md), [0070](0070-what-travels-with-the-folder.md)
  (a camada de ajustes da pessoa), [0087](0087-secret-blocks-hidden-from-readers.md),
  [0035](0035-cross-cutting-requirements.md).
- Status no briefing: ausente; ao ser aceita.

## Contexto

O que existe. Num UniVerso toda escrita numa pasta — o comando de uma
janela, o salvamento de uma sala, o sync de um aparelho, uma mudança que
o watcher acha — termina numa reconciliação que acrescenta ao registro de
mudanças da pasta (`crates/verso-server/src/sync.rs`): a tabela `changes`
registra o caminho, o hash e o tamanho dos bytes novos, um apagamento ou
uma renomeação, o autor e a hora (`crates/verso-server/src/db.rs`). **Ela
não guarda bytes.** A lixeira guarda o que foi apagado, e a versão que a
escrita de um aparelho substituiu, restauráveis por 30 dias ([0080](0080-the-trash-with-expiry-and-restore.md)
itens 3 e 12). Uma sala escreve a sua nota 900 ms depois da última edição
([0082](0082-live-co-editing-of-a-synced-folder.md)), então uma hora de
escrita são centenas de escritas. Uma pasta do computador, sem servidor,
não guarda nada do passado de um arquivo além da lixeira.

Então a edição de outro membro — um parágrafo apagado, um board
rearrumado — só pode ser vista enquanto está no desfazer da sala, e não
pode ser recuperada por ninguém. O Notion e o Google Docs mostram as
versões de uma página; a ajuda pública do Obsidian descreve um "File
recovery" do núcleo que guarda instantâneos no computador.

## Decisão

Proposta (2026-10-14). Aceita em 2026-10-14 (Status): cada `[ABERTO]` foi decidido como
recomendado e está marcado `[DECIDIDO 2026-10-14]`.

1. **Uma versão são os bytes de um arquivo numa escrita**, guardados fora
   da pasta ([0011](0011-config-outside-tree-index-as-cache.md)) — no
   servidor, no diretório de dados dele, pelo hash que o registro de
   mudanças já registra, para que bytes iguais sejam guardados uma vez só.
   O arquivo continua sendo a verdade
   ([0012](0012-files-are-source-of-truth.md)); o histórico nunca é escrito
   na pasta e nunca sincroniza.
2. **O que é guardado.** Todo arquivo de texto que a janela edita — notas,
   boards, bases, `.txt`, `.json`, `.csv`. `[DECIDIDO 2026-10-14]`: imagens, PDFs e
   outros anexos. Decidido: **fora do histórico**; um anexo substituído
   vai para a lixeira, como o item 12 da [0080](0080-the-trash-with-expiry-and-restore.md)
   já faz para a escrita de um aparelho.
3. **Quantas.** `[DECIDIDO 2026-10-14]`: o desbaste e a retenção. Decidido: as
   escritas de uma sala **agrupadas** em uma versão a cada dez minutos de
   edição; toda versão guardada por um dia, uma por hora por 30 dias, uma
   por dia depois disso até a retenção da pasta — `VERSO_HISTORY_DAYS`,
   365 por padrão, `0` para sem limite, definida por pasta no console como
   a da lixeira ([0080](0080-the-trash-with-expiry-and-restore.md) item 3);
   a versão mais nova de um arquivo nunca é desbastada.
4. **Quem mudou.** Cada versão nomeia os seus autores: as contas cujas
   edições a versão de uma sala contém, um aparelho pelo nome, o token de
   um agente, ou "fora do Verso" para uma mudança que o watcher achou.
   `[DECIDIDO 2026-10-14]`: quem escreveu cada linha. Decidido: **fora da V1**; a
   diferença entre duas versões e os autores delas respondem "quem mudou
   isto".
5. **A visão.** "Histórico" numa nota, num board ou numa base — pelo menu
   dela, pela paleta de comandos e pela barra de status — lista as
   versões, a mais nova primeiro, com quando, quem e o tamanho da mudança;
   uma selecionada mostra a diferença dela contra o texto atual e contra a
   anterior. **"Restaurar esta versão"** escreve esses bytes como uma
   escrita **nova**, com a verificação da invariante 11, pela sala quando
   a nota está ao vivo: o histórico nunca é reescrito, e a restauração é
   ela mesma uma versão. "Copiar como nota nova" a põe ao lado do arquivo
   em vez disso.
6. **Quem vê, num servidor.** Quem pode escrever o arquivo vê o histórico
   dele e restaura; o dono e o admin podem apagar uma versão.
   `[DECIDIDO 2026-10-14]`: leitores. Decidido: **sem histórico para leitores**, como
   eles não veem lixeira ([0080](0080-the-trash-with-expiry-and-restore.md)
   item 7) — senão uma versão passada precisaria da projeção da
   [0087](0087-secret-blocks-hidden-from-readers.md) aplicada a cada uma.
   Um compartilhamento vê o histórico dos arquivos dentro dele.
7. **O histórico e a cota.** `[DECIDIDO 2026-10-14]`: **como a lixeira**
   ([0080](0080-the-trash-with-expiry-and-restore.md) item 8): mostrado na
   página da pasta e não contado, as versões mais antigas desbastadas
   antes da hora quando só o histórico passa da cota da pasta, dito lá.
8. **Uma pasta do computador.** `[DECIDIDO 2026-10-14]`: se o desktop guarda um
   histórico das suas pastas locais na V1. Decidido: **sim**, o mesmo
   armazenamento no diretório de configuração e a mesma visão, a retenção
   um ajuste da camada da pessoa ([0070](0070-what-travels-with-the-folder.md));
   uma pasta sincronizada mostra o histórico do servidor, que contém as
   escritas de todo aparelho, e o local só para o que ainda não cruzou.
9. **Renomeações e apagamentos.** Uma versão acompanha o seu arquivo
   através de renomeações (o `renamed_from` do registro de mudanças); o
   histórico de um arquivo apagado é alcançado pela entrada dele na
   lixeira.
10. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
    a lista é uma tabela com linha de cabeçalho; a diferença é lida como
    linhas acrescentadas e removidas, não só pela cor; "Restaurar"
    pergunta antes e anuncia o que fez; pt-BR e inglês.

## Consequências

- O `verso-server` ganha o armazenamento de versões, o desbaste e os
  comandos (listar, ler, restaurar, apagar); o `verso-core` ganha o
  armazenamento local com o item 8; os tipos do contrato são gerados como
  sempre (invariante 3); `VERSO_HISTORY_DAYS` é documentada com as outras
  variáveis em `docs/reference/server-install.md`.
- O `[ABERTO]` da [0073](0073-self-hosted-server-first.md) "histórico e
  atribuição de uma mudança de outro membro" é respondido quando esta ADR
  for aceita, com uma linha de Revisões lá, e a linha do roadmap na Fase 3
  riscada.
- Um guardrail da feature, visto falhando primeiro ([0029](0029-guardrails-in-ci.md)):
  um teste de propriedade de que restaurar uma versão escreve exatamente
  os bytes dela, de que o desbaste nunca remove a versão mais nova de um
  arquivo, e de que nada do histórico toca a pasta.
- A janela ganha a visão Histórico, a diferença, os textos; testes de
  ponta a ponta para uma restauração sobre uma sala ao vivo e para a
  ausência de histórico de um leitor; o cofre de exemplo a ensina
  ([0058](0058-demo-vault-as-tutorial.md)); o changelog ganha a sua linha.

## Alternativas descartadas

Nenhuma registrada.

## Status

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondendo a
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. Na V1
(`docs/roadmap.md`, Fase 4 — V1). A [0073](0073-self-hosted-server-first.md) ganha uma linha de Revisões, e a linha da Fase 3 no roadmap é riscada.

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14). Na V1 pela palavra do mantenedor de 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o
mantenedor, cada um com uma recomendação: anexos (item 2), desbaste e
retenção (item 3), autoria por linha (item 4), leitores (item 6), a cota
(item 7), e o histórico local do desktop na V1 (item 8).
