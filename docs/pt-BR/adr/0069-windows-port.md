# ADR 0069 — A versão para Windows: x64, um instalador, testada numa máquina Windows por SSH

- Data: 2026-10-07
- Fonte: o mantenedor, em sessão: "uma das coisas que a gente tem para
  fazer é implementar uma versão para Windows", antes de uma versão estável
  com o máximo de recursos; depois, diante de cinco perguntas, "1. Sim, pode
  já fazer 2. Qual o melhor no nosso caso? Pros e contras 3. Por enquanto
  sim 4. Excelente pergunta, mas não tenho windows arm pra testar 5. Não
  sei"; e, diante dos prós e contras, "Prefiro nsis tb. Deixa win 10 tb,
  muita máquina não recebe a atualização". A máquina de teste foi montada na
  mesma sessão. As cinco perguntas em si não estão neste registro, só as
  respostas; a leitura das respostas 3 e 5 abaixo é do autor. Revisado em
  2026-10-07 depois da leitura do revisor (Fable 5.1), com a decisão do
  mantenedor de começar agora: ADR 0022 revisado, o app real dirigido pela
  suíte ponta a ponta que já existe, e três questões abertas — o `fsync` do
  diretório, o separador de caminho, a máquina com Windows 10.
- Relacionados: [0022](0022-target-platforms-macos-first.md) (o Windows
  sai, antes do Linux), [0029](0029-guardrails-in-ci.md) (as verificações
  por plataforma e os scripts locais), [0043](0043-placeholder-guard.md) (o
  placeholder do OneDrive, `[ABERTO]`),
  [0051](0051-development-flow-and-releases.md) (as versões, e a assinatura
  de código no Windows adiada), [0055](0055-in-app-updater.md) (o caminho
  do atualizador no Windows, nunca exercitado).
- Status no briefing: não presente

## Contexto

