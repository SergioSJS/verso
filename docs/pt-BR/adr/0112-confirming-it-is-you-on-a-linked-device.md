# ADR 0112 — Confirmar que é você num dispositivo vinculado

- Data: 2026-10-23
- Origem: o mantenedor, em 2026-10-23. No app desktop do Mac, numa pasta
  sincronizada com o servidor, tentou fazer um convite de mesa e recebeu o
  pedido de senha ("Confirme que é você"). Disse *"eu não coloquei senha"*: o
  app tinha sido vinculado pelo código de dispositivo, e a senha da conta era
  uma que uma configuração de teste definiu e guardou num arquivo. O assistente
  recomendou uma proposta para confirmar no próprio dispositivo.
- Escrita pelo Sonnet 5.5 a pedido da sessão. Proposta; nada construído. Para
  ser lida pelo outro modelo antes de ser aceita.
- Relacionadas: [0083](0083-security-hardening-of-universo.md) (itens 4, 6 e
  17: revogação de tokens, a prova recente, o código digitado da página do
  dispositivo), [0074](0074-accounts-and-access-on-the-server.md) (contas, a
  sessão de dispositivo), [0079](0079-sync-a-local-folder-with-a-server.md) (o
  app desktop se conecta a um servidor), [0096](0096-this-app-is-a-server.md)
  (o fluxo de dispositivo, item 6: o clique como prova no anfitrião),
  [0026](0026-core-ui-contract-inviolable-rules.md) (o contrato),
  [0029](0029-guardrails-in-ci.md) (guardrails),
  [0035](0035-cross-cutting-requirements.md) (idiomas, acessibilidade),
  [0069](0069-windows-port.md) e
  [a checklist multiplataforma](../reference/cross-platform-checklist.md).
- Status no briefing: ausente.

## Contexto

**O que existe.** Uma rota sensível do servidor (criar um token, aprovar um
dispositivo, um convite que leva uma pasta ou um compartilhamento, a troca de
senha, as ações do admin) responde 403 `prove_first` quando o `proved_at` da
sessão tem mais de dez minutos. `POST /api/me/prove` recebe a senha da conta
(pelo atraso e pela recusa do próprio login) ou uma asserção de passkey e
carimba a sessão ([0083](0083-security-hardening-of-universo.md) item 6;
`tests_prove.rs`, `app/ui/test/proof.test.mjs`). A janela mostra "Confirme que
é você" e pede a senha de novo. O app desktop tem um comando do anfitrião,
`server_prove`, que envia a senha com o bearer do dispositivo.

**A lacuna.** Um app desktop é vinculado a um servidor pelo fluxo de
dispositivo ([0074](0074-accounts-and-access-on-the-server.md) item 8,
[0079](0079-sync-a-local-folder-with-a-server.md)): a pessoa digita um código,
aprova na página do servidor, e o app guarda um token de dispositivo. A pessoa
pode nunca ter digitado a senha da conta nesse dispositivo, pode não lembrar
dela, ou pode ter entrado por um link de e-mail sem nunca escolher uma. A
única prova que o servidor aceita de um dispositivo é essa senha, então a
primeira ação sensível num dispositivo vinculado pode ser um beco sem saída.

**O que a pessoa tem em vez disso.** No anfitrião, o SO já sabe quem está no
teclado (Touch ID ou a senha de login no macOS, Windows Hello no Windows,
polkit em alguns desktops Linux). O [0096](0096-this-app-is-a-server.md) item
6 já escolheu o clique no anfitrião como prova para permitir um celular, e
deixou o pedido do SO como "possível depois".

## Decisão

Tudo abaixo é proposta. Nada está decidido.

