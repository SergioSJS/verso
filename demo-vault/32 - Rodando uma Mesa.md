---
title: Rodando uma Mesa
date: 2026-10-22
tags:
  - rpg
  - servidor
status: ativo
---

# Rodando uma Mesa

Uma **mesa** é uma pasta de campanha num UniVerso (o Verso num servidor seu, [[23 - Verso num Servidor]]): você, a mestra, convida as jogadoras só para ela, e cada nota fica **oculta** até você liberar. Nada disso é escrito nas notas: o que está liberado, o que tem nome secreto e quem pode editar fica no banco do servidor, então um arquivo sincronizado, ou aberto no Obsidian, é uma nota comum.

Só a dona da pasta faz isto, numa pasta de um servidor ou numa pasta deste computador **sincronizada** com ele ([[23 - Verso num Servidor]]): a mestra pode conduzir a sessão do app de desktop, com a pasta local, enquanto as jogadoras usam o navegador ou o app do Windows na pasta do servidor. Sem conexão (ou com a sincronização pausada) a mesa fica indisponível e o painel **Mesa** diz isso; ela volta sozinha quando a conexão volta. Numa pasta só deste computador não há mesa, e nada disto aparece.

---

## Fazer da pasta uma mesa

1. Com a pasta aberta, o painel **Mesa** tem o botão **Tornar esta pasta uma mesa** (só para a dona de uma pasta de servidor que ainda não é mesa); depois dele, **Abrir a janela da Mesa**. Pode haver quantas mesas quiser na mesma pasta aberta, uma por subpasta, **e cada mesa tem a sua própria conversa** (o painel **Mesa** acompanha a nota aberta e diz *Mesa: nome*, veja [[31 - A Mesa]]): cada pasta que é mesa ganha um selo **Mesa** na lista, e para a dona ele abre a janela *daquela* mesa; as jogadoras veem o selo **Mesa · jogador**, que mostra o que podem fazer ali (ler as notas liberadas e editar as que foram entregues a elas naquela mesa, em links) e não tem ajustes. O botão ao lado do nome da pasta acompanha a nota aberta: **Mesa: nome** da mesa que a contém, ou **Mesas (N)** com a lista quando a nota está fora de todas. Também dá pelo botão direito numa pasta › **Tornar esta pasta uma mesa**, ou, para a pasta toda, no fundo da lista › **Tornar a pasta toda uma mesa**. Numa pasta só deste computador o painel diz por que não há mesa.
2. A janela **Mesa** abre. Toda nota da pasta, as que já estavam e as que você fizer depois, começa **oculta**, com um cadeado na lista.
3. Para voltar atrás: **Desfazer mesa** na mesma janela, ou no menu da pasta. Os arquivos nunca mudaram.

Uma mestra pode ter várias mesas, uma pasta cada.

---

## Convidar as jogadoras

Na janela **Mesa**, **Convidar jogadores › Gerar link** faz um link de uso único, válido por 7 dias, que dá **leitura** desta mesa e só dela: quem aceita vê a pasta da mesa e nada acima nem ao lado. **Copiar o link** e mande.

Só quem administra o servidor convida alguém que ainda não tem conta; quem já tem conta entra pelo **Compartilhar…** da pasta ([[14 - Arquivos e Pastas]]). E quem já tem conta neste servidor, de outra mesa, **aceita o link com a conta que tem**: na página do convite, se já está dentro, o botão é **Entrar na mesa como** seu nome (**Não sou eu** sai da conta); se não, **Já tenho conta — entrar e aceitar** pede o e-mail e a senha ali mesmo. Não se cria outra conta, e um convite feito para um e-mail só serve àquela conta.

**Mesa aberta** é uma **chave** no topo da janela, com um selo **Aberta** ou **Fechada**, e vale na hora: não há botão de salvar. Desligada, as jogadoras não conseguem abrir a pasta e quem está dentro sai; e você sempre entra. **O que a jogadora vê:** no lugar da pasta, "A mesa está fechada pelo mestre. Você entra quando ela abrir.", com **Tentar agora**; o app tenta de novo sozinho, de vez em quando, e ela entra assim que você ligar a chave. Para você, o botão da Mesa ao lado do nome da pasta diz **Mesa (fechada)** enquanto estiver desligada, para você não esquecer ninguém do lado de fora.

