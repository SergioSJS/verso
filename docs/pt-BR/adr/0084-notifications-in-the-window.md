# ADR 0084 — Notificações na janela: uma mudança de estado dita uma vez, guardada numa lista, escolhida por tipo

- Data: 2026-10-14
- Origem: o mantenedor, em sessão em 2026-10-14. Testou o beta instalado
  com o servidor fora do ar e viu que nada era dito
  (*"Por que diabos não tem uma mensagem falando que o servidor não é
  encontrado?"*). A v0.8.2-beta.1 corrigiu esse caso onde a pessoa agiu.
  Depois pediu notificações no app, na frente do resto do trabalho
  (*"acho que vai ter que passar na frente"*), sobre uma proposta feita em
  sessão: avisos num canto, uma vez por mudança de estado; um ícone com
  contagem na barra de status e uma central de notificações; ajustes por
  categoria; os eventos do item 7. Em 2026-10-14 escolheu esta como a
  primeira missão da rodada seguinte. Escrito pelo Opus 5.5.
- Revisões: 2026-10-22 — T.6 da lista da tarde de 2026-10-21, respondida em
  2026-10-22. Opção A: no celular o aviso "fulano entrou na nota" aparece
  **embaixo, acima da barra do teclado**, não no alto sobre a primeira linha
  do editor e do board (**em construção**). A pergunta dele, *"Não faz mais
  sentido falar que entrou no cofre em vez de nota?"*, está `[ABERTO]`: a
  presença é por nota hoje (a linha Presença do item 7), e uma presença no
  nível da pasta vem com a tabela da
  [0107](0107-the-table-a-shared-roll-and-chat-log.md); nada é decidido aqui.
- Relacionados: [0026](0026-core-ui-contract-inviolable-rules.md) (regra
  2, a janela não supõe de que lado do fio o core está; regra 3, tipos
  gerados do Rust), [0035](0035-cross-cutting-requirements.md) (pt-BR e
  EN, acessibilidade desde o início), [0038](0038-ts-type-generation.md)
  (payloads tipados, nomes de evento sem tipo),
  [0055](0055-in-app-updater.md) (a verificação ao abrir, instalar só com
  um clique), [0058](0058-demo-vault-as-tutorial.md) (o tutorial acompanha
  toda mudança visível), [0065](0065-a-folder-per-window.md) (uma pasta
  por janela), [0070](0070-what-travels-with-the-folder.md) (a camada de
  ajustes da pessoa), [0076](0076-the-window-on-every-screen.md) (item 6,
  sem barra de status no celular),
  [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (item 5, o aviso em 90 %), [0079](0079-sync-a-local-folder-with-a-server.md)
  (item 13, o estado do sync na barra de status, nada em silêncio),
  [0080](0080-the-trash-with-expiry-and-restore.md) (item 3, a retenção),
  [0081](0081-sharing-between-people-on-one-universo.md) (item 8, uma
  revogação dita na hora), [0082](0082-live-co-editing-of-a-synced-folder.md)
  (item 14, o estado ao vivo em palavras).

## Contexto

A janela tem muitas maneiras de dizer algo e nenhuma noção de
notificação. Lido em `f16353bf`:

- **A linha de status** (`#status`, `role="status"`) é escrita por cerca
  de 150 lugares. A última escrita vence: não há histórico, nem
  prioridade, nem para onde voltar.
- **Um aviso flutuante** (`dom.ts` `showToast`) fica no topo, ao centro,
  no mesmo lugar e com a mesma classe do banner de atualização, um por
  vez. Três chamadas o usam: um compartilhamento revogado, mudanças de
  fora atrasadas e a importação da demonstração.
- **Banners onde a coisa está**, que estão certos como estão: os banners
  de conflito e de arquivo sumido numa nota, o aviso de reescrita de
  links, a caixa "servidor fora de alcance" ao lado do botão que falhou
  (v0.8.2-beta.1), e a barra de avisos própria da janela web (offline,
  reconectado, sessão encerrada, pasta sumida, nova versão).
- **Um sinal de não lido**: o ponto no botão de relatar quando um erro
  foi registrado.
- **"Uma vez" é decidido de quatro jeitos**: `sessionStorage` por versão
  para o banner de atualização, um limite de 10 minutos em memória para o
  aviso de cota, um limite por minuto para a linha de log de alcance, e
  nenhum para o resto.

Dos eventos que o mantenedor listou, quatro já chegam à janela: um sync
que falha ou volta, um conflito, um compartilhamento revogado e alguém
entrando na nota. Quatro não chegam:

- um compartilhamento **recebido** (quem recebe só fica sabendo quando
  uma lista é buscada de novo);
- uma **atualização** encontrada depois da verificação ao abrir (não há
  nova verificação);
- **cota** em 90 % numa pasta **local sincronizada** (só é enviada a
  janelas numa pasta do servidor);
- itens da **lixeira** prestes a expirar (as varreduras só registram no
  log).

Cada evento que chega é dito de um jeito: uns na linha de status, outros
num banner, outros num aviso flutuante.

Uma mensagem está errada. Uma janela do desktop numa pasta do servidor
cujo compartilhamento foi revogado diz *"A conexão com o servidor caiu;
tentando de novo…"*: `dialogs/servers.ts` só distingue o fim da sessão,
então a revogação da pasta cai em "conexão caiu".

## Decisão

Aceito (2026-10-14). Os itens em aberto foram decididos pelo mantenedor
no mesmo dia; cada um está marcado no lugar (Status).

1. **O que é uma notificação.** Uma notificação é uma mudança de estado
   que a pessoa não causou naquele momento, ou que dura além do momento:
   o sync falhou, chegou um compartilhamento, saiu uma atualização. O
   retorno de uma ação fica onde a pessoa agiu, como hoje: a linha de
   status para um salvamento, a caixa "fora de alcance" ao lado do botão,
   o banner de conflito na nota. As notificações somam-se a esse retorno
   e não substituem nada dele. A barra de status continua dizendo o
   estado do sync ([0079](0079-sync-a-local-folder-with-a-server.md) item
   13), e o estado ao vivo continua dizendo quem está na nota
   ([0082](0082-live-co-editing-of-a-synced-folder.md) item 14).

2. **Um jeito só de levantar uma.** Um único módulo da janela levanta
   notificações. Cada uma tem:
   - um `kind` (item 7);
   - uma `key` que nomeia o estado que relata, por exemplo
     `sync:<pasta>` ou `update:<versão>`;
   - um nível: informação, sucesso, aviso ou erro;
   - um título e uma frase na língua da pessoa;
   - as ações que oferece;
   - a hora;
   - a pasta a que se refere.

   Uma notificação é levantada **uma vez por mudança do estado da sua
   chave**. Se chega uma mais nova para a mesma chave ("o sync voltou"
   depois de "o sync falhou"), ela toma o lugar da anterior na lista.
   Isso substitui o `sessionStorage` por versão, o limite de 10 minutos da
   cota e a ausência de regra no resto. O limite do log de alcance é do
   log e fica.

3. **O aviso flutuante.**
   - Os avisos ficam no canto inferior direito, acima da barra de status,
     no máximo três por vez, o mais novo em cima.
   - Informação e sucesso saem depois de 6 s. Um aviso ou um erro fica
     até ser fechado ou até o estado voltar.
   - Passar o ponteiro ou dar foco pelo teclado pausa o relógio.
   - Um aviso nunca toma o foco. É anunciado por uma região viva: polida
     para informação e avisos, assertiva para erros.
   - Escape fecha um aviso em foco.
   - Com `prefers-reduced-motion`, um aviso aparece sem deslizar.
   - Os avisos ficam acima da pilha de sobreposições e nunca são tornados
     inertes por ela, então a ação de um aviso é alcançável com os
     Ajustes abertos.
   - O banner de atualização vira um aviso com as duas ações ("Baixar e
     atualizar", "Ver em Ajustes"). Isso acaba com a posição
     compartilhada. As chamadas atuais de `showToast` passam a este
     módulo.

4. **O ícone da barra de status.**
   - Um ícone com a contagem de notificações não lidas fica na barra de
     status do desktop, antes do botão de relatar. É um botão. O nome
     acessível diz a contagem ("3 notificações não lidas").
   - Ativá-lo abre a central.
   - Sem nada não lido, o ícone fica sem contagem, para que a central
     sempre possa ser encontrada.
   - O ponto do botão de relatar mantém seu sentido: foi registrado um
     erro que um relato pode levar.

5. **A central.**
   - A central é um painel que entra na pilha de sobreposições (Escape
     fecha, o que está embaixo fica inerte). Também é alcançada pela
     paleta de comandos: "Notificações".
   - Lista as notificações da mais nova para a mais antiga, cada uma com
     a hora no fuso do computador, a pasta quando não é a da janela, e
     suas ações.
   - Abri-la marca tudo como lido. "Limpar" esvazia.
   - Guarda no máximo 100 entradas, nenhuma com mais de 30 dias.
   - **Onde a lista mora** `[DECIDED 2026-10-14]`:
     - No armazenamento do navegador deste computador, ou deste navegador
       para a janela web. Uma lista por máquina, cada entrada marcada com
       sua pasta. Não sincroniza com a conta.
     - Uma notificação é histórico, não ajuste. Sincronizá-la faria a
       falha de sync de um aparelho aparecer em outro.

6. **No celular** ([0076](0076-the-window-on-every-screen.md) item 6),
   onde não há barra de status:
   - O ícone vai para a barra do topo do painel, ao lado da linha de
     falha.
   - Os avisos aparecem no topo, na largura toda menos as margens.

7. **Os tipos, e de onde cada um vem.** Cada tipo é uma linha dos ajustes
   (item 8).

   | Tipo | Levantada quando | Fonte hoje | Trabalho novo |
   |---|---|---|---|
   | Sync | o sync de uma pasta falha, e quando volta; a janela numa pasta do servidor perde o servidor, e o recupera; a janela web fica offline, e volta | `sync-status`, `server-gone` / `server-back`, os avisos da ponte web | os avisos de offline e reconectado da ponte web passam a este módulo |
   | Conflitos | o sync fez uma cópia de conflito; uma sala ao vivo recusou uma edição como conflito | `SyncStatus.conflicts`, `collab-conflict` | nenhum. O banner na nota fica |
   | Compartilhamento | recebi um compartilhamento; um compartilhamento que eu tinha foi revogado | revogado: `SyncStatus.revoked`, o quadro `gone` | **recebido:** um novo envio às conexões abertas de quem recebe, incluído na lista permitida do escopo de compartilhamento. **Revogado numa janela do desktop numa pasta do servidor:** dito como revogação, não mais como "conexão caiu" |
   | Atualizações | saiu uma versão nova | a verificação ao abrir | uma nova verificação com o app aberto `[DECIDED 2026-10-14]`: a cada 24 h, sob o mesmo ajuste ("Verificar atualizações automaticamente", [0055](0055-in-app-updater.md)). Uma notificação por versão |
   | Cota | uma pasta passa de 90 % da cota | `folder-quota`, só pastas do servidor | ganha um tipo no contrato e é repassado à janela de uma pasta local sincronizada. Levantada de novo só depois que a pasta cai abaixo de 90 % e passa outra vez |
   | Lixeira | itens desta pasta saem da lixeira em breve | nada: `trash_list` tem `expires` | o limiar `[DECIDED 2026-10-14]`: a janela pergunta ao abrir e uma vez por dia, e diz "n itens saem da lixeira em até 3 dias" no máximo uma vez por dia por pasta, com "Abrir a lixeira" |
   | Presença | alguém entra na nota que estou editando | `collab-awareness` → `presenceChanged` | nenhum. A saída não é notificada: o estado ao vivo já diz |

   Erros de uma ação (`verso:failed`) não são um tipo. Ficam onde a
   pessoa agiu (item 1).

8. **Ajustes.**
   - Uma seção nova dos Ajustes, "Notificações", tem uma linha por tipo
     com três valores: "Aviso e lista", "Só na lista", "Desligado".
   - **Os padrões** `[DECIDED 2026-10-14]`: "Aviso e lista" para todos os
     tipos.
   - Desligar um tipo não silencia seu estado. A barra de status continua
     dizendo o estado do sync, e a nota continua mostrando seu banner de
     conflito. Desligado só quer dizer sem aviso e sem linha na lista.
   - Os valores moram na camada da pessoa
     ([0070](0070-what-travels-with-the-folder.md)): os `Settings` da
     janela, sincronizados com a conta num servidor.
   - **O som da Mesa (2026-10-23, o mantenedor: "Mensagens no chat
     deveriam notificar de alguma forma, com som configurável").** Mais
     duas linhas na seção: "Som da Mesa" (Desligado, Suave, Sino, Estalo;
     Suave por padrão) e o seu volume. É um som, não um tipo de
     notificação: toca para a mensagem ou a rolagem de outra pessoa com o
     painel da Mesa aberto ou não, e o tipo "Mesa" acima (um aviso, a
     lista, a notificação do sistema) continua como era. Detalhes na
     [0107](0107-the-table-a-shared-roll-and-chat-log.md).

9. **As notificações do sistema** `[DECIDED 2026-10-14]`: nesta rodada,
   no desktop e no navegador.
   - Mais uma linha em "Notificações": "Também nas notificações do
     sistema". Começa **desligada**. A permissão do sistema é pedida no
     momento em que a pessoa liga, nunca de surpresa. Se a permissão é
     negada, a linha volta a desligada e diz por quê.
   - Ligada, uma notificação cujo tipo está em "Aviso e lista" vai também
     para as notificações do sistema, mas só enquanto a janela não está
     na frente: em segundo plano, minimizada ou em outra aba. Uma janela
     na frente mostra só o aviso.
   - Ativar a notificação do sistema traz a janela para a frente e abre a
     central naquela notificação.
   - Desktop: pelo plugin de notificação do Tauri, no macOS, no Windows e
     no Linux. A permissão dele entra nas capabilities da janela.
   - Navegador: pela Notification API do navegador. A ponte web responde
     às mesmas chamadas que o plugin do desktop responde, então a janela
     não pergunta de que lado roda
     ([0026](0026-core-ui-contract-inviolable-rules.md) regra 2).
   - Onde o sistema não consegue, a linha diz e fica desligada: uma
     página que não é servida por HTTPS, um navegador sem a API, ou um
     navegador de celular que só permite a um app instalado.
   - Dependências novas, cada uma justificada no pull request com a
     licença verificada: `tauri-plugin-notification` (Rust) e
     `@tauri-apps/plugin-notification` (npm).

10. **O contrato.**
    - Os payloads dos eventos que este ADR usa ganham tipos Rust em
      `verso-contract`, gerados em `bindings.ts` (regra 3). Isso cobre o
      novo envio de compartilhamento recebido, `folder-quota`,
      `server-gone` e `server-back`, que hoje não têm nenhum.
    - Os nomes de evento continuam strings, como
      [0038](0038-ts-type-generation.md) os deixou.
    - Nada na janela pergunta de que lado do fio veio um evento (regra
      2). Os mesmos ouvintes escutam o host Tauri e a ponte web.

11. **Acessibilidade e língua.**
    - Todo texto em pt-BR e EN ([0035](0035-cross-cutting-requirements.md)).
    - As horas no fuso do computador.
    - O ícone, as ações de cada aviso e a central são alcançáveis pelo
      teclado e nomeados para um leitor de tela.
    - Nenhuma informação depende só de cor: o nível também é um ícone e
      uma palavra.

12. **Testes e o tutorial.**
    - O harness levanta cada tipo pelos seus eventos, inclusive os
      caminhos de falha: servidor fora do ar, offline, uma revogação.
    - Os testes e2e verificam que cada tipo é dito uma vez por mudança,
      guardado na lista, respeita seu ajuste e é anunciado.
    - A nota 18 do vault de demonstração ganha "## Notificações". A
      parada `ajuda` do tour ganha sua linha. O roteiro ganha seus
      passos.
    - `docs/reference/manual-checks.md` lista o que só o app real mostra:
      o servidor parado e iniciado de novo, uma atualização encontrada, um
      compartilhamento dado por outra conta.

13. **A versão.** Construído como 0.8.3-beta.1. A mensagem do
    compartilhamento revogado (item 7) é corrigida na mesma build.

## Consequências

- A janela tem um lugar só para dizer um evento que vem sozinho, e uma
  regra para "uma vez". Eventos novos (histórico de versões, os achados
  do pentest externo mostrados a um admin, outros) se encaixam no módulo
  em vez de criar um quinto jeito.
- O topo central fica livre. O banner de atualização e os avisos não se
  cobrem mais.
- O servidor ganha um envio (um compartilhamento recebido) e um tipo no
  contrato por evento que não tinha. A lista permitida do escopo de
  compartilhamento cresce um nome.
- A janela pede `trash_list` uma vez por dia por pasta aberta. A resposta
  é pequena: entradas, não seus bytes.
- Quem quer silêncio pode tê-lo por tipo, sem perder o estado que a
  barra de status e as notas mostram.

## Alternativas descartadas

Nenhuma registrada.

## Status

**Aceito (2026-10-14).** Escrito pelo Opus 5.5 a pedido do mantenedor.
O mantenedor aceitou as quatro recomendações no mesmo dia (*"Sim,
todas"*): a lista nesta máquina, sem sincronizar (item 5); a nova
verificação a cada 24 h (item 7); o limiar da lixeira de 3 dias, uma vez
por dia por pasta (item 7); "Aviso e lista" para todos os tipos (item 8).

As notificações do sistema (item 9) foram contra a recomendação, que era
deixá-las para uma rodada seguinte. O mantenedor escolheu tê-las nesta
rodada (*"Sim, já nesta"*), começando desligadas, com a permissão pedida
quando o ajuste é ligado, e no navegador além do desktop.

A construir como 0.8.3-beta.1.

**Respondido durante a construção (2026-10-14, o mantenedor, como recomendado):**

- Ativar uma notificação do sistema (item 9). O plugin de notificação do
  desktop que roda com este Tauri (2.4) não diz nada à janela sobre um
  clique: no macOS e no Windows o clique traz o app para a frente, no
  Linux em geral só fecha a notificação. No navegador o clique abre a
  central naquela notificação. A versão 2.6 do plugin, que informa o
  clique, exige o Tauri 2.12 e saiu em 2026-10-10; entra numa 0.8.x
  seguinte, quando tiver pelo menos duas semanas, e aí o clique abre a
  central também no desktop.
- No desktop o sistema responde a todo pedido de permissão com
  "concedida" e decide nos próprios ajustes, então "negada → volta a
  desligada" (item 9) só acontece no navegador; no desktop a linha diz que
  o sistema pode bloquear as notificações, e onde permiti-las.
- A notificação de cota (item 7). O servidor avisa as janelas de uma pasta
  quando ela passa de 90 %, nunca quando volta para baixo. A janela pede o
  espaço da pasta uma vez por dia, junto com a checagem da lixeira; abaixo
  de 90 %, a próxima passagem notifica de novo.

**Escolhas da construção, aceitas pelo mantenedor em 2026-10-14**
(*"Sim, as 4"*):

- A importação da demonstração e mudanças de fora que chegaram atrasadas
  são ditas num aviso sem tipo e sem linha na lista: nenhum dos sete tipos
  se encaixa.
- O ajuste "Também nas notificações do sistema" fica nesta máquina, não
  nos ajustes da conta: a permissão é da máquina.
- Um sync que falha e um servidor fora de alcance são ditos de novo a cada
  abertura enquanto durarem; uma revogação, uma cópia de conflito, uma
  atualização, a lixeira e um compartilhamento recebido são lembrados
  entre aberturas.
- "O sync voltou" só é dito depois de uma falha, nunca depois de uma pausa
  feita pela pessoa.
