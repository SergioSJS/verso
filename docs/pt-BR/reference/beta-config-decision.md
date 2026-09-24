# Memorando de decisão: onde uma versão de teste guarda os índices

- Data: 2026-09-24
- Estado: **não decidido.** Opções e uma recomendação, identificadas como
  tais; o mantenedor decide (`CLAUDE.md` §1). Nenhum código segue este
  memorando ainda: a mudança é pequena e espera a resposta.
- Encontrado ao testar a primeira beta, `0.2.0-beta.1`, em 2026-09-24, e posto
  ao mantenedor na sessão na mesma noite; sem resposta quando isto foi
  escrito, então registrado aqui.

## 1. O que acontece hoje

A [ADR 0051](../adr/0051-development-flow-and-releases.md) diz que uma versão
de teste é o "Verso Beta", com identificador próprio, "para que se instale ao
lado do app de produção com os próprios ajustes de janela". Essa parte vale:
os ajustes da janela, os workspaces e a última pasta vivem no armazenamento da
web view, que o macOS mantém por identificador (`dev.verso.app.beta` contra
`dev.verso.app`).

Os índices não acompanham. O diretório de configuração
([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)) é nomeado pelo
`verso-core`, não pelo app: `$VERSO_CONFIG_DIR`, senão
`$XDG_CONFIG_HOME/verso`, senão `~/Library/Application Support/verso` no
macOS. A beta e o app de produção abrem, portanto, o mesmo arquivo de índice
para a mesma pasta. Hoje ele guarda só `index/`.

## 2. O que compartilhar custa

- **Uma mudança de schema reconstrói.** Um índice cuja versão de schema não é
  a do código é descartado e construído de novo: é um cache (ADR 0011,
  `crates/verso-index/src/schema.rs`). Uma beta com schema mais novo e um app
  de produção com o mais velho reconstroem o índice um do outro a cada vez que
  o usuário troca entre eles — segundos numa pasta grande, nada perdido.
- **Os dois abertos ao mesmo tempo, schemas diferentes.** Um reconstrói
  (derruba as tabelas) enquanto o outro mantém o arquivo aberto: a próxima
  consulta do outro falha até ele abrir a pasta de novo. Nada na pasta corre
  risco — o índice nunca escreve nela —, mas o app mostra erros.
- **Os dois abertos ao mesmo tempo, mesmo schema.** Dois escritores num
  arquivo SQLite, cada um com a sua ideia da listagem: o SQLite os serializa;
  o índice de cada app fica atual depois das próprias execuções.

Nenhuma versão de produção está instalada ainda, então nada disso aconteceu.

## 3. As opções

| | (a) Compartilhar, como hoje | (b) A beta tem o próprio diretório | (c) Compartilhar, um arquivo de índice por versão de schema |
|---|---|---|---|
| Onde | `…/verso` | `…/verso-beta` para uma versão de teste, `…/verso` para produção | `…/verso/index/v6/…`, `…/verso/index/v7/…` |
| Mudanças de schema | reconstrução a cada troca | nenhuma entre canais | nenhuma |
| Os dois abertos ao mesmo tempo | as falhas da seção 2 | independentes | independentes quando os schemas diferem; compartilhados quando iguais |
| Custo | nenhum | a beta indexa cada pasta uma vez; o CLI dela precisa usar o mesmo diretório que o app dela | diretórios de versões velhas ficam até serem removidos |
| Como | — | um canal de build (`VERSO_CHANNEL=beta`) dado ao app e ao CLI pelo workflow de release, lido onde o `verso-core` nomeia o diretório; `VERSO_CONFIG_DIR` continua prevalecendo | a versão do schema no caminho do índice |

**Recomendação: (b).** Dá à beta o que a ADR 0051 prometeu para os ajustes de
janela — estado próprio — e bate com o que o usuário vê: dois apps. A linha de
comando da beta (o `verso` do arquivo da beta) precisa usar o diretório da
beta, senão um `verso index` dela gravaria onde o app beta nunca olha; a mesma
variável de canal cobre os dois builds.

## 4. O que este memorando não verificou

- Dois apps abertos na mesma pasta ao mesmo tempo não foi executado; a seção 2
  decorre do código, não de um teste.
- Onde Windows e Linux poriam `verso-beta` segue as regras da ADR 0011 para
  eles; nenhum dos dois é alvo ainda.

## 5. Para o mantenedor

1. (a), (b) ou (c).
2. Se (b): o nome do diretório (`verso-beta` proposto).
