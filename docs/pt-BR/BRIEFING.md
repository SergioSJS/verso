# BRIEFING — Verso

> Versão 0.13 · 2026-10-09
> Fonte única das decisões tomadas antes do repositório existir.
> Alterações posteriores ao repositório: só mudança de status e correção de
> fato, registradas no Histórico ao final. Delimitações e consequências novas
> vivem nos ADRs.
> Entrada para ADRs, spec do dialeto, roadmap e `CLAUDE.md`.
> O mantenedor é a autoridade final sobre qualquer item deste documento.
> Original em pt-BR. Este é o documento que manda em caso de divergência com a tradução em `docs/BRIEFING.md` (ADR 0008).

## Como ler este documento

| Status | Significado | Como a IA deve tratar |
|---|---|---|
| `DECIDIDO` | Escolhido ou aceito explicitamente pelo mantenedor | ADR com status "Aceito" |
| `PROPOSTO` | Recomendado na discussão, sem confirmação explícita | ADR com status "Proposto"; nunca tratar como decidido |
| `ABERTO` | Sem decisão | Registrar como `[ABERTO]`; não resolver por conta própria |
| `RESTRIÇÃO` | Imposta por plataforma, licença de terceiros ou termos de uso; não é escolha | Registrar como restrição, citando a origem |

Regras para a IA:

1. Nada que não esteja aqui vira decisão. Na dúvida, `[ABERTO]`.
2. Não promover `PROPOSTO` para `DECIDIDO`. Só o mantenedor faz isso.
3. Ao encontrar contradição entre seções, registrar a contradição; não escolher um lado.

---

## 1. Visão

**O que é.** App de notas em Markdown, aberto e multiplataforma, que abre qualquer pasta como um editor de código abre e entrega nativamente o que usuários do Obsidian hoje montam com plugins. Público: quem organiza notas, worldbuilding e diários, com suporte especial a quem joga e mestra RPG de mesa.

**Por que existe.**

- Ferramenta aberta que a comunidade evolui sem depender de uma empresa. `DECIDIDO`
- Experiência redonda sem gambiarra: o que hoje exige plugin deve ser primitiva do app. `DECIDIDO`
- O mantenedor gosta de construir ferramentas; o projeto é movido a isso, não a receita. `DECIDIDO`

**O que não é.**

- Não é clone do Obsidian. É inspirado nele e compatível com os vaults dele. `DECIDIDO`
- Não promete rodar todos os plugins do Obsidian. `DECIDIDO`
- Não tem serviço pago nem plano de sustentação além de doações. `DECIDIDO`
- Não embute modelo de LLM nem depende de um provedor específico. `DECIDIDO`

---

## 2. Identidade

| Item | Valor | Status |
|---|---|---|
| Nome | Verso | `DECIDIDO` |
| Domínio | `versomd.com` | `DECIDIDO` — comprado pelo mantenedor em 2026-09-24, o mais próximo de `verso.md` que ele conseguiu (v0.10) |
| Nome de pacote/org se `verso` estiver ocupado | `verso-md` | `PROPOSTO` |
| Nomes de subprojetos | nenhum até existir código; "Recto" descartado | `DECIDIDO` |

Colisões conhecidas do nome, fora da categoria de apps de notas: plataforma de notebooks interativos em .NET chamada Verso; navegador Verso sobre o Servo (arquivado); editor de metadados de imagem em Perl.

---

## 3. Governança e licença

