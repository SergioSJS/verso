---
title: Verso num Servidor
tags:
  - verso
  - servidor
  - guia
---

# Verso num Servidor

O **Universo** é o Verso sem janela, numa máquina sua — um servidor em casa, um NAS, uma nuvem qualquer. As notas continuam **pastas comuns de arquivos Markdown** no disco dele; você as abre num navegador, no computador, no celular ou no tablet, e várias pessoas podem trabalhar na mesma pasta.

> [!NOTE] Quem hospeda vê as notas
> O servidor lê os arquivos para buscar e para editar junto: não há criptografia de ponta a ponta. Quem roda a máquina vê o que está nela, como num Notion seu.

---

## Instalar

Três jeitos, do mesmo programa (o guia completo está em `docs/reference/server-install.md`):

- **Docker**, para amd64 e arm64;
- **CasaOS e ZimaOS**, por um arquivo compose;
- um pacote **`.deb` ou `.rpm`** com um serviço do systemd, para uma máquina sem Docker.

Duas pastas importam: `VERSO_DATA_DIR`, num disco local, com as contas e os índices; e `VERSO_FOLDERS_DIR`, com as pastas de notas, que pode ficar num NAS. O backup é das duas.

Entrar pede **HTTPS**: um proxy reverso, o `tailscale serve` (o caminho mais simples para o celular e o iPad) ou o certificado do próprio servidor.

---

## O primeiro admin e as contas

- O admin vem das variáveis `VERSO_ADMIN_EMAIL` e `VERSO_ADMIN_PASSWORD`, **só na primeira subida**. Sem elas, o log mostra um link de configuração que vale uma hora.
- **Ninguém se cadastra sozinho**: o admin **convida**, com um link de uso único que vale sete dias, e vê quem o usou.
- Cada pasta tem um **dono**, **editores** e **leitores**. O admin não entra numa pasta sem dar acesso a si mesmo — e isso fica no registro que o dono lê.
- Senha esquecida: o admin gera um link de senha nova. Admin perdido: `universo admin reset <e-mail>` na própria máquina.
- Celular perdido: na página da conta, no console, **Encerrar sessões e tokens** desconecta a conta de todo navegador e aparelho na hora e revoga os tokens dela, sem trocar a senha — e fica no registro.
- Tudo isso fica no **console de administração** (o endereço `/admin`, ou Ajustes › Conta › *Administrar este servidor*), que só o admin vê: uma visão geral, as contas, as pastas com a **cota** de cada uma, os convites, o registro e a configuração do servidor.
- **Cota por pasta**: o admin limita o espaço de uma pasta; uma escrita que passaria do limite é recusada, e diminuir a pasta sempre é possível. Perto do limite, a janela avisa.
- Na página de uma pasta, **Últimas mudanças nos arquivos** diz quando, quem e o quê — com o **nome do aparelho** entre parênteses ao lado da conta, quando a mudança veio da sincronização de um aparelho. O registro do servidor também nomeia o aparelho quando recusa uma mudança.
- **Pede atenção**, na mesma página, aponta um nome guardado em **dois arquivos** no disco do servidor (o acento nas duas formas, de antes de um nome ser um arquivo só): só um sincroniza, e a linha diz qual remover ou renomear.

---

## A sua conta

Em **Ajustes › Conta** — o botão da pessoa, ao lado da engrenagem na faixa lateral, ou **Conta** no fim da barra lateral no celular:

- **passkeys** — entrar com a digital, o rosto ou o PIN, sem senha;
- as **sessões** abertas, e um botão para sair de todas as outras — encerrar a sessão de um aparelho o **desconecta na hora**, e a sincronização dele pede para conectar de novo em Ajustes › Servidores;
- **tokens de acesso** para scripts, presos a pastas e a ler ou escrever.

---

## Editar junto

Abra a mesma nota em duas janelas, ou com outra pessoa: o que um digita aparece no outro enquanto digita, com o cursor e o nome. O servidor grava o arquivo quando as edições assentam, e **nunca grava por cima** de uma mudança feita fora — essa mostra a diferença para vocês escolherem, como o Verso sempre fez.

Numa nota, num board ou num arquivo de texto que mudou em disco enquanto você digitava, são três saídas: **Descartar o meu e recarregar**, **Gravar o meu por cima** ou **Guardar os dois** — a versão do disco fica com o nome, e o seu texto vai para uma cópia ao lado, com o nome que a sincronização dá a um conflito.

---

## Do app desktop

Em **Ajustes › Servidores**, escreva o endereço do servidor e conecte: o navegador abre a página do servidor para você **permitir este computador** — ninguém cola token. Depois, escolha uma pasta do servidor, e a janela a mostra como se estivesse aqui.

