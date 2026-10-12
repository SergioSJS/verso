# ADR 0011 — Config fora da árvore e índice como cache reconstruível

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §5.1
- Status no briefing: `DECIDIDO`
- Revisões: 2026-09-22 — o que o código da feature 4 faz registrado em
  Consequências, como **provisório**; a Decisão não muda e as perguntas que o
  [0046](0046-index-location-lifecycle-tokenizer.md) guarda continuam
  `[ABERTO]` (memo `docs/reference/cli-decision.md`).

## Contexto

Decorrência direta de não haver vault ([0010](0010-folder-is-the-unit-no-vault.md)):
se nenhum diretório é obrigatório dentro da pasta, a configuração e o índice
precisam morar em outro lugar e ser reconstruíveis.

## Decisão

1. Config fora da árvore, em diretório de configuração do usuário, indexada pelo
   caminho da pasta. Nenhum diretório obrigatório dentro da pasta aberta.
2. O índice é cache reconstruível: apagá-lo não perde dado.

## Consequências

- Uma pasta sincronizada entre máquinas não carrega configuração junto, o que
  empurra a config compartilhada para o sync em camadas
  ([0021](0021-sync-automerge-layered-config.md)).
- Mover ou renomear a pasta desassocia a config, já que a chave é o caminho.
  Como a reassociação acontece, o briefing não diz.
- Como o índice é cache, ele nunca pode ser a única cópia de um dado — reforça
  a degradação para Markdown ([0013](0013-degrades-to-markdown.md)).
- Apagar o índice é operação segura e precisa continuar segura: vira teste, não
  promessa.
- Abrir uma pasta pela primeira vez implica indexar do zero, o que torna o custo
  da indexação visível para o usuário ([0039](0039-performance-targets.md)).
- `.obsidian/` num vault existente é ignorado, não apagado: a conversão é
  explícita e com diff (`docs/spec/dialect.md`, D2).
- O índice guarda o texto da pasta inteira fora dela. Onde ele mora quando a
  pasta é sensível, com que permissões, e o que acontece com o índice órfão
  quando a pasta some, é `[ABERTO]` em
  [0046](0046-index-location-lifecycle-tokenizer.md), a decidir antes
  da feature 3 da Fase 1. *(Decidido: o 0046 aceito em 2026-09-22.)*

**Onde fica o diretório de configuração, e o que chaveia uma pasta. Registrado
em 2026-09-22 a partir do código da feature 4 — provisório, o mantenedor decide
ao acordar**, na linha 2 da §10 de `docs/reference/cli-decision.md`. É o que o
código faz, não uma decisão.

- **O diretório** é `$VERSO_CONFIG_DIR` quando está definido e não vazio; senão
  `$XDG_CONFIG_HOME/verso` quando essa está definida e não vazia; senão
  `~/Library/Application Support/verso` no macOS e `~/.config/verso` nas outras
  plataformas. O `verso_core::config_dir` lê o ambiente e delega a regra inteira
  à `config_dir_from(verso, xdg, home, macos)`, uma **função pura**, de modo que
  a precedência é exercitada por um teste em vez de ser afirmada aqui.
- **O índice de uma pasta** é `<config>/index/<nome-da-pasta>-<hash>.sqlite` — o
  nome que o `verso-index` já calcula a partir do caminho **absoluto** da pasta
  (`Index::file_name_for`). O `Workspace::open` torna o caminho absoluto antes
  de calcular a chave, então `verso index .` e `verso index ~/vault` de outro
  lugar nomeiam um índice só. O `verso-core` calcula o caminho e o entrega; quem
  abre o arquivo é o `verso-index`
  ([0026](0026-core-ui-contract-inviolable-rules.md), regra 5, escopo
  delimitado).
- **Nenhum arquivo sidecar.** O memo recomendava um `<chave>.json` ao lado do
  índice com o caminho absoluto da pasta e a hora da última execução; o código
  põe os dois na própria tabela `meta` do arquivo de índice (`Index::set_root`,
  escrita ao fim de cada execução). Um arquivo por pasta em vez de dois, e os
  dois não podem se desencontrar. O mapeamento inverso de que uma listagem de
  órfãos precisa está lá, dentro do arquivo de índice que ele descreve.
- **Nada lista nem esquece um órfão ainda.** `verso index --list` e
  `verso index --forget <pasta>` **não estão escritos**; as linhas acima são o
  que eles leriam. Um índice cuja pasta sumiu fica no disco, intocado — que é a
  "limpeza sob demanda, nunca automática" do memo do índice, com o lado da
  demanda ainda faltando.
- **A metade do Linux do local continua aberta**, como a §2.6 de
  `docs/reference/index-decision.md` deixou: `~/.config/verso` é o que o código
  faz hoje, e se o Linux deve usar o diretório de configuração, o de dados ou o
  de cache é respondido no PR que trouxer o Linux.

