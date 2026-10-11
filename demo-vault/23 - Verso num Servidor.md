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
- Tudo isso fica no **console de administração** (o endereço `/admin`, ou Ajustes › Conta › *Administrar este servidor*), que só o admin vê: uma visão geral, as contas, as pastas com a **cota** de cada uma, os convites, o registro e a configuração do servidor.
- **Cota por pasta**: o admin limita o espaço de uma pasta; uma escrita que passaria do limite é recusada, e diminuir a pasta sempre é possível. Perto do limite, a janela avisa.

---

## A sua conta

Em **Ajustes › Conta** — o botão da pessoa, ao lado da engrenagem na faixa lateral, ou **Conta** no fim da barra lateral no celular:

- **passkeys** — entrar com a digital, o rosto ou o PIN, sem senha;
- as **sessões** abertas, e um botão para sair de todas as outras;
- **tokens de acesso** para scripts, presos a pastas e a ler ou escrever.

---

## Editar junto

Abra a mesma nota em duas janelas, ou com outra pessoa: o que um digita aparece no outro enquanto digita, com o cursor e o nome. O servidor grava o arquivo quando as edições assentam, e **nunca grava por cima** de uma mudança feita fora — essa mostra a diferença para vocês escolherem, como o Verso sempre fez.

---

## Do app desktop

Em **Ajustes › Servidores**, escreva o endereço do servidor e conecte: o navegador abre a página do servidor para você **permitir este computador** — ninguém cola token. Depois, escolha uma pasta do servidor, e a janela a mostra como se estivesse aqui.

---

## Sincronizar uma pasta deste computador

Abrir uma pasta do servidor numa janela é trabalhar **online**: tudo passa pela rede. **Sincronizar** é o outro jeito: a pasta mora neste computador — abre sem rede, o Obsidian lê, o backup copia — e o servidor guarda os mesmos arquivos para os seus outros aparelhos, o navegador e quem divide a pasta com você.

Com a pasta aberta, em **Ajustes › Sincronizar**, escolha o servidor e **uma pasta nova** (com o nome desta) ou uma que você já tem lá. O espaço da pasta aparece antes de qualquer coisa cruzar. Depois:

- uma mudança de um lado vai para o outro — ao salvar, quando o servidor avisa, ao reconectar e a cada cinco minutos; sem rede, ela espera;
- arquivos grandes vão **em pedaços**, e só são gravados quando chegam inteiros;
- **na primeira vez nada é apagado**: o que só um lado tem vai para o outro;
- se os dois lados mudaram o mesmo arquivo, é um **conflito**: a versão do servidor fica com o nome, e a deste computador fica ao lado, como `Nota (conflito, Mac, 2026-10-10 15.34).md`. Em Ajustes › Sincronizar, a lista de conflitos mostra **a diferença**; junte à mão e apague a cópia;
- se a sincronização fosse apagar **muitos arquivos** de uma vez — mais de um quinto da pasta, ou mais de 50, e ao menos 3 —, ela **para e pergunta**: uma pasta movida ou um disco que não montou parecem exclusões;
- o que fica de fora (a cota do servidor, um arquivo que não está no computador) aparece com o motivo, e **O que cruzou** lista o que foi e veio.

A barra de status mostra o estado — *Sincronizada*, *enviando 3*, *Sem conexão*, *Pausada*, *1 conflito* — e um clique nela abre a seção. Quem só **lê** a pasta no servidor recebe as mudanças; as feitas aqui ficam aqui. Desligar deixa os dois lados como estão.

---

Para o celular e o tablet, veja [[22 - Verso no Celular e no Tablet]]. Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
