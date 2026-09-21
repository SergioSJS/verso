# Revisão crítica — Fase 0

- Data: 2026-09-21
- Revisor: Fable 5.1, na função de revisor de documentos ([ADR 0032](../adr/0032-author-and-reviewer-roles.md))
- Entrada: `docs/BRIEFING.md`, `docs/adr/*`, `docs/spec/dialect.md`, `docs/roadmap.md`, `CLAUDE.md`, `.github/pull_request_template.md`, na branch `fase0/docs` (commit `20b8fb5`). Sem acesso à sessão do autor.
- Item do roadmap: 0.6 — Revisão crítica dos documentos por sessão independente.
- Estado: **achados aceitos integralmente pelo mantenedor e aplicados** na mesma
  sessão, por ordem dele. A seção 6 (Resolução) registra o que mudou por achado
  e as escolhas que a aplicação teve de fazer onde o achado deixava opções. O
  diff da aplicação precisa de leitura pelo Opus 5 antes do merge
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md), consequência acrescentada).

## Como ler

Cada achado tem um ID, uma classificação e a evidência (documento e seção). Nenhum achado propõe decisão: onde o mantenedor precisa escolher, o achado diz o que precisa ser escolhido e por quê. As seções 1 a 5 são o texto original da revisão, sem alteração; a seção 6 foi acrescentada na aplicação.

| Nível | Significado ([ADR 0033](../adr/0033-pr-workflow.md)) |
|---|---|
| BLOQUEANTE | Viola invariante, guardrail ou decisão; ou perde dado; ou torna um critério de saída insatisfazível. A Fase 0 não fecha com um destes aberto |
| IMPORTANTE | Deve ser resolvido, ou explicitamente adiado com registro |
| MENOR | A critério do autor |

## Resumo

| Nível | Quantidade | IDs |
|---|---|---|
| BLOQUEANTE | 3 | C1, C2, C3 |
| IMPORTANTE | 22 | C4–C9, R1–R8, I1–I3, L1–L5 |
| MENOR | 20 | C10–C16, R9–R13, I4–I6, L6–L10 |

Os três BLOQUEANTES têm resolução curta e são todos do mantenedor: uma promoção explícita (ou retirada) em `CLAUDE.md`, uma delimitação de escopo numa invariante, e uma reclassificação dos guardrails no roadmap.

---

## 1. Contradições entre documentos

### C1 — `CLAUDE.md` promove `PROPOSTO` a invariante (guarda contra placeholder) — BLOQUEANTE

- `CLAUDE.md` §2.2, invariante 10: "Arquivo placeholder de armazenamento sob demanda nunca é interpretado como deleção." Invariante é "BLOQUEANTE por definição".
- `docs/BRIEFING.md` §8: o mesmo item é `PROPOSTO`.
- [ADR 0021](../adr/0021-sync-automerge-layered-config.md): status Proposto.
- `CLAUDE.md` abre dizendo "Esta página não cria regra nova" e a Regra zero (§1, item 2) proíbe promover `PROPOSTO` a `DECIDIDO`.

O documento que enuncia a regra é o primeiro a violá-la. A guarda é boa e provavelmente deve ser decidida, mas quem decide é o mantenedor. Agravante: [ADR 0021](../adr/0021-sync-automerge-layered-config.md), ainda Proposto, já impõe requisito à Fase 1 ("a varredura de pasta da Fase 1 já precisa distinguir placeholder de arquivo ausente").

**Precisa do mantenedor:** promover explicitamente o item 3 do ADR 0021 (com ADR próprio ou nota de status), ou remover a invariante 10 de `CLAUDE.md` e a exigência sobre a Fase 1 no ADR 0021.

### C2 — Invariante 5 ("acesso a disco só em `verso-fs`") é contradita pela estrutura de crates decidida — BLOQUEANTE

- [ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md), regra 5: "Acesso a disco só dentro do crate `verso-fs`." Aceito.
- [ADR 0028](../adr/0028-crate-structure.md): `verso-index` é "SQLite/FTS5". Aceito. Consequência declarada: "Acesso a disco confinado a `verso-fs` deixa de ser convenção e vira ausência de dependência, auditável no `Cargo.toml`."
- [ADR 0023](../adr/0023-stack-core-and-editor.md): índice em SQLite com FTS5. Aceito.

SQLite escreve em disco (arquivo do banco, journal ou WAL). A dependência que faz isso (`rusqlite` ou equivalente) mora em `verso-index`, não em `verso-fs`. Da mesma forma, `verso-cli` lê argumentos e imprime, `verso-core` precisa ler a config "fora da árvore" ([ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)), e o benchmark gera vault sintético. Lida literalmente, a regra 5 torna o primeiro PR de `verso-index` BLOQUEANTE por definição, e a verificação "ausência de dependência de IO fora de `verso-fs`" falha por construção.

Provavelmente a intenção é "acesso aos arquivos da pasta aberta só via `verso-fs`", mas isso não está escrito em lugar nenhum, e a invariante 4 (handles opacos, "nunca caminho POSIX em string") tem o mesmo problema de escopo: `verso <pasta>` ([ADR 0042](../adr/0042-open-from-command-line.md)) e a config "indexada pelo caminho da pasta" (ADR 0011) são caminhos em string por decisão.

**Precisa do mantenedor:** delimitar o escopo das regras 4 e 5 (quais crates, quais arquivos, qual fronteira — contrato core↔UI e API de plugin, ou também o interior do core). Sem isso a verificação mecânica prometida no ADR 0028 não existe.

### C3 — "Todos os guardrails antes da primeira linha de produto" é insatisfazível na Fase 0 como escrito — BLOQUEANTE

- [ADR 0029](../adr/0029-guardrails-in-ci.md) e `CLAUDE.md` §3: "Todos no CI antes da primeira linha de lógica de produto."
- `docs/roadmap.md`, Fase 0, critério 4: "**Cada** guardrail de ADR 0029 é visto falhando numa branch de teste". A lista de verificação que segue enumera só cinco: `unsafe`, `unwrap` fora de teste, licença fora da allowlist, advisory conhecida, `cargo fmt` divergente.
- `docs/roadmap.md`, Fase 0: "Nenhuma feature." Item 0.10: "cinco crates, vazios".

Dos nove guardrails do ADR 0029, cinco são testes de lógica de produto e não podem existir com crates vazios: fuzzing do parser, property test de round-trip, escrita atômica, confinamento de caminho, escape de FTS5. O benchmark é o sexto. "Cada guardrail visto falhando" e "nenhuma feature" não podem ser verdade ao mesmo tempo; a enumeração do critério 4 admite isso tacitamente ao listar só cinco, e inclui `cargo fmt`, que não está na tabela do ADR 0029.

**Precisa do mantenedor:** separar, no ADR 0029 e no roadmap, os guardrails de workspace (lints, `cargo-deny`, `fmt`), que entram na Fase 0, dos guardrails que acompanham a feature que protegem, que entram na Fase 1 com a feature. O critério 4 da Fase 0 passa então a enumerar exatamente o primeiro grupo, e a Fase 1 ganha o segundo como critério de saída explícito.