O ADR 0022 decidiu que o Windows sai, antes do Linux e **depois da Fase 2**,
e que entra nas verificações por plataforma do CI em `main` e no
empacotamento de uma versão quando a sua versão chegar. Não disse como ela é
construída e testada, e nada no repositório decide um formato de instalador,
uma arquitetura ou como o código de Windows roda antes de um push. Em
2026-10-07 o mantenedor antecipou o app de Windows ("Tô querendo já iniciar
windows"): o ADR 0022 e o roadmap levam essa revisão, datada, e este ADR é o
como.

O Windows não roda em Docker num Mac ([0029](0029-guardrails-in-ci.md)), e
por isso o `scripts/check-linux.sh` não tem gêmeo para Windows. Há duas
máquinas Windows à mão: uma máquina virtual Windows 11 no servidor Proxmox
do mantenedor, na rede de casa, montada em 2026-10-07 por scripts que a
instalam sem intervenção e a deixam com o toolchain, SSH e Área de Trabalho
Remota; e um PC de jogos com GPU de verdade. Nessa máquina virtual o
`cargo test -p verso-dialect` passou, 93 testes de 93, com o toolchain
fixado em `rust-toolchain.toml`.

A janela hoje é afinada para o WKWebView: arrastos por eventos de ponteiro
porque o arrastar e soltar do HTML5 está morto lá, embeds em web views
filhas, um cache que sobrevive a atualizações. O WebView2 é Chromium. A
suíte ponta a ponta (`app/ui/e2e`, Playwright) roda só em WebKit.

O que foi conferido fora do repositório em 2026-10-07, para os itens
abaixo: o instalador NSIS do Tauri aceita `/S` (silencioso), `/P` (passivo)
e `/UPDATE`, encerra o app em execução no modo silencioso, e avisa sobre uma
instalação MSI anterior ([Windows Installer](https://v2.tauri.app/distribute/windows-installer/));
o `webviewInstallMode` é `downloadBootstrapper` por padrão,
`embedBootstrapper` acrescenta uns 1,8 MB, `offlineInstaller` uns 127 MB
(mesma página); o `tauri-driver` roda só em Windows e Linux, enquanto o
`@wdio/tauri-service` do WebdriverIO roda um servidor WebDriver embutido no
app em Windows, Linux e macOS
([WebDriver](https://v2.tauri.app/develop/tests/webdriver/)); o Playwright
se liga a um app WebView2 pelo Chrome DevTools Protocol quando o app é
iniciado com `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<porta>`,
uma `WEBVIEW2_USER_DATA_FOLDER` por teste
([Playwright, WebView2](https://playwright.dev/docs/webview2)); o `MoveFileEx`
com `MOVEFILE_WRITE_THROUGH` "não retorna até o arquivo estar de fato movido
no disco", e sem `MOVEFILE_COPY_ALLOWED` nunca cai para uma cópia
([MoveFileExW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw));
um minuto de Windows no GitHub Actions conta como dois de Linux.

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
   é `[ABERTO]`. Recomendação registrada: obrigatório quando o diff toca código
   que depende da plataforma (`verso-fs`, `app/src-tauri`, caminhos de
   configuração, tudo sob `cfg(windows)`), opcional nos outros casos; para
   código que só o Windows compila, o pull request declara a execução como
   um passo, como faz hoje para código só de macOS
   ([0029](0029-guardrails-in-ci.md)).
6. **CI, quando a versão chegar.** `main` ganha um job de Windows com o
   clippy e os testes numa imagem de runner fixada, e o workflow de versão um
   job de Windows que gera o instalador. Os pull requests ficam no Linux. Um
   minuto de Windows é cobrado como dois de Linux.
7. **O app real testado por máquina no Windows, pela suíte ponta a ponta
   que o repositório já tem** (proposto, pull request próprio). O WebView2 é
   Chromium: iniciado com
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<porta>`,
   a janela real aceita o Playwright pelo Chrome DevTools Protocol, então os
   testes de `app/ui/e2e` rodam contra o próprio app, não o harness, e os
   passos do roteiro que o harness não alcança viram testes lá. Uma pasta de
   dados de usuário por teste (`WEBVIEW2_USER_DATA_FOLDER`), já que o
   controle compartilha uma por padrão. O `tauri-driver` é a alternativa,
   só Windows e Linux; o `@wdio/tauri-service` do WebdriverIO alcançaria a
   janela real também no Mac, com um servidor WebDriver embutido — decisão
   própria, não deste ADR.
8. **Antes de qualquer máquina Windows: a suíte ponta a ponta em Chromium
   no Mac** (proposto, o primeiro passo da versão). Um projeto `chromium` do
   Playwright ao lado do `webkit`, no `scripts/check.sh`; o que difere entre
   os dois motores é a maior parte do que vai diferir no WebView2, e não
   custa runner nem SSH.
9. **O que a versão traz, cada item com um teste.**
   - Escrita atômica: `FlushFileBuffers` no arquivo temporário (`sync_all`),
     depois `MoveFileEx` com `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`
     e sem `MOVEFILE_COPY_ALLOWED`, para que a movimentação bloqueie até
     estar no disco e nunca degrade para uma cópia; e um handle aberto
     (antivírus, OneDrive) fazendo o rename falhar, com a nova tentativa que
     o teste fixa ([0029](0029-guardrails-in-ci.md)). **`[ABERTO]`: o
     invariante 9 do `CLAUDE.md` e o ADR 0029 pedem um `fsync` do diretório
     depois do rename, e o Windows não tem essa chamada num handle de
     diretório.** Recomendação registrada: no Windows o `fsync` do diretório
     é o `MOVEFILE_WRITE_THROUGH`, e o texto do guardrail diz isso; o
     mantenedor decide.
   - **`[ABERTO]`: o separador de caminho.** O caminho de uma nota cruza o
     contrato como texto relativo à pasta aberta (ADR 0026, regra 4), os
     alvos de wikilink e o índice guardam caminhos, e o
     `docs/reference/mcp-decision.md` escolheu `/` enquanto "o Windows não é
     alvo". Recomendação registrada: `/` em todo lugar em que um caminho é
     texto — o contrato, o índice, os links, o MCP — e só o `verso-fs` o
     converte para a forma do SO na sua borda, como o Obsidian escreve `/`
     em todo cofre; o mantenedor decide, com a Q8 (maiúsculas) ao lado.
   - O watcher (`verso-fs/src/watch.rs`) sobre `ReadDirectoryChangesW`: os
     eventos que um salvamento, uma renomeação e uma hidratação do OneDrive
     levantam, contra o que o `docs/reference/watcher-decision.md` registra
     para o macOS.
   - O placeholder do OneDrive, `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS`, como
     fixture do `verso-fs`: o mantenedor fecha o `[ABERTO]` desse provedor no
     [0043](0043-placeholder-guard.md) no pull request da versão.
   - Confinamento de caminhos contra as formas do Windows: letras de drive,
     caminhos UNC, `\`, junctions, nomes reservados (`CON`, `NUL`), nomes
     curtos 8.3, pontos e espaços no fim, e nomes sem distinção de
     maiúsculas (a Q8 da spec do dialeto é `[ABERTO]`).
   - O local da configuração no Windows, com o log e o arquivo do índice
     que no macOS moram ao lado dela (`~/Library/Application Support/verso`):
     `[ABERTO]`; o [0011](0011-config-outside-tree-index-as-cache.md) não tem
     equivalente para Windows.
   - O caminho de instalação do atualizador no Windows, que existe e nunca
     rodou ([0055](0055-in-app-updater.md)), e o seu rollback.
   - A linha de comando no `PATH`, e as teclas que o tutorial ensina, com
     Ctrl onde o macOS tem ⌘.

## Consequências

- **Ordem do trabalho** (recomendação registrada, decisão do mantenedor): a
  versão nasce de `main` depois do merge do pull request #37; o primeiro
  pull request dela é só infraestrutura — item 8, `scripts/check-windows.sh`,
  o job do CI, um build NSIS que instala e abre — e não toca código do
  `verso-fs`; o `verso-fs` vem depois, um item do 9 por pull request, já que
  é a crate sob os invariantes 5, 9 e 11.
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
  mas não rodado. **`[ABERTO]`**: ou essa máquina existe antes da primeira
  beta para Windows, ou o Windows 10 é declarado "melhor esforço" nas notas
  da versão; o mantenedor decide.
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

Proposto. Decidido pelo mantenedor em 2026-10-07: o app de Windows começa
agora, antes do fim da Fase 2 (ADR 0022 revisado no mesmo dia); só x64, sem
ARM64, e Windows 10 e 11 (item 1); NSIS por usuário (item 2); sem assinatura
de código por enquanto (item 3, lendo o seu "por enquanto sim" como aceite
do instalador não assinado). Proposto: o bootstrapper do WebView2 embutido
(item 2), os itens 4 a 9, a ordem do trabalho, e uma máquina de teste com
Windows 10. `[ABERTO]`: se o `scripts/check-windows.sh` precisa passar antes
de todo push; o que o `fsync` do diretório significa no Windows (item 9); o
separador de caminho onde um caminho é texto (item 9); Windows 10 rodado ou
"melhor esforço".