| Item | Status | Detalhe |
|---|---|---|
| Licença | `DECIDIDO` | Pacote A (decidido na v0.3, ADR 0005): MPL-2.0 no core e app, MIT no SDK de plugin. `LICENSE` na raiz. |
| Pacote A | opção | Core e app sob MPL-2.0; SDK de plugin sob MIT. Uso como serviço não obriga publicar mudanças. |
| Pacote B | opção | Core e app sob AGPL-3.0 com exceção explícita para plugins (permissão adicional, GPL-3.0 seção 7); SDK de plugin sob MIT. Cobre uso via rede. |
| Critério de desempate | contexto | A MPL-2.0 (cláusula 3.3) permite combinar código MPL numa obra maior sob AGPL-3.0 depois; os arquivos MPL continuam MPL. Relicenciar o projeto inteiro, em qualquer direção, exige consentimento de todo contribuidor. (Corrigido na v0.2; a redação original superestimava a passagem de A para B.) |
| GPL-3.0 pura | contexto | Não cobre uso via rede, que a arquitetura com servidor torna provável; por isso não aparece nos pacotes. |
| Modelo de contribuição | `DECIDIDO` | DCO, sem CLA. CLA permitiria relicenciar, o que contraria o objetivo de não ter empresa no meio. Código escrito por IA entra pelo mesmo DCO, desde que quem assina tenha domínio do código e se responsabilize por ele (confirmado na v0.4, ADR 0006). |
| Sustentação | `DECIDIDO` | Apenas Ko-fi. Doação não compra feature. |
| Visibilidade do repositório | `DECIDIDO` | Privado até a licença ser decidida. |
| Idioma da documentação do repositório | `DECIDIDO` | Inglês é a fonte; pt-BR é espelho de primeira classe em `docs/pt-BR/`, mesma estrutura e nomes. Este briefing é a exceção: o original pt-BR manda (decidido na v0.5, ADR 0008). |

---

## 4. Restrições

| Restrição | Origem | Consequência |
|---|---|---|
| Não inspecionar, descompilar ou desminificar o app Obsidian | Termos de uso do Obsidian proíbem engenharia reversa para desenvolver produto concorrente | Fontes permitidas: API pública (`obsidian.d.ts`, MIT), documentação pública, comportamento observado de fora |
| Sem acesso a pasta arbitrária no iOS | Sandbox do iOS | Document picker + security-scoped bookmarks |
| Sem watcher de mudança externa equivalente ao desktop no iOS | iOS | Atualização por ação do usuário ou ao retornar ao app |
| Sync em background restrito | iOS e Android | Sync mobile depende das janelas permitidas pelo SO |
| Operações em massa lentas via Storage Access Framework | Android | Indexação grande no Android exige estratégia própria |
| Sem Node no mobile | iOS e Android | Plugin que depende de Node é desktop-only |
| Sem processo residente no mobile | iOS e Android | MCP no mobile é remoto ou in-process |
| Client secret não pode ser guardado em app de código aberto | OAuth | Google Drive e OneDrive exigem PKCE ou client ID do próprio usuário |
| Verificação de app, cota por aplicação, semântica fraca de rename e conflito | Google Drive e OneDrive | Servem melhor como destino de backup que como sync contínuo |
| tldraw não pode ser usado | Licença source-available: chave de licença em produção, marca d'água obrigatória, proibição de relicenciar | Board usa Excalidraw (MIT) |

---

## 5. Princípios de produto

### 5.1 Pasta é a unidade, sem vault

- Abrir qualquer pasta como um editor de código abre; a raiz é a pasta aberta. `DECIDIDO`
- Config fora da árvore, em diretório de configuração do usuário indexado pelo caminho da pasta; nenhum diretório obrigatório dentro dela. `DECIDIDO`
- Índice é cache reconstruível; apagá-lo não perde dado. `DECIDIDO`
- Abrir pela linha de comando, como `code .`: `verso <pasta>`. `DECIDIDO`
- Workspace com múltiplas raízes e links resolvendo entre elas. `PROPOSTO`

### 5.2 Arquivos são a fonte de verdade

- Compatibilidade com vaults do Obsidian, ou conversão explícita onde não houver compatibilidade. `DECIDIDO`
- Abrir um arquivo nunca o reescreve. Conversão só por ação do usuário, com diff visível. `DECIDIDO`
- Todo dado estruturado degrada para Markdown legível em qualquer editor. `DECIDIDO` (promovido na v0.9, ADR 0013)

### 5.3 Primitivas em vez de features

Cada gambiarra comum no Obsidian é sintoma de uma primitiva ausente. O Verso implementa primitivas; features específicas vêm como plugins de primeira parte. `PROPOSTO`

| Primitiva | Substitui | Status |
|---|---|---|
| Nota tipada: `type:` no frontmatter + schema em arquivo de texto na pasta; sem schema, é Markdown comum | Dataview, Templater, statblocks | `DECIDIDO` (promovido na v0.9, ADR 0052) |
| ID estável de bloco, com backlinks e presença no grafo | pedido aberto no fórum do Obsidian desde 2020 | `PROPOSTO` |
| Relação tipada: aresta com tipo e direção; várias relações entre os mesmos dois nós | links sem semântica | `DECIDIDO` (promovido na v0.11, ADR 0057: propriedade do frontmatter cujo valor é wikilink) |
| Tempo como primeira classe: diário e notas periódicas | Periodic Notes, Calendar | `PROPOSTO` |
| Views estruturadas que podem materializar a saída como Markdown real no arquivo | resultado de consulta invisível a git, busca e agente | `PROPOSTO` |
| Proveniência de escrita no frontmatter: autor, modelo, quando | sem equivalente | `PROPOSTO` |

