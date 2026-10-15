# ADR 0092 — O celular offline: a janela servida por um UniVerso guarda pastas escolhidas e as sincroniza

- Data: 2026-10-14
- Fonte: o item 8 da [0073](0073-self-hosted-server-first.md) (offline no
  celular um passo posterior: um cache local, uma fila de escritas,
  reconciliação na volta) e o `[ABERTO]` dela "se o celular no navegador,
  só online, atende ao sync com celular que o mantenedor chamou de
  imprescindível, ou se o offline no celular vem mais cedo", levado nas
  decisões da Fase 3 do roadmap. A leitura de 2026-10-14 em sessão o
  listou entre as decisões em aberto ("Celular: só online ou offline
  (PWA)?") e o propôs para a V1; a resposta do mantenedor naquela noite,
  sobre a lista inteira: *"VAI SER TUDO NA V1"*. Escrita por Opus 5.5; a
  ser lida pelo outro modelo antes de ser aceita ([0032](0032-author-and-reviewer-roles.md)).
- Relacionados: [0025](0025-own-server-and-mobile-pwa.md) (a PWA como o
  primeiro cliente móvel; um cliente web não é offline-first), [0073](0073-self-hosted-server-first.md)
  (itens 6, 8 e 12: HTTPS, o navegador primeiro, a ordem), [0076](0076-the-window-on-every-screen.md)
  (a janela num celular), [0079](0079-sync-a-local-folder-with-a-server.md)
  (o protocolo e as regras do sync), [0080](0080-the-trash-with-expiry-and-restore.md),
  [0082](0082-live-co-editing-of-a-synced-folder.md) (uma nota ao vivo
  quando a conexão cai), [0087](0087-secret-blocks-hidden-from-readers.md)
  (os bytes de um leitor), [0027](0027-runtime-capabilities.md)
  (disponibilidade pelas capacidades), [0077](0077-the-server-administration-console-and-folder-quotas.md)
  (um admin encerra as sessões de um aparelho), [0035](0035-cross-cutting-requirements.md).
- Status no briefing: ausente; ao ser aceita.

## Contexto

O que existe. Um UniVerso iniciado com `--web` serve a janela, e a
página é instalável no Android e no iPadOS: um manifesto web, ícones e as
meta tags que a abrem em tela cheia (`app/ui/web-assets/manifest.webmanifest`,
`app/ui/build-index.mjs`). A janela se arruma para um celular
([0076](0076-the-window-on-every-screen.md)). Ela não tem service worker
e não guarda nota nenhuma no navegador: sem rede, a página instalada não
abre, e uma nota aberta quando a rede cai não pode ser salva em lugar
nenhum além do servidor. O `verso-dialect` compila para WebAssembly
(um guardrail desde a Fase 1), então o parser pode rodar na página.

O sync do desktop existe ([0079](0079-sync-a-local-folder-with-a-server.md)):
por arquivo, por hash contra uma base, um registro de mudanças lido a
partir de um cursor pelo WebSocket da sessão de aparelho, conflitos como
uma cópia ao lado do arquivo com a versão do servidor ficando com o nome,
dois acréscimos ao fim de uma nota juntados, apagamentos para a lixeira, a
primeira sincronização nunca apagando, uma pausa em apagamentos em massa
— construído e posto em campanha em 2026-10-10 e 11.

Limites do navegador, registrados na [0073](0073-self-hosted-server-first.md):
service worker só num contexto seguro (HTTPS); no iPadOS e no iOS,
armazenamento que o sistema pode despejar a menos que a página receba
persistência, que um web app instalado tem mais chance de conseguir —
uma heurística, não uma promessa; nenhum trabalho em segundo plano.

## Decisão

Proposta (2026-10-14). Aceita em 2026-10-14 (Status): cada `[ABERTO]` foi decidido como
recomendado e está marcado `[DECIDIDO 2026-10-14]`.

1. **Offline é sync, no navegador.** A janela guarda pastas escolhidas
   de um UniVerso no armazenamento do navegador e as mantém em dia com o
   servidor pelo **próprio protocolo e pelas próprias regras do sync**
   ([0079](0079-sync-a-local-folder-with-a-server.md)), pela sessão que ela
   já tem: o mesmo manifesto, cursor, hashes, cópia de conflito, merge de
   acréscimos, lixeira, regras da primeira sincronização e da pausa, o
   mesmo teste de propriedade rodado contra o armazenamento do navegador.
   Nenhum segundo protocolo.
2. **A janela abre sem rede.** Um service worker guarda o código da
   própria janela, versionado com o do servidor, para que a página
   instalada abra offline e mostre as pastas guardadas. Por HTTP puro não
   há service worker: o ajuste da pasta diz que offline precisa de HTTPS,
   e por quê ([0073](0073-self-hosted-server-first.md) item 6).
3. **O que é guardado.** "Disponível offline", um ajuste de cada pasta
   neste aparelho, desligado por padrão; ligado, ele diz o espaço que vai
   ocupar e pede ao navegador armazenamento persistente, e diz quando o
   sistema ainda pode despejá-lo (iPadOS, iOS). `[DECIDIDO 2026-10-14]`: anexos.
   Decidido: notas, boards, bases e arquivos de texto guardados
   inteiros; imagens e PDFs guardados depois de abertos, com "Manter todos
   os anexos" como escolha. `[DECIDIDO 2026-10-14]`: o armazenamento. Decidido:
   **IndexedDB**, o único armazenamento que todo navegador alvo oferece
   com persistência.
4. **Trabalhar offline.** Uma nota, um board ou uma base abre, renderiza
   — pelo `verso-dialect` compilado para WebAssembly — e é editado a
   partir do armazenamento; cada escrita espera numa fila com o hash em que
   se baseou, e sobe pelas regras do sync quando a rede volta. Uma nota
   que estava ao vivo numa sala quando a conexão caiu guarda o seu texto e
   passa pela comparação do sync na volta, como a do desktop
   ([0082](0082-live-co-editing-of-a-synced-folder.md)). `[DECIDIDO 2026-10-14]`: busca,
   backlinks e o grafo offline. Decidido: **calculados na página a
   partir das notas guardadas** — nomes e uma varredura simples para a
   busca, os links do parser para os backlinks e o grafo — e marcados
   "offline: das notas deste aparelho"; o índice do servidor volta a
   responder quando online.
5. **Leitores.** Os bytes guardados de um leitor são o que o servidor
   serve a esse leitor — a projeção da [0087](0087-secret-blocks-hidden-from-readers.md)
   quando ela se aplica; as edições offline de um leitor são recusadas,
   como o sync as recusa ([0079](0079-sync-a-local-folder-with-a-server.md) item 1).
6. **Deixar o aparelho.** Sair da conta apaga as pastas guardadas nele,
   depois de dizer quantas escritas não subiram; um admin encerrando as
   sessões do aparelho ([0077](0077-the-server-administration-console-and-folder-quotas.md))
   as apaga na próxima conexão dele. `[DECIDIDO 2026-10-14]`: criptografar o
   armazenamento em repouso. Decidido: **fora da V1** — o armazenamento
   do navegador é tão seguro quanto o celular desbloqueado —, dito no
   ajuste.
7. **O que a janela diz** ([0027](0027-runtime-capabilities.md)): online,
   offline, sincronizando, e a contagem de escritas esperando, na barra de
   status e nos ajustes da pasta; uma escrita que não consegue subir diz
   por quê onde foi feita.
8. **Todo navegador, não só celulares.** A mesma feature funciona num
   navegador de desktop; o app desktop mantém o sync de uma pasta local
   da [0079](0079-sync-a-local-folder-with-a-server.md), inalterado.
9. **Acessibilidade e idiomas** ([0035](0035-cross-cutting-requirements.md)):
   o estado offline é anunciado quando muda; pt-BR e inglês.

## Consequências

- A janela ganha o service worker, o armazenamento do navegador, a fila e
  o cliente do sync para eles; o servidor não ganha nada novo além de
  servir o worker — os comandos do sync são os do aparelho; os tipos do
  contrato são gerados como sempre (invariante 3).
- O `[ABERTO]` da [0073](0073-self-hosted-server-first.md) sobre o
  offline no celular, e a linha da Fase 3 que o carrega, são respondidos
  quando o mantenedor confirmar que a lista da V1 de 2026-10-14 o traz
  mais cedo — `docs/roadmap.md`, revisão 8, pergunta; a ordem do item 12
  da 0073 ("a PWA offline" depois do sync) é mantida, o sync estando
  construído.
- Testes: o teste de propriedade do sync contra o armazenamento do
  navegador; de ponta a ponta na largura de celular no harness e na suíte
  do servidor para abrir, editar, voltar e conflito offline; uma
  verificação manual num iPhone e num celular Android com a página
  instalada (`docs/reference/manual-checks.md`); o changelog ganha a sua
  linha.
- Um app nativo do mesmo código ([0073](0073-self-hosted-server-first.md)
  item 8) continua sendo a saída se o despejo ou os limites de segundo
  plano do navegador morderem.

## Alternativas descartadas

Nenhuma registrada.

## Status

**Aceita (2026-10-14).** O mantenedor, naquela noite, respondendo a
*"Aceita todas as recomendações (R1–R4 e os itens dos ADRs 0085–0092)?"* com *"Sim, todas"*: cada `[ABERTO]`
decidido como recomendado, marcado `[DECIDIDO 2026-10-14]` no lugar. Na V1
(`docs/roadmap.md`, Fase 4 — V1). A [0073](0073-self-hosted-server-first.md) ganha uma linha de Revisões, e a linha da Fase 3 no roadmap é riscada (R1).


**Aceita (2026-10-15), os dois desvios da construção e seus riscos conhecidos.** O mantenedor, respondendo à recomendação com *"bora"*, aceitou dois desvios da construção em relação a este ADR. (1) O núcleo offline é o núcleo TypeScript do harness do navegador, não o `verso-dialect` compilado para wasm: o `wasm-bindgen` escreveria `unsafe`, que o workspace proíbe fora de `web_clip`. (2) O motor de sync do navegador é um port em TypeScript preso aos vetores do motor em Rust (`crates/verso-core/src/sync/vectors.rs` para `app/ui/test/sync-vectors.json`), então existem dois motores. Riscos conhecidos que o construtor listou: o e2e de edição offline roda só no Chromium; um banco novo no servidor, ou uma carga anônima, apaga as edições ainda não enviadas, e o aviso as conta.

*(Histórico, antes da aceitação acima:)* Proposta (2026-10-14). Na V1 pela palavra do mantenedor de 2026-10-14
(*"VAI SER TUDO NA V1"*; `docs/roadmap.md`, revisão 8). Para o
mantenedor, cada um com uma recomendação: anexos e o armazenamento
(item 3), busca e links offline (item 4), criptografia em repouso
(item 6), e se a lista da V1 fecha o `[ABERTO]` da
[0073](0073-self-hosted-server-first.md) (Consequências).
