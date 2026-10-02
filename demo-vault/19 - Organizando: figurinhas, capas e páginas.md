---
title: "Organizando: figurinhas, capas e páginas"
date: 2026-10-02
tags:
  - organizacao
  - figurinhas
  - capas
  - pastas
  - ordem
status: ativo
sticker: "🎨"
color: "#e8590c"
---

# Organizando: Figurinhas, Capas e Páginas

O Verso oferece ferramentas visuais e estruturais para você organizar suas notas com identidade e clareza, mantendo tudo em Markdown puro e sem bancos de dados ocultos.

---

## 1. Figurinhas e Cores de Destaque

Cada nota ou pasta pode ter sua própria figurinha (emoji ou ícone Lucide) e cor de destaque:

- **Na árvore de arquivos**: o ícone e a cor identificam o item rapidamente na barra lateral.
- **Nas abas**: a figurinha aparece no título da aba aberta.
- **No cabeçalho da nota**: a figurinha e a cor acompanham o título no topo do documento.

### Como Definir
1. Clique no ícone de figurinha ao lado do título da nota aberta, ou clique com o botão direito no arquivo/pasta na árvore e selecione **Alterar figurinha…** ou **Alterar cor…**.
2. Escolha um emoji recente, busque na lista completa ou alterne para a aba de ícones Lucide (`lucide//<nome>`).
3. Selecione uma cor da paleta recomendada ou informe um valor hexadecimal personalizado.

No frontmatter YAML, as propriedades são salvas de forma limpa e transparente:
```yaml
---
sticker: "🚀"
color: "#e8590c"
---
```

---

## 2. Capas de Notas e Reposicionamento

Adicione um banner visual no topo da sua nota para destacar projetos, diários ou documentos especiais:

- **Adicionar Capa**: passe o mouse sobre o topo da nota e clique em **Adicionar capa** (ou use o menu de opções da nota).
- **Escolha da Imagem**: selecione uma imagem do seu cofre (como `assets/capa.jpg`) ou forneça uma imagem externa segura.
- **Reposicionamento Vertical**: passe o mouse sobre a capa e clique em **Reposicionar**. Arraste a imagem verticalmente (ou use as setas `↑` e `↓` do teclado para acessibilidade) e clique em **Salvar**.

O Verso armazena o caminho e o alinhamento percentual diretamente nas propriedades da nota:
```yaml
---
banner: "assets/diagrama.svg"
banner_y: 42
---
```

---

## 3. Páginas de Pasta e Templates de Itens

Uma pasta pode funcionar como uma central de conteúdo com sua própria página de visão geral:

- Clique no nome da pasta na árvore para abrir a **Visão de Pasta**, que exibe todos os itens em formato de lista ou miniaturas.
- Se a pasta contiver uma nota homônima (`Projetos/Projetos.md`), essa nota é exibida como a **Página da pasta**.
- Para criá-la rapidamente, clique com o botão direito na pasta › **Criar página da pasta**.

### Automação de Novos Itens
A página de uma pasta pode padronizar novas notas criadas dentro dela através de metadados:
```yaml
---
items_sticker: "📝"
items_color: "#1971c2"
items_template: "Templates/Nota de Reunião.md"
---
```
Qualquer nova nota criada dentro dessa pasta já nascerá com a figurinha, a cor e a estrutura do template configurados automaticamente.

---

## 4. Ordenação Manual e Itens Fixados

Organize os arquivos da sua árvore na ordem que fizer mais sentido para o seu fluxo de trabalho, além da ordem alfabética:

- **Arrastar e Soltar**: arraste uma nota ou pasta para cima ou para baixo dentro da mesma pasta para definir sua ordem personalizada.
- **Teclado e Acessibilidade**: use o menu de contexto › **Mover para cima** ou **Mover para baixo** para reordenar sem o mouse.
- **Fixar no Topo**: clique com o botão direito no arquivo ou pasta › **Fixar no topo da pasta**.
- **Desafixar**: use o menu de contexto › **Desafixar da pasta** para retornar o item à lista normal.

O Verso registra a ordem manual e os itens fixados na nota da pasta correspondente, como listas limpas de nomes no frontmatter:
```yaml
---
order:
  - "Pesquisa e Descobertas"
  - "Projeto Alpha"
  - "Projeto Beta"
pinned:
  - "Pesquisa e Descobertas"
---
```

---

## 5. Ocultar Itens da Árvore

Se você possui arquivos de configuração, rascunhos ou notas auxiliares que não precisam poluir a visualização lateral:

- Clique com o botão direito no item na árvore e selecione **Ocultar da árvore**.
- Para rever e gerenciar arquivos ocultos deste cofre, abra **Ajustes › Organização › Itens ocultos da árvore**, onde você pode remover qualquer item da lista oculta com um clique.

---

## 6. Edição Direta de Notas Incorporadas (Flow)

No Verso, notas incorporadas (`![[Nome da Nota]]`) não são blocos estáticos:

- Tanto no modo **Leitura** quanto no **Live Preview**, passe o mouse sobre a nota incorporada e clique no corpo do texto para editá-la diretamente no local.
- O botão no canto superior direito alterna entre a edição direta e a visualização.
- Cada arquivo preserva seu próprio histórico de desfazer e refazer (`⌘Z` / `⌘⇧Z`), mesmo quando editado de dentro de outra nota.
- Se a mesma nota estiver aberta em outra aba ou divisão, todas as alterações são sincronizadas instantaneamente em tempo real.
- Prefere o comportamento clássico de abrir a nota ao lado? Desative a opção em **Ajustes › Organização › Edição de nota incorporada**.

Experimente editar o bloco incorporado abaixo:

![[projetos/Pesquisa e Descobertas]]

---

## 7. Gatilho Rápido de Emojis no Editor

Enquanto escreve no editor, você não precisa interromper a digitação para abrir o teclado de caracteres do sistema:

- Digite `:` seguido das primeiras letras do nome de um emoji (por exemplo, `:fog` para 🚀 ou `:pen` para ✍️).
- Uma janela de autocompletar aparecerá com sugestões pesquisáveis em português e inglês.
- Use as setas `↑` e `↓` para navegar, pressione `Enter` ou `Tab` para inserir o emoji escolhido, ou pressione `Esc` para fechar.
- Esta função pode ser ativada ou desativada em **Ajustes › Organização › Sugerir emojis com ':'**.

---

Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
