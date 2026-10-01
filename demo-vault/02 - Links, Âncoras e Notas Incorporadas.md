---
title: Links, Âncoras e Notas Incorporadas
date: 2026-09-25
tags:
  - links
  - wikilinks
  - ancoras
  - embeds
status: ativo
---

# Links, Âncoras e Notas Incorporadas

No Verso, as conexões entre notas são cidadãs de primeira classe. Este guia demonstra como criar wikilinks, navegar diretamente para seções internas com âncoras e incorporar notas e blocos.

---

## 1. Tipos de Wikilinks

### Link Direto
No modo **Leitura**, um clique segue o link. No modo **Editar**, o clique põe o cursor no link, para editá-lo — `⌘` + clique o segue.

Link para uma nota existente pelo nome. Ao digitar `[[`, o Verso sugere as notas e os arquivos da pasta, o mais parecido primeiro; `[[Nota#` sugere os títulos daquela nota, e `[[#` os títulos desta. O formato do link inserido segue **Ajustes › Arquivos e links › Formato de novo link** (o mais curto possível, relativo à nota, ou a partir da raiz da pasta).
- [[00 - Bem-vindo ao Verso]]
- [[01 - Guia de Markdown e Sintaxe]]

Outro jeito: arraste uma nota da árvore de arquivos para o texto — entra um link para ela no ponto onde você soltar (uma imagem ou um PDF entram como embed).

### Link com Apelido (Alias)
Altere o texto visível mantendo o destino original com a barra vertical `|`:
- [[00 - Bem-vindo ao Verso|Ir para a Página Inicial]]
- [[01 - Guia de Markdown e Sintaxe|Acessar o Guia de Sintaxe]]

### Link para Nota Inexistente (Criação Automática)
Clique no link abaixo para testar o comportamento de criação automática estilo Obsidian (a nota será criada e aberta instantaneamente no editor):
- [[Nova Ideia de Projeto]]

---

## 2. Saltos de Cabeçalho (Âncoras)

### Salto dentro do Próprio Documento
Clique para rolar suavemente até a seção de teste no final deste arquivo:
- [[#Seção de Destino Local|Pular diretamente para a Seção de Destino Local]]

### Salto para Cabeçalho em Outra Nota
Você também pode apontar para cabeçalhos de outras notas usando a sintaxe `[[Nota#Título]]`:
- [[01 - Guia de Markdown e Sintaxe#Fórmulas Matemáticas em KaTeX|Ver Fórmulas Matemáticas no Guia de Sintaxe]]
- [[01 - Guia de Markdown e Sintaxe#Blocos de Código com Botão de Copiar|Ver Blocos de Código]]

---

## 3. Notas Incorporadas (Transclusão / Embeds)

Você pode incluir o conteúdo de outra nota dentro desta nota usando o prefixo `!`. Passe o mouse sobre a nota incorporada: o botão **Editar ao lado** abre a nota original numa divisão ao lado, pronta para editar.

![[projetos/Pesquisa e Descobertas]]

---

## 4. Quem Aponta para Esta Nota

Todo link cria o caminho de volta. Abra o painel da direita (`⌘⌥→`, ou o botão no canto direito da barra de status) e veja as abas:

- **Backlinks**: as notas que apontam para a nota aberta — e, em **Menções sem link**, as que citam o nome dela sem ser link.
- **Links de saída**: para onde esta nota aponta.
- **Estrutura**: os títulos da nota, para pular entre eles.

Renomear uma nota não quebra nada: o Verso mostra as notas que apontam para ela e atualiza os links quando você confirma (veja [[14 - Arquivos e Pastas]]).

---

## Espaçamento para Teste de Rolagem

Abaixo temos algumas linhas de preenchimento para garantir que o salto com âncora role visivelmente a tela.

...
...
...
...
...
...

---

## Seção de Destino Local

> [!NOTE]
> **Você chegou à Seção de Destino Local!**
> Se você clicou no link `[[#Seção de Destino Local]]`, a tela rolou até aqui automaticamente.

Voltar para [[00 - Bem-vindo ao Verso|Início]] ou seguir para [[03 - Propriedades e Metadados]].
