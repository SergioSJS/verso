# ADR 0075 — O empacotamento e o armazenamento do servidor: como é instalado, onde moram os dados, o que cada pasta ocupa

- Data: 2026-10-09
- Fonte: o mantenedor, em sessão em 2026-10-09: *"a imagem que a gente
  gerar para ser o servidor … que seja fácil fazer deploy num ZimaOS,
  CasaOS ou em qualquer cloud que a pessoa quiser. e também seja possível
  instalar direto às vezes o dispositivo é pequeno então não dá para usar
  docker … deveria ser possível ter uma variável de ambiente onde aponte
  onde vão ficar os dados e com isso quem estiver auto-hospedando pode
  apontar para um NAS ou diretório diferente … e também tem um indicativo
  de quanto de espaço aquele vault, aquela pasta aberta está ocupando … e
  nem todo vault vai ser sincronizado"*; depois as respostas dele às opções
  (Status). Escrito pela Opus 5.5; a ser lido pela Fable 5.1
  ([0032](0032-author-and-reviewer-roles.md)) antes de ser aceito.
- Relacionados: [0073](0073-self-hosted-server-first.md) (o servidor; as
  Consequências dele deixam as plataformas da imagem Docker e o caminho de
  atualização `[ABERTO]`; item 10, sync pelo servidor),
  [0074](0074-accounts-and-access-on-the-server.md) (contas; a página de
  admin que mostra o que cada conta ocupa), [0071](0071-linux-port.md)
  (o build Linux no Ubuntu 22.04, ARM64 esperando um repositório público;
  a varredura a cada 30 segundos quando o sistema não observa mais),
  [0044](0044-verso-fs-semantics.md) (o watcher; links simbólicos),
  [0011](0011-config-outside-tree-index-as-cache.md) (o índice e a
  configuração fora da pasta), [0012](0012-files-are-source-of-truth.md),
  [0051](0051-development-flow-and-releases.md) (o workflow de release),
  [0055](0055-in-app-updater.md) (atualizações assinadas).
- Status no briefing: ausente; aceito junto com o 0073.

## Contexto

O servidor do [0073](0073-self-hosted-server-first.md) é o core sem
janela: sem WebKit, sem tela, um binário do tamanho da linha de comando
`verso` e não do app. Quem o roda varia: um servidor de casa com loja de
apps (CasaOS, ZimaOS, Unraid, TrueNAS), uma máquina virtual em qualquer
cloud, um Raspberry Pi ou uma caixinha onde o Docker é uma camada a mais.
As notas podem ficar no disco da própria máquina ou num NAS montado pela
rede.

Dois fatos decidem para onde os dados vão. O servidor guarda bancos
SQLite — as contas do [0074](0074-accounts-and-access-on-the-server.md),
as sessões, o log de auditoria, o índice — e a própria documentação do
SQLite avisa que os locks dele não são confiáveis em sistemas de arquivos
de rede (NFS, SMB), onde um banco pode se corromper. E numa montagem de
rede o sistema operacional não avisa ninguém quando outra máquina muda um
arquivo: o watcher não vê nada, como não vê nada quando o Linux fica sem
watches, o caso que o [0071](0071-linux-port.md) já responde com uma
varredura a cada 30 segundos.

O CasaOS e o ZimaOS instalam apps a partir de um `docker-compose.yml` com
metadados próprios (um bloco `x-casaos`: título, ícone, as portas e os
volumes que o usuário escolhe); toda cloud roda uma imagem Docker; um
dispositivo pequeno aceita um binário e um arquivo de serviço.

## Decisão

Proposta; decidida em suas partes pelo mantenedor em 2026-10-09 (Status).

1. **Um serviço, um binário.** O servidor é o `verso serve`
   ([0073](0073-self-hosted-server-first.md) item 2) num binário sem a
   janela, construído a partir das mesmas crates da linha de comando; qual
   crate o abriga segue o `[ABERTO]` do 0073 sobre onde mora a tabela de
   sessões.
2. **Três formas de instalar, a partir desse binário** — decidido:
   - uma **imagem Docker** para amd64 e arm64, rodando com um usuário
     próprio, nunca root, com os dois diretórios do item 3 como volumes;
   - um **`docker-compose.yml`** com os metadados `x-casaos`, para as
     lojas de apps do CasaOS e do ZimaOS, que serve também a qualquer host
     que aceite um arquivo compose;
   - um **arquivo compactado e pacotes `.deb`/`.rpm` com uma unit do
     systemd**, para uma máquina sem Docker: o serviço roda como um usuário
     `verso`, com as configurações num arquivo de ambiente que a unit lê.
   O ARM64 é construído por compilação cruzada nos runners x86-64, não num
   runner ARM, o que o mantém possível enquanto o repositório é privado —
   servidores de casa e caixas NAS são muitas vezes ARM. Se o ARM64 do
   servidor é construído agora ou espera o repositório público junto com o
   do desktop ([0071](0071-linux-port.md)) fica `[ABERTO]` para o
   mantenedor.
