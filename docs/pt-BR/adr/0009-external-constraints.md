# ADR 0009 — Restrições externas assumidas como dadas

- Data: 2026-09-21
- Fonte: `docs/BRIEFING.md` §4
- Status no briefing: `RESTRIÇÃO` (não é escolha)
- Revisões: 2026-10-14 — as fontes admissíveis delimitadas, pelo
  mantenedor naquela noite (*"Sim, todas"*, respondendo às perguntas do
  [0094](0094-the-rest-of-bases.md), esta entre elas): o código público de
  um plugin de código aberto que o Obsidian publica sob a própria licença
  — o `obsidianmd/obsidian-maps`, MIT, por exemplo — é uma fonte
  admissível, como o `obsidian.d.ts` é. Inspecionar, descompilar ou
  desminificar o próprio app continua proibido. 2026-10-21 — as linhas de OAuth e de cotas respondidas para o sync pelo [0104](0104-external-cloud-storage-transports-and-quotas.md) (`drive.file` não sensível, PKCE e clientes públicos, limites por provedor).

## Contexto

Parte do desenho do Verso não é escolha: vem de termos de uso de terceiros, de
sandbox de sistema operacional ou de licença de biblioteca. Este ADR existe para
que essas restrições sejam citadas com a origem e não sejam reabertas como se
fossem preferência.

## Decisão

Registrar as restrições abaixo como dadas, com a origem, e desenhar dentro delas.

| Restrição | Origem | Consequência |
|---|---|---|
| Não inspecionar, descompilar ou desminificar o app Obsidian | Termos de uso do Obsidian proíbem engenharia reversa para desenvolver produto concorrente | Fontes permitidas: API pública (`obsidian.d.ts`, MIT), documentação pública, comportamento observado de fora; e *(desde 2026-10-14)* o código público de um plugin de código aberto que o Obsidian publica sob a própria licença (`obsidianmd/obsidian-maps`, MIT) |
| Sem acesso a pasta arbitrária no iOS | Sandbox do iOS | Document picker + security-scoped bookmarks |
| Sem watcher de mudança externa equivalente ao desktop no iOS | iOS | Atualização por ação do usuário ou ao retornar ao app |
| Sync em background restrito | iOS e Android | Sync mobile depende das janelas permitidas pelo SO |
| Operações em massa lentas via Storage Access Framework | Android | Indexação grande no Android exige estratégia própria |
| Sem Node no mobile | iOS e Android | Plugin que depende de Node é desktop-only |
| Sem processo residente no mobile | iOS e Android | MCP no mobile é remoto ou in-process |
| Client secret não pode ser guardado em app de código aberto | OAuth | Google Drive e OneDrive exigem PKCE ou client ID do próprio usuário |
| Verificação de app, cota por aplicação, semântica fraca de rename e conflito | Google Drive e OneDrive | Servem melhor como destino de backup que como sync contínuo |
| tldraw não pode ser usado | Licença source-available: chave de licença em produção, marca d'água obrigatória, proibição de relicenciar | Board usa Excalidraw (MIT) |

## Consequências

- A restrição sobre engenharia reversa define as fontes admissíveis para o
  trabalho de dialeto: só API pública, documentação pública e comportamento
  observado de fora ([0030](0030-base-dialect-obsidian-compatible.md)),
  e, desde 2026-10-14 (Revisões), o código público de um plugin de código
  aberto que o Obsidian publica sob a própria licença. O próprio app nunca
  é fonte, seja como for lido.
  Nenhum documento, fixture ou PR pode citar o binário do Obsidian como fonte.
- As restrições de mobile alimentam as capabilities em runtime
  ([0027](0027-runtime-capabilities.md)) e a proposta de servidor companheiro
  ([0025](0025-own-server-and-mobile-pwa.md)).
- A restrição de licença do tldraw é a origem da escolha do Excalidraw
  ([0024](0024-board-excalidraw.md)).
- Uma restrição só sai daqui se a origem mudar — e a mudança precisa ser citada.

## Alternativas descartadas

Não se aplica: restrições não são escolhas. As alternativas descartadas aparecem
nos ADRs que respondem a cada restrição.

## Status

Aceito como registro de restrição.
