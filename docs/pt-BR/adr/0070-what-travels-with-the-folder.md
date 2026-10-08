# ADR 0070 — O que viaja com a pasta: três camadas de configuração, e nomes que todo sistema guarda

- Data: 2026-10-08
- Fonte: o mantenedor, em sessão: "como teremos sincronizadores entre
  plataformas. Temos que levar isso em conta. Se a config ficar fora da
  pasta, não vai sincronizar e a barra tem que funcionar de qualquer
  jeito"; depois, diante de três passos — observar o Obsidian, escrever este
  ADR, recusar em todo sistema os nomes que o Windows não guarda —, "Faça os
  3".
- Relacionados: [0010](0010-folder-is-the-unit-no-vault.md) (sem vault),
  [0011](0011-config-outside-tree-index-as-cache.md) (configuração fora da
  árvore, o índice um cache), [0021](0021-sync-automerge-layered-config.md)
  (configuração em camadas, Proposto), [0052](0052-typed-note.md) (schemas
  na pasta), [0062](0062-focuses.md) (focos em `.space/waypoints.json`),
  [0069](0069-windows-port.md) (o porte para Windows, o `[OPEN]` do
  separador).
- Status no briefing: não presente

## Contexto

Uma pasta de notas é feita para ser sincronizada entre máquinas e sistemas —
iCloud, OneDrive, Syncthing, git — e aberta no Verso no macOS, no Windows e
no Linux. O ADR 0011 pôs a configuração fora da pasta, pela chave do caminho
da pasta, e registrou o custo: "uma pasta sincronizada entre máquinas não
leva a sua configuração junto".

O que vive fora da pasta em 2026-10-08:

| Onde | O quê | De quem |
|---|---|---|
| o diretório de configuração (`~/Library/Application Support/verso`, `%APPDATA%\verso`) | o índice (um cache), o arquivo lateral dele, o log | desta máquina |
| o armazenamento do web view | a largura da barra lateral, quais painéis estão abertos | desta máquina |
| o armazenamento do web view | as configurações (idioma, tema, …, e também os caminhos ignorados, o nome da nota de pasta, as origens de embed aprovadas) | desta máquina, embora algumas sejam da pasta |
| o armazenamento do web view, pela chave do **caminho absoluto** da pasta | os favoritos da pasta | desta máquina; perdidos mesmo onde o armazenamento sincronizasse, porque o caminho muda |

Já dentro da pasta: as notas, os boards, os schemas
([0052](0052-typed-note.md), a escolha do mantenedor pela pasta em vez do
diretório de configuração), a ordem manual de uma pasta na nota da pasta, os
focos em `.space/waypoints.json` ([0062](0062-focuses.md)).

Observado no Obsidian em 2026-10-08
([obsidian-paths-names-2026-10-08.md](../reference/obsidian-paths-names-2026-10-08.md)):
uma `\` num link é parte do nome, não separador; no macOS o Obsidian recusa
só `\ / :` num nome e cria `? * | " < >`, `CON`, ponto ou espaço no fim —
nomes que uma pasta sincronizada com o Windows não consegue levar.

## Decisão

1. **Três camadas de configuração** (proposto):
   - **as da máquina**, nunca sincronizadas: o índice, o arquivo lateral
     dele, o log, o layout da janela. Onde estão hoje (ADR 0011 sem
     mudança).
   - **as da pasta**, sincronizadas com ela porque são sobre ela: o que
     qualquer pessoa que abrir a pasta deve encontrar igual. Vivem dentro
     da pasta, num diretório oculto escrito só quando uma delas muda pela
     primeira vez — nenhuma pasta ganha um diretório que não pediu (ADR
     0011, regra 1 mantida) —, em arquivos escritos pela escrita atômica do
     `verso-fs` (invariantes 9 e 11), todo caminho neles relativo à pasta e
     com `/`, nenhum absoluto (invariante 4).
   - **as da pessoa**, que seguem o usuário entre pastas (idioma, tema,
     teclas): ficam na máquina até a sincronização em camadas
     ([0021](0021-sync-automerge-layered-config.md)) lhes dar um lugar.
2. **A camada da pasta, conteúdo proposto**: os favoritos, os caminhos
   ignorados, o nome da nota de pasta. Na primeira abertura de uma pasta
   depois disso, o que a máquina guardava dela vai para a pasta, uma vez.
3. **Nomes que todo sistema guarda. Decidido pelo mantenedor em
   2026-10-08**: uma nota, pasta ou arquivo que o Verso **cria ou renomeia**
   recebe um nome que macOS, Windows e Linux guardam. Recusados em todo
   sistema: um nome de dispositivo (`CON`, `PRN`, `AUX`, `NUL`,
   `COM0`–`COM9`, `LPT0`–`LPT9`, com ou sem extensão), ponto ou espaço no
   fim, `:`, `* " < > ? |`, um caractere de controle. Uma entrada que já
   existe nunca é recusada: é do usuário, abre, é lida e escrita como
   antes; só um nome novo é checado. No Windows, onde esses nomes nem
   existem, todo pedido é checado (ADR 0069).
4. **O separador**: o que o Verso escreve usa `/`, que o Obsidian resolve em
   todo sistema (ADR 0069, item 9). Uma `\` dentro de um link é parte do
   nome, como o Obsidian a lê no macOS: nunca vira `/`. As palavras do
   mantenedor acima apontam para `/`; fechar o `[OPEN]` do ADR 0069 cabe a
   ele.

## Consequências

- Uma pasta sincronizada com outra máquina abre com os seus favoritos, os
  seus caminhos ignorados e o nome da sua nota de pasta; a largura da barra
  lateral e o idioma continuam de cada máquina.
- Duas máquinas mudando uma configuração da pasta ao mesmo tempo deixam para
  a ferramenta de sincronização juntar o arquivo, ou guardar uma cópia de
  conflito; a checagem da escrita atômica (invariante 11) se recusa a
  escrever por cima de uma versão que não leu. Juntar é trabalho da
  sincronização em camadas ([0021](0021-sync-automerge-layered-config.md)).
- Se o Obsidian lista um diretório oculto do Verso no explorador de arquivos
  dele é algo a observar antes de escolher o nome (ADR 0009).
- Um nome que o Obsidian aceita no macOS pode ser recusado pelo Verso: mais
  estrito, nunca contrário — nenhum nome existente muda de sentido
  (invariante 12).
- Os campos de nova nota e de renomear da interface dizem por que um nome é
  recusado.

## Alternativas descartadas

- **Tudo na máquina, como hoje**: uma pasta sincronizada chega sem os seus
  favoritos e caminhos ignorados; os favoritos se perdem até na mesma
  máquina quando a pasta muda de lugar, porque a chave deles é o caminho.
- **O diretório `.obsidian/` do Obsidian**: o Verso escrevendo a
  configuração do próprio Obsidian arrisca contradizê-lo, e esses formatos
  não são públicos (ADR 0009, ADR 0030).
- **No frontmatter das notas**: o estado do app reescreveria as notas do
  usuário (invariante 8).
- **Recusar os nomes do Windows só no Windows**: um nome criado num Mac
  depois quebra a sincronização da pasta com o Windows.

## Status

Proposto. Decidido pelo mantenedor em 2026-10-08: o item 3 (nomes que todo
sistema guarda, para o que o Verso cria ou renomeia). Proposto: os itens 1,
2 e 4. `[OPEN]`: o nome do diretório oculto; se as origens de embed
aprovadas são da pasta ou da pessoa (uma permissão dada a um site, não uma
propriedade das notas); a pergunta do separador do ADR 0069, que continua
sendo do mantenedor fechar.