### C4 — Papel de revisor para código de UI/TypeScript não existe — IMPORTANTE

- [ADR 0032](../adr/0032-author-and-reviewer-roles.md) e `CLAUDE.md` §5: "Autor de UI e TypeScript: Opus 5"; "Revisor de código: Opus 5"; "Quem escreveu não revisa o que escreveu, nem na mesma sessão nem depois."

Se "quem" é o modelo, o código de UI (Fase 2) não tem revisor. Se "quem" é a sessão, a frase "nem depois" não faz sentido. O ADR define revisor para o core (Opus 5) e para documentos (Fable 5.1), mas não para UI/TS.

**Precisa do mantenedor:** dizer quem revisa UI/TS, e se "quem escreveu" significa modelo ou sessão.

### C5 — Critério de saída da Fase 1 depende de itens `PROPOSTO` e `[ABERTO]` — IMPORTANTE

- `docs/roadmap.md`, Fase 1, critério 4: o agente responde "consultando por tipo" e "cita o bloco de origem, e a citação leva à posição exata".
- [ADR 0014](../adr/0014-primitives-catalog.md) (Proposto): nota tipada é primitiva proposta; "Nada deste catálogo está na Fase 1".
- `docs/spec/dialect.md` Q11: formato e localização dos schemas, `[ABERTO]`, a decidir "antes da nota tipada (2.6)", ou seja, na Fase 2.
- Nenhum documento define como "posição exata" é representada (ver L3).

"Consultar por tipo" na Fase 1 exige schema, que só é decidido na Fase 2. O portão da Fase 1 pede algo que a ordem de decisões impede.

**Precisa do mantenedor:** tirar "consultar por tipo" do critério da Fase 1, ou antecipar Q11 e um ADR de nota tipada para a Fase 1.

### C6 — Aprovar fixture vira canal de decisão que contorna o ADR — IMPORTANTE

- `docs/spec/dialect.md` §1: "O comportamento normativo é o das fixtures, não o desta prosa. Onde os dois divergirem, a fixture ganha e a spec é corrigida."
- `docs/spec/dialect.md` §9: "Cada questão precisa de resposta do mantenedor antes de o comportamento correspondente ser implementado."
- [ADR 0031](../adr/0031-fixtures-as-contract.md): a IA pode rascunhar fixtures a partir da sexta; o mantenedor aprova.
- `CLAUDE.md` §1, Regra zero: "Nada que não esteja no briefing ou num ADR vira decisão."

Uma fixture rascunhada pela IA e aprovada responde, na prática, a uma questão `[ABERTO]` (Q2, Q3, Q6, Q13, Q14...) sem passar pela spec nem por ADR. A spec diz que será "corrigida", mas não diz por quem, em que PR, nem se a questão em §9 fecha junto. Regra zero e §1 da spec apontam em direções opostas.

**Precisa do mantenedor:** definir se aprovar uma fixture que responde a uma questão fecha a questão (e então o PR da fixture precisa atualizar §9 da spec), ou se a questão precisa ser fechada antes de a fixture existir.

### C7 — Fase 0 exige fixture de `#^bloco` cuja forma está `[ABERTO]`, e o schema do `expected.yaml` não existe — IMPORTANTE

- `docs/roadmap.md`, Fase 0, critério 5: cinco fixtures à mão "cobrindo categorias mínimas distintas de §11.4".
- `docs/roadmap.md`, Fase 0, "Não bloqueia a saída": questões `[ABERTO]` de dialeto.
- `docs/spec/dialect.md` §5.5 e Q1: o nome do campo para `#^bloco` é `[ABERTO]`; o exemplo usa `<campo ainda não definido>`.
- A spec, por outro lado, inventa sem cerimônia os campos `embeds`, `callouts`, `kind`, `title` e `frontmatter` (§5.1, §5.6, §5.8), que também não estão no briefing. A Regra zero foi aplicada a um campo e não aos outros.
- Nenhum documento define o schema do `expected.yaml`: quais chaves existem, se chave ausente significa "lista vazia" ou "não afirmado", se a ordem dos itens é a ordem no documento, se `target` é o texto cru do link ou um valor normalizado (`[[nota.md]]` → `nota` ou `nota.md`?), como um mesmo link aparece quando combina heading e alias.

As cinco primeiras fixtures vão fixar esse schema implicitamente, e `expected.yaml` é "intocável". O contrato nasce sem gramática.

**Precisa do mantenedor:** fixar o schema do `expected.yaml` (pode ser uma seção curta na spec, marcada como decidida por ele) e responder Q1 antes do item 0.9, ou aceitar que as cinco fixtures decidem isso e registrar na spec o que elas decidiram.

### C8 — "Passo 5 do roteiro" não existe em nenhum documento — IMPORTANTE

- `docs/BRIEFING.md` §3, §17 e [ADR 0005](../adr/0005-license.md), [ADR 0008](../adr/0008-documentation-language.md): três decisões `[ABERTO]` (licença, idioma, e a confirmação do DCO) são adiadas para o "Passo 5".
- O repositório tem fases (0, 1, 2), não passos. Nenhum documento define o roteiro nem o Passo 5.
- [ADR 0005](../adr/0005-license.md) diz "antes do esqueleto" (Fase 2); o roadmap exige `LICENSE` para fechar a Fase 0. Compatível, mas só porque "antes do esqueleto" é vago.

**Precisa do mantenedor:** substituir "Passo 5" por um ponto do roadmap (ex.: "antes do fechamento da Fase 0").

### C9 — Guardrails de verificação sem lugar no CI: WASM e tipos gerados — IMPORTANTE

- [ADR 0028](../adr/0028-crate-structure.md) e [ADR 0037](../adr/0037-base-parser.md): `verso-dialect` "compilável para WASM" é o que mitiga a divergência entre o parser do editor e o do índice (§10.3).
- [ADR 0038](../adr/0038-ts-type-generation.md): "O CI precisa verificar que os tipos gerados estão atualizados; caso contrário a regra 3 vira convenção."
- Nem `cargo check --target wasm32-unknown-unknown -p verso-dialect` nem a verificação dos tipos gerados aparecem na lista de CI de [ADR 0029](../adr/0029-guardrails-in-ci.md) ou do roadmap.

Duas propriedades das quais a arquitetura depende ficam como promessa, não como guardrail. A primeira cabe já na Fase 1 (com o crate); a segunda, na Fase 2.

### C10 — `#[allow]`: `CLAUDE.md` proíbe, o template de PR admite — MENOR

- `CLAUDE.md` §3: "Nenhum pode ser desligado, contornado com `#[allow]` local"; exceção "é assunto de PR próprio".
- `.github/pull_request_template.md`: "Nenhum `#[allow]` novo para calar guardrail; se foi inevitável, está justificado acima" — no mesmo PR.

### C11 — Alternativas "descartadas implicitamente" violam a regra de registro — MENOR

