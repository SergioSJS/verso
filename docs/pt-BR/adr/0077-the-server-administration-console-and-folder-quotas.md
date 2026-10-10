# ADR 0077 — O console de administração do servidor, e cotas por pasta

- Data: 2026-10-10
- Fonte: o mantenedor, em sessão em 2026-10-10, depois de a 0.7.0-beta.1
  trazer a administração como uma seção de Ajustes: *"a cota de espaço por
  pasta isso deveria ter mas o admin tem que evoluir, não ficou bom essa
  parte estar junto com as configurações, configuração do servidor imagino
  ser diferente do verso, especialmente pq pode escalar muito, com número de
  usuários e tal"*; e *"gosto dessa direção"* sobre a direção proposta em
  resposta (a conta fica em Ajustes, a administração vira um console
  próprio). Escrito por Opus 5.5; a ser lido por Fable 5.1
  ([0032](0032-author-and-reviewer-roles.md)) antes de ser aceito.
- Relacionados: [0074](0074-accounts-and-access-on-the-server.md) (contas,
  papéis, o registro de auditoria; itens 4 a 6 e 9), [0075](0075-server-packaging-and-storage.md)
  (item 4, o espaço que cada pasta ocupa, limites depois — **revisto** pelo
  item 5 abaixo; item 6, configuração pelo ambiente),
  [0073](0073-self-hosted-server-first.md) (item 6, limites de envio e
  cotas antes do primeiro usuário que não seja o mantenedor),
  [0035](0035-cross-cutting-requirements.md) (os dois idiomas,
  acessibilidade).
- Status no briefing: ausente; ao ser aceito.

## Contexto

A 0.7.0-beta.1 mostra a administração do servidor como uma seção dos
Ajustes da janela, ao lado da conta da pessoa: o servidor, as pastas, as
contas, os convites e o registro de auditoria, cada um como linhas dos
ajustes. Ficou com cara de Verso, como o mantenedor tinha pedido, mas duas
coisas não se sustentam quando um servidor cresce:

- **Ajustes são da pessoa**; administrar o servidor é outro trabalho, feito
  por outro papel, em outra escala. Um servidor de uma família tem cinco
  contas; o de um clube ou de uma escola tem centenas, com milhares de
  pastas e um registro de auditoria de dezenas de milhares de linhas.
  Linhas de ajustes, cada lista buscada inteira, não escalam para isso.
- **O espaço é mostrado e não limitado.** O item 4 da 0075 mostra quanto
  cada pasta ocupa e deixa os limites para quando membros que não são o
  dono enviarem arquivos — o que a 0.7.0-beta.1 já permite (um editor envia
  anexos). O item 6 da 0073 pede cotas antes do primeiro usuário que não
  seja o mantenedor.

## Decisão

Aceita (2026-10-10, Status).

1. **A conta fica em Ajustes; a administração sai.** Ajustes › Conta
   mantém o que é da pessoa: perfil, senha, passkeys, sessões, as pastas e
   seus membros (para um dono), tokens de acesso, sair. A administração do
   servidor vira um **console próprio** em `/admin`: uma página inteira, não
   uma seção dos Ajustes da janela. Um admin chega a ele por Ajustes ›
   Conta ("Administrar este servidor") e pelo endereço; a faixa lateral da
   janela não tem botão para ele.
2. **O console é desenhado com as peças da própria janela**: os tokens, as
   fontes, os botões, os interruptores e os diálogos dela, para que tenha
   cara de Verso (a regra do mantenedor de 2026-10-09: nada que não pareça
   o app). O layout é o de todo console de administração que escala: uma
   navegação lateral com as seções, uma página por seção, um cabeçalho com
   o nome e a versão do servidor e o caminho de volta às notas. No celular
   a navegação se recolhe num menu.
