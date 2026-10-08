# ADR 0069 — A versão para Windows: x64, um instalador, testada numa máquina Windows por SSH

- Data: 2026-10-07
- Fonte: o mantenedor, em sessão: "uma das coisas que a gente tem para
  fazer é implementar uma versão para Windows", antes de uma versão estável
  com o máximo de recursos; depois, diante de cinco perguntas, "1. Sim, pode
  já fazer 2. Qual o melhor no nosso caso? Pros e contras 3. Por enquanto
  sim 4. Excelente pergunta, mas não tenho windows arm pra testar 5. Não
  sei"; e, diante dos prós e contras, "Prefiro nsis tb. Deixa win 10 tb,
  muita máquina não recebe a atualização". A máquina de teste foi montada na
  mesma sessão.
- Relacionados: [0022](0022-target-platforms-macos-first.md) (o Windows
  sai, antes do Linux), [0029](0029-guardrails-in-ci.md) (as verificações
  por plataforma e os scripts locais), [0043](0043-placeholder-guard.md) (o
  placeholder do OneDrive, `[OPEN]`),
  [0051](0051-development-flow-and-releases.md) (as versões, e a assinatura
  de código no Windows adiada), [0055](0055-in-app-updater.md) (o caminho
  do atualizador no Windows, nunca exercitado).
- Status no briefing: não presente

## Contexto

O ADR 0022 decidiu que o Windows sai, antes do Linux, e que entra nas
verificações por plataforma do CI em `main` e no empacotamento de uma versão
quando a sua versão chegar. Não disse como ela é construída e testada, e
nada no repositório decide um formato de instalador, uma arquitetura ou como
o código de Windows roda antes de um push.

O Windows não roda em Docker num Mac ([0029](0029-guardrails-in-ci.md)), e
por isso o `scripts/check-linux.sh` não tem gêmeo para Windows. Há duas
máquinas Windows à mão: uma máquina virtual Windows 11 no servidor Proxmox
do mantenedor, na rede de casa, montada em 2026-10-07 por scripts que a
instalam sem intervenção e a deixam com o toolchain, SSH e Área de Trabalho
Remota; e um PC de jogos com GPU de verdade. Nessa máquina virtual o
`cargo test -p verso-dialect` passou, 93 testes de 93, com o toolchain
fixado em `rust-toolchain.toml`.

O roadmap põe o app de Windows depois da Fase 2
([roadmap](../roadmap.md), "E também os apps de Windows e Linux"). As
palavras do mantenedor acima o trazem para antes de uma versão estável;
reconciliar o roadmap cabe a ele.

## Decisão

1. **Só x64, Windows 10 e 11.** Windows em ARM não é construído: não há
   máquina para testar. O Windows 10 fica, embora tenha saído do suporte em
   outubro de 2025: muita máquina nunca recebeu a atualização para o 11.
2. **O instalador é NSIS, por usuário.** Instala sem direitos de
   administrador, então o atualizador do app
   ([0055](0055-in-app-updater.md)) roda o novo instalador em silêncio, sem
   prompt de UAC; um só instalador leva pt-BR e EN
   ([0035](0035-cross-cutting-requirements.md)); o "Verso Beta" instala ao
   lado do "Verso" como no macOS
   ([0051](0051-development-flow-and-releases.md)). O bundle de Windows tem
   só o NSIS como alvo. O Windows 11 traz o WebView2 e o Windows 10 pode não
   ter, então o instalador embute o bootstrapper do WebView2 (uns 2 MB), que
   o instala quando falta (proposto; o padrão do Tauri baixa o bootstrapper
   na hora da instalação).
3. **Sem assinatura de código por enquanto.** O SmartScreen avisa na
   primeira execução de um instalador não assinado, e isso fica aceito até
   a distribuição pública, onde o
   [0051](0051-development-flow-and-releases.md) já põe a decisão de
   assinatura de código.
4. **Desenvolvido no Mac, construído e testado numa máquina Windows
   alcançada por SSH.** O repositório supõe só um host SSH chamado
   `verso-win`: Windows com OpenSSH, Windows PowerShell como shell, o MSVC
   Build Tools, rustup, Node 22 e Git com `core.autocrlf false`. Os scripts
   que montam a máquina virtual do mantenedor ficam fora do repositório:
   guardam os endereços da rede de casa. O PC de jogos é a verificação em
   hardware real (GPU, DPI alto), à mão, antes de uma versão.
5. **`scripts/check-windows.sh`**, ao lado do `check-linux.sh`: copia a
   árvore de trabalho para o host Windows byte a byte (arquivos rastreados e
   arquivos não rastreados que não são ignorados, sem conversão de fim de
   linha) e roda lá as verificações cuja resposta depende da plataforma:
   `cargo clippy` com `-D warnings` e `cargo test --workspace`
   ([0029](0029-guardrails-in-ci.md)). Se precisa passar antes de todo push
   é `[OPEN]`. Recomendação registrada: obrigatório quando o diff toca código
   que depende da plataforma (`verso-fs`, `app/src-tauri`, caminhos de
   configuração, tudo sob `cfg(windows)`), opcional nos outros casos; para
   código que só o Windows compila, o pull request declara a execução como
   um passo, como faz hoje para código só de macOS
   ([0029](0029-guardrails-in-ci.md)).