1. **`[OPEN]` O que um app desktop vinculado pelo fluxo de dispositivo usa
   para provar.**
   - (a) A senha da conta, como hoje. Funciona em todo lugar; é um beco sem
     saída para quem nunca definiu uma.
   - (b) A verificação do próprio SO, depois uma prova presa ao dispositivo
     para o servidor. O anfitrião pergunta ao SO (`LocalAuthentication` no
     macOS, Windows Hello no Windows, polkit ou nada no Linux). Em caso de
     sucesso, assina um desafio do servidor com uma **chave por dispositivo**
     criada no vínculo: o par de chaves nasce quando o dispositivo é aprovado,
     fica no chaveiro do SO (Keychain, Credential Manager, Secret Service)
     marcado como exigindo a presença da pessoa onde o SO permite, e o
     servidor registra a chave pública junto da sessão de dispositivo. O
     servidor nunca vê o segredo do SO; vê uma assinatura que pode verificar.
   - (c) Aprovar em outro dispositivo já conectado (estilo push): a ação
     sensível espera, e um dispositivo conectado mostra "Foi você?". Exige um
     segundo dispositivo online.
   - *Recomendação:* **(b), com (a) sempre disponível como reserva** (pessoa
     sem chave no chaveiro, dispositivo vinculado antes disto existir,
     anfitrião Linux sem verificação do SO). No Linux sem agente polkit, o app
     recua para (a). (c) fica como opção para depois; não é descartada.

2. **`[OPEN]` O que o servidor aceita como prova recente, por quanto tempo, em
   quais rotas.**
   - Uma prova de dispositivo é: o servidor emite um desafio de uso único preso
     à sessão (um valor aleatório com validade curta, por exemplo 60
     segundos); o anfitrião devolve a assinatura da chave do dispositivo sobre
     ele; o servidor confere com a chave registrada no vínculo e carimba
     `proved_at`, exatamente como uma senha faz.
   - *Recomendação:* os **mesmos dez minutos** e as **mesmas rotas** do item 6
     do [0083](0083-security-hardening-of-universo.md), nenhuma rota nova e
     nenhuma janela maior; a constante continua constante. O desafio é
     consumido no uso, então um replay falha. Uma assinatura errada passa pelo
     atraso e pela recusa do próprio login (uma linha de login recusado,
     contada).
   - Linhas de auditoria: uma prova por chave de dispositivo, uma recusada, um
     desafio expirado sem uso; nunca a chave, a assinatura ou o valor do
     desafio.
   - A chave do dispositivo acaba com a sessão do dispositivo: quando a sessão
     termina (a pessoa remove o dispositivo, um admin a encerra, uma
     redefinição ou um `admin reset` revoga os tokens, item 4 do 0083), a
     chave pública registrada é apagada no mesmo passo, e o app apaga a chave
     privada do chaveiro quando souber que a sessão acabou.
   - `[OPEN]` Se um dispositivo vinculado antes disto existir é convidado a
     criar uma chave depois. *Recomendação:* sim, na próxima prova por senha,
     com uma linha visível dizendo isso.

3. **`[OPEN]` Janelas de navegador.**
   - (a) Inalteradas: senha, ou uma passkey onde a pessoa tiver adicionado
     uma.
   - (b) Promover as passkeys WebAuthn como a prova oferecida primeiro.
   - *Recomendação:* (a) agora; (b) é uma decisão separada, para depois. O
     navegador não tem chave nossa no chaveiro para prender a prova, e as
     passkeys já funcionam por `POST /api/me/prove/passkey`.

4. **Ameaças, como o assistente levantou.**
   - *Um notebook roubado e desbloqueado:* a ação sensível ainda exige a
     verificação do SO (Touch ID ou senha de login), que o ladrão não tem; não
     é mais fraco do que hoje, em que o ladrão precisaria da senha da conta.
   - *Um token de dispositivo copiado sem a chave do chaveiro:* o token sozinho
     recebe `prove_first` e não consegue assinar o desafio; a prova falha.
     Onde o chaveiro não consegue exigir presença, a chave ainda não é
     exportável por uma cópia comum de arquivo.
   - *Malware rodando na sessão desbloqueada do usuário:* só consegue pedir ao
     chaveiro que assine com a pessoa ausente se a chave não exigir presença;
     onde exige, o pedido do SO aparece. A mesma exposição de hoje, com a
     senha digitada numa janela comprometida; não se afirma que isto se
     resolve.
   - *Um servidor que não é o vinculado:* o desafio é preso à sessão e à
     origem do servidor; uma assinatura para um servidor não prova nada em
     outro.

