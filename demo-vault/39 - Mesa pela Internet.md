---
title: Mesa pela Internet
date: 2026-11-04
tags:
  - verso
  - servidor
  - mesa
  - cloudflare
  - guia
status: active
---

# Mesa pela Internet

Você quer jogar com gente que não está na sua casa, sem alugar servidor nem entender de rede? O Verso do seu computador pode **virar um servidor** por algumas horas: você liga, manda um **link** às jogadoras, elas entram pelo navegador e jogam na [[31 - A Mesa|Mesa]], como num UniVerso ([[23 - Verso num Servidor]]). É a mesma ideia de rodar o Foundry no seu computador: **o computador precisa ficar ligado e acordado** enquanto a mesa acontece.

É **um recurso só**, o **Transformar em servidor**, com duas caixas: servir **na sua rede** (os celulares que você [[22 - Verso no Celular e no Tablet|pareia]]) e servir **por um link na internet**. Marque uma, a outra ou as duas.

> [!WARNING] O link é um modo de teste
> O link usa um serviço de teste da Cloudflare: sem garantia de funcionamento, até 200 pedidos ao mesmo tempo. O Verso diz isso na própria caixa. Só entra quem você convidar, e ninguém vê uma pasta que você não compartilhou. **Desligue quando a sessão acabar.**

---

## 1. Ligar o link

1. Abra a pasta da campanha no Verso e vá em **Ajustes › Transformar em servidor**.
2. Em **Pastas servidas**, marque a pasta da campanha. Nenhuma vem marcada. Para a mesa, sirva a **pasta inteira**: é ela que você vai convidar e é nela que você vai sentar.
3. Em **Onde servir**, marque **Por um link na internet (Cloudflare, modo de teste)**. Se não quiser servir celulares na sua rede, deixe **Na minha rede** desmarcada: com só o link, o computador não aceita nada pela rede da casa.
4. Toque em **Ligar o servidor**. Na **primeira vez** o Verso baixa o **cloudflared**, o programa da Cloudflare que abre o link (cerca de 40 MB), e confere a soma dele antes de usar. Demora um pouco; o painel diz o que está acontecendo.
5. Quando aparecer **Link no ar.**, o painel mostra o **Endereço da mesa**, com **Copiar link** e **Mostrar o QR do link**. A barra de status passa a dizer **Servindo · link na internet**, e o ícone do livro na barra de menus do Mac (ou na área de notificação do Windows) ganha uma linha **Link pela internet ligado**; no Linux fica só a marca da barra de status.

O painel também diz:

- **Quanto falta**: *Fecha sozinho em … h … min*. O link dura **12 horas**. **Prorrogar por 12 horas** mantém o **mesmo link** por mais 12. Passou das 12 sem prorrogar, o link fecha e o painel avisa; ligue de novo para um link novo.
- **Um link rápido muda a cada vez que liga.** Mande o novo às pessoas; os convites feitos antes apontam para o link antigo.
- Se a rede bloqueia UDP: *o link passou a usar HTTP/2*. Funciona igual, às vezes um pouco mais devagar.
- O **cloudflared** é da Cloudflare, licença Apache-2.0; a lista está em **Ajustes › Créditos**.

### Se não ligar

O painel diz o motivo em palavras. Os mais comuns:

- *Não foi possível baixar o cloudflared do GitHub*: sem internet, ou o GitHub não respondeu. Confira a conexão e tente de novo.
- *O cloudflared baixado não confere com a soma que o Verso fixa*: o arquivo foi recusado e apagado. Tente mais tarde.
- *O cloudflared não alcançou a Cloudflare*: a rede parece bloquear. Tente outra rede.
- *A Cloudflare não deu um link a tempo*: o serviço de teste pode estar fora. Tente em instantes.

---

## 2. Convidar as jogadoras

Em **Convidar pessoas**:

1. Em **Pasta**, escolha a pasta servida (ou **Nenhuma (só a conta)**), e em **Pode**, **Ler** ou **Editar**.
2. **Criar convite**. O link aparece **uma única vez**: **Copiar convite** e mande à pessoa por onde preferir. Vale por **7 dias** e serve para **uma pessoa só**.
3. A jogadora abre o link, cria a conta com **qualquer e-mail dela** (**nada é enviado**: o e-mail só serve de nome de entrada), um nome e uma senha, e depois entra pelo endereço da mesa.
4. A lista **Convites** mostra cada um (esperando, aceito por…, encerrado, expirado) e **Encerrar** fecha um que ainda espera.