- `CLAUDE.md` §1 item 4 e `docs/adr/README.md`: só registrar alternativa que alguém de fato considerou.
- [ADR 0007](../adr/0007-private-repo-until-license.md) e [ADR 0028](../adr/0028-crate-structure.md): "descartado implicitamente". Implícito é o oposto de "de fato considerado".

### C12 — Spec §7 D7 rotula como `DECIDIDO` um efeito que é `PROPOSTO` — MENOR

- `docs/spec/dialect.md` §7, linha D7: status `DECIDIDO ([0016])`, mas a coluna "Efeito" afirma o shim separado com tabela declarada, que é [ADR 0017](../adr/0017-plugins-format-shim-loading.md), Proposto.

### C13 — [ADR 0042](../adr/0042-open-from-command-line.md) atribui `verso serve` ao [ADR 0028](../adr/0028-crate-structure.md) — MENOR

- O ADR 0028 lista `index, search, backlinks, mcp`. `verso serve` vem do [ADR 0025](../adr/0025-own-server-and-mobile-pwa.md), Proposto. A citação está errada e mistura status.

### C14 — "pt-BR e EN desde o primeiro commit" não é verificável como escrito — MENOR

- [ADR 0035](../adr/0035-cross-cutting-requirements.md) estende a decisão às "mensagens da CLI da Fase 1: nenhuma string literal solta". O briefing diz "desde o primeiro commit", que já passou (é documentação). O roadmap da Fase 1 não tem item nem critério de saída de i18n; só a Fase 2 (2.7). A extensão à CLI implica dependência nova em `verso-cli` que ninguém justificou.

### C15 — Degradação para Markdown ([ADR 0013](../adr/0013-degrades-to-markdown.md)) versus `.canvas` no dialeto base — MENOR

- "Todo dado estruturado degrada para Markdown legível" (Proposto) e "`.canvas` (JSON Canvas)" no dialeto base (Aceito, [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md)). JSON não é Markdown. [ADR 0040](../adr/0040-board-persistence.md) toca no assunto sem resolver: "JSON binário não atende", mas JSON Canvas é texto. Vale dizer o que "degrada para Markdown" quer dizer para dados que já nascem em outro formato de texto.

### C16 — Fechar um `[ABERTO]`: editar o ADR ou escrever outro? — MENOR

- `docs/adr/README.md`: "ADR não é editado para mudar de ideia. Um ADR novo supersede o anterior." Os ADRs 0005, 0008, 0037–0040 estão `[ABERTO]` e vão precisar fechar. Não está dito se fechar é editar o status ou criar um ADR novo. Importa porque a Fase 0 fecha com o ADR 0005 "saindo de `[ABERTO]` no mesmo momento".

---

## 2. Riscos de segurança, perda de dados e escalabilidade não tratados

### R1 — Escrita atômica: o guardrail contra perda de dado tem lacunas que perdem dado — IMPORTANTE

[ADR 0029](../adr/0029-guardrails-in-ci.md) define "arquivo temporário + `fsync` + `rename`". Nenhum documento trata de:

- `fsync` do **diretório** depois do `rename`; sem isso, o rename pode não sobreviver a queda de energia em ext4/APFS.
- **Metadados** perdidos no rename: permissões, dono, xattrs (tags do Finder, quarentena), datas de criação. O arquivo novo nasce com o modo padrão do processo.
- **Hard links** e **aliases** quebram: o rename substitui o inode.
- **Clientes de sync** (iCloud Drive, Dropbox, OneDrive, Syncthing) veem "apagou e criou", não "editou". Alguns geram cópia de conflito; outros, em pastas sob demanda, reagem mal a temporário aparecendo e sumindo. Isso é irônico frente à guarda contra placeholder ([ADR 0021](../adr/0021-sync-automerge-layered-config.md)).
- **Sistemas de arquivo de rede** (SMB, NFS) onde rename não é atômico.
- **Windows** (plataforma-alvo): substituir arquivo existente exige `MoveFileEx` com `REPLACE_EXISTING`, e handles abertos por antivírus ou OneDrive fazem o rename falhar.

Nada disso precisa ser decidido agora, mas precisa entrar como requisito da feature 2 da Fase 1 e como caso de teste, não como descoberta.

### R2 — Modificação externa concorrente: lost update silencioso — IMPORTANTE

O caso de uso decidido é a mesma pasta aberta no Obsidian e no Verso ([ADR 0012](../adr/0012-files-are-source-of-truth.md)). Nenhum documento fala em detectar que o arquivo mudou em disco desde que foi lido (mtime, tamanho ou hash) antes de gravar. Sem isso, o Verso grava por cima de uma edição feita em outro app, sem diff e sem aviso, o que é exatamente o que a invariante 8 proíbe. Vale também para escrita por agente sobre índice desatualizado (posição de bloco errada corrompe o arquivo). Fase 2 é onde entra o primeiro caminho de escrita; a regra precisa existir antes.

### R3 — Symlinks e caminhos: o confinamento existe, a política não — IMPORTANTE

O guardrail "confinamento de caminho" ([ADR 0029](../adr/0029-guardrails-in-ci.md)) evita sair da pasta via `../` ou symlink. Não está dito:

- se um symlink **dentro** da pasta apontando para fora é seguido (expõe dado de fora da pasta ao índice, ao MCP e a plugins) ou ignorado (quebra quem mantém a pasta de anexos por link simbólico, prática comum);
- symlink para diretório com laço;
- o que um **handle opaco** está preso a: um descritor aberto (`openat`, imune a troca de caminho entre verificar e usar) ou um índice numa tabela de strings (a verificação continua sendo por caminho, e a janela de TOCTOU continua aberta);
- estabilidade do handle entre sessões, entre renomes e entre raízes de workspace. O agente (MCP) e o contrato precisam de um identificador estável; se o identificador estável acaba sendo o caminho, a invariante 4 vira embalagem.

### R4 — `verso serve`, WebSocket remoto e o contrato: autenticação não faz parte do contrato — IMPORTANTE

[ADR 0025](../adr/0025-own-server-and-mobile-pwa.md) registra "autenticação e exposição" como questão a abrir "quando o servidor entrar em escopo". Mas o contrato core↔UI é definido na Fase 2 (item 2.1), "definido primeiro", e é a peça que o servidor reaproveita. Um contrato desenhado sem identidade de sessão, sem autorização por operação e sem noção de "quem está do outro lado" precisa ser refeito quando o servidor chegar. O risco não é implementar auth agora; é decidir na Fase 2 um contrato que não a comporta.

### R5 — `verso mcp`: transporte, superfície de exposição e injeção via conteúdo da pasta — IMPORTANTE

A Fase 1 entrega `verso mcp` somente leitura. Nenhum documento diz:

