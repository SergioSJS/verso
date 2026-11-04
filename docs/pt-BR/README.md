# Verso

[English](../../README.md)

Site oficial: **https://versomd.com** (o código dele: [SergioSJS/versomd-site](https://github.com/SergioSJS/versomd-site)).
Os instaladores e os pacotes do UniVerso saem só das versões deste
repositório, assinados com minisign `RWS1zv2nvs/ng1hA0YspwOg7wGda98zkXjVfx8m9CtT5obRW5zabNHaT`.

O Verso é um aplicativo de notas para arquivos Markdown simples. Aponte para
uma pasta — um vault do Obsidian funciona como está — e ele dá um editor,
boards, bases, busca e um grafo sobre esses arquivos, no macOS, no Windows e
no Linux. Nada fica preso num banco de dados: os arquivos são as notas, e o
Verso nunca reescreve um arquivo que você só abriu. Ele é feito primeiro
para preparar sessões de RPG de mesa
([ADR 0036](../adr/0036-tabletop-rpg-support.md)), e serve para qualquer
conjunto de notas ligadas.

O repositório fica privado enquanto o app amadurece; ele está na Fase 2 do
[roadmap](../roadmap.md), em uso diário pelo mantenedor.

## Princípios

- **Seus arquivos são a fonte da verdade.** Notas são arquivos `.md`,
  boards são `.canvas`, bases são `.base`, numa pasta que você escolhe. O
  índice que o Verso mantém é um cache fora da pasta, refeito a partir dos
  arquivos ([ADR 0012](../adr/0012-files-are-source-of-truth.md)).
- **Abrir nunca reescreve.** Nenhuma reformatação silenciosa de frontmatter,
  finais de linha ou espaçamento; toda escrita é atômica e confere que o
  arquivo em disco ainda é o que foi lido — se mudou, você vê a diferença
  antes.
- **Compatível com o Obsidian.** O Verso lê e escreve o dialeto do Obsidian
  — wikilinks, embeds, ids de bloco, callouts, propriedades, JSON Canvas — e
  o estende sem mudar o sentido de nenhuma construção existente
  ([ADR 0030](../adr/0030-base-dialect-obsidian-compatible.md)). Dá para abrir
  a mesma pasta nos dois.
- **Local, sem conta.** Sem login, sem telemetria, sem nuvem própria.
- **Português e inglês** desde a primeira linha de código.

## O que ele faz

- **Escrever.** Modos Leitura, Editar e Fonte; blocos que você arrasta pela
  alça e um menu `/`, como no Notion; tabelas editadas como tabelas; um
  painel de propriedades para o frontmatter; notas tipadas, em que `type:` e
  um schema dão à nota a sua forma; callouts, matemática em KaTeX,
  diagramas Mermaid, blocos de código com botão de copiar.
- **Ligar.** Wikilinks para notas, títulos e blocos (`^id`), embeds que
  mostram a nota ou o bloco, backlinks e links de saída, links sem destino,
  renomear atualizando todos os links, e um grafo interativo.
- **Boards.** Arquivos `.canvas` desenhados com o Excalidraw: as notas da
  pasta como cartões que você edita ali mesmo, imagens (que dá para recortar)
  e PDFs como cartões,
  setas que mantêm o ponto onde foram desenhadas, relações tipadas, e
  desenhos do plugin Excalidraw do Obsidian.
- **Bases.** Arquivos `.base` mostrados como tabelas, quadros Kanban e
  listas, e incorporados vivos nas notas.
- **Organizar.** Uma árvore de arquivos com seleção múltipla, figurinhas,
  cores e capas, páginas de pasta, ordem manual e focos compartilhados com o
  make.md, notas diárias com calendário, e templates oferecidos ao criar uma
  nota.
- **Mídia e web.** Um leitor de PDF com duas páginas lado a lado, imagens,
  páginas da web guardadas como notas, e arquivos HTML.
- **Encontrar.** Busca no texto, abrir pelo nome, paleta de comandos,
  localizar e substituir em todas as notas, abas (fixas e de
  pré-visualização), painéis lado a lado, áreas, e uma pasta por janela.
- **Do seu jeito.** Temas, paletas, fontes, idioma e os seus próprios
  atalhos.
- **Agentes e terminal.** O comando `verso` indexa, busca e lista
  backlinks; `verso mcp` é um servidor MCP só de leitura, para uma pasta ou
  para todo o Verso, que os Ajustes conectam ao Claude Desktop; toda chamada
  de um agente fica registrada.
- **Atualizações.** O app se atualiza sozinho, e só instala uma atualização
  cuja assinatura confere com a chave que ele traz
  ([ADR 0055](../adr/0055-in-app-updater.md)).

## Instalar

