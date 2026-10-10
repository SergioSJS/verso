# A bancada de sincronização

[English](../../reference/sync-lab.md)

Um Universo nesta máquina, um vault de teste e as ferramentas para exercitar
a sincronização ([ADR 0079](../adr/0079-sync-a-local-folder-with-a-server.md))
com apps de verdade e muitos aparelhos, guardados entre uma rodada e outra
para que toda campanha comece do mesmo lugar e todo teste de carga seja
comparável com os anteriores. Tudo aqui é dado de teste, em
`target/sync-lab/`, nunca commitado.

## 1. A bancada

```
scripts/sync-lab/lab.sh up        # compila o verso se preciso, gera o vault uma vez, sobe o servidor, cria pessoas e pastas
scripts/sync-lab/lab.sh status
scripts/sync-lab/lab.sh load --devices 50 --seconds 120 --label "o que mudou"
scripts/sync-lab/lab.sh down
scripts/sync-lab/lab.sh reset     # pergunta, depois apaga target/sync-lab
```

O servidor escuta em `http://localhost:7351` (`VERSO_LAB_PORT`), com os
dados em `target/sync-lab/data`, as pastas em `target/sync-lab/folders` e o
log em `target/sync-lab/server.log`. O `up` cria:

- o admin `admin@lab.test`, e **Ana** e **Bia**, editoras das duas pastas,
  com senhas geradas;
- a pasta **Caderno**, o vault de teste, e a **Carga**, vazia, para o teste
  de carga;
- `target/sync-lab/lab.json` (modo 600): o endereço, os ids e diretórios
  das pastas, as contas e suas senhas.

Um aparelho do app desktop entra na bancada sem cliques, como a campanha de
2026-10-10 fez: o app abre a pasta uma vez (a chave dela é o nome de
`<config>/index/<nome>-<hex>.json` sem a extensão), depois o
`<config>/servers.json` recebe um token de aparelho — aprovado para uma
conta pela API (`/api/device/start`, `/api/device/<código>`,
`/api/device/poll`) — e o `<config>/sync-<chave>.json` nomeia o servidor e
a pasta; o app, aberto de novo na pasta, sincroniza. O `VERSO_CONFIG_DIR` dá
a uma segunda cópia do app uma configuração própria; uma cópia compilada
com outro identificador (`tauri build --config
'{"identifier":"…","productName":"…"}'`) roda ao lado da instalada. Uma VM
alcança a bancada por um túnel SSH reverso, `ssh -R
7351:127.0.0.1:7351 <vm>`, já que o app aceita `http` só para `localhost`.

## 2. O vault de teste

`node scripts/sync-lab/seed.mjs <pasta vazia>` escreve o mesmo vault toda
vez: notas com links e uma propriedade, pastas com três níveis, um nome na
forma composta do Unicode (NFC) e um na forma decomposta que o macOS grava
(NFD), um emoji, espaços duplos, um arquivo vazio, um PNG, um binário de
1 MB, um binário de `--big-mb` megabytes (60 por padrão, os mesmos bytes em
qualquer máquina) e um lote de `--batch` notas (120). Os nomes e os
arquivos grandes são criados aqui, não commitados: o git normaliza nomes no
macOS, e o repositório não carrega dezenas de megabytes.

## 3. O teste de carga

`scripts/server-load.mjs` (pelo `lab.sh load`, ou sozinho contra qualquer
servidor) abre `--devices` conexões sobre sessões de aparelho de verdade —
uma sessão por conta, já que iniciar o login de um aparelho é limitado por
endereço — e, por `--seconds`, cada uma faz ao acaso: lê as mudanças depois
do seu cursor; envia um arquivo novo (um em vinte de 2 MB, os outros de
alguns kB); edita um dos seus arquivos com a base que tem; edita a **nota
quente** que todos os aparelhos compartilham, com a última base que viu, e é
recusada como `changed` quando outro aparelho chegou antes; lê de volta um
dos seus arquivos e confere o hash; apaga um dos seus arquivos.

No fim ele informa, por operação, a latência **p50, p90, p95, p99 e o
máximo** em milissegundos, as operações por segundo, os erros por tipo
(`put_hot:changed` é a disputa esperada, não uma falha) e a
**integridade**: todo arquivo que um aparelho gravou por último tem
exatamente esses bytes no disco do servidor, todo arquivo que ele apagou
sumiu, e a nota quente tem a última versão aceita. Um problema faz ele sair
com 1.

Cada rodada é acrescentada a `scripts/sync-lab/results.jsonl` — data,
commit, máquina, aparelhos, contas, duração, os números acima — salvo com
`--no-record`. Esse arquivo é o histórico a acompanhar; as rodadas que
importam ficam resumidas abaixo.

| Data | Commit | Máquina | Aparelhos × s | ops/s | put_new p50 / p90 / p99 ms | changes p50 / p99 ms | Integridade | Nota |
|---|---|---|---|---|---|---|---|---|

## 4. Os cenários da campanha

O que a campanha de 2026-10-10 rodou com dois apps instalados, um navegador
e o servidor, e o que uma campanha roda de novo antes de uma versão que
mexa na sincronização. Cada um é julgado pelos arquivos de todos os
aparelhos e do servidor comparados byte a byte, e pelos logs (toda linha
`sync`, todo `WARN` e `ERROR`).

- **O que cruza**: uma edição em cada sentido; uma nota nova em pastas com
  três níveis; uma renomeação; uma pasta movida com o que tem dentro (sem
  deixar pasta vazia); uma renomeação só de maiúsculas; nomes com acento
  nas duas formas Unicode, um emoji, espaços; um arquivo vazio; uma imagem;
  arquivos de 60, 300, 700 e 900 MB.
- **O mesmo arquivo**: dois aparelhos editando uma nota no mesmo instante;
  um apagando enquanto o outro edita (a edição vence); um renomeando
  enquanto o outro edita (as duas ficam); um aparelho fechado enquanto os
  dois editam (um conflito na volta dele); o navegador digitando numa sala
  enquanto um aparelho edita a mesma nota.
- **Proteções**: uma exclusão em massa (mais de um quinto, mais de 50)
  pausa, e os arquivos devolvidos a cancelam; as mudanças de uma leitora
  ficam no aparelho dela, ditas, e as do servidor continuam chegando; um
  papel mudado com a conexão aberta; a cota recusando um arquivo e deixando
  o resto passar; a sessão do aparelho encerrada pelo admin; o membro
  removido da pasta; o app derrubado no meio de um envio; o servidor
  derrubado no meio de um download (nada pela metade, retomado, mesmos
  hashes).
- **A janela**: os estados da barra de status; a seção de sincronização; a
  diferença de um conflito; apagar a cópia; pausar e retomar; desligar e
  religar a sincronização (continua da base).
- **Plataformas**: o mesmo, com aparelhos no macOS, no Windows e no Linux
  num servidor só, incluindo uma nota nomeada num sistema em NFC e em outro
  em NFD.
