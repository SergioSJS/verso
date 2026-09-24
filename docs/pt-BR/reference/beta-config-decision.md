# Memo de decisão: onde uma release de teste guarda os índices

- Data: 2026-09-24
- Status: **não decidido.** Pergunta se um ponto decidido deve ser revisto,
  com opções e uma recomendação identificadas como tais; o mantenedor decide
  (`CLAUDE.md` §1). Nenhum código segue este memo.
- Escrito pelo Opus 5.5 durante a noite, no lugar do Fable 5.1 por decisão do
  mantenedor de 2026-09-23; lido por uma sessão nova do Opus 5.5 sob a mesma
  decisão, e corrigido depois dessa leitura: a primeira versão apresentava um
  ponto decidido como uma lacuna.

## 1. O que está decidido

O [ADR 0051](../adr/0051-development-flow-and-releases.md), Decisão 6, aceito
em 2026-09-23: "Uma release de teste é o "Verso Beta", com um identificador
próprio, para ser instalado ao lado do app de produção com os próprios ajustes
da janela, e a linha de comando dele o abre; o índice, um cache que se refaz, é
compartilhado."

O diretório em que o índice mora é o do
[ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md), decidido em
2026-09-22: `$VERSO_CONFIG_DIR`, senão `$XDG_CONFIG_HOME/verso`, senão
`~/Library/Application Support/verso` no macOS; o índice de uma pasta é
`<config>/index/<nome>-<hash>.sqlite`. O código faz as duas coisas: a beta e o
app de produção abrem o mesmo arquivo de índice para a mesma pasta, enquanto os
ajustes da janela, os workspaces e a última pasta vivem no armazenamento da web
view, que o macOS mantém por identificador.

## 2. O que compartilhar custa, visto ao testar a primeira beta

- **Uma mudança de schema reconstrói.** Um índice cuja versão de schema não é
  a do código é descartado e construído de novo
  (`crates/verso-index/src/schema.rs`). Uma beta com schema mais novo e um app
  de produção com o mais velho reconstroem o índice um do outro a cada troca —
  segundos numa pasta grande, nada perdido.
- **Os dois abertos ao mesmo tempo, schemas diferentes.** Um reconstrói —
  derruba e cria todas as tabelas — enquanto o outro mantém o arquivo aberto: a
  próxima consulta do outro pode falhar, ou devolver nada em silêncio, até ele
  indexar de novo. Nada na pasta corre risco: o índice nunca escreve nela.
- **Os dois abertos ao mesmo tempo, mesmo schema.** Dois escritores num
  arquivo SQLite: o SQLite os serializa (cada nota é uma transação própria), e
  o índice de cada app fica atual depois das próprias execuções.

Nenhuma versão de produção está instalada ainda, então nada disso aconteceu.

## 3. As opções

| | (a) Compartilhar, como decidido | (b) A beta tem o próprio diretório | (c) Compartilhar, um arquivo de índice por versão de schema |
|---|---|---|---|
| Onde | `…/verso` | `…/verso-beta` para uma release de teste, `…/verso` para produção | `…/verso/index/v6/…`, `…/verso/index/v7/…` |
| Mudanças de schema | reconstrução a cada troca | nenhuma entre canais | nenhuma |
| Os dois abertos ao mesmo tempo | seção 2 | independentes | independentes quando os schemas diferem |
| Muda um texto decidido | não | a Decisão 6 do ADR 0051, e a regra do diretório do ADR 0011 | o caminho do índice do ADR 0011 |
| Custo | nenhum | a beta indexa cada pasta uma vez; a linha de comando dela precisa usar o mesmo diretório que o app dela (um canal de build dado aos dois) | arquivos de versões velhas ficam até serem removidos |

**Recomendação: manter (a)**, a decisão, e revê-la num ponto: antes que uma
beta mude o schema do índice enquanto uma versão de produção está instalada na
mesma máquina. Até lá os dois custos da seção 2 não podem acontecer, e depois
dele (b) é a mudança menor.

## 4. O que este memo não verificou

- Dois apps abertos na mesma pasta ao mesmo tempo não foi executado; a seção 2
  decorre do código, não de um teste.
- Windows e Linux ainda não estão construídos; onde cada um guardaria o índice
  de uma beta é assunto dos portes deles.

## 5. Para o mantenedor

1. Manter (a), ou mudá-la — (b) ou (c) — por uma revisão do ADR 0051 e do
   ADR 0011.
