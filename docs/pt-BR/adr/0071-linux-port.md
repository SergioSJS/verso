# ADR 0071 — A versão para Linux: um build para toda distribuição, testado em máquinas virtuais

- Data: 2026-10-08
- Fonte: o mantenedor, em sessão, depois do porte para Windows: "acione um
  agente … para verificar o que falta para termos uma versão do Verso para
  Linux"; "acha que faz sentido subir umas duas máquinas linux no proxmox pra
  testar? pegando a distro mais usada e uma diferentona"; "com essas o debian
  taria coberto?"; "como obsidian faz com linux? a versão linux é feita pra
  qual distro?"; depois "aproveite e já escreva o adr para linux, valide e
  corrija com fable. e deixe pra depois". A análise do que falta foi feita
  no mesmo dia por um agente, só lendo o repositório; o Contexto cita o que
  ele achou por arquivo e linha. Lido pelo Fable 5.1 no mesmo dia e revisado
  pelo que ele achou (ADR 0032).
- Relacionados: [0022](0022-target-platforms-macos-first.md) (Linux depois
  da Fase 2), [0011](0011-config-outside-tree-index-as-cache.md) (o local do
  índice no Linux, `[ABERTO]`), [0029](0029-guardrails-in-ci.md)
  (guardrails e scripts locais), [0043](0043-placeholder-guard.md)
  (placeholders: nenhum provedor reconhecido no Linux),
  [0044](0044-verso-fs-semantics.md) (a varredura periódica do watcher
  quando acaba o limite de observadores do inotify),
  [0051](0051-development-flow-and-releases.md) (versões e assinatura),
  [0055](0055-in-app-updater.md) (o atualizador),
  [0069](0069-windows-port.md) (o porte para Windows, o molde),
  [0070](0070-what-travels-with-the-folder.md) (nomes que todo sistema
  guarda).
- Status no briefing: não presente

## Contexto

O que o Linux tem em 2026-10-08, pelo repositório:

- **O núcleo e o app compilam e passam nos testes no Linux em todo pull
  request.** O `scripts/check-linux.sh` (linhas 23, 33–40, 60) roda
  `cargo fmt`, clippy, os testes e a checagem dos bindings num container
  Debian 12 com WebKitGTK 4.1, onde o `verso-app` compila e os testes do
  host rodam no runtime mock do Tauri; a CI roda o mesmo no `ubuntu-24.04`
  (`.github/workflows/ci.yml`, 61, 150–163). Ao contrário do Windows, a
  semântica do núcleo não precisa de porte: os caminhos são `/`, um
  diretório aceita `fsync`, um rename por cima de um arquivo aberto
  funciona, e os nomes que o Windows recusa já são recusados em todo
  sistema (ADR 0070). O que falta ao `verso-fs` no Linux está listado
  abaixo.
- **Não existe pacote para Linux e a janela nunca foi aberta no Linux.** O
  `app/src-tauri/tauri.conf.json` (26–45) não tem seção `linux`; o
  `release.yml` (17–18, 89) publica só o macOS — também não tem job de
  Windows ainda; a suíte de ponta a ponta não roda no Linux.
- **O ramo Linux do atualizador nunca rodou e, pela leitura, falharia**
  (`app/src-tauri/src/update.rs`): todo download é aberto como ZIP (496,
  591); hoje nenhum arquivo das versões tem `linux` no nome, então o app de
  Linux não acha pacote nenhum (292–337); quando houver um, a lista de
  arquivos põe um AppImage primeiro (315–316), que seria aberto como ZIP; um
  AppImage é trocado pelo `current_exe()`
  (861–863), que aponta para dentro da montagem só leitura em vez do
  `$APPIMAGE`.
- **A integração com o sistema supõe macOS ou Windows:** instalar a linha
  de comando grava em `/usr/local/bin`, sem elevação fora do macOS
  (`app/src-tauri/src/cli.rs`, 8, 119–143); "Adicionar ao Claude" supõe
  `~/.config/Claude` (184); uma segunda abertura abre um segundo processo —
  sem instância única em lugar nenhum, Windows incluído; "Mostrar na pasta"
  abre a pasta pai pelo `xdg-open` sem selecionar o arquivo
  (`app/src-tauri/src/files.rs`, 288–293); "Copiar caminho completo"
  precisa do `wl-copy` ou do `xclip` (346–373), muitas vezes não
  instalados; o item de menu diz "Finder" em todo sistema
  (`app/ui/src/strings.ts`, 147, 280 — já errado no Windows).
