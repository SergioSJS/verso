# ADR 0062 — Focos: raízes nomeadas da árvore de arquivos, compartilhadas com o make.md

- Data: 2026-10-03
- Fonte: o mantenedor, 2026-10-02 e 2026-10-03, em sessão, depois de
  testar as fatias do [ADR 0060](0060-makemd-organizing-features.md): "e
  sobre a criação de Navigator que define atalhos como se tivesse movendo a
  raiz da aplicação pra outras pastas"; "pensei de aproveitarmos a barra da
  direita que praticamente não tem uso, aí teria uma aba a mais que listaria
  todos os focos, que inclui automaticamente o foco da raiz real"; sobre
  onde guardar os focos, "onde o obsidian guarda? … a gente copia e fica até
  compatível", e depois: "Só ler, mas poderíamos criar um mecanismo de
  converter e aplicar as mudanças no arquivo do obsidian, avisando do risco
  de compatibilidade … se for diferente do que sabemos, mantemos só
  leitura, se for igual ao esperado, escrevemos no arquivo pra manter
  syncado … a pessoa poderia usar os 2". A implementação é delegada ao
  Antigravity ("vou ter que delegar o focos para o antigravity").
- Status no briefing: não consta

## Contexto

O make.md os chama de focos (memo
[`makemd-decision.md`](../reference/makemd-decision.md), N3): uma fileira de
raízes nomeadas acima do navegador dele, cada uma um conjunto de pastas e
arquivos; escolher uma mostra o navegador a partir dali. A D5 do
[ADR 0060](0060-makemd-organizing-features.md) os deixou para depois, com o
[ADR 0041](0041-multi-root-workspace.md) (várias raízes, `PROPOSTO`). O
próprio Obsidian não tem focos; o arquivo é do make.md.

O make.md os guarda num arquivo só, na raiz do cofre, `.space/waypoints.json`.
Visto no cofre Sandbox do mantenedor em 2026-10-03, make.md 1.3.5:

```json
[{"name":"Home","sticker":"ui//home","paths":["/"]},
 {"sticker":"ui//spaces","name":"aaaa","paths":["Untitled","Untitled/pasta","Untitled/xxxxx.md"]}]
```

Um array de objetos, cada um com `name` (texto), `sticker` (a forma do
make.md, D2 do [ADR 0060](0060-makemd-organizing-features.md)) e `paths` (uma
lista): `"/"` é a raiz do cofre, os outros caminhos são relativos a ela, e
um caminho pode nomear uma nota além de uma pasta. As chaves vêm em qualquer
ordem.