### 5.4 Packs de schema

Schemas distribuíveis como conteúdo (diário, worldbuilding, sistemas de RPG). Resolvem a paralisia de começar com o app vazio. `PROPOSTO`

---

## 6. Plugins

- Sistema de plugins próprio é central ao projeto. `DECIDIDO`
- Plugins em TypeScript, executando em Web Worker, sem acesso direto a disco; todo acesso passa pelo core. `DECIDIDO`
- Manifesto declara capabilities exigidas (ex.: `vault:read`, `vault:write`, `net:fetch`, `fs:external`), com consentimento na instalação. `DECIDIDO`
- Formato familiar a quem escreve plugin de Obsidian (`manifest.json`, `main.js`, classe base com `onload`/`onunload`, registro de comandos e de settings), sem compatibilidade binária. `PROPOSTO`
- Shim de compatibilidade com plugins do Obsidian: pacote separado, fora do core, cobrindo só a API pública, com tabela de compatibilidade declarada. `PROPOSTO`
- Carregamento lazy por padrão e tempo de carga visível por plugin. `PROPOSTO`
- Flag de plataforma no manifesto, equivalente ao `isDesktopOnly`. `PROPOSTO`
- Features do próprio projeto (sync, Foundry, packs de RPG) são escritas como plugins; se precisarem de acesso privilegiado, a API está errada. `PROPOSTO`
- Plugin nativo em WASM dentro do core: possibilidade futura, não planejada. `PROPOSTO`

---

## 7. LLM-nativo

Requisito: um agente deve navegar e aproveitar o conteúdo da pasta tão bem quanto uma pessoa. `DECIDIDO`

- Servidor MCP no core, não em plugin: buscar, ler, caminhar o grafo, consultar por tipo. `DECIDIDO`
- Consulta estruturada (tipo, propriedades, relações) antes de busca por similaridade. `DECIDIDO`
- IDs de bloco permitem citação verificável, com link de volta à posição exata. `DECIDIDO`
- Escrita por agente: diff com revisão antes de aplicar, proveniência registrada, permissão declarada. `DECIDIDO`
- Endpoint de modelo trazido pelo usuário; nenhum modelo fixo. `DECIDIDO`
- Recursos generativos explícitos e opt-in, dada a sensibilidade da comunidade de RPG a conteúdo gerado por IA. `PROPOSTO`
- Chaves de API no keychain do sistema operacional, nunca dentro da pasta. `PROPOSTO`

---

## 8. Sync

- Sync nativo é essencial, com servidor próprio e com serviços como Google Drive e OneDrive. `DECIDIDO`; revisto na v0.13 (ADR 0073): o servidor próprio vem primeiro e o sync entre dispositivos passa por ele; Google Drive e OneDrive por API deixam de ser essenciais (a pasta sincronizada é suportada, WebDAV é o primeiro transporte externo, iCloud nunca por API).
- Motor de merge no core (entende blocos, frontmatter e o modelo de arquivo); transportes como plugins (servidor próprio, WebDAV, S3, Google Drive, OneDrive). `DECIDIDO`; revisto na v0.13 (ADR 0073): transportes moram no core até plugins existirem e enquanto guardarem credenciais.
- Candidato ao motor de merge: Automerge. `PROPOSTO`; revisto na v0.13 (ADR 0073, `DECIDIDO`): Yjs, como mecanismo de uma sessão ao vivo, nunca a forma guardada de uma nota, que é o arquivo.
- Config em camadas: compartilhada (lista de plugins, schemas) e por dispositivo (hotkeys, layout). `PROPOSTO`
- Arquivo placeholder de armazenamento sob demanda (iCloud, OneDrive) nunca é interpretado como deleção. `DECIDIDO` (promovido na v0.2, ADR 0043)
- Sync fica fora de escopo até o fim da Fase 2. `DECIDIDO`; na v0.13 (ADR 0073): o sync entra na Fase 3, depois da primeira versão do servidor e por ele.