- **transporte**: stdio (processo filho do cliente) ou HTTP/SSE (porta local). Se for porta, entram bind em `localhost`, origem, DNS rebinding e ausência de token — problemas conhecidos e públicos de servidores MCP locais.
- que "somente leitura" ainda entrega a pasta inteira, incluindo o que a visão de jogador (Q9) vai querer esconder, a qualquer cliente que conecte.
- que o conteúdo das notas é entrada **não confiável** para o agente (packs de schema baixados, notas compartilhadas por jogadores, material colado da web). Injeção de prompt via nota é o vetor óbvio, e o caminho de escrita por agente (diff antes de aplicar, [ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) é a mitigação, mas ela não está registrada como mitigação desse risco em §10.3.

### R6 — O índice copia a pasta inteira para fora dela — IMPORTANTE

[ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md): índice em diretório de configuração do usuário. FTS5 guarda o texto. Consequências não registradas:

- o conteúdo do vault (inclusive segredos de mestre e qualquer chave que alguém tenha colado numa nota) passa a existir em claro num segundo lugar, com backup (Time Machine, iCloud) e permissões diferentes das da pasta;
- apagar ou mover a pasta não apaga a cópia;
- uma pasta criptografada ou em volume removível ganha uma sombra em disco local.

Precisa de decisão sobre onde o índice mora quando a pasta é sensível, e sobre limpeza. Compare com o cuidado dado às chaves de API no keychain ([ADR 0019](../adr/0019-generative-opt-in-and-keychain.md)).

### R7 — Modelo de capabilities de plugin: consentimento na instalação é o modelo fraco conhecido — IMPORTANTE

[ADR 0016](../adr/0016-plugins-execution-and-capabilities.md) (Aceito) fixa "consentimento na instalação". [ADR 0027](../adr/0027-runtime-capabilities.md) lista `fs:arbitrary`, `fs:external`, `proc:spawn`, `net:fetch`. Não há registro de:

- que `vault:read` + `net:fetch` é exfiltração completa da pasta, e que um plugin com `proc:spawn` está fora de qualquer sandbox;
- revogação, consentimento em runtime, ou diferença entre capability "da plataforma" e "de permissão" (o próprio ADR 0027 nota os dois vocabulários e deixa em aberto);
- integridade e origem do plugin: assinatura, hash, atualização que ganha capability nova sem novo consentimento;
- que packs de schema "não executam código" ([ADR 0015](../adr/0015-schema-packs.md)) só é verdade se schema não tiver templates, expressões ou consultas — e views materializáveis ([ADR 0014](../adr/0014-primitives-catalog.md)) sugerem que terá.

Plugins estão fora de escopo até a Fase 2, mas a API é uma das três decisões irreversíveis (§10.4). Registrar como questão antes de desenhar a API custa uma linha; depois, custa a API.

### R8 — Renomear nota e a atualização de links em outros arquivos — IMPORTANTE

O Obsidian reescreve todos os arquivos que linkam para uma nota renomeada. O Verso terá árvore de arquivos na Fase 2 (2.3). Reescrever N arquivos por causa de um rename é escrita sem "abrir", em massa, e sem diff — colide com as invariantes 7 e 8 se for automática, e quebra os links de quem usa a pasta no Obsidian se não for. Nenhum documento fala de rename, criação, exclusão (lixeira do sistema ou `unlink`?) ou movimentação de arquivos. São operações da Fase 2 com potencial de perda de dado.

### R9 — Placeholder de armazenamento sob demanda: a guarda não tem mecanismo — MENOR

Além de C1: nem o briefing nem o ADR 0021 dizem como um placeholder é detectado (iCloud usa `.nome.md.icloud`; OneDrive usa atributo de arquivo no Windows e outro no macOS; Dropbox e Google Drive têm os seus). A plataforma inicial é macOS, onde iCloud Drive é o caso mais comum de pasta de notas. A decisão precisa vir com a lista do que é reconhecido.

### R10 — `cargo-deny` e advisories: CI vermelho por advisory nova sem política — MENOR

Advisory publicada num sábado deixa o CI vermelho sem PR culpado. Não está dito como se lida com isso (lista de exceções com justificativa e prazo). Também não há menção a `Cargo.lock` versionado nem a auditoria de dependências além de licença e advisory.

### R11 — Limites de recurso: tamanho, profundidade, laços — MENOR

Q17 cobre arquivo malformado. Não cobre: arquivo de centenas de MB, linha única de dezenas de MB, milhares de colchetes aninhados (parser quadrático), árvore de diretórios profunda, laço de symlink, e o limite de watches do inotify no Linux (vault grande estoura o padrão do kernel). Fuzzing pega crash, não lentidão; o benchmark pega regressão, não limite.

### R12 — Tokenizador do FTS5 para pt-BR — MENOR

O produto é pt-BR e EN por decisão. O tokenizador padrão do FTS5 não trata acentos (`Café` ≠ `cafe`) nem stemming. Como o índice é cache, trocar depois é só reindexar, o que torna isto reversível — mas a primeira linha de base do benchmark deve ser tirada já com o tokenizador certo, ou a linha de base fica inválida.

### R13 — Proveniência de escrita grava dado pessoal no arquivo — MENOR

"Autor, modelo, quando" no frontmatter ([ADR 0014](../adr/0014-primitives-catalog.md), Proposto) é dado pessoal que vai junto com o arquivo em sync, export e compartilhamento com jogadores. Merece uma linha sobre o que é gravado e se é opt-in.

---

## 3. Decisões irreversíveis com evidência insuficiente

### I1 — Licença: interações não analisadas no [ADR 0005](../adr/0005-license.md) — IMPORTANTE

O ADR compara os pacotes A e B por um critério (uso via rede). Faltam três que mudam a conclusão:

1. **iOS e App Store.** iOS é plataforma-alvo decidida ([ADR 0022](../adr/0022-target-platforms-macos-first.md)). Distribuição de código sob (A)GPL pela App Store é amplamente considerada incompatível com os termos da loja, salvo quando quem publica detém todo o copyright — o que o modelo DCO sem CLA ([ADR 0006](../adr/0006-contribution-dco-no-cla.md)) impede assim que houver contribuição externa. Pacote B + DCO + iOS é uma combinação que precisa de análise antes de ser escolhida.
2. **"Ir de A para B depois é possível" é impreciso.** A cláusula 3.3 da MPL-2.0 permite distribuir uma obra maior sob licença secundária (AGPL entre elas); não converte os arquivos MPL, que continuam MPL. Relicenciar o projeto inteiro continua exigindo consentimento. O critério de desempate registrado no briefing está mais forte do que a licença sustenta.
3. **Código escrito por IA e copyleft.** Todo o core será escrito por modelo ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). O status de copyright de código gerado por IA é indefinido em várias jurisdições, e copyleft depende de copyright para ser exigível. O DCO pede que quem assina certifique origem e direito de submeter. Nenhum documento toca no assunto. Não é decisão de engenharia; é uma pergunta a levar a quem entende, antes de fechar a licença.

### I2 — API de plugin: "Web Worker" está Aceito sem nenhuma evidência de que plugin de UI é possível assim — IMPORTANTE