**Depois da leitura da Opus 5 de 2026-09-22 o código também faz:**

- **O caminho da pasta é normalizado antes de o índice ser chaveado.** O
  `Workspace::open` torna o caminho absoluto e então descarta o `.` e o
  separador final (via `Path::components`), de modo que `vault`, `vault/` e
  `vault/.` nomeiam um arquivo de índice só em vez de três. O shell que
  completa um nome de diretório acrescenta o separador, então esse era o
  problema da primeira execução, não um caso exótico.
- **O `..` é mantido, não resolvido**, porque resolvê-lo significa seguir
  symlink, que é assunto do `verso-fs`
  ([0044](0044-verso-fs-semantics.md)). Então `vault/../vault` ainda chaveia um
  índice próprio: lacuna conhecida, registrada e não decidida.
- **Sem `HOME`, sem `XDG_CONFIG_HOME` e sem `VERSO_CONFIG_DIR` é um erro que o
  usuário vê** (`CoreError::NoConfigDir`, código de saída 3), nunca um diretório
  relativo ao atual. Sob `launchd` ou num contêiner pelado, o fallback punha o
  índice onde o processo estivesse rodando, possivelmente dentro da própria
  pasta aberta.

**Decidido em 2026-09-22 pelo mantenedor** (`docs/reference/cli-decision.md`
§10, linha 2). O diretório de configuração é `$VERSO_CONFIG_DIR` quando
definido e não vazio; senão `$XDG_CONFIG_HOME/verso` quando essa variável
estiver definida; senão `~/Library/Application Support/verso` no macOS e
`~/.config/verso` no resto. Sem nenhum dos três — e sem `HOME` — o comando
**falha com mensagem**; nunca cai para um diretório relativo ao atual, que num
job do `launchd` ou num contêiner poderia cair dentro da pasta aberta. Sem
dependência `dirs`/`directories`: a regra são nove linhas nossas.

O índice de uma pasta é `<config>/index/<nome>-<hash>.sqlite`, chaveado pelo
caminho absoluto da pasta depois de normalizado, com um sidecar `<mesmo>.json`
registrando esse caminho e a hora da última indexação, para que um índice órfão
possa ser listado e esquecido
([0046](0046-index-location-lifecycle-tokenizer.md)). O sidecar **ainda não é
escrito**: é o que falta da feature 4.

Por que essa ordem e não só o padrão da plataforma: as próprias bibliotecas do
ecossistema Rust devolvem `Application Support` no macOS, e a reclamação
recorrente contra elas é que um `XDG_CONFIG_HOME` explicitamente definido é
ignorado. Respeitá-lo quando está definido, e cair no padrão da plataforma
quando não está, é o meio-termo que os dois lados pedem, e é o que espera quem
mantém dotfiles.

## Alternativas descartadas

- Diretório de configuração dentro da pasta, no modelo `.obsidian/` — descartado
  em §5.1.

## Status

Aceito. Emendado pelo mantenedor em 2026-10-08:

- No Windows o diretório de configuração é `%LOCALAPPDATA%\verso`, depois de
  `$VERSO_CONFIG_DIR` e `$XDG_CONFIG_HOME` e antes de `HOME`: o que ele
  guarda é da máquina, e o `%APPDATA%` móvel é copiado entre máquinas
  ([ADR 0069](0069-windows-port.md), item 9; a escolha deixada ao porte).
- Uma rodada de índice confia numa nota pela data de modificação e pelo
  tamanho, sem lê-la, quando a nota foi modificada pelo menos 2 s antes do
  começo da rodada que a leu por último (`indexed_at`, schema 12); senão a
  lê e calcula o hash como antes. Uma mudança no mesmo segundo de uma
  leitura poderia manter os dois, então essa nota é lida de novo, como o git
  faz com as suas entradas "racy". Ler e calcular o hash de toda nota fazia
  cada abertura de 5.000 notas custar segundos ("pode ser").
  *Revisto em 2026-10-09 (schema 13), só o mecanismo:* a data da qual a
  nota precisa ser mais antiga é uma só para o índice inteiro — o começo da
  última rodada completa, que leu ou confiou em toda nota
  (`meta.verified_from`, não gravada por uma rodada que não conseguiu
  listar uma pasta ou ler um arquivo) — em vez de uma por linha. Atestar
  cada linha regravava todas as linhas, com o texto junto, a cada
  abertura: no runner do CI, reabrir 10.000 notas foi de 379 ms (a linha de
  base registrada) a 949–980 ms. Aceito, como no git: um arquivo trocado
  por outro do mesmo tamanho com o mesmo segundo de modificação (uma cópia
  que mantém as datas, uma restauração) é confiado até um dos dois mudar.
