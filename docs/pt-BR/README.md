# Verso

[English](../../README.md)

O Verso é um aplicativo aberto de notas em Markdown: arquivos simples em
disco, compatível com vaults do Obsidian, feito primeiro para preparar
sessões de RPG de mesa ([ADR 0036](adr/0036-tabletop-rpg-support.md)). Ele
está na Fase 2 do [roadmap](roadmap.md): uma janela desktop no macOS, em uso
diário pelo mantenedor. O repositório fica privado até estar pronto.

## Compilar e rodar

```
cd app/ui && npm ci && npm run build && cd ../..
cargo build -p verso-app -p verso-cli
./target/debug/verso /caminho/de/uma/pasta
```

A UI precisa do Node 22, e o Rust precisa do toolchain que o
`rust-toolchain.toml` fixa (o `rustup` o instala). A linha de comando sozinha
— `verso index`, `verso search`, `verso backlinks`, `verso mcp` — não precisa
de UI: `./target/debug/verso help`.

## Testar localmente, antes do push

O CI confirma; ele não deve ser onde uma falha aparece primeiro. Dois scripts
rodam os guardrails do CI ([ADR 0029](adr/0029-guardrails-in-ci.md)) na sua
máquina:

| Script | Roda | Precisa de |
|---|---|---|
| `scripts/check.sh` | todo guardrail do job de Linux do CI, nativo — num Mac, é a checagem de macOS | o toolchain, o Node 22, `cargo install cargo-deny --locked` |
| `scripts/check-linux.sh` | fmt, clippy, os testes e os bindings gerados num container Linux, como usuário comum | Docker; o bundle da UI que o primeiro script gera |

```
scripts/check.sh && scripts/check-linux.sh
```

A primeira execução de Linux baixa uma imagem, um toolchain e as
dependências; as seguintes levam cerca de um minuto. O que nenhum dos dois
cobre:

- **macOS num container** não existe: o Docker roda Linux. Num Mac, o
  `scripts/check.sh` é a checagem de macOS; o CI repete clippy e os testes no
  macOS depois de cada merge no `main`.
- **Windows**: o Docker num Mac ou num Linux não roda Windows, e o Verso ainda
  não compila para Windows. Com o porte para Windows
  ([ADR 0022](adr/0022-target-platforms-macos-first.md)), uma checagem do
  build de Windows entra nesses scripts, e os testes rodam em Windows no CI.
- **O fuzzing e o benchmark**, que o CI roda no `main`:
  `cargo +nightly fuzz run parse` em `crates/verso-dialect`, e
  `cargo run --release -p verso-bench -- --help`.

## Versões

Cada versão está listada no [CHANGELOG.md](CHANGELOG.md); o que já foi
mesclado mas ainda não saiu fica em "Não lançado". `vX.Y.Z` é uma release de
produção, `vX.Y.Z-beta.N` uma release de teste, publicada como "Verso Beta",
que se instala ao lado do app de produção com os próprios ajustes da janela
([ADR 0051](adr/0051-development-flow-and-releases.md)).

- **Para instalar uma**: pela página de Releases do repositório, descompacte
  o app em `/Applications`. Ele é assinado ad hoc, não por um desenvolvedor
  registrado: na primeira vez o macOS se recusa a abri-lo — libere uma vez em
  Ajustes do Sistema → Privacidade e Segurança → "Abrir Mesmo Assim". O
  arquivo `verso-cli` traz a linha de comando; ponha o `verso` no seu `PATH`.
  Extraído pelo Finder, ele também é barrado na primeira execução: libere ali
  também, ou rode `xattr -d com.apple.quarantine verso` uma vez.
- **Qual está rodando**: Ajustes → Geral → Versão, o painel Sobre, ou
  `verso --version`.
- **Gerar uma** só acontece quando o mantenedor pede:
  `node scripts/release.mjs prepare X.Y.Z[-beta.N]` abre o pull request da
  release, e depois do merge dele `node scripts/release.mjs tag
  X.Y.Z[-beta.N]` marca o commit que trouxe a versão; a tag compila e publica
  a release. Antes da primeira tag, um ensaio — Actions → release → Run
  workflow — compila os mesmos arquivos e não publica nada.

## Documentos

- [CONTRIBUTING.md](CONTRIBUTING.md) — como propor uma mudança, a assinatura,
  o que nunca fazer.
- [roadmap.md](roadmap.md) — as fases e os critérios de saída.
- [adr/](adr/README.md) — um registro por decisão.
- [spec/dialect.md](spec/dialect.md) — o dialeto Markdown, com as questões em
  aberto.
- [reference/app-decision.md](reference/app-decision.md) — o que a janela faz,
  e como verificar sem ler código.