[ADR 0016](../adr/0016-plugins-execution-and-capabilities.md) decide TypeScript em Web Worker, sem disco, tudo pelo core. Alternativas descartadas: só "acesso direto a disco" e "compatibilidade binária". Não há registro de:

- que Web Worker não tem DOM: um plugin não registra view, modal, extensão de CodeMirror, painel lateral nem ícone. A maior parte dos plugins do Obsidian existe para fazer exatamente isso. O ADR não diz como um plugin em worker contribui UI (protocolo de UI declarativa por mensagem? iframe sandboxed? extensões de CM6 carregadas na thread principal, o que quebra "sem acesso direto"?). O modelo de plugin do Figma resolve isso com arquitetura própria e cara; nada disso foi considerado.
- que transportes de sync como plugin ([ADR 0020](../adr/0020-sync-merge-in-core-transports-as-plugins.md), Aceito) precisam rodar em background, e worker em WebView de mobile não roda em background (restrição registrada no [ADR 0009](../adr/0009-external-constraints.md)).
- que "formato familiar a quem escreve plugin de Obsidian" ([ADR 0017](../adr/0017-plugins-format-shim-loading.md)) com API assíncrona e sem DOM é familiar só no `manifest.json`.

A decisão pode estar certa. Está registrada como Aceito com evidência zero para a parte difícil, e é irreversível depois do primeiro plugin.

### I3 — Dialeto: fixtures sem origem registrada e base escolhida sem critério declarado — IMPORTANTE

- [ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md) lista o que é "base compatível". A fonte citada é só o briefing. A documentação pública do Obsidian ("Obsidian Flavored Markdown") documenta mais construções — tags, comentários `%%`, destaque `==`, matemática, tabelas, footnotes, links Markdown para arquivo, `[[nota#h1#h2]]` — e não há critério dito para o que ficou de fora. Q15 registra isso como `[ABERTO]`, mas o ADR Aceito deveria citar a fonte pública que embasa a lista, pela regra de fontes admissíveis do [ADR 0009](../adr/0009-external-constraints.md).
- As cinco fixtures do mantenedor codificam "comportamento observado de fora". Nenhum documento pede que a fixture registre **como** foi observado (versão do Obsidian, passo reproduzível). Sem isso, uma fixture registra a memória do mantenedor, não uma observação, e não há como recontestar quando o Obsidian mudar. Um campo `observed_at:` (ou equivalente) no `expected.yaml`, ou um `README` por caso, resolve.

### I4 — Stack ([ADR 0023](../adr/0023-stack-core-and-editor.md)) Aceito com "Nenhuma alternativa registrada" — MENOR

Rust, Tauri v2, CM6 e SQLite são escolhas defensáveis, e a UI é reversível antes da Fase 2. Mas Tauri v2 mobile é jovem, e o WKWebView do iOS impõe limites a CM6 e a workers que ninguém listou. Vale pelo menos uma linha por item dizendo por que não foi Electron, ProseMirror/Tiptap, ou Lexical — mesmo que a resposta seja "não avaliado".

### I5 — MCP no core prende o core a um protocolo de terceiros em evolução — MENOR

[ADR 0018](../adr/0018-llm-native-mcp-in-core.md), Aceito. A especificação do MCP mudou de transporte e de modelo de autorização mais de uma vez. Colocar o servidor no core (e não em plugin) é decisão razoável; falta a política de versão do protocolo suportada e o que acontece quando ela muda.

### I6 — Handles opacos: decisão Aceita sem semântica — MENOR

Complementa R3. A regra 4 ([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)) é o único ponto do contrato que já está decidido e que é caro de mudar, e não diz o que um handle identifica, quanto tempo vale, nem se sobrevive a rename. Isso vai para o contrato na Fase 2 e para o MCP na Fase 1.

---

## 4. Lacunas na spec do dialeto

A spec §9 já é uma boa lista. Abaixo, o que um parser da Fase 1 precisa saber e que nem §9 pergunta.

### L1 — Headings não existem na spec — IMPORTANTE

O roadmap da Fase 1, feature 1, é "parse de links, blocos, **headings** e frontmatter". A spec não tem seção de heading, não tem chave `headings:` no `expected.yaml`, e não diz como o texto de `[[nota#seção]]` casa com um heading: sensibilidade a maiúsculas, pontuação e espaços, emoji, formatação inline no heading (`## *Porão* ^2`), headings duplicados, caminho de headings aninhados (`[[nota#Cap 1#Seção]]`). Sem isso, backlinks para seção (critério de saída 2 da Fase 1) não têm definição.

### L2 — Links Markdown comuns para arquivo local não são mencionados — IMPORTANTE

`[texto](nota.md)`, `[texto](../pasta/nota.md)`, `[texto](nota%20com%20espa%C3%A7o.md)`, `[texto](<nota com espaço.md>)` e a forma de imagem `![](img.png)`. O Obsidian documenta e resolve essas formas como links, e o próprio app pode ser configurado para gravá-las em vez de wikilinks. Um vault inteiro pode não ter um único `[[ ]]`. A spec e as categorias mínimas de fixtures ignoram o caso, e ele decide se backlinks estão certos.

### L3 — Posição no arquivo: requisito decidido sem representação — IMPORTANTE

"Citação verificável, com link de volta à posição exata" é `DECIDIDO` (§7, [ADR 0018](../adr/0018-llm-native-mcp-in-core.md)) e é critério de saída da Fase 1. O `expected.yaml` não tem campo de posição (linha, coluna, offset em bytes ou em caracteres?), então o corpus não testa posições, e o parser pode passar em todas as fixtures sem produzi-las. Relacionado: ID estável de bloco "com backlinks e presença no grafo" só é estável para `^id` escrito no arquivo; para bloco sem `^id`, um ID que more só no índice não é estável (índice é cache, [ADR 0011](../adr/0011-config-outside-tree-index-as-cache.md)) e um ID escrito pelo app viola a invariante 7. A spec deveria dizer que citação de bloco sem `^id` é por posição, e o que a posição é.

### L4 — "Round-trip" tem duas leituras e elas escolhem parsers diferentes — IMPORTANTE

[ADR 0012](../adr/0012-files-are-source-of-truth.md): "round-trip vira property test obrigatório". [ADR 0037](../adr/0037-base-parser.md): "preservação fiel do arquivo". Duas interpretações:

1. O parser produz uma árvore **sem perda** (CST) e `serialize(parse(x)) == x` byte a byte. Exige parser próprio ou base com posições completas; `pulldown-cmark` não atende sem trabalho grande.
2. O parser é somente leitura para o índice; "abrir nunca reescreve" é garantido por nunca gravar no caminho de leitura, e edições são patches textuais por posição. `serialize` não existe e o property test testa outra coisa (ex.: parse não faz panic e é determinístico).

A escolha entre 1 e 2 decide o parser base ([ADR 0037](../adr/0037-base-parser.md)), o custo da Fase 1, e como merge por bloco ([ADR 0020](../adr/0020-sync-merge-in-core-transports-as-plugins.md)) e escrita por agente vão funcionar. Ela não está feita em lugar nenhum e o ADR 0037 não a lista entre os critérios.

