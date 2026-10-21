# ADRs do Verso

Um registro por decisão do `docs/BRIEFING.md`. Formato fixo: Contexto / Decisão /
Consequências / Alternativas descartadas / Status.

## Status

Os status espelham o briefing e não podem ser promovidos pela IA:

| Status | Significado |
|---|---|
| Aceito | `DECIDIDO` no briefing: escolhido ou aceito explicitamente pelo mantenedor |
| Proposto | `PROPOSTO` no briefing: recomendado na discussão, sem confirmação |
| `[ABERTO]` | Sem decisão. Registra o contexto e quando decidir |
| Restrição | Imposta por plataforma, licença ou termos de uso; não é escolha |

Só o mantenedor promove Proposto para Aceito, ou fecha um `[ABERTO]`.

## Índice

### Projeto e governança

| # | Título | Status |
|---|---|---|
| [0001](0001-open-tool-no-company.md) | Ferramenta aberta, sem empresa e sem produto pago | Aceito |
| [0002](0002-negative-scope.md) | Escopo negativo: nem clone, nem host de plugins alheios, nem LLM embutido | Aceito |
| [0003](0003-primitives-not-workarounds.md) | O que hoje exige plugin deve ser primitiva do app | Aceito |
| [0004](0004-project-name-verso.md) | Nome do projeto: Verso | Aceito; o domínio `versomd.com` (2026-09-24); o nome do pacote, do crate e no npm `versomd`, pela conferência de disponibilidade de 2026-10-12 |
| [0005](0005-license.md) | Licença do projeto: MPL-2.0 no core e app, MIT no SDK de plugin | Aceito |
| [0006](0006-contribution-dco-no-cla.md) | Contribuição por DCO, sem CLA; código escrito por IA entra pelo mesmo DCO, sob responsabilidade de quem assina | Aceito |
| [0007](0007-private-repo-until-license.md) | Repositório privado até a licença ser decidida | Aceito |
| [0008](0008-documentation-language.md) | Idioma da documentação: inglês fonte, pt-BR espelho | Aceito |
| [0009](0009-external-constraints.md) | Restrições externas assumidas como dadas | Restrição; revisado em 2026-10-14: o código público de um plugin de código aberto que o Obsidian publica é uma fonte admissível |

### Princípios de produto

| # | Título | Status |
|---|---|---|
| [0010](0010-folder-is-the-unit-no-vault.md) | A pasta aberta é a unidade de trabalho; não existe vault | Aceito |
| [0011](0011-config-outside-tree-index-as-cache.md) | Config fora da árvore e índice como cache reconstruível | Aceito |
| [0041](0041-multi-root-workspace.md) | Workspace com múltiplas raízes | Proposto; depois da V1 (2026-10-21) |
| [0042](0042-open-from-command-line.md) | Abrir pela linha de comando: `verso <pasta>` | Aceito |
| [0012](0012-files-are-source-of-truth.md) | Arquivos são a fonte de verdade; abrir nunca reescreve | Aceito |
| [0013](0013-degrades-to-markdown.md) | Todo dado estruturado degrada para Markdown legível | Aceito (2026-09-24) |
| [0014](0014-primitives-catalog.md) | Catálogo de primitivas do Verso | Proposto (a nota do dia e os templates: Aceito; a nota tipada: Aceito no 0052; a relação tipada: decidida no 0057, 2026-09-30; as visões estruturadas: Aceito no 0053; as notas periódicas: Aceito no 0093, 2026-10-14) |
| [0015](0015-schema-packs.md) | Packs de schema distribuíveis como conteúdo | Proposto; depois da V1 (2026-10-21); os pacotes da 0098 são o formato deles |
| [0052](0052-typed-note.md) | Nota tipada: `type:` no frontmatter e um schema | Aceito (2026-09-24); uma propriedade com valor de link é relação tipada a partir do 0057 (2026-09-30) |
| [0053](0053-views-bases.md) | Visões sobre a pasta: bases, no formato do Obsidian | Aceito (2026-09-24) |
| [0059](0059-tabs-preview-pinned.md) | Abas: uma aba de pré-visualização por padrão, abas fixas compactas, a aba escolhida emenda na página | Aceito (2026-09-30) |
| [0060](0060-makemd-organizing-features.md) | As funcionalidades de organização do make.md como primitivas do Verso | Aceito (2026-10-02) |
| [0061](0061-blocks-in-edit-mode.md) | Blocos no modo Editar: uma alça para arrastar, um + para adicionar, um menu por bloco | Aceito (2026-10-06) |
| [0062](0062-focuses.md) | Focos: raízes nomeadas da árvore de arquivos, compartilhadas com o make.md | Aceito (2026-10-03) |
| [0063](0063-files-onto-the-board.md) | Pôr imagens e arquivos no board: soltar, colar, escolher e arrastar | Aceito (2026-10-06) |
| [0064](0064-tables-edited-as-tables.md) | Tabelas editadas como tabelas no modo Editar | Aceito (2026-10-06) |
| [0065](0065-a-folder-per-window.md) | Uma pasta por janela | Aceito (2026-10-06) |
| [0066](0066-mcp-sees-boards-relations-properties-bases.md) | O MCP enxerga boards, relações, propriedades e bases | Aceito (2026-10-07) |
| [0067](0067-source-files-stay-small.md) | Arquivos de código continuam pequenos: um mapa de módulos e um limite de tamanho | Aceito (2026-10-07) |
| [0068](0068-templates-chosen-in-a-new-note.md) | Templates escolhidos numa nota nova, como no Notion | Aceito (2026-10-07) |
| [0085](0085-hover-preview.md) | Prévia ao passar o ponteiro: a nota que um link nomeia, mostrada onde o ponteiro para | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1; decidido como recomendado: o modo Editar com o modificador, uma prévia dentro de uma prévia, a tecla padrão do comando |
| [0086](0086-infobox-a-typed-notes-card.md) | O infobox: as propriedades de uma nota tipada como um cartão ao lado do texto | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1; os tipos `link` e `image` e um `layout` nomeado pelo schema; decidido como recomendado: um endereço da web como imagem, a chave do layout, o texto alternativo da imagem |
| [0088](0088-dice-and-random-tables.md) | Dados e tabelas aleatórias: `dice:` numa nota rola, o resultado nunca escrito | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1; a sintaxe inline do Dice Roller, o motor do Rolai (MIT); decidido como recomendado: a notação, linhas desiguais, quem rola numa sala, como o Rolai é reaproveitado, um rolador sem nota, as Consequências do 0036 |
| [0089](0089-linking-unlinked-mentions.md) | Vincular menções sem link: um "Vincular" por menção e "Vincular todas", com um diff | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1; decidido como recomendado: maiúsculas, acentos e aliases, a sugestão enquanto se digita (fora da V1, desligada por padrão) |
| [0090](0090-maps-on-the-board.md) | Mapas no board: uma imagem debaixo do board, alfinetes que abrem notas, alfinetes secretos | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1, os mapas incluídos (*"VAI SER TUDO NA V1"*); decidido como recomendado: o nome do campo, os tiles, alfinetes secretos por projeção ou por um board separado |
| [0093](0093-periodic-notes.md) | Notas periódicas: a semana, o mês, o trimestre e o ano ao lado do dia | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1 (roadmap V.18, onda A); nomeadas e guardadas como o plugin Periodic Notes faz; decidido como recomendado: os períodos ligados por padrão, a pasta, os ajustes na camada da pasta, a semana e o idioma dos nomes, `{{date}}` num período, teclas padrão, ler os ajustes do Obsidian, a nota que dois aparelhos criaram offline, abrir ao iniciar |
| [0094](0094-the-rest-of-bases.md) | O resto das bases: expressões regulares, o layout de mapa, e o que o 0053 deixou sem construir | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1 (roadmap V.19, onda A); expressões regulares como o Obsidian as documenta, o layout de mapa com as chaves do plugin oficial Maps, nenhum tile de terceiro por padrão; decidido como recomendado: o motor, "Nova nota aqui", a biblioteca de desenho, o que um mapa mostra sem fonte, o endereço de tiles da própria base, imagens como mapas, `html()`, editar uma base incorporada |

