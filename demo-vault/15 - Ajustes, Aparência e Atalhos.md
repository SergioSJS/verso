---
title: Ajustes, Aparência e Atalhos
date: 2026-10-01
tags:
  - ajustes
  - aparencia
  - atalhos
status: ativo
---

# Ajustes, Aparência e Atalhos

`⌘,` abre os **Ajustes** (também no botão da faixa da esquerda e no menu **Verso › Ajustes…**). O campo **Buscar nos ajustes…** acha uma opção pelo nome.

---

## As Seções

- **Geral**: o idioma (**Sistema**, **Português (Brasil)** ou **English**), o tempo do salvamento automático, as atualizações, o console do desenvolvedor, o conteúdo remoto e os sites permitidos nas notas.
- **Notificações**: para cada tipo — sincronização, conflitos, compartilhamento, atualizações, cota, lixeira, presença — **Aviso e lista**, **Só na lista** ou **Desligado**, e as notificações do sistema (veja [[18 - Ajuda, Atualizações e Diagnóstico#Notificações]]).
- **Aparência**: tema, paleta, fontes, tamanho do texto, cor dos títulos, largura do texto e o painel **Personalizar aparência**, com perfis e temas para compartilhar.
- **Editor**: abas de pré-visualização, o modo em que as notas abrem, a correção ortográfica e os números de linha.
- **Arquivos e links**: pastas de build e `.gitignore`, o formato dos links novos, e as pastas de anexos, das notas diárias e dos templates.
- **Board**: como um `.canvas` abre e como os boards novos nascem (veja [[09 - Board e Relações]]).
- **Atalhos**: as teclas de cada comando.
- **Terminal e agentes**: o comando `verso` e o Verso nos agentes de IA (veja [[17 - Terminal, CLI e Agentes]]).

---

## Da pasta ou desta máquina

Três ajustes são da pasta, não do computador: os **Favoritos**, as **pastas de build** e o **`.gitignore`** (em **Arquivos e links**) e o **Nome da nota da pasta** (em **Organização**). Eles ficam dentro da própria pasta, em `.verso/settings.json`, e viajam com ela: abra a pasta sincronizada em outro computador — pela sincronização do Verso (veja [[23 - Verso num Servidor]]), iCloud, OneDrive, Syncthing ou git — e eles estão lá. Ao lado de cada um, os Ajustes dizem **Da pasta** ou **Desta máquina**: desta máquina enquanto a pasta não tem o arquivo, que só aparece na primeira mudança — abrir uma pasta nunca o cria. Quem só lê uma pasta de servidor guarda os favoritos dela neste computador, e a estrela funciona do mesmo jeito: ao lado deles, os Ajustes dizem **Desta máquina**.

Experimente: em **Arquivos e links**, desligue **Ignorar pastas de build** e veja a etiqueta passar a **Da pasta**; ligue de novo para voltar.

---

## Aparência

- **Tema**: **Sistema**, **Claro** ou **Escuro**.
- **Paleta de cores**: **Papel** (a padrão), **Sépia**, **Ardósia** e **Musgo**.
- **Tom do escuro**, no tema escuro: **Suave** (o padrão, para ler e escrever por horas), **Profundo** (quase preto, para um quarto escuro ou uma tela OLED) e **Penumbra** (mais claro).
- **Botões da faixa lateral**: cada um com o seu interruptor; a engrenagem de Ajustes fica sempre, para que haja volta.
- **Tamanho da fonte**: de 12 a 30 pixels.
- **Fonte dos títulos** e **Fonte do texto**: serifada clássica, sem serifa moderna, editorial literária, monoespaçada ou a do sistema.
- **Cor de destaque dos títulos**: de âmbar a ametista.
- **Largura do texto**: confortável (100 caracteres) ou toda a área.

Experimente agora: troque a paleta para **Sépia** e o tema para **Escuro**, compare os três tons do escuro, e volte.

### Personalizar aparência

Logo abaixo, em **Ajustes › Aparência**, fica o painel **Personalizar aparência**. À direita há uma página de exemplo — títulos, texto, um link, uma etiqueta, uma citação, código, uma tabela, um botão e um aviso —, desenhada com as mesmas classes de uma nota; à esquerda, os controles. Mude uma cor e a página de exemplo e a janela inteira mudam na hora, sem recarregar.

- **Claro e Escuro** se editam à parte: escolha o lado em **Lado que você edita**. O exemplo mostra o lado que você edita.
- **Cores**: papel, papel 2, linhas finas, tinta, tinta 2, selo (links e destaques) e latão (títulos e marcas). Cada uma tem o seletor de cor e um campo de texto, que aceita `#rrggbb`, `rgb()`, `hsl()` e `oklch()`. As cores de apoio — o terceiro papel, a tinta de apoio, os fundos suaves — o Verso calcula a partir dessas.
- **Fontes e tamanho**: a fonte dos títulos, a de leitura, a de código, e o tamanho do texto.
- **Contraste**: a razão entre o texto e o fundo, ao vivo. Abaixo de **4,5:1** o painel avisa — muita gente lê mal assim —; se uma escolha deixasse um par abaixo de **3:1**, ela é desfeita sozinha, uma vez, com uma mensagem que diz o que foi desfeito.
- **Restaurar padrão** está sempre no alto do painel, e se alcança com o teclado.

**Perfis**: dê um nome ao visual atual e **Salvar como perfil**; depois escolha na lista e **Usar**, **Renomear** ou **Excluir**. Cada aparelho guarda os seus; num servidor, eles vão com a sua conta.

**Compartilhar**: **Exportar…** guarda o visual num arquivo `.verso-theme` pequeno, só com cores, fontes e tamanho — nunca uma nota, nunca CSS livre. Para usar o de outra pessoa, **Importar…** ou arraste o arquivo para a janela. O Verso confere o arquivo: só aceita as cores e as fontes da lista, e recusa o que deixaria o texto ilegível, dizendo por quê. Há um para experimentar: [[Pergaminho.verso-theme]] (está em `assets/temas`) — arraste-o para a janela e depois use **Restaurar padrão** para voltar.

**Sugerir à pasta**: quem pode escrever na pasta pode **Sugerir à pasta** o visual atual. Quem a abrir vê um aviso — **Esta pasta sugere o tema …** — com **Usar** e **Agora não**; a pasta nunca aplica nada sozinha, e a resposta fica lembrada neste aparelho. **Remover a sugestão** desfaz.

Experimente: mude a **Tinta** para um azul-escuro, veja o exemplo mudar, tente um cinza claro demais e leia a mensagem que desfaz a escolha; depois **Restaurar padrão**.

---

## Atalhos

Em **Atalhos**, cada comando mostra a sua tecla e o botão **Alterar**: clique, e aperte a combinação nova — ela precisa ter `⌘` (ou ser `⌥ Enter`, a do **Abrir link sob o cursor**). Se outro comando já usava aquela combinação, ela sai dele. **Restaurar** volta ao padrão.

**Zoom da janela** (no aplicativo de mesa): `⌘+` aumenta, `⌘-` diminui e `⌘0` volta a 100 % (`Ctrl` no Windows e no Linux), de 50 % a 200 %, de 10 em 10; `Ctrl` com a roda do mouse ou o gesto de pinça no trackpad fazem o mesmo — menos sobre um board, um mapa, um PDF ou o grafo, que dão zoom nele mesmo. Cada computador guarda o seu zoom. É diferente do **Tamanho da fonte**, que só aumenta o texto. No navegador vale o zoom do próprio navegador.

Os atalhos do dia a dia estão na [[00 - Bem-vindo ao Verso|Página Inicial]]; os do board, em [[10 - Desenhando no Board]].

---

## A Faixa da Esquerda

Os botões da faixa da esquerda (arquivos, busca, nota de hoje, grafo…) se arrastam para mudar de ordem. Com o botão direito num deles: **Mover para cima**, **Mover para baixo**, **Ocultar este botão**, **Mostrar botões ocultos** e **Restaurar ordem**.

---

Siga para [[16 - Páginas Web e HTML]] ou volte para a [[00 - Bem-vindo ao Verso|Página Inicial]].