5. **`[OPEN]` Contrato e crates tocados; o guardrail.**
   - O contrato ganha um comando para iniciar uma prova de dispositivo e um
     para concluí-la (o anfitrião assina, a janela nunca vê a chave); os tipos
     TS são gerados ([0026](0026-core-ui-contract-inviolable-rules.md)). O
     `server_prove` existente continua como reserva.
   - Crates: `verso-server` (o desafio, a chave registrada, o carimbo, as
     linhas de auditoria, a exclusão junto da sessão), `verso-service` só se o
     comando passar por ele, `app/src-tauri` (a verificação do SO e o
     chaveiro são código de plataforma; qualquer `unsafe` necessário fica
     dentro da exceção que o [0029](0029-guardrails-in-ci.md) já permite, ou o
     trabalho pede a sua própria exceção). Novas dependências (um crate de
     chaveiro, um de assinatura) pedem justificativa e passagem no
     `cargo-deny`. A checklist multiplataforma é lida antes da construção.
   - Guardrail (grupo de feature, visto falhar antes do merge): uma prova
     recente pela chave do dispositivo é aceita e carimba `proved_at`; um
     desafio repetido, uma assinatura pela chave de outro dispositivo, uma
     chave de sessão encerrada e um desafio expirado são cada um recusados
     com `prove_first` ou com a recusa do login; a chave some com a sessão; as
     rotas protegidas do `tests_prove.rs` são exercitadas com a prova de
     dispositivo como com a senha.
   - *Recomendação:* a lista acima, numa construção só, com o guardrail no
     mesmo PR.

6. **`[OPEN]` Acessibilidade e idiomas.**
   - O diálogo do SO é do próprio SO, no idioma do sistema e com o seu suporte
     assistivo. O nosso diálogo mantém título e texto em pt-BR e EN
     ([0035](0035-cross-cutting-requirements.md)), diz qual método vai usar
     ("Confirmar com Touch ID" ou "Confirmar com a sua senha"), toma o foco, é
     operável por teclado e oferece a senha como caminho de volta visível, para
     a pessoa nunca ficar presa. Uma verificação do SO cancelada ou que falhou
     é dita em palavras, não em silêncio.
   - *Recomendação:* como escrito; os textos exatos são escritos com a
     construção.

## Consequências

- Quem vinculou o app pelo código de dispositivo pode fazer um convite ou
  aprovar um dispositivo sem nunca ter digitado uma senha naquela máquina.
- O servidor guarda uma chave pública a mais por sessão de dispositivo e uma
  tabela de desafios a mais; as duas morrem com a sessão.
- O código de plataforma cresce em três SOs; o Linux mantém o caminho da
  senha.
- Um dispositivo sem a chave ou sem verificação do SO continua funcionando
  pela senha, então ninguém fica trancado do lado de fora.
- Custo: M para o servidor e o contrato, M para os anfitriões macOS e Windows,
  S para a reserva do Linux. Dentro do escopo do servidor
  ([0073](0073-self-hosted-server-first.md)).

## Alternativas descartadas

Nenhuma registrada. Aprovar em outro dispositivo (item 1 (c)) e passkeys no
navegador (item 3 (b)) são opções deixadas em aberto, não descartadas.

## Status

**Proposta (2026-10-23).** Escrita pelo Sonnet 5.5 a pedido da sessão. Os
itens 1 a 3, 5 e 6 estão `[OPEN]` para o mantenedor, cada um com uma
recomendação; o item 4 é a análise do assistente e não decide nada. Nada
construído.
