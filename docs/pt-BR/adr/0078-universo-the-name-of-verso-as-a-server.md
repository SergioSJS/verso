# ADR 0078 — Universo: o nome do Verso como servidor

- Data: 2026-10-10
- Fonte: o mantenedor, em sessão em 2026-10-10, sobre o choque de
  `/usr/bin/verso` entre os pacotes do app desktop e os do servidor: *"eu
  tinha até a proposta de chamar de uni-verso o verso pra rodar em servidor
  e syncar coisas, fica um trocadilho legal"*. Escrito por Opus 5.5; a ser
  lido por Fable 5.1 ([0032](0032-author-and-reviewer-roles.md)) antes de
  ser aceito.
- Relacionados: [0075](0075-server-packaging-and-storage.md) (itens 1 e 2:
  um binário, três formas de instalar; a imagem no registro do GitHub),
  [0073](0073-self-hosted-server-first.md) (o servidor; item 10, o sync
  por ele), [0004](0004-project-name-verso.md) (o nome do produto),
  [0071](0071-linux-port.md) (os `.deb`/`.rpm` do app desktop).
- Status no briefing: ausente; ao ser aceito, ao lado do nome do produto.

## Contexto

O servidor é o `verso serve`, um subcomando do binário `verso` (item 1 da
0075). Os `.deb` e `.rpm` dele instalam esse binário como `/usr/bin/verso`;
o pacote de produção do app desktop também (a linha de comando ao lado do
app). Numa mesma máquina Linux o segundo pacote é recusado. As versões de
teste não se chocam (o beta do desktop instala `verso-beta`), então a
0.7.0-beta.1 saiu sem o problema aparecer; a primeira versão de produção o
mostraria.

O mantenedor tinha um nome para o Verso como servidor, nunca escrito até
agora: **Universo** — *uni-verso*, os versos juntos; o servidor onde as
pastas de várias pessoas se encontram e, com o sync (item 10 da 0073), onde
os aparelhos de uma pessoa se encontram.

## Decisão

Aceita (2026-10-10, Status).

1. **Universo é o nome do Verso como servidor.** O app continua Verso; o
   servidor auto-hospedado — hoje o `verso serve`, amanhã o centro por onde
   o sync passa — é o Universo. Uma base de código, um binário (item 1 da
   0075): o nome é o empacotamento do servidor e como se fala dele.
2. **Chamado como `universo`, o binário é o servidor.** O binário olha o
   nome com que foi iniciado: `universo` roda o que o `verso serve` roda, e
   `universo admin reset <e-mail>` o que o `verso serve admin reset` faz;
   `universo --web`, `universo --help`, `universo --version` como se espera.
   O `verso serve` continua funcionando, sem mudança.
3. **Os artefatos do servidor levam o nome**:
   - os pacotes `universo-<versão>-<arq>.deb` e
     `universo-<versão>-<arq>.rpm` (o padrão de nomes da release), que
     instalam o binário como
     `/usr/bin/universo`, a unidade `universo.service`, o arquivo de
     ambiente `/etc/universo/universo.env`, o usuário `universo`, os dados
     em `/var/lib/universo` — nenhum caminho que o pacote do app desktop
     instala;
   - o arquivo `universo-<versão>-<arq>.tar.gz`;
   - a imagem `ghcr.io/sergiosjs/universo`, o serviço do arquivo compose e
     o cartão do CasaOS com o nome Universo.
4. **As variáveis continuam `VERSO_*`.** São a configuração do servidor e
   já estão documentadas; renomeá-las mudaria toda instalação sem ganho.
   Recomendado; `[ABERTO]` para o mantenedor.
5. **O que uma pessoa vê.** As páginas que o servidor serve antes da janela
   — entrar, um convite, uma senha nova — e o console de administração
   ([0077](0077-the-server-administration-console-and-folder-quotas.md))
   dizem "Universo" ao lado da marca do Verso ("Universo · um servidor
   Verso"); a janela em si é o Verso, onde quer que seja servida. No app
   desktop, Ajustes › Servidores tem o nome do que conecta: `[ABERTO]` se
   vira "Universo" ou continua "Servidores". Recomendado: "Servidores", com
   "Universo" na descrição, já que uma pessoa se conecta a um servidor que
   alguém roda, pelo endereço.
6. **Os nomes da 0.7.0-beta.1 não seguem.** A imagem
   `ghcr.io/sergiosjs/verso` e os pacotes `verso-server-*` param na
   0.7.0-beta.1; a próxima versão publica os do Universo. Só o mantenedor
   roda um servidor por enquanto, então nenhuma migração é distribuída; a
   página de instalação diz como mover um diretório de dados de
   `/var/lib/verso` para `/var/lib/universo` numa instalação por pacote.

## Consequências

- O `verso-cli` ganha o despacho pelo nome com que foi iniciado; o workflow
  de release, `packaging/server/*`, o arquivo compose, as páginas de
  instalação (os dois idiomas) e o modelo de ameaças mudam de nome; a nota
  do cofre de exemplo sobre o servidor diz Universo.
- O `.deb`/`.rpm` de produção do app desktop e o Universo se instalam na
  mesma máquina.
- Um domínio ou um logo próprio do Universo não são decididos aqui.

## Alternativas descartadas

- **Um conflito declarado entre os dois pacotes** (`conflicts:` do nfpm),
  com o `verso` do desktop usado para servir numa máquina com os dois —
  proposto em sessão em 2026-10-10; o mantenedor respondeu com o nome em
  vez disso.

## Status

**Aceita em 2026-10-10** pelo mantenedor, com todas as recomendações, em
sessão: *"com exceção do 6, pode seguir o recomendado, o 6 pode já implementar"*. Item 4: as variáveis continuam `VERSO_*`. Item 5:
Ajustes › Servidores mantém o nome, com Universo na descrição. A ser lida
por Fable 5.1 com o código da rodada.