Duas decisões aceitas impedem escrevê-lo: a D2 do ADR 0060 ("nada dentro de
uma pasta `.space/` é escrito nunca") e o
[ADR 0044](0044-verso-fs-semantics.md) (um nome que começa com `.` não é
percorrido, e o `verso-fs` recusa um handle para ele).

O painel da direita tem Estrutura, Backlinks, Links de saída, Tags, Favoritos
e Calendário ([ADR 0049](0049-phase-2-scope-widened.md) §1).

## Decisão

Escrito pelo autor a partir das palavras do mantenedor acima, e aceito pelo
mantenedor como está escrito (Status).

1. **O que é um foco (D1).** Um nome, uma figurinha e uma lista de caminhos
   dentro da pasta aberta — pastas e notas. Escolher um foco mostra a árvore
   de arquivos a partir desses caminhos: cada pasta como uma raiz da árvore,
   cada nota como uma linha. **"Início"** vem sempre primeiro: a própria
   pasta aberta, feito pelo Verso, nunca apagado. Caminhos fora da pasta
   aberta são o [ADR 0041](0041-multi-root-workspace.md), não este.
2. **Onde aparecem (D2).** Uma aba **"Focos"** no painel da direita, ao lado
   de Favoritos: todos os focos, Início primeiro, o que está em uso marcado.
   Um clique o escolhe. A aba acrescenta um, renomeia, troca a figurinha,
   reordena e apaga. O cabeçalho da árvore diz o foco em uso ("ARQUIVOS ·
   Projetos"), com um jeito de voltar ao Início.
3. **Como se cria um (D3).** Pelo menu de uma pasta ou de uma nota na
   árvore: "Criar foco aqui" (um foco com aquele caminho) e "Adicionar ao
   foco…" (acrescenta o caminho a um). Um comando da paleta, "Trocar foco",
   os lista; pode ganhar teclas (Ajustes › Atalhos).
4. **O que um foco não muda (D4).** A busca, os links, os backlinks, o
   grafo, as bases e o índice continuam sendo da pasta aberta inteira. Um
   foco é só uma vista da árvore.
5. **Onde ficam guardados (D5).**
   - **Sem** `.space/waypoints.json` na pasta aberta: nas configurações do
     Verso, por pasta aberta, fora da pasta
     ([ADR 0011](0011-config-outside-tree-index-as-cache.md)). O Verso não
     cria `.space/`.
   - Com o arquivo, os focos dele são **lidos** e mostrados, sempre.
   - São **escritos de volta** só quando o arquivo está no **formato
     conhecido** (D6), e só depois de a pessoa ser avisada uma vez, por pasta
     aberta, de que o arquivo do make.md não é um formato publicado e um
     make.md futuro pode lê-lo de outro jeito; a resposta fica guardada.
     Então uma mudança feita no Verso é escrita ali, e os dois apps mostram
     os mesmos focos.
   - Em qualquer outro caso — um formato desconhecido, uma resposta de não —
     o arquivo fica só leitura, a aba diz por quê, e os focos feitos no Verso
     ficam nas configurações dele, ao lado dos do make.md.
6. **O formato conhecido (D6).** Um array JSON; cada elemento um objeto cujas
   chaves são `name` (uma string), `paths` (um array de strings) e,
   opcionalmente, `sticker` (uma string), e nenhuma outra chave; cada caminho
   `"/"` ou relativo, sem `..`. Qualquer outra coisa é desconhecida, e o
   arquivo fica só leitura. Escrever mantém o que o Verso não mudou como
   estava: a ordem dos elementos, a ordem das chaves, um foco que o Verso não
   mostra.
7. **As exceções que isso pede (D7).** À D2 do ADR 0060: o Verso escreve um
   arquivo dentro de `.space/` — `waypoints.json` na raiz da pasta aberta —
   sob a D5 e a D6, e nada mais dentro de `.space/`. Ao ADR 0044: o
   `verso-fs` lê e escreve esse único caminho, pelo nome, como faz com o
   `.trash/`; toda outra entrada que começa com ponto continua não
   percorrida e recusada. Cada escrita é atômica e confere que o arquivo é o
   que foi lido (invariantes 9 e 11); um arquivo mudado desde então — o
   make.md escrevendo ao mesmo tempo — é lido de novo e a única mudança é
   aplicada outra vez, ou, se não puder mais ser, nada é escrito e a aba diz
   isso.
8. **Atualização (D8).** O watcher não vê entradas que começam com ponto; o
   arquivo é lido de novo quando a aba aparece, quando a janela ganha o foco
   e antes de toda escrita.
9. **Configurações (D9).** Uma configuração fora das dez da D12 do
   [ADR 0060](0060-makemd-organizing-features.md), em Ajustes › Organização:
   "Sincronizar focos com o make.md", a resposta da D5 para esta pasta, para
   poder ser mudada depois.

## Consequências

- Fatias, cada uma um pull request próprio:
  - **F1** — Rust: a exceção do `verso-fs`, leitura e escrita de
    `.space/waypoints.json` com a checagem de formato (D6), comandos do
    contrato, as respostas do harness. Testes: o formato conhecido lido; uma
    chave desconhecida, um `..`, um não-array, cada um só leitura; uma escrita
    que muda um foco deixa todo outro byte como estava; um arquivo mudado
    desde a leitura é lido de novo; um caminho oculto que não seja este
    continua recusado.
  - **F2** — a janela: a aba Focos, o Início, escolher um foco, a árvore a
    partir dos caminhos dele, o cabeçalho, os menus, o comando da paleta, a
    configuração e o aviso único, o armazenamento nas configurações do Verso.
  - **F3** — o tutorial: uma nota do cofre de exemplo e uma parada no "Tour
    do Verso" ([ADR 0058](0058-demo-vault-as-tutorial.md)); passos do roteiro;
    linhas de changelog nas duas línguas.
- Testes e2e no harness para D1–D5 e D8, cada um visto falhando sem a sua
  mudança; passos de nível A no app real com o make.md aberto no mesmo cofre
  (o Sandbox mantém o make.md para isso, por escolha do mantenedor em
  2026-10-02), lendo o log do app depois de cada um.
- Comandos novos do Tauri entram na lista de `app/src-tauri/build.rs` e em
  `capabilities/default.json`; o harness não vê essa lista.
- O `window.confirm` do app real é assíncrono e o `window.prompt` não
  devolve nada: o aviso da D5 usa o diálogo da própria janela (`ask`).
- A D5 do [ADR 0060](0060-makemd-organizing-features.md) ("os focos esperam a
  0041") é substituída por esta, para caminhos dentro da pasta aberta; o 0060
  ganha uma linha apontando para cá quando esta for aceita.
- **Autoria.** O mantenedor delega a implementação ao Antigravity — um
  desvio dos papéis do [ADR 0032](0032-author-and-reviewer-roles.md), como no
  ADR 0060 — e cada pull request é lido por um modelo Claude numa sessão
  própria antes do merge. Este registro foi escrito pelo Opus 5.5.

## Alternativas descartadas

Pesadas pelo mantenedor em sessão:

- Focos só nas configurações do Verso — sem compatibilidade com o make.md.
- Ler e escrever o arquivo do make.md seja o que for que ele contenha — o
  risco de escrever por cima de um formato que o Verso não conhece.

Consideradas pelo autor e levadas ao mantenedor:

- Uma fileira de focos acima da árvore, como o make.md os mostra — o painel
  da direita foi a escolha do mantenedor; trocar pela paleta cobre o painel
  fechado.

## Status

Aceito (2026-10-03): o mantenedor, em sessão, sobre este texto — "parece
estar tudo certo, aceito".