Pela [página de Releases](https://github.com/SergioSJS/verso/releases) do
repositório. Cada release abre com *Qual arquivo baixar?* — o arquivo de
cada computador, como link — e *Como instalar*, em inglês e em português.
Uma versão de teste sai como "Verso Beta" — os arquivos dela começam com
`Verso-Beta-` — e se instala ao lado do app de produção.

| Seu computador | Arquivo | Primeira vez |
|---|---|---|
| Mac com chip Apple (M1, M2, M3, M4…); um Mac com processador Intel não é suportado | `Verso-X.Y.Z-macos-arm64.zip`: descompacte em `/Applications` | assinado ad hoc, não por um desenvolvedor registrado: permita uma vez em Ajustes do Sistema → Privacidade e Segurança → "Abrir Mesmo Assim" |
| Windows 10 e 11, x64 (rodado até agora no Windows 11) | `Verso-X.Y.Z-windows-x64-setup.exe`, um instalador para o seu usuário | sem assinatura: o SmartScreen pergunta uma vez: em Mais informações, mande executar |
| Linux, x64 | `Verso-X.Y.Z-linux-amd64.deb` para Ubuntu (22.04 e posteriores), Linux Mint, Debian (12 e posteriores), Pop!_OS; `Verso-X.Y.Z-linux-x86_64.rpm` para Fedora (36 e posteriores); `Verso-X.Y.Z-linux-x86_64.AppImage` para qualquer outro | o AppImage: torne-o executável e rode. O ARM64 vem quando o repositório for público |

O `verso-X.Y.Z-SHA256SUMS` lista o sha256 de cada arquivo, e o `.sig`
dele assina a lista com a chave acima: o atualizador do app e o
instalador do UniVerso conferem cada arquivo com eles, e você pode
ignorar os dois. (A 0.8.3 também leva um `.sig` ao lado de cada arquivo,
para os apps anteriores a ela; as releases depois dela, não.)

A linha de comando vem com o app. No macOS, Ajustes → Terminal e agentes →
Instalar a liga como `/usr/local/bin/verso`; no Windows o `verso.exe` fica
ao lado do app; no Linux um pacote põe o `verso` em `/usr/bin`, e os Ajustes
de um AppImage o põem em `~/.local/bin`. Os arquivos `verso-cli` trazem a
mesma linha de comando para uma máquina sem o app.

## Experimente: o tutorial

Abra uma pasta e, sem nenhuma nota aberta, escolha **Importar cofre de
exemplo**: o Verso
escreve ali o seu tutorial — umas vinte notas, uma por área do app, e dois
boards. Comece pelo board **Tour do Verso**, depois o **Treino do Board**
para aprender a desenhar ([ADR 0058](../adr/0058-demo-vault-as-tutorial.md)).
O mesmo conteúdo está em `demo-vault/`.

## Como é feito

Um núcleo em Rust e uma janela desktop
([ADR 0028](../adr/0028-crate-structure.md)):

| Parte | O que faz |
|---|---|
| `crates/verso-dialect` | o parser de Markdown — puro, sem IO, compila para WebAssembly |
| `crates/verso-fs` | os arquivos da pasta: handles opacos, o watcher, escrita atômica, confinamento à pasta |
| `crates/verso-index` | SQLite com FTS5: busca, links, o grafo |
| `crates/verso-core` | orquestra o resto e expõe o contrato |
| `crates/verso-cli` | o comando `verso` e o servidor MCP |
| `crates/verso-contract` | os tipos do contrato, sem IO |
| `crates/verso-bench` | o benchmark, nunca distribuído |
| `app/src-tauri`, `app/ui` | a janela Tauri e a sua interface em TypeScript (CodeMirror, Excalidraw) |

A janela só fala com o núcleo pelo contrato, cujos tipos TypeScript são
gerados a partir do Rust
([ADR 0026](../adr/0026-core-ui-contract-inviolable-rules.md)). O comportamento
é fixado pelas fixtures em `fixtures/`, e cada decisão
tem o seu registro em [docs/adr/](../adr/README.md).

## Compilar e rodar

```
cd app/ui && npm ci && npm run build && cd ../..
cargo build -p verso-app -p verso-cli
./target/debug/verso /caminho/para/uma/pasta
```

É preciso o Node 22 para a interface e o toolchain Rust que o
`rust-toolchain.toml` fixa (o `rustup` o instala). No Linux, também as
bibliotecas do Tauri (a WebKitGTK 4.1 e as outras que o workflow de release
instala). Só a linha de comando — `verso index`, `verso search`,
`verso backlinks`, `verso mcp` — não precisa da interface:
`./target/debug/verso help`.

## Testar localmente, antes do push

O CI confirma; não deve ser onde uma falha aparece pela primeira vez. Estes
scripts rodam os guardrails do CI ([ADR 0029](../adr/0029-guardrails-in-ci.md))
na sua máquina:

| Script | Roda | Precisa |
|---|---|---|
| `scripts/check.sh` | todos os guardrails do job Linux do CI, de forma nativa — num Mac, esta é a checagem do macOS; depois, quando o Docker roda, o `scripts/check-e2e.sh` (`--no-e2e` o deixa de fora; sem Docker a última linha diz que ele foi pulado) | o toolchain, o Node 22, `cargo install cargo-deny --locked`; com `cargo install cargo-nextest --locked` os testes rodam com um limite de tempo por teste (sem ele, `cargo test`) |
| `scripts/check-e2e.sh` | o que o CI não roda: os testes de ponta a ponta da janela sobre o harness do navegador ([ADR 0058](../adr/0058-demo-vault-as-tutorial.md)), no WebKit e no Chromium, os motores dos apps de macOS e Windows ([ADR 0069](../adr/0069-windows-port.md)), com 3 workers (`E2E_WORKERS`), e os do servidor contra um `verso serve` de verdade, os dois ao mesmo tempo na imagem Linux do Playwright — nunca no window server do próprio Mac. Os traces de uma falha voltam para `app/ui/e2e/results` e `app/ui/e2e-server/results`; `--ui` ou `--server` roda uma suíte só, os outros argumentos vão para o Playwright | Docker |
| `scripts/check-linux.sh` | fmt, clippy, os testes (cargo-nextest) e os bindings gerados num contêiner Linux, como usuário comum; depois a imagem do servidor, o script de backup e o instalador | Docker; o bundle da interface que o primeiro script gera. A imagem do contêiner, `verso-ci` (`scripts/ci/Dockerfile`: o toolchain, o WebKitGTK, o cargo-deny, o cargo-nextest, o Node), é gerada na primeira vez e de novo só quando esse arquivo ou o `rust-toolchain.toml` muda |
| `scripts/check-windows.sh` | clippy e os testes numa máquina Windows por SSH; `--bundle` também gera o instalador ([ADR 0069](../adr/0069-windows-port.md)). Obrigatório quando o diff toca código de plataforma (`verso-fs`, `app/src-tauri`, caminhos de configuração, `cfg(windows)`), opcional nos outros casos | um host SSH chamado `verso-win` com o toolchain (o cabeçalho do script lista) |
| `scripts/check-linux-vm.sh` | clippy e os testes numa máquina Linux por SSH; `--bundle` gera o `.deb`, o `.rpm` e o AppImage, `--install` abre o app no desktop dela, `--webkit` roda a suíte de ponta a ponta no WebKit do Linux num contêiner ([ADR 0071](../adr/0071-linux-port.md)). Quando fizer sentido, ou para um pacote fechado | um host SSH chamado `verso-ubuntu` (o cabeçalho do script lista); Docker para `--webkit` |
| `scripts/install-beta.sh` | num Mac com chip Apple, este checkout instalado como "Verso Beta" sobre `/Applications/Verso Beta.app`: a janela compilada primeiro, os binários nativamente, o `ui-web` e as chaves do Info.plist no bundle, assinado ad hoc, o beta aberto fechado sem perder trabalho, e uma falha se o log não disser que subiu este commit sem ERROR ([ADR 0051](../adr/0051-development-flow-and-releases.md)). O fim de toda mudança que o usuário vê; `--dirty` instala trabalho não commitado | um Verso Beta já instalado (uma release, ou um `tauri build` com um Node arm64) |

```
scripts/check.sh && scripts/check-linux.sh
scripts/check-windows.sh   # quando o diff toca código de plataforma
```

O que nenhum deles cobre:

- **macOS num contêiner** não existe: o Docker roda Linux. Num Mac, o
  `scripts/check.sh` é a checagem do macOS; o CI repete clippy e os testes
  no macOS depois de cada merge no `main`.
- **O fuzzing e o benchmark**, que o CI roda no `main`:
  `cargo +nightly fuzz run parse` em `crates/verso-dialect`, e
  `cargo run --release -p verso-bench -- --help`.

## Versões

Cada versão está listada no [CHANGELOG.md](CHANGELOG.md); o que já foi
mesclado mas ainda não lançado fica em "Não lançado". `vX.Y.Z` é uma versão
de produção, `vX.Y.Z-beta.N` uma versão de teste
([ADR 0051](../adr/0051-development-flow-and-releases.md)).

- **Qual está rodando**: Ajustes → Geral → Versão, o painel Sobre, ou
  `verso --version`.
- **Gerar uma** só acontece quando o mantenedor pede:
  `node scripts/release.mjs prepare X.Y.Z[-beta.N]`, na branch do pull
  request que lança, acerta a versão e move o changelog num commit; o merge
  desse pull request no `main` gera, assina, publica e marca a versão para
  todos os sistemas. Um ensaio — Actions → release → Run workflow — gera os
  mesmos arquivos e não publica nada.

## Documentos

- [CONTRIBUTING.md](CONTRIBUTING.md) — como propor uma mudança, sign-off, o
  que nunca fazer.
- [roadmap.md](../roadmap.md) — as fases e os seus critérios de saída.
- [adr/](../adr/README.md) — um registro por decisão.
- [spec/dialect.md](../spec/dialect.md) — o dialeto Markdown, com as suas
  questões abertas.
- [reference/app-decision.md](../reference/app-decision.md) — o que a janela
  faz, e como verificar sem ler código.
- [reference/server-hands-on.md](../reference/server-hands-on.md) — instalar o
  UniVerso passo a passo, com Docker ou um pacote, ao lado de outros apps,
  até o app de desktop conectado; a referência é
  [reference/server-install.md](../reference/server-install.md).