### Plugins e LLM

| # | Título | Status |
|---|---|---|
| [0016](0016-plugins-execution-and-capabilities.md) | Plugins: TypeScript em Web Worker, sem disco, com capabilities declaradas | Aceito |
| [0017](0017-plugins-format-shim-loading.md) | Plugins: formato familiar, shim separado, carga lazy e dogfooding | Proposto |
| [0018](0018-llm-native-mcp-in-core.md) | LLM-nativo: servidor MCP no core, consulta estruturada, escrita revisada | Aceito |
| [0019](0019-generative-opt-in-and-keychain.md) | Recursos generativos opt-in e chaves no keychain | Aceito (2026-10-21) |

### Sync

| # | Título | Status |
|---|---|---|
| [0020](0020-sync-merge-in-core-transports-as-plugins.md) | Sync: motor de merge no core, transportes como plugin, fora de escopo até a Fase 2 | Aceito; revisto pelo 0073 (2026-10-09): o servidor primeiro e o sync por ele, Drive e OneDrive por API não essenciais, transportes no core enquanto guardarem credenciais |
| [0021](0021-sync-automerge-layered-config.md) | Sync: Automerge e config em camadas | Proposto; item 1 revisto pelo 0073 (2026-10-09): Yjs no lugar do Automerge, como mecanismo de uma sessão ao vivo |
| [0043](0043-placeholder-guard.md) | Arquivo placeholder de armazenamento sob demanda nunca é deleção | Aceito; detecção decidida para o iCloud Drive (2026-09-22) e para os atributos de nuvem do Windows, os do OneDrive entre eles (2026-10-08); `[ABERTO]` para os outros provedores |

### Plataformas e arquitetura

