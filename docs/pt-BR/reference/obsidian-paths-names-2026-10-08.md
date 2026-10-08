# Os separadores e os nomes de arquivo do Obsidian, observados em 2026-10-08

- Data: 2026-10-08
- Observado com: Obsidian 1.14.4 (instalador 1.11.5), macOS, pelo CLI dele
- Admissível pelo [ADR 0009](../adr/0009-external-constraints.md): uso normal
  do app e só a API pública (`Vault.create`, `MetadataCache.getCache`,
  `MetadataCache.getFirstLinkpathDest`, `MetadataCache.resolvedLinks` e
  `unresolvedLinks`, declarados no `obsidian.d.ts`); nada do binário.
- Por quê: uma pasta é sincronizada entre macOS, Windows e Linux. Antes de o
  porte para Windows contar com `/` (ADR 0069, item 9) e de o Verso recusar
  em todo sistema nomes que o Windows não guarda
  ([0070](../adr/0070-what-travels-with-the-folder.md)), o que o Obsidian
  faz com uma `\` num link ou num caminho, e quais nomes ele recusa. Veja o
  [obsidian-cli.md](obsidian-cli.md) para como o CLI é rodado.

## 1. Como

Uma pasta descartável do vault `Sandbox`, `verso-fixtures/sep-2026-10-08/`
(apagada depois), preenchida pela API a partir do CLI:

```
obsidian eval vault=Sandbox code="eval(require('fs').readFileSync('<script>.js','utf8'))"
```

O script chama `app.vault.create(<pasta>/<nome>.md, "x")` uma vez por nome e
registra a resposta; escreve `pasta/nota.md` e uma nota `linker.md` que
aponta para ela de seis jeitos; depois lê, para cada link da `linker.md`, o
texto do link, `getFirstLinkpathDest(link, "linker.md")` e as entradas da
nota em `resolvedLinks` e `unresolvedLinks`.

## 2. O que foi observado

**Links.**

| Na `linker.md` | Resolve para |
|---|---|
| `[[pasta\nota]]` | nada (não resolvido, como `pasta\nota`) |
| `[[pasta/nota]]` | `…/pasta/nota.md` |
| `[[verso-fixtures/sep-2026-10-08/pasta\nota]]` | nada |
| `[[verso-fixtures/sep-2026-10-08\pasta\nota]]` | nada |
| `[texto](pasta\nota.md)` | nada |
| `[texto](pasta/nota.md)` | `…/pasta/nota.md` |

**Nomes dados ao `Vault.create`.**

| Nome | Resposta |
|---|---|
| `a:b` | recusado: "File name cannot contain any of the following characters: \ / :" |
| `a\b` | a `\` lida como separador: o Obsidian tentou criar `a/b.md` e falhou com ENOENT (não há pasta `a`) |
| `a*b`, `a"b`, `a<b`, `a>b`, `a?b`, `a\|b` | criados como escritos |
| `CON`, `nul`, `COM1` | criados como escritos |
| `ponto.` (`ponto..md`), `espaco ` (`espaco .md`) | criados como escritos |
| `a#b`, `a^b`, `a[b`, `a]b`, `normal` | criados como escritos |

## 3. O que isso mostra

- Num **link**, o Obsidian no macOS toma a `\` como parte do nome, não como
  separador: `[[pasta\nota]]` não chega a `pasta/nota.md`. O Verso, que
  estende o Obsidian e nunca o contradiz (invariante 12), faz o mesmo: uma
  `\` num link não vira `/`. O que o Verso escreve usa `/`, que o Obsidian
  resolve em todo sistema.
- Num **caminho entregue ao vault**, o Obsidian converte `\` em `/` antes de
  checar o nome.
- No macOS o Obsidian recusa só `\`, `/` e `:` num nome. Ele cria nomes que
  o Windows não guarda — `* " < > ? |`, um nome de dispositivo (`CON`,
  `NUL`, `COM1`), ponto ou espaço no fim —, que uma pasta sincronizada com o
  Windows depois não consegue levar. Recusá-los em todo sistema quando uma
  nota é criada ou renomeada é mais estrito que o Obsidian, não contrário a
  ele: nenhum nome existente muda de sentido.

## 4. Não observado

- O Obsidian no Windows (a resolução de links com `\` e os nomes que os
  diálogos dele recusam lá).
- Os diálogos de nova nota e de renomear da janela, que podem checar mais
  que o `Vault.create`.
- Linux, diferenças só de maiúsculas (spec Q8) e normalização Unicode (Q7).