---

## 9. Plataformas e stack

| Item | Valor | Status |
|---|---|---|
| Plataformas-alvo | macOS, Windows, Linux, iOS, Android | `DECIDIDO` |
| Plataforma inicial | macOS | `DECIDIDO` |
| Limitações por plataforma | aceitáveis, desde que explícitas | `DECIDIDO` |
| Core | Rust | `DECIDIDO` |
| Shell | Tauri v2 (desktop e mobile) | `DECIDIDO` |
| Editor | CodeMirror 6 com Live Preview | `DECIDIDO` |
| Board | Excalidraw (MIT) como camada de anotação livre | `DECIDIDO` |
| Board — camada semântica | nós são notas, arestas são relações tipadas; seta livre pode ser promovida a relação tipada | `DECIDIDO` (promovido na v0.11, ADR 0057) |
| Persistência do board | sidecar em JSON Canvas, com ou sem extensões | `DECIDIDO` (v0.11, ADR 0057): o próprio `.canvas`, com o desenho sob uma chave de topo `verso` no mesmo arquivo |
| Índice | SQLite com FTS5 | `DECIDIDO` |
| Geração de tipos TS a partir do Rust | ts-rs ou specta | `ABERTO` |
| Parser base | pulldown-cmark, comrak ou próprio | `DECIDIDO`: pulldown-cmark (v0.8, ADR 0037) |
| Servidor | mesmo binário do core sem UI (`verso serve`) | `DECIDIDO` (promovido na v0.13, ADR 0073): `verso serve`, subcomando do binário `verso`; o servidor auto-hospedado vem primeiro na Fase 3 |
| Mobile inicial | cliente web (PWA) servido pelo servidor próprio | `DECIDIDO` (promovido na v0.13, ADR 0073): a janela servida pelo servidor, no navegador do celular e do tablet; offline depois |
| Indexação para mobile | servidor companheiro indexa e entrega índice pronto ao celular | `PROPOSTO`; superado na v0.13 (ADR 0073 item 8): o servidor indexa, o celular pergunta a ele |

---

## 10. Arquitetura

```
┌─ Core Rust (processo nativo) ─────────────────┐
│ fs + watcher · parser · índice SQLite/FTS5    │
│ grafo · merge · MCP · sync                    │
└───────────────────┬───────────────────────────┘
                    │ contrato: comandos + eventos
                    │ (IPC local ou WebSocket remoto)
┌───────────────────┴───────────────────────────┐
│ UI web: CM6 · Excalidraw · board · views      │
│ Plugins TS em Web Worker, sem acesso a disco  │
└───────────────────────────────────────────────┘
```

### 10.1 Regras invioláveis `DECIDIDO`

1. A UI só fala com o core pelo contrato. Nenhum atalho.
2. A UI não assume de que lado do fio o core está; latência e disponibilidade vêm das capabilities.
3. O contrato é definido primeiro; tipos TS são gerados a partir do Rust.
4. A API de filesystem trabalha com handles opacos, nunca com caminho POSIX em string.
5. Acesso a disco só dentro do crate `verso-fs`.
6. Plugins nunca acessam disco diretamente.

### 10.2 Capabilities em runtime `PROPOSTO`

- Consultáveis pela UI e por plugins (ex.: `fs:arbitrary`, `fs:watch`, `net:fetch`, `proc:spawn`, `bg:sync`, `offline`).
- Manifesto de plugin declara o que exige; o catálogo filtra por plataforma.
- A UI explica a ausência de um recurso em vez de escondê-lo.

### 10.3 Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Parser do editor (Lezer, em JS) diverge do parser do índice (Rust) | Corpus de fixtures como suíte de conformidade para os dois; parser Rust puro, compilável para WASM |
| API do Obsidian tem leituras síncronas; o contrato é assíncrono | Projeção somente-leitura do índice no lado JS, alimentada por eventos |
| Mantenedor iniciante em Rust | Guardrails mecânicos, fixtures legíveis, revisão independente |
| Escopo e burnout | Núcleo pequeno, features como plugins, portão de um mês de uso real |
| Perda de dados | Escrita atômica, guarda contra placeholder, abrir nunca reescreve |

### 10.4 Decisões caras de reverter