6. **CI, quando a versão chegar.** `main` ganha um job de Windows com o
   clippy e os testes numa imagem de runner fixada, e o workflow de versão um
   job de Windows que gera o instalador. Os pull requests ficam no Linux. Um
   minuto de Windows é cobrado como dois de Linux.
7. **O app real testado por máquina no Windows** (proposto, pull request
   próprio). O WebDriver do Tauri (`tauri-driver`) funciona no Windows e não
   no macOS, então os passos do roteiro que o harness do navegador não
   alcança podem rodar contra a janela real lá.
8. **O que a versão traz, cada item com um teste.**
   - Escrita atômica por `MoveFileEx` com `REPLACE_EXISTING`, e um handle
     aberto (antivírus, OneDrive) fazendo o rename falhar
     ([0029](0029-guardrails-in-ci.md)).
   - O placeholder do OneDrive, `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, como
     fixture do `verso-fs`: o mantenedor fecha o `[OPEN]` desse provedor no
     [0043](0043-placeholder-guard.md) no pull request da versão.
   - Confinamento de caminhos contra as formas do Windows: letras de drive,
     caminhos UNC, `\`, junctions, nomes reservados (`CON`, `NUL`), nomes
     curtos 8.3, pontos e espaços no fim, e nomes sem distinção de
     maiúsculas (a Q8 da spec do dialeto é `[OPEN]`).
   - O local da configuração no Windows: `[OPEN]`; o
     [0011](0011-config-outside-tree-index-as-cache.md) não tem equivalente
     para Windows.
   - O caminho de instalação do atualizador no Windows, que existe e nunca
     rodou ([0055](0055-in-app-updater.md)), e o seu rollback.
   - A linha de comando no `PATH`, e as teclas que o tutorial ensina, com
     Ctrl onde o macOS tem ⌘.

## Consequências

- Duas notas de referência contradizem o ADR 0022 como revisado em
  2026-09-23: `docs/reference/mcp-decision.md` ("Windows não é alvo", sobre
  o separador de caminho) e `docs/reference/watcher-decision.md` ("Windows
  (ainda não é alvo)", contra a sua própria tabela). O pull request da
  versão as corrige, ou registra por que não.
- O `README.md` já promete uma verificação do build de Windows ao lado dos
  scripts locais; o item 5 é essa verificação.
- A máquina virtual roda a avaliação do Windows 11 Enterprise, que expira em
  90 dias; os seus scripts a remontam sem intervenção.
- A máquina virtual roda o Windows 11. O Windows 10 precisa de uma máquina
  própria para ser testado (proposto: uma segunda máquina virtual, da
  avaliação do Windows 10 Enterprise LTSC); até lá o Windows 10 é suportado
  mas não rodado.
- Sem GPU na máquina virtual: o WebView2 renderiza em software lá. A taxa de
  quadros do board é julgada no PC de jogos.
- Cada job de Windows no CI custa o dobro de um de Linux, só em `main` e
  numa versão.

## Alternativas descartadas

- **O PC de jogos como a máquina Windows.** Tem GPU de verdade, mas é
  dividido com os jogos, não tem snapshots para voltar a uma instalação
  limpa, e fica em outro cômodo. Mantido para as verificações em hardware
  real.
- **Só o CI (`windows-latest`).** Constrói e testa, mas ninguém consegue
  olhar o app, e cada tentativa custa minutos de runner.
- **Compilação cruzada a partir do Mac (`cargo-xwin`).** O suporte do Tauri
  é experimental e só NSIS, e constrói sem rodar nada.
- **MSI (WiX).** Por máquina: o atualizador levantaria um prompt de UAC a
  cada atualização; um MSI por idioma; só constrói no Windows. Serve à
  implantação em empresas, que pode acrescentá-lo depois.
- **Windows em ARM.** Nenhuma máquina para testar.
- **Só Windows 11.** Proposto na sessão, já que o Windows 10 saiu do
  suporte; o mantenedor manteve o Windows 10, porque muita máquina nunca
  recebeu a atualização.

## Status

Proposto. Decidido pelo mantenedor em 2026-10-07: só x64, sem ARM64, e
Windows 10 e 11 (item 1); NSIS por usuário (item 2); sem assinatura de
código por enquanto (item 3, lendo o seu "por enquanto sim" como aceite do
instalador não assinado). Proposto: o bootstrapper do WebView2 embutido
(item 2), os itens 4 a 8, e uma máquina de teste com Windows 10. `[OPEN]`:
se o `scripts/check-windows.sh` precisa passar antes de todo push.