Ali também fica o **nome deste aparelho** — por padrão, o nome do sistema. Dê um nome seu (dois computadores com o mesmo nome de sistema deixam de se confundir): ele vai no nome das cópias de conflito, na lista de sessões do servidor e nas últimas mudanças de cada pasta.

---

## Sincronizar uma pasta deste computador

Abrir uma pasta do servidor numa janela é trabalhar **online**: tudo passa pela rede. **Sincronizar** é o outro jeito: a pasta mora neste computador — abre sem rede, o Obsidian lê, o backup copia — e o servidor guarda os mesmos arquivos para os seus outros aparelhos, o navegador e quem divide a pasta com você.

Com a pasta aberta, em **Ajustes › Sincronizar**, escolha o servidor e **uma pasta nova** (com o nome desta) ou uma que você já tem lá. O espaço da pasta aparece antes de qualquer coisa cruzar. Depois:

- uma mudança de um lado vai para o outro — ao salvar, quando o servidor avisa, ao reconectar e a cada cinco minutos; sem rede, ela espera;
- arquivos grandes vão **em pedaços**, e só são gravados quando chegam inteiros;
- **na primeira vez nada é apagado**: o que só um lado tem vai para o outro;
- se os dois lados mudaram o mesmo arquivo, é um **conflito**: a versão do servidor fica com o nome, e a deste computador fica ao lado, como `Nota (conflito, Mac, 2026-10-10 15.34).md`. Em Ajustes › Sincronizar, a lista de conflitos mostra **a diferença**; junte à mão e apague a cópia;
- se os dois lados só **acrescentaram linhas ao fim** de uma nota, não é conflito: as linhas se juntam numa nota só, as do servidor primeiro, e a atividade recente diz *juntado*;
- um nome com acento é **um arquivo só** em todo lugar, mesmo que um sistema guarde o `é` inteiro e outro como `e` mais o acento (como os Macs antigos gravavam): cada computador fica com a grafia que o seu sistema deu ao nome, e o mesmo arquivo mudado dos dois lados é um conflito;
- se a sincronização fosse apagar **muitos arquivos** de uma vez — mais de um quinto da pasta, ou mais de 50, e ao menos 3 —, ela **para e pergunta**: uma pasta movida ou um disco que não montou parecem exclusões;
- o que fica de fora (a cota do servidor, um arquivo que não está no computador) aparece com o motivo, e **O que cruzou** lista o que foi e veio.

A barra de status mostra o estado — *Sincronizada*, *enviando 3*, *Sem conexão*, *Pausada*, *1 conflito* — e um clique nela abre a seção. Quem só **lê** a pasta no servidor recebe as mudanças; as feitas aqui ficam aqui. Desligar deixa os dois lados como estão.

---

## Compartilhar com outra pessoa

Cada pessoa tem o seu vault no mesmo Universo. Para dividir **uma pasta** do seu com outra pessoa, clique com o botão direito na pasta, na árvore, e escolha **Compartilhar…**: escreva o e-mail da conta dela neste servidor e o papel — **lê** ou **edita**. Para dividir **o vault todo**, o mesmo diálogo no menu da raiz da árvore, **Compartilhar a pasta toda…**. Só a dona da pasta compartilha; quem recebe não repassa.

A pasta compartilhada ganha uma marquinha de pessoa na árvore. No diálogo, mude o papel de alguém ou tire o acesso — o diálogo pergunta antes, e as janelas abertas dessa pessoa fecham a pasta na hora. O que ela já tinha sincronizado continua no computador dela.

Se as notas da pasta mostram imagens guardadas **fora** dela — a pasta de anexos na raiz do vault, como o Obsidian faz —, o diálogo avisa e oferece **incluir a pasta de anexos, só leitura**.

Quem recebe vê a pasta como uma pasta **sua**, com o nome dela e o da dona — *Campanha (Sérgio)* — em **Compartilhados comigo**: no botão da pasta, no topo da barra lateral (que agrupa **Neste computador**, **Meus** e **Compartilhados comigo**), em Ajustes › Servidores e na conta no navegador. Ela abre numa janela própria e, no app desktop, sincroniza com uma pasta deste computador só dela — nunca dentro do seu vault. Nada de fora da pasta compartilhada chega a ela: um link para uma nota de fora aparece como **não está no que foi compartilhado com você**, sem criar nota.

Este vault de demonstração não tem duas contas: para ver o outro lado, use dois navegadores num Universo.

---

Para o celular e o tablet, veja [[22 - Verso no Celular e no Tablet]]. Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
