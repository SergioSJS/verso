# ADR 0020 — Sync: motor de merge no core, transportes como plugin, fora de escopo até a Fase 2

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §8, §15
- Status no briefing: `DECIDIDO`
- Revisões: 2026-10-09 — revisto pelo [0073](0073-self-hosted-server-first.md),
  aceito pelo mantenedor naquele dia; o texto abaixo fica como foi
  decidido em 2026-09-21. **A ordem**: o servidor auto-hospedado é
  construído primeiro, e o sync entre dispositivos vem depois dele e por
  ele (0073 itens 1 e 10). **Item 1**: o sync nativo continua essencial e
  passa pelo servidor próprio do Verso; as integrações com Google Drive e
  OneDrive por API não são essenciais — o caminho da pasta é suportado e
  documentado (cópias de conflito detectadas, placeholders tratados),
  WebDAV é o primeiro transporte externo, Drive e OneDrive por API vêm se
  pedirem, iCloud nunca por API, o rclone não é embutido. **Item 3**:
  transportes moram no core, não como plugins, até plugins existirem e
  enquanto guardarem credenciais (0073 item 4). **Item 4**: o sync sai de
  "fora de escopo até o fim da Fase 2" para a Fase 3, depois da primeira
  versão do servidor ([0034](0034-roadmap-in-phases.md), revisto no mesmo
  dia). O item 2 fica; merge por bloco vem depois de conflitos terem sido
  vistos em uso (0073 item 10).

## Contexto

Sync é apontado como essencial, e também é onde mais se perde dado. O briefing
separa duas coisas que costumam vir juntas: entender o conteúdo (merge) e mover
bytes (transporte).

## Decisão

1. Sync nativo é essencial, com servidor próprio e com serviços como Google
   Drive e OneDrive.
2. O motor de merge fica no core, porque entende blocos, frontmatter e o modelo
   de arquivo.
3. Transportes são plugins: servidor próprio, WebDAV, S3, Google Drive,
   OneDrive.
4. Sync fica fora de escopo até o fim da Fase 2.

## Consequências

- Um transporte novo não pode mudar a semântica de merge; só entrega e busca
  bytes.
- Sendo transporte um plugin, a API de plugin precisa ser suficiente para
  escrever sync — o teste mais duro de [0017](0017-plugins-format-shim-loading.md).
- Google Drive e OneDrive servem melhor como destino de backup que como sync
  contínuo, por restrição de plataforma ([0009](0009-external-constraints.md)).
- Estar fora de escopo até o fim da Fase 2 protege o portão de um mês de uso
  real ([0034](0034-roadmap-in-phases.md)); ainda assim, o modelo de arquivo da
  Fase 1 não pode inviabilizar merge por bloco depois.

## Alternativas descartadas

- Merge dentro de cada transporte — descartado em §8, que coloca o motor no core.
- Depender de Google Drive ou OneDrive como sync contínuo principal — descartado
  pelas restrições de §4.

## Status

Aceito. Revisto em 2026-10-09 pelo [0073](0073-self-hosted-server-first.md)
(Revisões).