- **O WebKitGTK não é o WKWebView:** o wry documenta as web views filhas
  (notas web e embeds) como "Linux (X11 Only)", o Wayland precisando do
  construtor GTK dele (a documentação do wry,
  [0.56](https://docs.rs/crate/wry/0.56.0); o lock tem a 0.55.1); NVIDIA no
  Wayland pode mostrar a janela em branco
  ([Tauri](https://v2.tauri.app/develop/debug/linux-graphics/)), e os
  contornos são variáveis de ambiente (`__NV_DISABLE_EXPLICIT_SYNC`,
  `WEBKIT_DISABLE_DMABUF_RENDERER`), que o app não consegue definir
  sozinho: o `std::env::set_var` é `unsafe` no Rust 2024 e o workspace
  proíbe `unsafe` (`Cargo.toml`, 16, 24) — um lançador (o `AppRun` do
  AppImage, o arquivo desktop) consegue; o board, telas HiDPI e escala
  fracionária só se julgam numa tela de verdade, com GPU.
- **O `verso-fs` no Linux:** um estouro da fila do inotify já vira uma
  nova varredura (`crates/verso-fs/src/watch.rs`, 192–197), mas nada trata
  o fim do limite de observadores numa pasta grande, a varredura periódica
  que o ADR 0044 (76–80) pede quando o Linux virar alvo; sistemas de
  arquivos de rede são detectados só no macOS (`write.rs`, 318–325);
  atributos estendidos que falham na cópia (SELinux no Fedora) já são
  relatados, como no macOS (`write.rs`, 269–287), e só precisam ser
  observados.
- **Um eixo novo que o Windows não tinha: maiúsculas.** Os sistemas de
  arquivos do macOS e do Windows não distinguem maiúsculas; os do Linux
  distinguem, e `Nota.md` e `nota.md` podem existir lado a lado. Links,
  renomear e "já existe um arquivo com esse nome" foram escritos com essa
  folga (a Q8 da spec, `docs/spec/dialect.md`, 924–936, `[ABERTO]`).
- **Nenhum placeholder de provedor de nuvem é reconhecido no Linux** (o ADR
  0043 cobre o iCloud, e os atributos do Windows desde 2026-10-08).

Como o Obsidian distribui no Linux, pela página de download e pelas versões
([download](https://obsidian.md/download)): um build para toda
distribuição, não um por distribuição — um AppImage (x64 e ARM64), um
`.deb` para amd64, arquivos `.tar.gz`, um Snap, e um Flatpak marcado como
"mantido pela comunidade". Ele consegue porque o Electron leva o próprio
Chromium. O Tauri usa o WebKitGTK do sistema: o AppImage do Tauri o
empacota junto com as dependências dele (70 MB ou mais), enquanto o `.deb`
e o `.rpm` dependem do `libwebkit2gtk-4.1` da distribuição; o Tauri pede
para compilar na base mais antiga que se quer suportar, porque uma glibc
mais nova não roda num sistema mais velho
([AppImage](https://v2.tauri.app/distribute/appimage/),
[Debian](https://v2.tauri.app/distribute/debian/)). O Ubuntu 22.04 tem a
glibc 2.35 e o Debian 12 tem a 2.36, então das duas a base mais antiga é o
Ubuntu 22.04 ([Ubuntu](https://packages.ubuntu.com/source/jammy/glibc)).

## Decisão

Tudo proposto pelo autor; o porte espera ("deixe pra depois").

1. **x64 primeiro.** Linux em ARM64 (Raspberry Pi, notebooks ARM) é uma
   pergunta, não um plano: `[ABERTO]`.
2. **Um build, três pacotes:** um AppImage para toda distribuição, um
   `.deb` para a família Debian (Debian, Ubuntu, Mint, Pop!_OS), um `.rpm`
   para o Fedora e a família dele — os três de um único `tauri build`. Isso
   responde ao "feita pra qual distro?" do mantenedor: para nenhuma em
   particular, como o Obsidian. O Flatpak fica para depois: um Flatpak
   precisa da revisão do Flathub e de uma permissão de sistema de arquivos
   para as pastas, e a linha de comando e o servidor MCP, que um cliente
   inicia como programa, morariam dentro do isolamento ou precisariam de um
   segundo pacote.
3. **Compilado no Ubuntu 22.04, num container:** a base mais antiga da
   família, para os pacotes rodarem no Ubuntu 22.04 em diante, no Debian 12
   (agora em LTS) em diante e no Fedora atual. O container Debian 12 do `check-linux.sh`
   continua checando; ele não compila o que é distribuído. As versões
   suportadas são uma pergunta: `[ABERTO]`.
4. **Testado em máquinas virtuais no host Proxmox**, instaladas sem
   intervenção (o autoinstall do Ubuntu, o kickstart do Fedora, o preseed do
   Debian), com snapshots e SSH por chave, como a máquina Windows. O
   mantenedor perguntou de duas — a distribuição mais usada e uma bem
   diferente — e se o Debian ficaria coberto; o autor respondeu que o
   Ubuntu cobre o empacotamento da família Debian mas não as bibliotecas
   mais velhas do Debian, e propôs três, todas montadas quando o porte
   começar (Decisão 8):
   - **O LTS atual do Ubuntu, GNOME no Wayland** (26.04 hoje): o desktop
     mais usado; o `.deb` e o AppImage;
   - **A versão mais antiga ainda suportada do Debian, GNOME** (12 hoje —
     oldstable, em LTS de 2026-07-11 até 2028-06; o Debian 13 é o estável
     atual, e nenhuma máquina o roda): WebKitGTK, GStreamer e Mesa mais
     velhos, e um sistema "pelado" (codecs e ferramentas de área de
     transferência não instalados);
   - **A versão atual do Fedora, KDE Plasma** (44 hoje; só Wayland desde o
     Fedora 40): a outra família — o `.rpm`, SELinux, KDE no lugar do
     GNOME, bibliotecas mais novas.

   Duas ou três máquinas: `[ABERTO]`. Sem GPU numa máquina virtual: a
   janela renderiza em software ali, bom para correção, não para a fluidez
   do board; NVIDIA no Wayland precisa de hardware de verdade, que nenhuma
   máquina daqui tem: `[ABERTO]`.
5. **`scripts/check-linux-vm.sh`**, ao lado do `check-linux.sh` e do
   `check-windows.sh`: a mesma árvore, byte a byte, para uma VM, o pacote
   compilado e instalado, o app aberto; e o projeto WebKit da suíte de ponta
   a ponta rodado num container Linux com Node ao lado do Rust, cujo WebKit
   do Playwright é um build próprio dos portes GTK e WPE (o
   `browser_patches/webkit` do Playwright) — perto do motor do app de Linux sem o
   custo de uma máquina. Quando ele é exigido antes de um push, como o
   `check-windows.sh` é quando código de plataforma muda (0069, item 5):
   `[ABERTO]`. A lista de scripts locais do ADR 0029 o ganha quando ele
   chegar.
6. **CI quando o porte chegar:** o job de pull request continua; uma versão
   compila e publica os três pacotes ao lado dos do macOS, e dos do Windows
   quando o job de versão dele existir.
7. **O que o porte traz, cada item com um teste:**
   - a seção `linux` do bundle, e a beta ao lado da versão estável: hoje as
     duas instalariam `/usr/bin/verso-app` e colidiriam num `.deb`/`.rpm`;
   - o caminho Linux do atualizador: consertado (o arquivo pelo formato, o
     AppImage trocado pelo `$APPIMAGE`, o arquivo que a documentação do
     AppImage indica para isso
     ([AppImage](https://docs.appimage.org/packaging-guide/environment-variables.html))), ou deixado ao gerenciador de pacotes para
     o `.deb` e o `.rpm`, ou o plugin de atualização do Tauri — deixado de
     lado pelo ADR 0055 enquanto o repositório é privado, ele atualiza
     AppImage, `.deb` e `.rpm` desde a 2.10.0 e sempre exige assinatura
     ([changelog](https://v2.tauri.app/release/updater/all-versions/)) (a
     assinatura é do ADR 0051): `[ABERTO]`;
   - uma instância só — falta no Windows também, então um trabalho só para
     os dois;
   - a linha de comando no `PATH` sem root (`~/.local/bin`, da
     especificação de diretórios base do XDG desde a 0.8,
     [XDG](https://specifications.freedesktop.org/basedir/latest/));
   - "Mostrar na pasta" selecionando o arquivo (a interface D-Bus do
     gerenciador de arquivos, `org.freedesktop.FileManager1`, com o
     Nautilus e o Dolphin entre as implementações,
     [freedesktop](https://wiki.freedesktop.org/www/Specifications/file-manager-interface/),
     senão a pasta); o item de menu nomeado por sistema (Finder, Explorer, o
     gerenciador de arquivos) — Windows incluído; "Copiar caminho completo"
     dizendo o que instalar quando não há ferramenta de área de
     transferência;
   - "Adicionar ao Claude": o Claude Desktop para Linux está em beta para
     Ubuntu e Debian ([Anthropic](https://claude.com/download)); onde ele lê
     as configurações não está documentado — o `~/.config/Claude` é
     observado numa instalação de verdade antes de se contar com ele:
     `[ABERTO]`;
   - a varredura periódica quando acaba o limite de observadores do
     inotify (ADR 0044);
   - sistemas de arquivos de rede: detectados no Linux também, ou
     registrados como não detectados — o ADR 0029 evitou uma lista de
     nomes de sistemas de arquivos no macOS, e o Linux não oferece
     uma flag como o `MNT_LOCAL`;
   - atributos estendidos sob SELinux: observados na máquina Fedora;
   - maiúsculas: os testes que importam onde dois nomes diferem só em
     maiúsculas (links, renomear, "já existe"), e a Q8 da spec respondida
     para o Linux pelo mantenedor, observado antes o comportamento do
     Obsidian no Linux (ADR 0009);
   - web views filhas no Wayland: observadas, e o construtor GTK que o wry
     documenta para o Wayland tentado; o que não funciona aparece como não
     funcionando, nunca um painel em branco;
   - placeholders de nuvem no Linux: `[ABERTO]` (ADR 0043);
   - as teclas do tutorial com Ctrl, como no Windows.
8. **A ordem do trabalho, quando o porte começar:** as máquinas e o
   `check-linux-vm.sh`, e a suíte WebKit num container (sem código de
   produto: mostram quanto o motor precisa); depois o empacotamento e a
   integração com o sistema; o `verso-fs`; o atualizador; o job de versão; a
   passada no motor por último, o tamanho dela já conhecido.

## Consequências

- O que o porte para Windows fez serve ao Linux sem custo: o checklist
  entre plataformas, caminhos com `/`, nomes que todo sistema guarda, o
  índice em transações por rodada, Ctrl onde o macOS tem ⌘, o código do
  atualizador compartilhado entre Windows e Linux, um diretório de
  configuração que os testes conseguem nomear, e o ADR, o script e o job de
  CI para copiar.
- Mais máquinas no host Proxmox: uns 4 GB de memória cada enquanto
  ligadas, e disco só para o que gravarem (thin provisioning).
- O motor é a incógnita: se o WebKitGTK se comportar como o WebKit no Mac,
  o Linux custa menos que o Windows custou; se não, mais ou menos o mesmo.
  O primeiro passo existe para medir isso.
- Quem usa uma distribuição mais velha que a base do build não roda o
  `.deb` nem o `.rpm`; o AppImage é o que tentar ali, e em qualquer
  distribuição sem pacote.
- O roadmap aponta para este ADR na linha do Linux, como aponta para o
  0069.

## Alternativas descartadas

- **Um pacote por distribuição**: o mantenedor perguntou para qual
  distribuição a versão Linux é feita; o autor respondeu, pela documentação
  do Obsidian e do Tauri, que um build serve a todas (Decisão 2).
- **Arch como a distribuição "diferentona"**: levantada pelo autor em
  sessão e deixada de lado — o Fedora testa mais do que importa aqui (o
  `.rpm`, SELinux, KDE) e tem mais usuários.
- **Flatpak primeiro**: levantado pelo autor em sessão (Decisão 2).
- **Uma máquina virtual para a base mais antiga**: levantada pelo autor em
  sessão — o build só precisa das bibliotecas dessa base, que um container
  dá; as máquinas são para rodar o app.

## Status

Proposto. O porte espera, pela palavra do mantenedor em 2026-10-08 ("deixe
pra depois"); o ADR 0022 não muda (Linux depois da Fase 2) até o mantenedor
o revisar. **Respondido pelo mantenedor em 2026-10-09**, para quando o
porte começar:
- O ARM64 é gerado ao lado do x64.
- As versões seguem o Obsidian: nenhuma lista publicada. O piso é a
  WebKitGTK 4.1, a biblioteca de que o Tauri precisa — Ubuntu 22.04,
  Debian 12, Fedora 36 e posteriores.
- A checagem de NVIDIA com Wayland roda no desktop do mantenedor, com um
  pacote.
- O `check-linux-vm.sh` não é exigido antes de todo push, só quando fizer
  sentido ou para um pacote fechado.
- As atualizações são assinadas com a chave de release do ADR 0055
  (revisto em 2026-10-09).
- As configurações do Claude Desktop são tomadas como em `~/.config/Claude`
  (guias de terceiros; os documentos da Anthropic nomeiam só macOS e
  Windows), a observar numa instalação real antes de depender disso.
- Placeholders de nuvem: nenhum no Linux — não há arquivos "só online" no
  nível do sistema, então uma nota é lida como qualquer arquivo.
- O índice e o log ficam em `$XDG_CONFIG_HOME/verso` (`~/.config/verso`),
  como o Obsidian guarda `~/.config/obsidian`.

`[ABERTO]`: Snap; Wayland nativo ou X11 forçado onde as web views filhas
precisarem; nomes que diferem só em maiúsculas (a Q8 da spec).