### L5 — O que a varredura ignora, e o que "bloco" é — IMPORTANTE

- **Caminhos ignorados**: `.obsidian/`, `.git/`, `.trash/` (lixeira do Obsidian, cheia de notas com links), arquivos ocultos, `node_modules/`, pasta de anexos. Uma nota na `.trash/` que linka para outra conta como backlink? Isso muda o resultado do critério de saída 2 da Fase 1. Q16 pergunta sobre tipos de arquivo, não sobre caminhos.
- **"Bloco"** é usado em toda a documentação (ID de bloco, merge por bloco, visibilidade por bloco, citação de bloco) e nunca definido: parágrafo, item de lista, célula de tabela, callout inteiro, bloco de código? O Obsidian documenta a sua noção; a spec precisa da dela antes de Q3 e Q4 fazerem sentido.

### L6 — Formas combinadas e escapes de wikilink — MENOR

`[[nota#seção|alias]]`, `[[nota#^bloco|alias]]`, `[[#seção]]` e `[[#^bloco]]` (mesmo arquivo, alvo vazio — conta como backlink de si mesmo?), `[[pasta/nota]]`, `[[nota.md]]`, `[[nota\|alias]]` dentro de tabela, `\[[não é link]]`, `[[ nota ]]` com espaços, `![[img.png|300]]` (o `|` é tamanho, não alias), `[[nota|alias|extra]]`, e wikilink dentro de link Markdown ou de imagem.

### L7 — Frontmatter: fronteira e dialeto de YAML — MENOR

BOM antes do `---`, CRLF (a invariante 7 exige preservar quebra de linha, mas nada diz qual é a quebra "do arquivo" quando há mistura), `---` seguido de `...`, frontmatter vazio, YAML inválido (Q17 cobre parcialmente), e a versão do YAML: em 1.1, `yes`, `no`, `on` e datas viram booleanos e timestamps; em 1.2, não. `tags: 2024` é número ou tag? Wikilinks dentro de valores de frontmatter (`related: "[[nota]]"`), que as Properties do Obsidian tratam como links. Prefixo `#` em tags de frontmatter.

### L8 — Charset do `^id` e forma de tags — MENOR

Q3 e Q4 cobrem posição e unicidade; falta o alfabeto permitido (a documentação pública do Obsidian restringe a letras, números e hífen) e o que acontece com `^id` inválido. Para tags (Q13), falta o charset, tags aninhadas `#a/b`, e sensibilidade a maiúsculas.

### L9 — Q7 parte de um fato desatualizado sobre macOS — MENOR

A spec diz que "o macOS grava nomes de arquivo em NFD". Isso era HFS+. APFS preserva a forma recebida e faz busca insensível à normalização. A pergunta continua válida (arquivos vindos de HFS+, de outras plataformas e de sync misturam formas), mas a decisão deve partir do comportamento atual. Da mesma forma, APFS pode ser case-sensitive por volume; Q8 trata macOS como sempre insensível.

### L10 — Codificação e arquivos não-texto — MENOR

Arquivo `.md` que não é UTF-8 válido (Latin-1 de vault antigo, UTF-16 com BOM do Windows): erro, texto com substituição, ou ignorado? Q17 fala de "malformado" sem separar codificação de sintaxe.

---

## 5. Observações fora das quatro categorias

Registradas por completude; nenhuma é achado classificado.

- Nomes de modelo (`Opus 5`, `Fable 5.1`) estão gravados em ADR Aceito ([0032](../adr/0032-author-and-reviewer-roles.md)). Vão envelhecer; o papel importa mais que o nome.
- [ADR 0009](../adr/0009-external-constraints.md) cita os termos de uso do Obsidian sem link nem data de consulta. Para uma restrição "que só sai daqui se a origem mudar", a origem precisa ser localizável.
- O critério de saída 2 da Fase 2 pressupõe que o vault do mantenedor está em git. Vale para ele; não é rede de segurança para ninguém mais. Histórico local ou snapshot antes de escrita por agente e de conversão é candidato a primitiva, não a plugin.
- O roadmap não tem lugar para a escrita por agente com diff (`DECIDIDO`, §7): a Fase 1 é MCP somente leitura e a Fase 2 não a menciona. Fica em "Depois da Fase 2", sem ordem.
- A Fase 2, item 2.6 ("um tipo de nota ponta a ponta"), depende de promover [ADR 0014](../adr/0014-primitives-catalog.md) (nota tipada) e [ADR 0013](../adr/0013-degrades-to-markdown.md), ambos Proposto. A tabela de decisões da Fase 2 lista só Q11 e ts-rs/specta.

---

## 6. Resolução

