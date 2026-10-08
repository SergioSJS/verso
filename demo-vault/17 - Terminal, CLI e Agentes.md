---
title: Terminal, CLI e Agentes
date: 2026-10-01
tags:
  - terminal
  - cli
  - agentes
  - mcp
status: ativo
---

# Terminal, CLI e Agentes

O Verso também trabalha fora da janela: o comando `verso` busca nas suas notas pelo terminal, e um agente de IA (como o Claude) pode ler o cofre pelo protocolo MCP — sem nunca escrever nele.

---

## Instalar o Comando `verso`

Em **Ajustes › Terminal e agentes › Comando verso no terminal**, clique em **Instalar**. O Verso põe o comando em `/usr/local/bin/verso` (o macOS pode pedir a sua senha); **Remover** o tira. Se já existe outro `verso` ali, o botão é **Substituir**.

No Windows não há o que instalar: o `verso.exe` vem com o app, na pasta dele. Rode-o pelo caminho, ou ponha essa pasta no PATH para digitar só `verso`.

---

## O que o Comando Faz

| Comando | Faz |
| :--- | :--- |
| `verso index ~/Notas` | indexa a pasta |
| `verso search ~/Notas reunião` | busca nas notas (`--limit 50` para mais resultados) |
| `verso backlinks ~/Notas "Projeto Alpha"` | quem aponta para uma nota (pelo nome, como num link, ou pelo caminho dentro da pasta) |
| `verso backlinks ~/Notas --unresolved` | os links que não levam a nenhuma nota: notas que ainda não existem, e anexos |
| `verso ~/Notas` | abre a pasta no app — com o app aberto, numa janela própria |
| `verso help` | a ajuda completa |

`--json` devolve a resposta em JSON, para scripts; `--lang pt-BR` ou `--lang en` escolhe o idioma.

---

## Agentes de IA (MCP)

Em **Ajustes › Terminal e agentes**:

- **Adicionar ao Claude Desktop** liga este cofre ao Claude Desktop (no Mac, com o comando `verso` instalado; no Windows ele já vem com o app). Sem o Claude Desktop instalado, o botão vira **Baixar o Claude Desktop** e abre a página de download.
- **Claude Code** mostra a linha que liga o cofre ao Claude Code (`claude mcp add …`), com **Copiar**.
- **Outros clientes MCP** mostra o JSON para outros programas.

O agente ganha nove ferramentas, todas só de leitura:

- `search` (buscar) e `list_notes` (listar as notas e os boards — também só as de uma tag, como `projeto`, ou de uma propriedade, como `status: ativo`);
- `read_note` (ler uma nota, com as propriedades e as tags dela);
- `links` e `backlinks` (as ligações de uma nota — e, quando a ligação é uma propriedade do frontmatter, como `aliado: "[[Barão]]"`, qual é a relação);
- `read_board` (ler um board: os cartões, as setas com as relações, os textos desenhados);
- `query_base` (consultar uma base, como a tabela que o Verso mostra);
- `unresolved` (os links sem destino) e `index` (atualizar o índice).

Experimente pedir: *"quais notas têm a tag projeto e o que o Tour do Verso mostra?"*. Ele lê; quem escreve é você.

---

Siga para [[18 - Ajuda, Atualizações e Diagnóstico]] ou volte para a [[00 - Bem-vindo ao Verso|Página Inicial]].