Se o convite sair pelo endereço da **sua rede** (a caixa do link desmarcada), o painel avisa: só abre quem estiver nela, e o navegador vai reclamar do certificado do computador — é o mesmo aviso do [[22 - Verso no Celular e no Tablet#Parear o Celular com o Seu Computador|pareamento do celular]]; aceite só numa rede em que você confia.

Quem entra vê só o que você compartilhou, com o papel que você deu. Como mestrar a mesa (liberar notas, jogadoras, direitos) está em [[32 - Rodando uma Mesa]].

**Para quem foi convidado:** a página de entrada lembra de abrir **primeiro** o link do convite e criar a conta. Se a mesa não responder, a janela diz **A mesa está offline** — o computador de quem mestra pode ter desligado ou dormido, ou o link acabou — com **Tentar de novo**, e tenta sozinha a cada 30 segundos. Se a mestra mandou um link novo, é só abri-lo.

---

## 3. Sentar à mesa

Servir não abre a mesa na **sua** janela. Para mestrar, vá a **Esta janela na mesa** e use **Sentar à mesa** na pasta da janela (ela precisa estar servida inteira). A janela passa a ser cliente do seu próprio servidor, como dona: tem a Mesa, a campanha e os convites, como num UniVerso. A barra de status mostra **Na mesa**.

**Sair da mesa** (na seção, ou na marca da barra de status) volta à pasta deste computador. Se o servidor **parar** com a janela sentada, ela volta sozinha para a pasta do computador e avisa. Na próxima vez, o Verso abre a pasta do computador, nunca a mesa.

### Links de leitura

Em **Links de leitura**, **Ligar os links de leitura** vem **desligado**. Ligado, você cria um link no menu de uma nota ou pasta **na janela sentada à mesa**, e quem o tiver lê, sem conta e sem editar. Desligar **fecha todos os links na hora**; ligar de novo reabre os que você não revogou. Um link nunca abre uma pasta servida só em parte.

---

## 4. O seu endereço, que não muda

O link rápido muda a cada vez. Se você tem um **domínio** seu, pode ter um endereço fixo, como `mesa.seudominio.com`, e **sem o limite de 12 horas**. Precisa de uma conta na **Cloudflare** com o domínio adicionado a ela (o plano grátis serve). Em **Usar meu endereço**:

1. **Tenha um domínio e adicione-o à Cloudflare** — uma vez, à mão. **Como adicionar um domínio à Cloudflare** leva à página deles.
2. **Entrar na Cloudflare**: o navegador abre, você entra e escolhe o domínio. O Verso espera até 10 minutos. Se o navegador não abrir, o painel mostra a página para abrir à mão.
3. Escreva o **Endereço** (`mesa.seudominio.com`: letras minúsculas, números e hífens, com um ponto) e toque em **Configurar**. O Verso cria o túnel e o registro de DNS; pode levar alguns minutos até abrir em todo lugar.

Depois, marque **Usar meu endereço no link (em vez de um link rápido)** com o link desligado. O mesmo endereço vale em todas as sessões.

- **Remover meu endereço** apaga o túnel na Cloudflare (o registro de DNS pode ficar lá; apague no painel se quiser). Se a Cloudflare não puder ser consultada, **Esquecer só neste computador** limpa daqui, e o túnel continua lá até você apagá-lo.
- Com **Manter ligado ao abrir o app**, o endereço próprio volta ao abrir o app; o link rápido, nunca.

---

## 5. Contas, senhas e outros apps

- **Senha ou passkey:** pela sua **rede**, entra-se com a **senha**. Uma **passkey** só vale pelo link da internet. A passkey feita num **link rápido some com ele**; no **seu endereço**, ela fica.
- **Apps Verso de outras pessoas:** quem você convidou pode conectar o próprio Verso (**Ajustes › Servidores**) e sincronizar a pasta compartilhada com ele. Use o **endereço do link**: pela rede, o Verso dela não confia no certificado do seu computador e não conecta. A lista mostra cada app com o nome e a pessoa, e **Encerrar** o desconecta. **Celulares nunca sincronizam**: usam a janela do navegador.
- **Tokens:** quem tem conta pode criar, no navegador, um token pessoal para um programa dela; ele alcança só as pastas daquela conta, e nunca abre nada do dono do computador.
- **Celular seu:** o pareamento por QR é **só pela rede**. Com o link sozinho, **Parear um celular** fica desligado e diz por quê.

---

## 6. Parar

**Parar de servir** (na seção, na barra de status ou no menu do ícone) desliga tudo de uma vez: o link, a rede e a janela sentada. Fechar o app faz o mesmo. Se o computador dormir, a mesa cai: quem joga vê **A mesa está offline**.

---

Se preferir um servidor que fique ligado sozinho, volte à [[38 - Instalar o servidor num NAS ou VPS]]. Ou vá à [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