A janela é feita de cartões: **Convidar jogadores** (o link num campo, com **Copiar** e o dia em que vence), **Jogadores** (cada uma com o que você entregou a ela para editar, em links), **Notas** (quantas liberadas e quantas ocultas, com **Liberar tudo** e **Ocultar tudo**) e, recolhidos, os limites em **Avançado**. **Desfazer mesa** fica no pé, em vermelho e discreto, e pergunta antes.

**Na página da pasta** (a que abre ao clicar no nome da pasta) a mesma coisa cabe num cartão **Mesa** logo abaixo do título: a chave, quantas jogadoras há e quem está na mesa agora, **Convidar**, **Liberar tudo** / **Ocultar tudo** e **Configurações da mesa**, que abre a janela inteira; você pode recolher o cartão, e o app lembra por pasta. Numa pasta que ainda não é mesa, o cartão é só o botão **Tornar esta pasta uma mesa**. A jogadora vê uma linha, **Mesa · jogador**, com a mesa aberta ou fechada e as notas entregues a ela, em links.

---

## Liberar aos poucos

- Botão direito numa nota › **Liberar para a mesa**. Ela aparece na lista das jogadoras, nas buscas, no grafo, nos links e nos quadros; sincroniza para o aparelho delas.
- **Ocultar da mesa** a tira de novo (o aparelho recebe a ordem de largá-la).
- Numa pasta da mesa: **Liberar tudo daqui** e **Ocultar tudo daqui**. Selecionando várias notas, o mesmo no menu da seleção. Na janela **Mesa**: **Liberar tudo**.

Uma nota oculta não existe para a jogadora: não está em lista nenhuma, e pedir por ela responde como pedir por uma que nunca houve. As imagens e arquivos só aparecem se uma nota **liberada** os mostra. Os blocos `> [!secret]` ([[25 - Dados e Tabelas Sorteadas]]) continuam escondendo um pedaço de uma nota liberada.

---

## Um link para uma nota que ainda não apareceu

Numa nota liberada, `[[Barão]]` para uma nota oculta chega à jogadora como **Barão 🔒**: o texto, sem link, para ela saber que há algo. Com apelido, `[[A traição do barão|um rumor]]` vira **um rumor 🔒**. Um incorporado `![[Cripta]]` vira "🔒 (ainda não revelado)". Nunca vai o caminho, o título de uma seção nem um `^id`.

Quando o nome já é um spoiler: botão direito na nota oculta › **Nome secreto**, e todo link para ela vira ▒▒▒▒, com o mesmo tamanho sempre. Um cartão de **board** para uma nota oculta também chega como um cartão trancado. Ao liberar a nota, os links funcionam para todo mundo.

---

## Quem edita

Por padrão as jogadoras só leem. Botão direito numa nota › **Editável por** escolhe **ninguém**, **o grupo** (todas as jogadoras editam: a nota do grupo) ou **uma jogadora** (a ficha dela). A nota fica liberada com a permissão, e quem edita a lê **inteira**, com os blocos secretos e os links como você os escreveu: se há segredo nela, não a dê para ninguém.

Ninguém além de você renomeia, apaga ou cria notas ou arquivos; o servidor confere isso em cada porta (a janela, a sala de edição, o aparelho sincronizado).

---

## Limites da mesa

Em **Avançado: limites da mesa** (recolhido; cada campo salva ao sair dele ou com Enter e diz **Salvo** ao lado): quantas entradas o registro da [[31 - A Mesa|Mesa]] guarda (de 1.000 a 200.000; 20.000 de início) e o tamanho de uma imagem nela (de 1 a 30 MB; 10 de início). Passando do limite do registro, saem as mais antigas que não estão fixadas. Cada mesa tem o seu registro e os seus limites: o ajuste de uma não muda a outra.

---

Volte a [[31 - A Mesa]], consulte a [[00 - Bem-vindo ao Verso|Página Inicial]] ou explore o [[Tour do Verso.canvas|Tour do Verso]].