| # | Título | Status |
|---|---|---|
| [0022](0022-target-platforms-macos-first.md) | Plataformas-alvo e macOS primeiro | Aceito; revisado em 2026-10-12: o Linux saiu na Fase 3 (2026-10-09), não depois da Fase 2 |
| [0023](0023-stack-core-and-editor.md) | Stack: Rust, Tauri v2, CodeMirror 6, SQLite com FTS5 | Aceito |
| [0024](0024-board-excalidraw.md) | Board: Excalidraw como camada de anotação livre | Aceito; camada semântica e persistência decididas no 0057 (2026-09-30) |
| [0025](0025-own-server-and-mobile-pwa.md) | Servidor próprio (`verso serve`) e mobile inicial como cliente web | Proposto; os itens 1 e 2 aceitos no 0073 (2026-10-09), o item 3 superado lá |
| [0026](0026-core-ui-contract-inviolable-rules.md) | Contrato core↔UI e regras invioláveis de arquitetura | Aceito; regra 4 esclarecida para um servidor, a regra inalterada, e o escopo da regra 5 ampliado ao banco do servidor (2026-10-09) |
| [0027](0027-runtime-capabilities.md) | Capabilities consultáveis em runtime | Aceito (2026-10-12); o item 3 revisado para a regra do 0076: o que o lado não consegue fazer não aparece, com um caminho de volta nos Ajustes |
| [0028](0028-crate-structure.md) | Estrutura de crates | Aceito; dois crates para o servidor, `verso-service` e `verso-server` (2026-10-09) |
| [0050](0050-outbound-network-access.md) | Acesso de saída à rede a partir da janela | Aceito (o padrão do ajuste, ligado: decidido em 2026-10-21); revisado pela 0055 e pela 0056 (2026-09-29), e pelo 0073 e pelo 0075 (2026-10-09): o tráfego de um servidor e a checagem de atualização dele |
| [0054](0054-terminal-and-agents-from-the-app.md) | A linha de comando e os agentes, ligados pelo app | Aceito (2026-09-24); o `[ABERTO]` sobre as ferramentas do sistema fechado (2026-09-29) |
| [0055](0055-in-app-updater.md) | O atualizador dentro do app | Aceito (2026-09-29); revisto em 2026-10-09 (os arquivos de release assinados, o app confere) e 2026-10-14 (uma lista de checksums assinada por release no lugar de um `.sig` por arquivo, a 0.8.3 a ponte que publica os dois; `[OPEN]`: qual versão encerra a ponte) |
| [0056](0056-embedded-web-pages.md) | Páginas web embutidas: o proxy, a origem dele e a rede local | Aceito (2026-09-29); revisto no mesmo dia: sem proxy, as páginas carregam direto das origens que o usuário aprovou |
| [0057](0057-board-json-canvas.md) | O board: um arquivo JSON Canvas, o Excalidraw como superfície, relações tipadas no frontmatter | Aceito (2026-09-30) |
| [0069](0069-windows-port.md) | A versão para Windows: x64, um instalador, testada numa máquina Windows por SSH | Aceito (2026-10-12), decidido em partes desde 2026-10-07; x64, Windows 10 e 11, NSIS e sem assinatura de código por enquanto decididos; começa agora, na Fase 2 à frente do resto (0022 revisado); o bloqueio do push quando código de plataforma muda; máquina Windows 10 depois, código escrito para ele; o local da configuração (`%LOCALAPPDATA%\verso`) e o placeholder do OneDrive decididos em 2026-10-08; o `fsync` do diretório (o `FlushFileBuffers` conta) e o separador de caminho (`/`) decididos em 2026-10-09; saiu na 0.5.0-beta.1; itens 2, 4, 6–9 e a ordem do trabalho aceitos como construídos (2026-10-12) |
| [0070](0070-what-travels-with-the-folder.md) | O que viaja com a pasta: três camadas de configuração, e nomes que todo sistema guarda | Decidido em partes (2026-10-08/12); nomes que todo sistema guarda decidido, a `\` entre eles; as origens de embed aprovadas são da pessoa, e a camada da pessoa mora com a conta num servidor (2026-10-09, com o 0073); itens 1–2, a camada da pasta em `.verso/settings.json`, aceitos e construídos (2026-10-12), `[ABERTO]` a leitura de "os caminhos ignorados" e o nome do arquivo |
| [0071](0071-linux-port.md) | A versão para Linux: um build para toda distribuição, testado em máquinas virtuais | Saiu na 0.6.0-beta.1 (2026-10-09, PR #41); respondido em 2026-10-09: ARM64, versões, assinatura, o local do índice, três máquinas, o atualizador; Aceita por inteiro (2026-10-21): sem Snap por ora, Wayland observado e dito quando não funciona, nomes só com maiúsculas diferentes depois da V1 |
| [0072](0072-window-controls-in-the-app.md) | Os controles da janela dentro do app: sem barra de título no macOS e no Windows | Aceito (2026-10-08): botões do próprio app no Windows; emendado em 2026-10-09: no Linux também |
| [0073](0073-self-hosted-server-first.md) | Servidor auto-hospedado primeiro: colaboração online antes do sync | Aceito (2026-10-09), com os itens marcados como propostos; respondidos naquela noite: os crates do serviço, a versão do contrato, o caminho de atualização do servidor (opção b), TLS atrás de um proxy ou do Tailscale ou com o certificado do próprio servidor, os handles e os symlinks num servidor, conteúdo remoto por leitor, edição simultânea na primeira versão do servidor, o app desktop conectando nesta rodada; antes: recuperação de conta, donos por servidor, plataformas do Docker; revisa 0020, 0021, 0025, 0034, 0044, 0045, 0050, 0070; coedição do board decidida e construída em 2026-10-12 (item 12 da 0082); `[ABERTO]`: celular só online vs offline mais cedo, permissões mais finas e histórico, E2E depois, MCP pela rede, a URL pré-assinada, critérios de iPad nativo, repasse de custo, "este app é um servidor" atualizando com celulares conectados |
| [0074](0074-accounts-and-access-on-the-server.md) | Contas e acesso no servidor: o primeiro admin, o login, os tokens | Aceito (2026-10-09), com o 0073; decididos: o admin pelo ambiente só na primeira subida, recuperado por um comando na máquina; senha, depois passkeys nesta rodada; só por convite, acompanhado; o admin sem acesso implícito às pastas; várias contas; tokens de acesso pessoais por pasta; o app desktop entrando pelo navegador nesta rodada; itens 2, 7, 9, 10, 11 aceitos como escritos |
| [0075](0075-server-packaging-and-storage.md) | O empacotamento e o armazenamento do servidor: como se instala, onde ficam os dados, quanto cada pasta ocupa | Aceito (2026-10-09), com o 0073; decididos: imagem Docker, compose para CasaOS/ZimaOS e pacotes com systemd; um diretório de dados local e uma raiz de pastas que pode ser um NAS; o espaço por pasta mostrado, limites depois; sync por pasta, desligado por padrão; ARM64 agora; a imagem no registro do GitHub; `verso serve` um subcomando do `verso`; o id de uma pasta; symlinks que saem de uma pasta recusados num servidor; o servidor avisa o admin de uma versão nova e nunca se atualiza sozinho; o `VERSO_UPDATE_CHECK` aceito como construído (2026-10-12) |
| [0076](0076-the-window-on-every-screen.md) | A janela em toda tela: celular, tablet, um painel estreito | Aceito (2026-10-09), todas as recomendações, construído nesta rodada antes de a janela do servidor sair: a moldura pela tela e o painel pela largura dele, um painel por vez no celular, o grafo, um cartão para abrir um link no modo Editar, o kanban por toque, uma barra embaixo no lugar do ribbon, o teclado da tela e a barra dele, itens de menu no lugar de modificadores, leitores de tela com toque, alvos e áreas seguras, o zoom da página mantido, itens só do host por capacidade, e2e marcado nas larguras de celular e tablet; `[ABERTO]`: o conteúdo da barra do teclado, depois do uso |
| [0077](0077-the-server-administration-console-and-folder-quotas.md) | O console de administração do servidor, e cotas por pasta | Aceita (2026-10-10), todas as recomendações: a conta fica em Ajustes, a administração vira um console próprio em /admin, desenhado com as peças da janela; toda lista buscada, ordenada e paginada no servidor; cotas por pasta agora (revê o item 4 da 0075); a configuração mostrada só para leitura; decidido em 2026-10-10: cotas só por pasta (por conta quando membros criarem pastas), a configuração não editada pelo console |
| [0078](0078-universo-the-name-of-verso-as-a-server.md) | UniVerso: o nome do Verso como servidor | Aceita (2026-10-10), todas as recomendações: UniVerso é o nome do servidor auto-hospedado; o binário chamado como `universo` é o `verso serve`; os pacotes, a unidade, o usuário, os caminhos e a imagem do servidor levam o nome, acabando com o choque de `/usr/bin/verso`; os nomes da 0.7.0-beta.1 não seguem; decidido em 2026-10-10: as variáveis continuam `VERSO_*`, Ajustes › Servidores mantém o nome; revisto em 2026-10-12: escrito UniVerso, os identificadores em minúsculas |
| [0079](0079-sync-a-local-folder-with-a-server.md) | Sync: uma pasta do desktop mantida em dia com uma pasta num servidor | Aceita (2026-10-10), arquivos grandes em pedaços já: uma pasta local com uma pasta do servidor, escolhida nos ajustes dela; por arquivo, por hash contra uma base guardada fora da pasta; um registro de mudanças por pasta no servidor; o WebSocket da sessão de aparelho, sem transporte próprio; conflitos como cópia ao lado do arquivo, a versão do servidor ficando com o nome; apagamentos nunca a partir de placeholders, apagamentos em massa pausam; mudanças de nome detectadas; o primeiro sync nunca apaga; um teste de propriedade como guardrail da feature; revista em 2026-10-10: a pausa precisa de pelo menos 3 apagamentos, um apagamento vai para o `.trash/` da pasta, as duas formas Unicode de um nome são um arquivo só (Q7 da spec), o salvamento velho de um programa de fora um limite conhecido |
| [0080](0080-the-trash-with-expiry-and-restore.md) | A lixeira: o que foi apagado é visto, restaurado, e expira | Aceita (2026-10-11), escrita por Fable 5.1 a pedido do mantenedor: `.trash/` continua, o registro dela um cache fora da pasta; uma visão Lixeira na janela e no console; restaurar ao caminho original ou ao lado de um nome ocupado, um arquivo que voltou para o sync; retenção por `VERSO_TRASH_DAYS` e por pasta, a varredura confinada a `.trash/`; escritores veem e restauram, o dono esvazia; itens abertos respondidos em 2026-10-10, aceita em 2026-10-11: 30 dias, o dono pode encurtar, sem linha na árvore, mostrada e não contada (as mais antigas expirando antes além da cota), os apagamentos do sync para o `.trash/` da pasta; uma versão que a escrita de um aparelho substituiu guardada na lixeira |
| [0081](0081-sharing-between-people-on-one-universo.md) | Compartilhar entre pessoas num mesmo UniVerso: um vault, uma pasta dentro dele, leitura ou escrita | Aceita (2026-10-11), escrita por Fable 5.1 a pedido do mantenedor: um compartilhamento é uma concessão num caminho, quem recebe vê uma pasta própria e o servidor guarda uma pasta só; "Compartilhados comigo" e "Compartilhados por mim" onde quer que pastas sejam listadas; sincronizado como pasta local própria; uma sala por nota; respostas filtradas ao compartilhamento, um link para fora "não está no que foi compartilhado com você"; mudanças de nome levam o compartilhamento; a concessão mais alta que cobre; itens abertos respondidos em 2026-10-10, aceita em 2026-10-11: sem nome próprio, só o dono compartilha, sem links públicos agora, nunca dentro do vault de quem recebe, a pasta de anexos oferecida só leitura, sem documento só na primeira versão, o seletor de pastas agrupado "Neste computador / Meus / Compartilhados comigo"; depois, em ADR própria: o histórico de um arquivo |
| [0082](0082-live-co-editing-of-a-synced-folder.md) | Coedição ao vivo de uma pasta sincronizada: a nota do desktop entra na sala do servidor enquanto online | Aceita (2026-10-11), escrita por Fable 5.1 a pedido do mantenedor, a direção aprovada em sessão: a nota de uma pasta sincronizada entra na mesma sala que o navegador usa enquanto o link do sync está de pé, por esse link, pelos comandos `collab_*` e pela capacidade `collab` que o contrato já tem; a identidade e o papel da sessão de aparelho, um leitor presente e sem digitar; só o sync escreve o arquivo local enquanto a nota está ao vivo, o salvamento automático da aba sendo o salvamento da sala; edições locais não sincronizadas enviadas antes de entrar; numa queda a aba mantém o texto e salva localmente, na volta reentra na mesma sala ou passa pela comparação do sync, nada perdido; a edição de um programa de fora enviada como qualquer outra, uma cópia quando a sala se moveu; salas só para notas, a sala de um compartilhamento é a do dono; um teste de propriedade novo como guardrail; itens abertos respondidos em 2026-10-10, aceita em 2026-10-11: entrar ao abrir, ligada por padrão com um ajuste por pasta; item 12 decidido e construído em 2026-10-12: todo arquivo que a janela edita é coeditado ao vivo — qualquer arquivo de texto, uma base, um board fundido pela regra do próprio Excalidraw, o arquivo dele gravado pela sala como o conversor de uma janela o faz do estado da sala; depois, em ADR própria: fusão por bloco de edições offline |
| [0083](0083-security-hardening-of-universo.md) | Endurecimento de segurança do UniVerso: bots, força bruta, as ferramentas do host e o que vem antes do primeiro usuário de fora | Aceita (2026-10-13), escrita por Fable 5.1 a pedido do mantenedor, lida por Opus 5.5: 19 itens da revisão `docs/reference/security-review-2026-10-13.md` (nenhum achado BLOQUEANTE; 10 IMPORTANTES) — uma linha de log fixa por sign-in falho para fail2ban/CrowdSec, um teto e um aviso, uma lista de recusa de senhas, a recuperação revogando tokens, vários proxies confiáveis, uma prova recente para ações sensíveis, um ritmo REST, os limites frouxos, os cabeçalhos afirmados, retenção da auditoria, o pacote endurecido, um backup cifrado, `npm audit`, as entradas do servidor sob fuzzing, `SECURITY.md` e `security.txt`, a leitura de fora e o pentest, sem CAPTCHA, os números medidos, validação num laboratório hostil (ataques roteirizados em Docker supondo que o atacante leu o código público); uma ordem de trabalho: tudo construído nesta rodada menos o pentest de fora, condição do anúncio; decididos em 2026-10-13, todos como recomendado: os números como estão (medidos no item 18 e ajustados lá), o filtro do fail2ban no pacote e o CrowdSec na documentação, HIBP não, nenhum modo só-passkey depois de ataque, a prova recente e o pentest condições do anúncio, `preload` não, 365 dias de retenção da auditoria, `age` opcional, `security@versomd.com` sem bounty, prova de trabalho não, digitar o código do aparelho sim |
| [0084](0084-notifications-in-the-window.md) | Notificações na janela: uma mudança de estado dita uma vez, guardada numa lista, escolhida por tipo | Aceito (2026-10-14), escrito pelo Opus 5.5 a pedido do mantenedor: avisos no canto inferior direito, um ícone com a contagem de não lidas na barra de status, uma central na pilha de sobreposições, uma linha de ajuste por tipo (sync, conflitos, compartilhamento, atualizações, cota, lixeira, presença); quatro fontes novas (compartilhamento recebido, nova verificação de atualização, cota numa pasta sincronizada, lixeira expirando); o compartilhamento revogado dito como tal; decidido em 2026-10-14: a lista nesta máquina, sem sincronizar; a nova verificação a cada 24 h; os 3 dias da lixeira; "Aviso e lista" para todos os tipos; as notificações do sistema nesta rodada, no desktop e no navegador, desligadas até a pessoa ligar |
| [0087](0087-secret-blocks-hidden-from-readers.md) | Blocos secretos: um callout `[!secret]` fica na nota, e um UniVerso serve aos leitores a nota sem ele | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia, a direção decidida pelo mantenedor naquela noite: os blocos ficam no texto, os leitores recebem uma projeção em todo lugar, quem escreve vê tudo, um callout comum no Obsidian; na V1; o item 8 dela fecha a Q9 da spec (spec v0.38); decidido como recomendado: outras palavras-chave, o aninhamento com a Q5, um leitor numa nota ao vivo, "ver como leitor", o índice, a exportação |
| [0091](0091-version-history.md) | Histórico de versões: quem mudou um arquivo, quando, e trazer uma versão de volta | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1; responde ao "histórico e atribuição de uma mudança de outro membro" do 0073; decidido como recomendado: anexos, rarefação e retenção, autoria por linha, leitores, a cota, o histórico local do desktop |
| [0092](0092-the-phone-offline.md) | O celular offline: a janela servida por um UniVerso guarda pastas escolhidas e as sincroniza | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; na V1; o protocolo do sync no navegador; decidido como recomendado: anexos e o armazenamento, busca e links offline, criptografia em repouso, a lista da V1 fechando a questão do 0073 sobre o offline |
| [0095](0095-mac-notarization-and-windows-code-signing.md) | Notarização no Mac e assinatura de código no Windows, e o build para Mac Intel | Aceito (2026-10-14), todas as recomendações (*"Sim, todas"*); proposto no mesmo dia; o ADR próprio que a R3 pediu (roadmap V.11, V.21); revisa o 0051 e o 0069; Developer ID e notarização no macOS; o Azure Artifact Signing fora de alcance para o mantenedor no Brasil; decidido como recomendado: quem se inscreve e paga, a opção do Windows (SignPath recomendada), assinaturas de pacote no Linux, quando, os segredos, um build de Mac universal ou x64 separado |
| [0096](0096-this-app-is-a-server.md) | Este app é um servidor: o desktop servindo a pasta na rede local | Aceito (2026-10-15), todas as recomendações (*"vamos seguir as suas recomendações"*); na V1, onda C (roadmap V.20), não construído; o item 2 da 0073 decide a forma numa frase e nada da segurança; 18 itens `[DECIDIDO 2026-10-15]` como recomendado: desligado por padrão, só interfaces privadas, um QR de pareamento que vive 2 minutos com confirmação no notebook, o certificado numa LAN, mDNS, uma pasta que também sincroniza, os comandos do celular, Windows |
| [0097](0097-universo-found-on-the-network-and-a-bad-dns-survived.md) | O UniVerso achado na rede de casa, e um DNS ruim contornado | Aceito nos itens 1 e 7 (2026-10-16, *"Gosto de todos"*), as frases do mantenedor; os detalhes (itens 2-6 e 7a: `_verso._tcp`, o que o TXT leva incluindo `url`, o interruptor `VERSO_ANNOUNCE`, a política e os tempos do recuo de DNS, o cliente escrito à mão) decididos como construídos em 2026-10-21 (o item 8, o texto do erro, continua `[PROPOSTO]`); a exceção de `std::fs` do `resolv_conf.rs` foi ratificada; em aberto: se o compose do CasaOS/ZimaOS é entregue com rede host para a descoberta funcionar de cara; o servidor se anuncia por mDNS além do loopback, o desktop lista o que acha enquanto Ajustes › Servidores está aberto, um clique preenche o endereço e entra como digitado, nada conecta só por um anúncio; uma conexão a um servidor pergunta a cada servidor DNS do sistema quando o endereço do sistema falha, o nome TLS mantido, nunca https para http; o erro nomeia os IPs tentados |
| [0098](0098-world-and-campaign-wizard-template-bundles.md) | O assistente de projetos: uma árvore de pastas a partir de um pacote, mostrada e editável antes de ser escrita | Aceita (2026-10-20) nos itens que o mantenedor decidiu (*"15. sim, com opção de mudar"*, *"o Igor Téuri é meu amigo, ele autorizou a gente a copiar a estrutura"*); reescrita a partir do primeiro texto do Gemini de 2026-10-17, que se dizia Aceito sem aceitação; a árvore do pacote é mostrada e editável antes de qualquer escrita, cada resposta do núcleo é lida, nada é sobrescrito; o pacote Dados Críticos segue a estrutura de Igor Téuri com a autorização dele; os detalhes (pacotes guardados em `.verso/bundles/`, os ancestrais contados, `{{date:FORMATO}}`, nomes no idioma da pessoa) decididos em 2026-10-21; os pacotes são o formato dos packs (0015) |
| [0099](0099-visual-markdown-statblocks-and-cards.md) | Statblocks: um cartão a partir de um bloco `statblock`, layouts como arquivos da pasta, rolagens por sistema | Aceita (2026-10-20), o desenho proposto naquele dia (*"adorei as sugestões e melhorias e correções. pode definir uma sequencia e atuar em tudo"*); reescrita a partir do primeiro texto de 2026-10-17; um cartão vem só de um bloco `statblock` com as chaves do Fantasy Statblocks, os layouts são arquivos da pasta (`.verso/layouts/`), nenhum código num layout, as rolagens seguem o sistema pelos perfis do Rolai, os marcadores escrevem na nota, layouts embutidos só onde a licença é aberta; o editor de layouts é refeito; os detalhes (`extends:`, a insígnia de reparo, as treze famílias, duas licenciadas) decididos em 2026-10-21; em reconstrução |
| [0100](0100-visual-customization-wizard.md) | Assistente de aparência: uma prévia ao vivo em Ajustes sobre os tokens reais, perfis salvos e arquivos `.verso-theme` | Aceito (2026-10-21), reescrito sobre os tokens reais da janela com as respostas do mantenedor (o primeiro texto de 2026-10-17 se dizia Aceito sem aceitação); na V1 como uma fatia pequena (roadmap V.28); um tema pode levar o `recommendedTheme` opcional da pasta (escolha do mantenedor); nada construído |
| [0101](0101-3d-dice-physics-overlay.md) | Dados 3D: um módulo preguiçoso que só encena a queda, sobre um resultado já sorteado | Proposto; reescrito em 2026-10-21 com as respostas do mantenedor: na V1 (roadmap V.29), pedaço preguiçoso, chave desligada por padrão; **a biblioteca continua `[ABERTO]`** à espera de uma avaliação (`three`+`cannon-es` contra `@3d-dice/dice-box-threejs`); aceito e construído depois disso; nada construído |
| [0102](0102-creative-oracles-and-improvisation.md) | Oráculos e improviso: respostas graduadas, faíscas de ideias, um registro na nota | Aceita (2026-10-20) nos itens que o mantenedor decidiu (*"qual o motivo de não poder gravar na nota?"*, *"acho que deveria ser acumulativo, exceto se a pergunta for reescrita"*); reescrita a partir do primeiro texto de 2026-10-17; respostas graduadas em cinco chances, a resposta escrita na nota como um callout `[!oracle]` e acumulada, sem nunca remover uma linha que a pessoa escreveu, chances e palavras de faísca em `.verso/settings.json`, o servidor sorteando numa sala; os detalhes (o mesmo comando para todo sorteio, a migração do armazenamento do navegador, a página de ajustes, mais três estilos de chances) decididos em 2026-10-21 |
| [0103](0103-feature-presets-and-capability-flags.md) | Funcionalidades: uma chave visível para cada funcionalidade opcional, todas ligadas por padrão | Aceita (2026-10-20), o desenho proposto naquele dia (*"adorei as sugestões e melhorias e correções. pode definir uma sequencia e atuar em tudo"*); reescrita a partir das três predefinições de 2026-10-17, que o mantenedor não conseguia ler (*"não tá claro pra mim o que muda esses presets"*); uma chave visível por funcionalidade opcional nas Configurações, todas ligadas por padrão, atalhos "Tudo" e "Só escrita", a escolha da pessoa e nunca a da pasta, desligar não muda arquivo; a migração de uma predefinição antiga decidida em 2026-10-21; duas chaves com regra própria (dados 3D desligados por padrão, diagrama de dados) |
| [0105](0105-read-links-without-an-account.md) | Links de leitura sem conta: uma pasta ou uma nota de um UniVerso, abertos a quem tiver o link | Aceita (2026-10-21): item 1 em 2026-10-20 (um link de leitura no UniVerso, sem conta), o resto como recomendado em 2026-10-21 — pasta ou uma nota, o dono faz, chave do administrador desligada por padrão, validade e senha opcionais, revogar; nada construído |
| [0106](0106-structured-data-as-a-diagram.md) | Dados estruturados como diagrama: JSON e YAML desenhados como caixas para mover, recolher e seguir de volta ao texto | Aceita (2026-10-21): itens 1–3 em 2026-10-20 (visualizador nosso a partir da ideia do JSON Crack, sem `elkjs`; mover caixas e recolher ramos; JSON e YAML), o resto em 2026-10-21 — caixas em HTML sobre linhas em SVG, árvore arrumada, só leitura mais "Salvar como board", sete formatos, na V1 (roadmap V.30); nada construído |

### Dialeto, engenharia e roadmap

| # | Título | Status |
|---|---|---|
| [0029](0029-guardrails-in-ci.md) | Guardrails no CI antes da primeira linha de lógica de produto | Aceito; três exceções de `std::fs` ratificadas (2026-09-29); os registros provisórios de 2026-09-22 ratificados, e o teste com cliente de sync uma checagem manual que não trava nada (2026-10-12) |
| [0030](0030-base-dialect-obsidian-compatible.md) | Dialeto base compatível com o Obsidian; o Verso estende, nunca contradiz | Aceito |
| [0031](0031-fixtures-as-contract.md) | Fixtures são o contrato de comportamento entre mantenedor e IA | Aceito |
| [0032](0032-author-and-reviewer-roles.md) | Papéis: a IA escreve, o mantenedor revisa comportamento | Aceito |
| [0033](0033-pr-workflow.md) | Fluxo de PR | Aceito |
| [0034](0034-roadmap-in-phases.md) | Roadmap em três fases com portões de saída verificáveis | Aceito; uma Fase 3 acrescentada pelo 0073, e sync e mobile fora da lista do ponto 4 (2026-10-09) |
| [0035](0035-cross-cutting-requirements.md) | Requisitos transversais: pt-BR e EN, acessibilidade, benchmark | Aceito |
| [0036](0036-tabletop-rpg-support.md) | Suporte especial a RPG de mesa | Aceito (intenção) |
| [0049](0049-phase-2-scope-widened.md) | Escopo da Fase 2 ampliado a pedido do mantenedor | Aceito; nenhum menu próprio do Dock por enquanto (decidido em 2026-10-07) |
| [0051](0051-development-flow-and-releases.md) | Fluxo de desenvolvimento, versões e releases | Aceito |
| [0058](0058-demo-vault-as-tutorial.md) | O cofre de exemplo é o tutorial do produto, mantido a cada feature | Aceito (2026-10-01; revisado no mesmo dia: o roteiro roda por máquina no harness do navegador); o cofre de exemplo em inglês antes da V1 (decidido em 2026-10-21) |

### Decisões técnicas em aberto

| # | Título | Quando decidir |
|---|---|---|
| [0037](0037-base-parser.md) | Parser base do `verso-dialect`: `pulldown-cmark`, `comrak` como fallback | Aceito |
| [0038](0038-ts-type-generation.md) | Geração de tipos TypeScript a partir do Rust: `specta` com `tauri-specta` | Aceito |
| [0039](0039-performance-targets.md) | Metas de performance | Após a primeira linha de base |
| [0040](0040-board-persistence.md) | Persistência do board | Aceito (2026-09-30), pelo 0057 |

### Questões abertas levantadas na revisão da Fase 0

Fonte: [`../review/phase-0.md`](../review/phase-0.md). Cada uma começou sem
decisão e registra o que precisava ser respondido e quando; a última coluna diz
onde cada uma está.

| # | Título | Quando decidir |
|---|---|---|
| [0044](0044-verso-fs-semantics.md) | Semântica de `verso-fs`: symlinks, handles opacos, caminhos ignorados | Symlinks e caminhos ignorados: Aceito (2026-09-22); handles: aceitos como construídos para a Fase 2 (2026-09-24), reabertos antes que qualquer coisa fora das views do próprio app ganhe acesso a arquivos, respondidos para o `verso serve` em 2026-10-09 (a sessão e o papel dela são a capacidade de acesso); symlinks num servidor: recusados quando saem da pasta (2026-10-09); o watcher: Aceito (2026-09-24); caminhos ignorados revistos em 2026-09-29 — a lista embutida e o `.gitignore`, atrás de ajustes — Aceito; num servidor, um symlink pendente cujo alvo está dentro da pasta tratado como arquivo novo dentro dela (4ffe8a9), confirmado pelo mantenedor em 2026-10-12 |
| [0045](0045-server-and-mcp-security.md) | Segurança do servidor, do MCP e do contrato | MCP: Aceito; contrato: aceito como foi construído para a Fase 2, `[ABERTO]` até um servidor entrar em escopo, respondido em 2026-10-09 pelo item 11 do 0074; servidor: respondido em 2026-10-09 pelo 0073 e pelo 0074; o MCP pela rede `[ABERTO]` |
| [0046](0046-index-location-lifecycle-tokenizer.md) | Índice: localização, ciclo de vida e tokenizador | Aceito (2026-09-22) |
| [0047](0047-plugin-api-open-questions.md) | Questões abertas da API de plugin | Antes de desenhar a API (depois da Fase 2) |
| [0048](0048-file-operations-in-ui.md) | Operações de arquivo na UI: renomear, criar, excluir, mover | Aceito (2026-09-23) |

## Itens em aberto que não viraram ADR

Três itens de dialeto do §17 vivem em [`../spec/dialect.md`](../spec/dialect.md),
onde o comportamento é especificado: sintaxe de relação tipada (item 6, decidida
em 2026-09-30 como a Q10, com o [0057](0057-board-json-canvas.md)), formato
e localização dos schemas (item 7, decidido em 2026-09-24 como a Q11, com o
[0052](0052-typed-note.md)) e sintaxe de visibilidade por bloco (item 8, decidido em 2026-10-14 como
Q9, com o [0087](0087-secret-blocks-hidden-from-readers.md)).
As lacunas de parsing (Q1–Q8, Q12–Q26) também vivem lá.

A verificação de disponibilidade do nome (item 2) está registrada em
[0004](0004-project-name-verso.md).

## Como escrever um ADR novo

1. Numerar em sequência: `NNNN-title-in-kebab-case.md`.
2. Usar as cinco seções, nesta ordem, sem inventar outras.
3. Citar a fonte no cabeçalho (`docs/BRIEFING.md` §X, PR, issue, ou a revisão
   que o originou).
4. Em "Alternativas descartadas", registrar apenas alternativas que foram de
   fato consideradas. Sem nenhuma: escrever "Nenhuma registrada".
5. ADR não é editado para mudar de ideia. Um ADR novo supersede o anterior, e o
   anterior ganha uma linha apontando para o novo.

## Como alterar um ADR existente

Três casos, com tratamentos diferentes:

| Caso | O que fazer |
|---|---|
| Correção ou delimitação que **não muda a decisão** (erro de citação, escopo que faltava dizer, consequência descoberta depois) | Editar no lugar e acrescentar uma linha `Revisões:` no cabeçalho, com data e origem (PR ou revisão) |
| **Mudar** uma decisão Aceita | ADR novo que supersede; o antigo ganha a linha apontando para o novo e não é editado além disso |
| **Fechar** um `[ABERTO]` ou promover um Proposto | Editar a seção Decisão e o Status no lugar, citando o commit ou PR em que o mantenedor decidiu. Um `[ABERTO]` não tem decisão a superseder; a promoção de Proposto é a confirmação do texto que já estava lá |

Só o mantenedor faz o segundo e o terceiro caso. O primeiro pode ser feito pela
IA, e é achado de revisão se disfarçar mudança de decisão de correção.