3. **Dois diretórios, duas variáveis** — decidido:
   - `VERSO_DATA_DIR`: as contas, as sessões, o log de auditoria, os
     índices. **Um disco local**: na subida o servidor lê o sistema de
     arquivos sob ele, e em NFS, SMB/CIFS ou sshfs diz no log e na página
     de admin que os bancos podem se corromper ali.
   - `VERSO_FOLDERS_DIR`: a raiz sob a qual moram as pastas de notas — que
     **pode** ser um NAS. O admin cria ou abre pastas só sob ela, e um
     caminho que sai dela é recusado, o mesmo confinamento que o
     `verso-fs` aplica dentro de uma pasta. Num sistema de arquivos de rede
     o servidor observa por varredura (a cada 30 segundos, como o 0071) em
     vez de esperar eventos que nunca chegam, e diz isso na página da
     pasta.
   Fazer backup do servidor é fazer backup desses dois diretórios, e a
   documentação diz isso com essas palavras.
4. **O espaço que cada pasta ocupa é mostrado; limites vêm depois** —
   decidido: para cada pasta, o total, quanto é nota e quanto é anexo, o
   número de arquivos e o tamanho do índice dela, contados durante o
   percurso que o índice já faz (nenhum percurso próprio). Mostrado nos
   ajustes da pasta — no desktop também, para uma pasta local — na página
   de admin, por pasta e por conta (com quantas pastas cada conta tem,
   [0074](0074-accounts-and-access-on-the-server.md) item 4), e pela linha
   de comando. Um limite por pasta ou por conta, definido pelo admin, vem
   quando membros além do dono enviarem arquivos
   ([0073](0073-self-hosted-server-first.md) item 6), não antes.
5. **O sync é escolhido pasta a pasta, desligado por padrão** — decidido:
   no desktop cada pasta é "só neste computador" ou "sincronizada com o
   servidor X"; no servidor uma pasta existe só lá, online, a menos que um
   desktop a sincronize. Antes de o sync ser ligado, o espaço da pasta
   (item 4) é mostrado. Uma lista do que uma pasta não sincroniza (anexos
   grandes, digamos) vem depois do próprio sync
   ([0073](0073-self-hosted-server-first.md) item 10).
6. **Configuração por ambiente, a mesma nas três formas.** As variáveis do
   [0074](0074-accounts-and-access-on-the-server.md) e as duas acima; nada
   que um host precise editar dentro da imagem. Um valor dado como
   `NAME_FILE` é lido daquele arquivo (secrets do Docker e do Kubernetes).

## Consequências

- O workflow de release ganha um job do servidor: o binário para amd64 (e
  arm64 conforme o item 2), a imagem, o arquivo compose e os pacotes,
  assinados como os apps são ([0055](0055-in-app-updater.md)). Onde a
  imagem é publicada enquanto o repositório é privado (o registro do
  GitHub pede login para baixar um pacote privado) fica `[ABERTO]`.
- O `verso-fs` aprende a distinguir um sistema de arquivos de rede de um
  local, para a varredura do item 3; o `verso-index` informa os tamanhos do
  item 4 a partir do percurso que já faz.
- A documentação ganha uma página por forma de instalação, os dois
  diretórios e o backup deles, e o aviso sobre bancos num NAS.
- A entrada na loja de apps do CasaOS/ZimaOS é uma submissão aos
  repositórios deles, feita quando o servidor for anunciado
  ([0073](0073-self-hosted-server-first.md), o modelo de ameaças primeiro).

## Alternativas descartadas

- **Só Docker** (levantada pelo autor): o mantenedor nomeou dispositivos
  pequenos onde o Docker não cabe.
- **Um diretório para tudo** (levantada pelo autor): um host que o aponta
  para um NAS põe os bancos na rede.
- **Sync ligado para toda pasta, desligado uma a uma** (levantada pelo
  autor): o mantenedor: nem toda pasta é sincronizada.
- **Limites por pasta agora** (levantada pelo autor): antes de outros
  enviarem arquivos, um limite só trava o dono.

## Status

Proposto, decidido em suas partes pelo mantenedor em 2026-10-09, nas
respostas dele: três formas de instalar (item 2, "B"); dois diretórios
(item 3, "B"); o espaço mostrado agora e limites depois (item 4, "A agora
B depois"); sync por pasta, desligado por padrão (item 5, "A"). A ser lido
pela Fable 5.1 e aceito com o [0073](0073-self-hosted-server-first.md).
`[ABERTO]`: o ARM64 do servidor agora ou junto com o do desktop; onde a
imagem é publicada enquanto o repositório é privado; o caminho de
atualização de um servidor ([0073](0073-self-hosted-server-first.md)).
