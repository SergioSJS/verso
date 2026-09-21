# ADR 0020 — Sync: motor de merge no core, transportes como plugin, fora de escopo até a Fase 2

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §8, §15
- Status no briefing: `DECIDIDO`

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
  escrever sync — o teste mais duro de [0017](0017-plugins-formato-shim-carregamento.md).
- Google Drive e OneDrive servem melhor como destino de backup que como sync
  contínuo, por restrição de plataforma ([0009](0009-restricoes-externas.md)).
- Estar fora de escopo até o fim da Fase 2 protege o portão de um mês de uso
  real ([0034](0034-roadmap-em-fases.md)); ainda assim, o modelo de arquivo da
  Fase 1 não pode inviabilizar merge por bloco depois.

## Alternativas descartadas

- Merge dentro de cada transporte — descartado em §8, que coloca o motor no core.
- Depender de Google Drive ou OneDrive como sync contínuo principal — descartado
  pelas restrições de §4.

## Status

Aceito.