Licença (após contribuições), dialeto de arquivo (após existirem vaults) e API de plugin (após existirem plugins). Exigem mais evidência que qualquer outra decisão.

---

## 11. Dialeto de arquivo

### 11.1 Base compatível com Obsidian `DECIDIDO`

Ler e escrever sem quebrar:

- wikilinks: `[[nota]]`, `[[nota|alias]]`, `[[nota#seção]]`, `[[nota#^bloco]]`
- embeds: `![[...]]`
- callouts
- definição de bloco: `^id`
- frontmatter YAML, incluindo `tags` e `aliases`
- `.canvas` (JSON Canvas)

O Verso estende esse dialeto; nunca o contradiz.

### 11.2 Conversão explícita `PROPOSTO`

| Origem (Obsidian) | Destino (Verso) |
|---|---|
| `.obsidian/` | config do Verso fora da árvore |
| Campo inline do Dataview `chave:: valor` | frontmatter |
| `.excalidraw.md` do plugin Excalidraw | formato do board |

### 11.3 Itens de dialeto

- Sintaxe de relação tipada. `DECIDIDO` (v0.11: propriedade do frontmatter cujo valor é wikilink entre aspas, Q10 da spec, ADR 0057)
- Formato e localização dos schemas. `DECIDIDO` (v0.9: um bloco `verso-schema` numa nota da pasta; Q11 da spec, ADR 0052)
- Sintaxe de visibilidade por bloco (segredo do mestre). `ABERTO`
- i18n de schema: chave neutra de idioma com rótulo traduzido (ex.: `type: npc` exibido como "PdM" ou "NPC"). `DECIDIDO` (promovido na v0.9, ADR 0052)

### 11.4 Fixtures `DECIDIDO`

Estrutura:

```
fixtures/<categoria>/<caso>/input.md
fixtures/<categoria>/<caso>/expected.yaml
```

Exemplo — `input.md`:

```markdown
Encontramos [[Barão Vermelho|o barão]] na [[Taverna#Porão]].

`[[isto não é link]]`

Ele jurou vingança. ^juramento
```

Exemplo — `expected.yaml`:

```yaml
links:
  - target: Barão Vermelho
    alias: o barão
  - target: Taverna
    heading: Porão
blocks:
  - id: juramento
```

Categorias mínimas:

- wikilink simples, com alias, com heading, com `#^bloco`
- embed `![[...]]`
- definição de bloco `^id`
- link dentro de código inline e de bloco de código (não conta como link)
- frontmatter com `tags` e `aliases`
- nomes de nota com acento e espaço

Regras:

- As fixtures são o contrato de comportamento entre o mantenedor e a IA.
- `expected.yaml` só muda com aprovação explícita do mantenedor.
- Qualquer fixture pode ser rascunhada pela IA; só vale com aprovação explícita do mantenedor, e nas cinco primeiras essa aprovação inclui conferir o comportamento no app Obsidian (alterado na v0.6, ADR 0031; até então: "as 5 primeiras são escritas à mão pelo mantenedor").

---

## 12. RPG de mesa

Suporte especial a quem joga e mestra é intenção declarada. `DECIDIDO` para a intenção; escopo abaixo `PROPOSTO`.

| Recurso | Status |
|---|---|
| Integração com Foundry VTT mapeando nota tipada ↔ Actor/Item com o data model do sistema; os módulos existentes só sincronizam journals | `PROPOSTO` |
| Tabela aleatória como tipo de nota com ação de rolagem | `PROPOSTO` |
| Visão de jogador: blocos marcados como secretos somem no compartilhamento e na exportação; mapeia para permissão de journal no Foundry | `PROPOSTO` |
| Atalhos nomeados de viewport no board | `PROPOSTO` |
| Packs de schema por sistema de jogo | `PROPOSTO` |

---

## 13. Requisitos transversais

| Item | Status |
|---|---|
| pt-BR e EN desde o primeiro commit | `DECIDIDO` |
| Acessibilidade desde o início | `DECIDIDO` |
| Board com vista equivalente acessível (lista ou tabela das mesmas notas e relações) | `DECIDIDO` (v0.11, ADR 0057: um sumário ao lado do board; decidido pelo mantenedor em 2026-10-01, v0.12) |
| Metas de performance | `ABERTO` — sem metas por ora |
| Benchmark com vault sintético registrando linha de base | `DECIDIDO` |

