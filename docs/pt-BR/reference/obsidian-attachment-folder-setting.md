# A configuração de pasta de anexos do Obsidian: o que foi e o que não foi observado

- Data: 2026-10-16
- Situação: **não decidido; ainda não observado.** Uma nota para a ADR 0096
  item 2 (emendada em 2026-10-16), em que "este app é um servidor" mostra ao
  celular a pasta de anexos do próprio cofre, só para ler, e a leitura de
  `.obsidian/app.json` espera o aval do mantenedor.

## O que o código faz com `attachmentFolderPath`

| Valor em `.obsidian/app.json` | Entendido como |
|---|---|
| ausente, ou o arquivo ilegível, grande demais ou não-JSON | nenhuma pasta de anexos |
| `/` ou vazio | a raiz do cofre: nenhuma (nada fora da pasta escolhida para acrescentar) |
| `./` | "a mesma pasta da nota": nenhuma (dentro do que é servido) |
| `./sub` | uma subpasta da pasta da nota: nenhuma (dentro do que é servido) |
| `Anexos`, `/Anexos/`, `a/b` | a pasta desse caminho, a partir da raiz do cofre |
| um caminho com `..`, uma parte oculta (`.obsidian`), barra invertida ou dois-pontos | nenhuma |

## O que não foi observado

Esses significados vêm da documentação pública do Obsidian e da forma dos
valores, **não** de uma execução do Obsidian num cofre. A CLI do Obsidian
(`obsidian-cli.md`) não foi usada para definir cada valor e ver onde cai um
anexo novo; até que seja, a tabela acima é a leitura do código, não uma
observação registrada (`CLAUDE.md` regra 13: o app nunca é inspecionado por
dentro). Uma fixture desse comportamento registraria em `observed:` como foi
verificado e não é feita aqui.
