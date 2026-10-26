# Política de segurança

[English](../../SECURITY.md)

Como avisar o projeto de uma vulnerabilidade no Verso ou no UniVerso, e o
que acontece depois ([ADR 0083](../adr/0083-security-hardening-of-universo.md)
item 15).

## Como relatar uma vulnerabilidade

Escreva para **security@versomd.com**. Diga o que é afetado (o servidor, o
app, o site; a versão, de `universo --version`, da janela Sobre do app ou da
visão geral do console), o que um atacante consegue fazer e como reproduzir.
Por favor escreva para o endereço em vez de abrir uma issue pública, para
que a correção saia antes de os detalhes ficarem públicos.

Escreva em português ou em inglês.

## O que prometemos

- Uma confirmação de recebimento em até **7 dias** da sua mensagem.
- Uma correção na próxima versão da linha suportada, que é a versão mais
  recente.
- Crédito nas notas da versão, com o nome que você der, quando você quiser;
  nenhum quando não quiser.

Não há programa de recompensa (bug bounty).

## Escopo

Dentro do escopo:

- **O servidor**, UniVerso (`verso serve`): a API, o WebSocket, a janela
  que ele serve ao navegador, os pacotes, a imagem e o script de instalação
  (`universo.sh`).
- **O app**, o Verso no macOS, no Windows e no Linux, e a linha de comando.
- **O site**, versomd.com, e os arquivos que ele serve.

Fora do escopo:

- **A máquina de quem hospeda**: o sistema operacional, o proxy reverso, o
  host do Docker, a configuração própria. Quem hospeda um servidor vê as
  notas nele por construção ([o modelo de ameaças](../reference/threat-model.md)).
- **Os dados do próprio membro**: o que uma pessoa já consegue ler ou mudar
  com o acesso que ela tem a uma pasta.
- **Negação de serviço contra um servidor que não é seu.** Teste num
  servidor seu: [o guia de instalação](../reference/server-install.md) monta
  um.

## E-mail criptografado

A chave para e-mail criptografado ainda não está publicada: ela é publicada
aqui com a primeira versão que a trouxer.

## security.txt

Todo servidor UniVerso responde `/.well-known/security.txt` (RFC 9116) com
este endereço, os idiomas, um link para esta página e uma validade de um ano
depois da versão que ele roda.