---

## 14. Engenharia

### 14.1 Papéis `DECIDIDO`

- O mantenedor aprende Rust em paralelo, fora do projeto. A IA escreve o código; o mantenedor revisa comportamento pelas fixtures e questiona decisões.
- Opus 5: autor de documentos, autor de UI/TS, revisor do código do core.
- Fable 5.1: autor do código do core, revisor de documentos e do código de UI/TS.
- Autor e revisor sempre em sessões separadas; o revisor não vê o raciocínio do autor. "Quem escreveu não revisa" vale para o modelo, não só para a sessão (precisado na v0.2, ADR 0032).

### 14.2 Estrutura de crates `DECIDIDO`

```
crates/
├── verso-dialect   # parser puro: sem IO, sem async
├── verso-index     # SQLite/FTS5, grafo
├── verso-fs        # handles opacos, watcher, escrita atômica, confinamento
├── verso-core      # orquestra e expõe o contrato
└── verso-cli       # index, search, backlinks, mcp
```

### 14.3 Guardrails `DECIDIDO`

Todos no CI antes da primeira linha de lógica de produto. (Lido no ADR 0029 como dois grupos: guardrails de workspace antes da primeira linha de código de produto; guardrails de feature no mesmo PR da feature que protegem, nunca depois.)

| Guardrail | Evita |
|---|---|
| `unsafe_code = "forbid"` via `[workspace.lints]` | corrupção de memória |
| clippy com `-D warnings`; `unwrap_used` e `expect_used` negados, permitidos só em testes | panic derrubando o app |
| `cargo-deny`: allowlist de licenças compatível com a licença escolhida; advisories negadas | dependência incompatível ou vulnerável |
| Fuzzing do parser com `cargo-fuzz` | arquivo malformado travando o app |
| Property test de round-trip | abrir reescrevendo arquivo |
| Escrita atômica (arquivo temporário + fsync + rename) | corrupção em queda de energia |
| Confinamento de caminho no adapter | plugin ou agente saindo da pasta via `../` ou symlink |
| Queries parametrizadas + escape da sintaxe FTS5 | busca quebrando com aspas e operadores |
| Benchmark com vault sintético | regressão de performance |

CI em macOS e Linux: `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo deny check`.

### 14.4 Fluxo de PR `DECIDIDO`

- PR pequeno, um assunto.
- Template: O quê / Por quê / Alternativas descartadas / Como verificar / Conceito Rust usado (explicado para iniciante).
- Se uma fixture parecer errada, o autor para e pergunta; nunca altera `expected.yaml`.
- Dependência nova exige justificativa no PR.
- Revisão independente classifica achados em BLOQUEANTE, IMPORTANTE ou MENOR.
- Merge só com CI verde, sem BLOQUEANTE aberto, e se o mantenedor consegue explicar o PR com as próprias palavras.

---

## 15. Roadmap `DECIDIDO`

### Fase 0 — Fundação

ADRs, spec do dialeto v0, corpus inicial de fixtures, `CLAUDE.md`, template de PR; revisão crítica; decisão de licença; workspace e CI com todos os guardrails, sem nenhuma feature.

**Saída:** zero BLOQUEANTE aberto; `LICENSE` presente; CI verde; guardrails comprovadamente disparando numa branch de teste.

### Fase 1 — Core via CLI, sem UI

| # | Crate | Entrega |
|---|---|---|
| 1 | verso-dialect | parse de links, blocos, headings e frontmatter; round-trip; alvo de fuzz |
| 2 | verso-fs | varrer pasta, confinamento de caminho, escrita atômica |
| 3 | verso-index | schema SQLite, FTS5, backlinks |
| 4 | verso-cli | `verso index`, `verso search`, `verso backlinks` |
| 5 | bench | gerador de vault sintético + linha de base |
| 6 | verso-cli | `verso mcp` somente leitura |

**Saída:** vault real de campanha indexa sem erro; backlinks conferem com o esperado; guardrails verdes; notas consultáveis pelo Claude via MCP.

### Fase 2 — Esqueleto andante no macOS

Tauri + CM6: abrir pasta, árvore de arquivos, editor, backlinks e busca vindos do core; contrato com tipos gerados; um tipo de nota ponta a ponta.