Aplicada em 2026-09-21 por ordem do mantenedor ("aceito todas mudanças, pode
aplicá-las e atualizar tudo"). Onde o achado deixava duas opções, a coluna
"Escolha feita" diz qual foi tomada e por quê; cada uma é revertível por veto do
mantenedor. Nenhum `[ABERTO]` de dialeto foi fechado; o que era pergunta virou
pergunta registrada com prazo.

### BLOQUEANTES

| ID | Onde mudou | Escolha feita |
|---|---|---|
| C1 | ADR 0043 novo (Aceito); ADR 0021 perde o item 3 e aponta para 0043; BRIEFING §8 promovido a `DECIDIDO` (v0.2); `CLAUDE.md` invariante 10 cita 0043 | **Promover**, não retirar: o mantenedor escreveu a invariante e §10.3 já a listava como mitigação de perda de dado. Mecanismo de detecção por provedor fica `[ABERTO]` (feature 2 da Fase 1) |
| C2 | ADR 0026: subseção "Escopo das regras 4 e 5" + consequências; ADR 0028: consequência reescrita; ADR 0029: lint `disallowed_methods` para `std::fs`; `CLAUDE.md` §2.1 itens 4 e 5 e §3 | Regra 5 = **arquivos da pasta aberta**; índice, config e IO da CLI ficam fora. Regra 4 = **o que atravessa o contrato**; caminho em string só na borda e em `verso-fs`. O texto do briefing §10.1 não foi alterado: a delimitação vive no ADR |
| C3 | ADR 0029: tabelas "de workspace" e "de feature", com a fase em que cada um entra; roadmap Fase 0 item 0.11 e critério 4; Fase 1 critério 3; Fase 2 critério 3; `CLAUDE.md` §3; template de PR | Guardrail de feature entra **no mesmo PR** da feature e é visto falhando ali. `cargo fmt` entrou na tabela de workspace |

### IMPORTANTES

| ID | Onde mudou | Escolha feita |
|---|---|---|
| C4 | ADR 0032 (item 5 e tabela por artefato); `CLAUDE.md` §5; BRIEFING §14.1 | "Quem" = **modelo**. Revisor de UI/TS = Fable 5.1, única opção com dois modelos. Consequência nova: revisor que aplica os próprios achados vira autor, e o outro modelo lê o diff |
| C5 | Roadmap Fase 1 critério 4 e feature 6; ADR 0018 | **Retirar** "consultar por tipo" da Fase 1; entra com a nota tipada (2.6). Citação por `^id` ou por posição |
| C6 | ADR 0031 consequência; spec §1; `CLAUDE.md` invariante 17; template de PR | Fixture que responde questão `[ABERTO]` só entra no PR que fecha a questão, com spec §9 atualizada; a aprovação nesse PR é a decisão |
| C7 | Spec §4 reescrita como schema do `expected.yaml` (`PROPOSTO`); §5.5 e §5.6 usam `block`; §8; roadmap 0.9 e critério 5 | Schema **rascunhado e marcado `PROPOSTO`**; confirmação pelo mantenedor por linha na spec ou pelas cinco fixtures à mão. Q1: `block` proposto. Campos inventados na v0 (`embeds`, `callouts`, `kind`, `title`, `frontmatter`) agora estão declarados no mesmo lugar e com o mesmo status |
| C8 | BRIEFING §3, §17; ADRs 0005 e 0008; roadmap 0.7 e 0.8; `CLAUDE.md` §8 | "Passo 5" → "antes do fechamento da Fase 0" em todos os lugares |
| C9 | ADR 0029 (linhas WASM e tipos gerados); `CLAUDE.md` §3; roadmap Fase 1 critério 3 e Fase 2 critério 3 | WASM na feature 1; tipos gerados no item 2.1 |
| R1 | ADR 0029, subseção "Requisitos da escrita atômica"; `CLAUDE.md` invariante 9 | Seis requisitos com teste cada; Windows entra quando Windows entrar |
| R2 | ADR 0012 consequência; `CLAUDE.md` invariante 11 (nova); ADR 0048; roadmap Fase 2 critério 2 | Verificação de mtime+tamanho ou hash antes de gravar; divergência → diff, nunca sobrescrita silenciosa |
| R3 | ADR 0044 novo (`[ABERTO]`); ADR 0026 consequência; roadmap Fase 1 e Fase 2 (decisões) | Registrado, não decidido. Prazos: symlinks e caminhos antes da feature 2; handles antes da feature 6 e do item 2.1 |
| R4 | ADR 0045 novo (`[ABERTO]`); ADR 0026 consequência; ADR 0025; roadmap Fase 2 (decisões) | Identidade de sessão e autorização entram no contrato desde o item 2.1, ainda que no IPC local tudo seja concedido |
| R5 | ADR 0045; ADR 0018 consequências; roadmap Fase 1 (decisões) | Transporte, superfície e versão do protocolo antes da feature 6. Conteúdo da pasta registrado como entrada não confiável; diff antes de aplicar registrado como mitigação |
| R6 | ADR 0046 novo (`[ABERTO]`); ADR 0011 consequência; roadmap Fase 1 (decisões) | Localização, permissões e limpeza antes da feature 3 |
| R7 | ADR 0047 novo (`[ABERTO]`); ADR 0016 consequência; ADR 0015 consequência | ADR 0016 continua Aceito; 0047 lista o que precisa estar respondido antes do desenho da API |
| R8 | ADR 0048 novo (`[ABERTO]`); roadmap Fase 2 (decisões e critério 2) | Rename, criar, excluir, mover e atualização de links antes do item 2.3 |
| I1 | ADR 0005 (três análises pendentes; critério de desempate corrigido); BRIEFING §3 (critério corrigido, v0.2); roadmap 0.7 e critério 2 | Nenhuma decisão de licença. A decisão passa a exigir as três análises. A correção da cláusula 3.3 da MPL foi feita também no briefing por ser correção de fato, registrada no Histórico |
| I2 | ADR 0047; ADR 0016 consequência | Idem R7. Status de 0016 não mudou |
| I3 | ADR 0030 (fonte pública citada; lista é mínimo, não teto); ADR 0031 e spec §4.5 (`observed:`) | `observed:` obrigatório em fixture de compatibilidade; `source:` em fixture de comportamento próprio |
| L1 | Spec §5.12 (headings, com `expected.yaml`); §4.3; §8 categoria nova; Q19 | Casamento de heading fica `[ABERTO]` (Q19) |
| L2 | Spec §5.13 (`PROPOSTO`); §4.2 campo `syntax`; §8 categoria nova; Q20 | Proposta: contam como link, `target` decodificado. Marcado `PROPOSTO` porque o briefing não lista a forma |
| L3 | Spec §4.4 (`pos`); §8; ADR 0018; ADR 0014; ADR 0037; roadmap Fase 1 critério 4 | `line`/`col` a partir de 1, `col` em caracteres Unicode. Bloco sem `^id` é citado por posição; ID que mora só no índice não é estável |
| L4 | Spec Q18; ADR 0037 (critério e ordem: Q18 antes da comparação); ADR 0012 consequência; ADR 0029 (linha do round-trip cita Q18); roadmap Fase 1 (decisões) | Não decidido. Q18 precede a escolha do parser |
| L5 | ADR 0044 (caminhos ignorados); spec Q21 ("bloco") e Q26; roadmap Fase 1 critério 2 | "Bloco" fica `[ABERTO]` (Q21). Caminhos ignorados vivem em 0044 e a lista à mão do critério 2 segue a decisão |

### MENORES

| ID | Onde mudou | Escolha feita |
|---|---|---|
| C10 | Template de PR (checkbox reescrito) | Alinhado ao `CLAUDE.md`: guardrail que bloqueia trabalho legítimo é PR próprio |
| C11 | ADRs 0007 e 0028 | "Descartado implicitamente" → "Nenhuma registrada", com o não avaliado entre parênteses |
| C12 | Spec §7 D7 | Status separado: execução `DECIDIDO` (0016), shim `PROPOSTO` (0017) |
| C13 | ADR 0042 | `verso serve` citado de 0025 (Proposto) |
| C14 | ADR 0035; roadmap Fase 1 feature 7 e critério 6 | "Primeiro commit" = primeiro commit de código de produto. CLI em dois idiomas vira item e critério da Fase 1 |
| C15 | ADR 0013 consequência | "Markdown legível" = texto legível no formato que o dado já tem; `.canvas` não contradiz |
| C16 | `docs/adr/README.md`, seção "Como alterar um ADR existente" | Três casos: correção no lugar com `Revisões:`; mudança de decisão por ADR novo; fechar `[ABERTO]` ou promover Proposto editando Decisão e Status no lugar |
| R9 | ADR 0043 (consequências) | Mecanismo por provedor `[ABERTO]`, iCloud Drive primeiro |
| R10 | ADR 0029 consequências; `CLAUDE.md` §3 | Exceção de advisory só com justificativa, link e expiração; `Cargo.lock` versionado |
| R11 | Spec Q17 ampliada; ADR 0044 | Limites de recurso registrados como pergunta |
| R12 | ADR 0046; ADR 0023 consequência; roadmap Fase 1 (decisões) | Tokenizador antes da linha de base |
| R13 | ADR 0014 consequência | Proveniência: dado pessoal, opt-in a decidir no ADR da primitiva |
| I4 | ADR 0023 (riscos não avaliados; alternativas não avaliadas registradas como registro, não descarte) | Status não mudou |
| I5 | ADR 0045; ADR 0018 consequência | Versão do protocolo MCP entra na decisão da feature 6 |
| I6 | ADR 0044 | Idem R3 |
| L6 | Spec Q23; §5.6 (embed com tamanho) | Formas combinadas e escapes registrados |
| L7 | Spec Q24 | Fronteira e dialeto do frontmatter registrados |
| L8 | Spec Q22 | Charset de `^id` e forma das tags registrados |
| L9 | Spec §5.10, Q7 e Q8 | Texto corrigido para APFS; a pergunta continua |
| L10 | Spec Q25 | Codificação separada de sintaxe |

### Observações da seção 5

| Observação | Estado |
|---|---|
| Nomes de modelo em ADR Aceito | **Não alterado.** Trocar por papel abstrato é mudança de decisão (ADR 0032, Aceito); fica para o mantenedor |
| Link e data dos termos de uso do Obsidian (ADR 0009) | **Não alterado.** Exige consulta à origem para citar com data; a IA não deve inventar a citação. Fica para o mantenedor registrar |
| Vault em git como única rede de segurança | **Não alterado.** Snapshot local antes de escrita por agente é candidato a primitiva; entra na conversa com o catálogo (ADR 0014), depois da Fase 2 |
| Escrita por agente sem fase | Roadmap, "Depois da Fase 2": registrada como `DECIDIDO` sem fase atribuída |
| Promoção de 0014 e 0013 antes de 2.6 | Roadmap Fase 2, tabela de decisões: linha acrescentada; ADR 0014 consequência |

### O que continua sendo do mantenedor

1. Confirmar o schema do `expected.yaml` (spec §4, `PROPOSTO`) e a resposta
   proposta a Q1 — por linha na spec ou pelas cinco fixtures à mão.
2. Decidir licença (ADR 0005) com as três análises respondidas, e idioma (ADR
   0008), antes de fechar a Fase 0.
3. Pedir ao Opus 5 a leitura do diff desta aplicação (ADR 0032).
4. Registrar link e data dos termos de uso do Obsidian no ADR 0009, se quiser
   fechar a observação.
5. Vetar qualquer linha da coluna "Escolha feita" acima. Cada uma é um commit
   reversível; nenhuma promove `PROPOSTO` além de C1, que foi ordem explícita.

---

## 7. Leitura independente da aplicação (Opus 5)

- Leitor: Opus 5, que não escreveu nem esta revisão nem o commit que lê
  ([ADR 0032](../adr/0032-author-and-reviewer-roles.md)). Entrada: `eda5420`,
  lido arquivo a arquivo contra os documentos naquele commit. **Nenhum
  BLOQUEANTE.**
- A seção 6 é um mapa fiel do diff: cada linha cai onde diz que cai, e nenhum
  achado está marcado como resolvido sem mudança que o resolva. Nada passou de
  `PROPOSTO` a `DECIDIDO` e nenhum `[ABERTO]` foi fechado além de C1, ordenado
  pelo mantenedor; Q1 virou `PROPOSTO`, que é proposta, não fechamento.

### Escolhas que vão além do achado — ratificar ou vetar

- **C4, IMPORTANTE.** O achado perguntava *quem* revisa UI/TS; a aplicação
  respondeu, e escreveu a resposta no `BRIEFING.md` §14.1, seção `DECIDIDO` — não
  é mudança de status nem correção de fato, que é o limite que o próprio commit
  escreve no cabeçalho do briefing.
- **C1, IMPORTANTE.** O ADR 0043 é Aceito com dois itens que a frase promovida
  não contém: placeholder como "presente, conteúdo indisponível" com o índice
  guardando a última versão conhecida (item 2), e a guarda valendo desde a Fase 1
  (item 3). Só "nunca é deleção" foi promovido.
- **R2, IMPORTANTE.** A invariante 11 do `CLAUDE.md` é nova e BLOQUEANTE por
  definição, e sua única base é uma consequência acrescentada ao ADR 0012 no
  mesmo commit: regra e base escritas juntas, pela IA. É o padrão de C1 um passo
  adiante.
- **I3, IMPORTANTE.** "A lista é o mínimo, não o teto" (ADR 0030) amplia o
  alcance de uma decisão Aceita; o achado pedia só a fonte e o critério da lista.
- **I1 e C14, MENOR.** As três análises pendentes do ADR 0005 não são as três do
  achado; C14 ganhou item de escopo e um sexto critério de saída na Fase 1.

### Contradições introduzidas, não registradas na revisão

- **IMPORTANTE.** O ADR 0026 (Aceito) exige que o contrato nasça com identidade
  de sessão e autorização por operação, enquanto o ADR 0045 responde "Decisão:
  nenhuma" no mesmo ponto: exigido e aberto ao mesmo tempo. É também a única
  decisão disfarçada de questão aberta em 0043–0048; 0046 (diacríticos) e 0044
  (regra 4 como forma, não segurança) são MENOR, 0047 e 0048 estão limpos.
  *Resolvido em 2026-09-21: a consequência do ADR 0026 agora diz que a forma do
  contrato não pode impedi-las; a decisão continua aberta no 0045.*
- **IMPORTANTE.** A spec §4 e o roadmap 0.9 deixam as cinco fixtures confirmarem
  o schema "ao segui-lo"; o ADR 0031, no mesmo commit, exige o PR que fecha a
  questão, com a §9 atualizada. Dois procedimentos para o ato de que C6 tratava.
  *Resolvido em 2026-09-21: a mudança de regra no ADR 0031 item 4 e o fechamento
  explícito de Q1 no PR das fixtures deixaram um procedimento só, a aprovação no
  PR.*
- **MENOR.** O briefing §14.3 e a regra 5 do ADR 0026 mantêm a redação que C3 e
  C2 releram em outro lugar, sem ponteiro; o ADR 0030 cita a documentação do
  Obsidian sem data, enquanto a §6 recusa citar a fonte do ADR 0009 por esse
  mesmo motivo.
  *Resolvido em 2026-09-21: ponteiro acrescentado ao briefing §14.3; o ADR 0030
  agora nomeia as páginas e a data da consulta.*

### Estado da ratificação

**Ratificado pelo mantenedor em 2026-09-21** ("ok" à lista consolidada): C4
(papel de revisor no briefing §14.1), ADR 0043 itens 2–3, invariante 11 do
`CLAUDE.md`, "mínimo, não teto" no ADR 0030, a mudança de regra de fixtures
escrita no briefing §11.4, e a ausência de `Signed-off-by` nos commits da
Fase 0 (sign-off exigido a partir do primeiro commit da Fase 1, ADR 0006).
Nada vetado.
