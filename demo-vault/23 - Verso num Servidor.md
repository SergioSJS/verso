---
title: Verso num Servidor
tags:
  - verso
  - servidor
  - guia
---

# Verso num Servidor

O `verso serve` é o Verso sem janela, numa máquina sua — um servidor em casa, um NAS, uma nuvem qualquer. As notas continuam **pastas comuns de arquivos Markdown** no disco dele; você as abre num navegador, no computador, no celular ou no tablet, e várias pessoas podem trabalhar na mesma pasta.

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
- Senha esquecida: o admin gera um link de senha nova. Admin perdido: `verso serve admin reset <e-mail>` na própria máquina.

---

## A sua conta

Na página **Conta** (ao lado da barra de status, ou no fim da barra lateral no celular):

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

Para o celular e o tablet, veja [[22 - Verso no Celular e no Tablet]]. Volte para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou abra o [[Tour do Verso.canvas|Tour do Verso]].
