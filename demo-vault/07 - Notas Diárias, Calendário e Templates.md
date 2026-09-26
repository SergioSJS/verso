---
title: Notas Diárias, Calendário e Templates
date: 2026-09-25
tags:
  - daily
  - calendario
  - templates
  - produtividade
status: ativo
---

# Notas Diárias, Calendário e Templates

O Verso possui um ecossistema completo para produtividade pessoal e registro contínuo, unindo **Notas Diárias (Daily Notes)**, navegação temporal via **Painel de Calendário** e automação com **Templates**.

---

## 📅 Notas Diárias (Daily Notes)

As Notas Diárias funcionam como um registro cronológico do seu dia a dia (diário, registro de tarefas, reuniões e ideias rápidas).

### Como Acessar a Nota de Hoje
1. **Pela Ribbon Lateral**: Clique no ícone de calendário na barra vertical à esquerda.
2. **Por Atalho**: Pressione `⌘D` (ou `Ctrl+D`).
3. **Pela Paleta de Comandos**: Pressione `⌘P` (ou `Ctrl+P`) e digite `Hoje` ou `Daily`.

Se a nota do dia atual ainda não existir, o Verso a cria automaticamente na pasta configurada (por padrão, `daily/`).

### Formato e Organização
- As notas recebem automaticamente o nome no padrão `YYYY-MM-DD.md` (por exemplo: `2026-09-25.md`).
- Você pode navegar entre os dias anteriores e seguintes facilmente pelos links ou pelo painel de calendário.
- Exemplos já disponíveis neste vault:
  - [[daily/2026-09-24|Nota de Ontem (2026-09-24)]]
  - [[daily/2026-09-25|Nota de Hoje (2026-09-25)]]

---

## 🗓️ Painel de Calendário na Barra Direita

Na barra lateral direita do Verso, você encontra a aba com ícone de calendário:

### Funcionalidades do Calendário:
- **Visão Mensal**: Navegue entre os meses pelas setas de navegação.
- **Indicadores de Notas**: Os dias que já possuem uma nota registrada exibem um ponto indicador logo abaixo do número do dia.
- **Abertura com 1 Clique**: Clique em qualquer dia para abrir instantaneamente a nota daquela data (ou criá-la se ainda não existir).
- **Retorno ao Dia Atual**: Clique no botão "Hoje" no topo do calendário para voltar imediatamente à data de hoje.

---

## 📋 Uso e Criação de Templates

Templates no Verso são arquivos Markdown normais armazenados na pasta designada como pasta de templates (configurada em **Ajustes › Arquivos e links › Pasta de templates**, por padrão `templates/`).

### Templates Inclusos no Vault de Teste:
- [[templates/Nota Diária|Template de Nota Diária]]: Estrutura com prioridades, tarefas do dia e notas soltas.
- [[templates/Nota de Reunião|Template de Nota de Reunião]]: Pauta, participantes, decisões e plano de ação.
- [[templates/Novo Projeto|Template de Novo Projeto]]: Metadados de projeto, escopo, entregáveis e cronograma.

### Como Inserir um Template em Qualquer Nota:
1. Em qualquer linha vazia da sua nota, digite `/template` (ou apenas `/`).
2. Selecione a opção **Inserir template** no menu de contexto.
3. Escolha o template desejado e pressione `Enter`. O conteúdo do template será inserido na posição do cursor.
4. Alternativamente, use a Paleta de Comandos (`⌘P`) e selecione **Inserir template…**.

### Como Salvar a Nota Atual como um Template:
- Abra o menu de comandos (`⌘P`) e selecione **Salvar esta nota como template**, ou acesse pelo menu de contexto da aba. A nota será copiada imediatamente para a pasta de templates.

---

Parabéns! Você concluiu todos os guias fundamentais do Verso.
Retorne para a [[00 - Bem-vindo ao Verso|Página Inicial]] para explorar e personalizar seu vault!