**Saída:** um mês de uso real na preparação de mesa.

### Fora de escopo até o fim da Fase 2

~~Sync~~, ~~mobile~~, plugins, ~~board~~, shim de compatibilidade. O board entrou na Fase 2 em 2026-09-30 (v0.11, ADR 0057). Sync e mobile saíram em 2026-10-09 para a Fase 3 — o app de Linux, depois o servidor auto-hospedado — na forma do ADR 0073: mobile pelo navegador, servido pelo servidor; sync depois do servidor e por ele (v0.13, ADR 0034).

---

## 16. Contexto de mercado

### 16.1 Dores de usuários do Obsidian que motivam decisões

| Dor | Decisão relacionada |
|---|---|
| Apps mobile menos polidos; vaults grandes travam no iPhone | servidor companheiro; capabilities |
| Sync de config (plugins, hotkeys) falha entre dispositivos | config em camadas |
| Armazenamento sob demanda interpretado como deleção, causando perda | guarda contra placeholder |
| Startup lento com muitos plugins | lazy por padrão; tempo de carga visível |
| Backlink de bloco pedido desde 2020 | ID estável de bloco |
| Resultado de consulta invisível a grafo, busca, git e agente | views materializáveis |
| Paralisia de configuração inicial | packs de schema |
| Dataview sem evolução; Bases lê só frontmatter | nota tipada e consulta nativas |

### 16.2 Projetos de referência

| Projeto | Relevância |
|---|---|
| Zettlr | abre pasta arbitrária sem vault; GPL |
| SilverBullet | server-first, no navegador; MIT; referência para o cliente web |
| Logseq | AGPL; transição para versão em banco de dados ainda em beta |
| Grimoire | app local-first em Markdown com pasta como tipo e backlinks tipados |
| Alkemion Studio | board visual para mestres; relações tipadas; tabelas aleatórias; visão de jogador |
| Módulos de sync Obsidian ↔ Foundry | sincronizam journals; não mapeiam para Actor/Item |

---

## 17. Itens em aberto — lista consolidada

| # | Item | Quando decidir |
|---|---|---|
| 1 | ~~Licença: pacote A ou B~~ | decidido: pacote A (v0.3, ADR 0005) |
| 2 | Disponibilidade do nome em crates.io, npm e org do GitHub (o domínio: `versomd.com`, v0.10, ADR 0004) | antes de tornar o repositório público |
| 3 | ~~Idioma da documentação do repositório~~ | decidido: inglês fonte, pt-BR espelho (v0.5, ADR 0008) |
| 4 | ~~Parser base: pulldown-cmark, comrak ou próprio~~ | decidido: pulldown-cmark (v0.8, ADR 0037; leitura de round-trip na spec Q18) |
| 5 | Geração de tipos TS: ts-rs ou specta | início da Fase 2 |
| 6 | ~~Sintaxe de relação tipada~~ | decidido: propriedade do frontmatter cujo valor é wikilink (v0.11, Q10 da spec, ADR 0057) |
| 7 | ~~Formato e localização dos schemas~~ | decidido: um bloco `verso-schema` numa nota da pasta (v0.9, Q11 da spec, ADR 0052) |
| 8 | Sintaxe de visibilidade por bloco | antes de compartilhamento e exportação |
| 9 | ~~Persistência do board~~ | decidido: o próprio `.canvas`, com o desenho sob uma chave `verso` (v0.11, ADR 0057) |
| 10 | Metas de performance | após a primeira linha de base |

Itens abertos levantados depois do briefing vivem nos ADRs 0044–0048 e na
seção 9 da spec do dialeto, não aqui.

---

## Histórico

