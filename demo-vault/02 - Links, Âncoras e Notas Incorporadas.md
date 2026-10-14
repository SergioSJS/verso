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

### Incorporar só um bloco

Um `^id` no fim de um parágrafo, de um item de lista ou de um título dá nome àquele bloco; `![[nota#^id]]` mostra só ele, e `[[nota#^id]]` leva até ele. Um `^id` sozinho numa linha, depois de uma linha em branco, nomeia o bloco de antes — uma tabela, um bloco de código, uma citação. Este embed mostra só o terceiro item das descobertas:

![[Projetos/Pesquisa e Descobertas#^atomica]]

Se o mesmo `^id` aparecer duas vezes numa nota, vale o último, como no Obsidian, e a nota avisa. A marca `^id` não aparece na Leitura; no Editar ela fica apagada, para você ver onde está.

---

## 4. Quem Aponta para Esta Nota

Todo link cria o caminho de volta. Abra o painel da direita (`⌘⌥→`, ou o botão no canto direito da barra de status) e veja as abas:

- **Links**: em cima, os **Backlinks** — as notas que apontam para a nota aberta — e, em **Menções sem link**, as que citam o nome dela sem ser link; embaixo, depois de um traço, os **Links de saída**: para onde esta nota aponta.
- **Estrutura**: os títulos da nota, para pular entre eles.

### Menções sem link

Em **Menções sem link**, cada linha é um lugar onde outra nota escreve o nome desta sem ser link — o nome inteiro, maiúsculas ou minúsculas tanto faz, acentos contam ("Porto" acha "porto", não "Pôrto"), e cada um dos `aliases` da nota vale como nome. Código, comentários, tags e o que já é link ficam de fora. A linha mostra o trecho em volta, e:

- **Linkar** troca aquele trecho por um link ali mesmo: `[[Nome]]`, ou `[[Nome|texto]]` quando o texto escrito é outro (outra caixa, um alias). Numa nota aberta numa aba, ⌘Z desfaz.
- **Linkar todas** mostra antes, como um diff, cada nota e cada linha que vai mudar; nada é gravado até você confirmar, e uma nota que mudou nesse meio-tempo fica de fora, com o nome dito.

Quem só lê uma pasta num servidor vê a lista, sem os botões.

> [!example] Experimente
> Esta frase escreve o nome Lia Torres sem link. Abra a nota dela (⌘P e o nome dela), vá em **Links** no painel da direita e, em **Menções sem link**, clique em **Linkar** na linha desta nota: a frase passa a ter o link.

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