3. **Seções**, recomendadas:
   - **Visão geral**: a versão do servidor e a atualização, o armazenamento
     (o diretório de dados, a raiz das pastas, sistemas de arquivos de
     rede), e-mail, modo de TLS, totais (contas, pastas, espaço) e avisos
     (uma cota perto do limite, uma pasta num sistema de arquivos de rede,
     uma atualização).
   - **Contas**: uma tabela — nome, e-mail, papel, pastas, espaço, último
     acesso, criação — com busca, ordenação e páginas; uma conta abre uma
     página própria (as pastas, as sessões, os tokens, o link de senha
     nova, admin, pode criar pastas, remover).
   - **Pastas**: uma tabela — nome, donos, membros, espaço e cota, última
     mudança — com busca, ordenação e páginas; uma pasta abre uma página
     (membros, cota, detalhe do espaço, entrar como admin, a auditoria
     daquela pasta); pastas no disco sem dono, para registrar.
   - **Convites**: pendentes, usados, expirados, encerrados; um convite
     novo.
   - **Registro de auditoria**: filtrado por pessoa, ação, pasta e datas,
     em páginas; exportado como CSV.
   - **Servidor**: a configuração em vigor, só leitura — as variáveis do
     item 6 da 0075 e seus valores, segredos mostrados como definidos ou
     não, nunca o valor.
4. **Toda lista é buscada, ordenada e paginada no servidor.** A API de
   administração recebe `q`, `sort` e um cursor de página e devolve uma
   página (50 linhas por padrão) e um total; o console nunca busca uma
   lista inteira. O banco do servidor ganha os índices que essas consultas
   precisam.
5. **Cotas por pasta, agora** — revê o item 4 da 0075 ("limites depois"):
   - o admin define a cota de uma pasta, ou nenhuma; um padrão do servidor
     para pastas novas vem de `VERSO_FOLDER_QUOTA` (nenhum quando não
     definido), mostrado e mudado no console por pasta;
   - uma escrita que levaria a pasta além da cota é recusada com um erro
     `quota` que a janela diz nas palavras da pessoa (a nota ou o arquivo
     não é escrito; nada que já está lá é tocado); uma escrita que não faz
     a pasta crescer — uma edição que encurta uma nota, um apagamento, uma
     mudança de lugar — é sempre permitida, para que uma pasta cheia possa
     ser diminuída;
   - a 90 % os donos e editores da pasta veem um aviso na janela, e o
     console lista a pasta na Visão geral;
   - o espaço é o que o item 4 da 0075 conta durante a varredura, mantido
     em dia por cada escrita e apagamento entre varreduras;
   - `[ABERTO]`: uma cota por conta (todas as pastas de que é dona) também,
     ou só por pasta. Recomendado: por pasta agora, por conta quando um
     servidor tiver membros que criam pastas.
6. **Nenhuma configuração do servidor é editada no console** nesta ADR: a
   configuração fica no ambiente (item 6 da 0075), mostrada só para
   leitura. Editá-la pelo console — e-mail, a cota padrão — fica
   `[ABERTO]`, para quando um admin pedir.
7. **Os dois idiomas, acessibilidade**: toda página em pt-BR e inglês,
   tabelas com cabeçalhos e legendas, ordenação e paginação pelo teclado,
   e os testes de ponta a ponta do console na suíte do servidor
   (`e2e-server`), nas larguras de desktop e de celular.

## Consequências

- Ajustes perde a seção de Administração; Ajustes › Conta ganha o link
  para o console, para um admin. Os testes de ponta a ponta que percorrem a
  administração passam para o console.
- A API de administração muda de forma (páginas, filtros, totais); o
  console é o único cliente dela, então nada fora do repositório quebra.
- O caminho de escrita do `verso-service` ganha a verificação da cota antes
  de o core escrever: o espaço da pasta é conhecido pelo serviço, que já o
  conta (item 4 da 0075). As pastas locais do app desktop não têm cota.
- Uma variável nova, `VERSO_FOLDER_QUOTA`, documentada com as outras em
  `docs/reference/server-install.md`.

## Alternativas descartadas

- **A administração como uma seção de Ajustes** — feita na 0.7.0-beta.1;
  rejeitada pelo mantenedor em 2026-10-10 (Fonte).
- **A administração como páginas do servidor fora da aparência da janela** —
  feitas primeiro em 2026-10-09 e rejeitadas pelo mantenedor no mesmo dia
  por não parecerem o Verso; o item 2 mantém as peças da janela.

## Status

**Aceita em 2026-10-10** pelo mantenedor, com todas as recomendações, em
sessão: *"com exceção do 6, pode seguir o recomendado, o 6 pode já implementar"*. Item 5: cotas só por pasta; uma cota por conta quando
um servidor tiver membros que criam pastas. Item 6: a configuração só para
leitura no console, editada no ambiente. A ser lida por Fable 5.1 com o
código da rodada.