| Versão | Data | Mudança |
|---|---|---|
| 0.1 | 2026-09-21 | Versão inicial. |
| 0.1 | 2026-09-21 | §5.1: config fora da árvore e índice como cache promovidos a `DECIDIDO`; abertura pela linha de comando registrada como `DECIDIDO`. |
| 0.2 | 2026-09-21 | Aplicação da revisão da Fase 0 (`docs/review/phase-0.md`), aceita integralmente pelo mantenedor: §8 guarda contra placeholder promovida a `DECIDIDO` (ADR 0043); §3 critério de desempate corrigido e "Passo 5" substituído por "antes do fechamento da Fase 0" (§3, §17); §14.1 revisor de UI/TS definido. Nenhuma outra seção alterada. |
| 0.3 | 2026-09-21 | §3 e §17 item 1: licença decidida pelo mantenedor — Pacote A, MPL-2.0 no core e app, MIT no SDK de plugin (ADR 0005). `LICENSE` adicionado à raiz. |
| 0.4 | 2026-09-21 | §3: modelo de contribuição (DCO sem CLA) confirmado pelo mantenedor, com a regra para código escrito por IA: quem assina tem domínio e se responsabiliza (ADR 0006). |
| 0.5 | 2026-09-21 | §3 e §17 item 3: idioma da documentação decidido pelo mantenedor — inglês fonte, pt-BR espelho em `docs/pt-BR/`; este briefing é a exceção, com o original pt-BR mandando (ADR 0008). |
| 0.6 | 2026-09-21 | §11.4: regra de fixtures alterada pelo mantenedor — qualquer fixture pode ser rascunhada pela IA; só vale com aprovação explícita dele, e as cinco primeiras são conferidas no app Obsidian antes da aprovação (ADR 0031). |
| 0.7 | 2026-09-21 | §14.3: ponteiro para a leitura em dois grupos dos guardrails no ADR 0029, após a leitura independente da revisão da Fase 0 (docs/review/phase-0.md §7). Nenhuma decisão alterada. |
| 0.8 | 2026-09-21 | §9 e §17 item 4: parser base decidido pelo mantenedor — pulldown-cmark, com comrak como fallback, na leitura somente leitura de round-trip (spec Q18). Comparação em docs/reference/parser-decision.md (ADR 0037). |
| 0.9 | 2026-09-24 | §5.2, §5.3, §11.3 e §17 item 7: decididos pelo mantenedor, sobre o memo docs/reference/typed-note-decision.md — a degradação para Markdown (ADR 0013, aceito como está escrito, com "views" e "dado estruturado" delimitados), a nota tipada e o i18n de schema (ADR 0052), e o formato e a localização dos schemas: um bloco `verso-schema` numa nota, em qualquer lugar da pasta menos caminhos ocultos e ignorados (Q11 da spec). A localização é a escolha do mantenedor entre a §5.3 (arquivo de texto na pasta) e a §8 (schemas na camada compartilhada da config), que fica como está, `PROPOSTO`, e agora discorda sobre schemas. |
| 0.10 | 2026-09-24 | §2 e §17 item 2: domínio decidido pelo mantenedor — comprou `versomd.com`, o mais próximo de `verso.md` que conseguiu (ADR 0004). A disponibilidade em crates.io, npm e org do GitHub segue em aberto. |
| 0.11 | 2026-09-30 | §5.3, §9, §11.3, §13, §15 e §17 itens 6 e 9: decididos pelo mantenedor, sobre o memo docs/reference/board-decision.md — o board entra na Fase 2; a persistência é o próprio `.canvas`, com o desenho do Excalidraw sob uma chave de topo `verso`; a camada semântica e a relação tipada, cuja sintaxe é uma propriedade do frontmatter da nota de origem com wikilink entre aspas (Q10 da spec); a vista acessível do board, um sumário ao lado dele (ADR 0057). |
| 0.12 | 2026-10-01 | §13: a vista acessível do board, um sumário ao lado dele — escrita como `DECIDIDO` na v0.11 enquanto o ADR 0057 a deixava como escolha do autor — decidida pelo mantenedor em 2026-10-01, sobre a revisão crítica docs/review/board.md (§6 item 15). Nenhuma outra mudança. |
| 0.13 | 2026-10-09 | §8, §9 e §15: decididos pelo mantenedor ao aceitar o ADR 0073 (servidor auto-hospedado primeiro), junto com os ADRs 0074, 0075 e 0076, na resposta *"Com exceção de E que deve nascer em b, K deve ser b, L deve vir agora, P tudo — vc segue o recomendado"*. §8: o sync passa pelo servidor próprio e vem depois dele; Drive e OneDrive por API deixam de ser essenciais; transportes no core enquanto guardarem credenciais; Yjs no lugar do Automerge, como mecanismo de sessão ao vivo; o sync entra na Fase 3. §9: o servidor e o mobile inicial pelo navegador promovidos a `DECIDIDO`; a indexação para mobile superada. §15: sync e mobile saem da lista de fora de escopo para a Fase 3. |
