---
title: Fichas, Oráculos e Criação de Mundos
date: 2026-10-18
tags:
  - rpg
  - fichas
  - oraculo
  - mundos
status: ativo
---

# Fichas, Oráculos e Criação de Mundos

O Verso inclui ferramentas visuais para mestres de RPG, jogadores solo e construtores de mundos fictícios. Todas funcionam sob o mesmo princípio dos arquivos locais: **nada além do Markdown puro é gravado em disco**, garantindo que seus personagens, cenários e anotações permaneçam legíveis em qualquer outro editor de texto.

---

## 🛡️ Fichas e Statblocks Visuais

Um bloco de código com a linguagem `statblock` desenha um cartão interativo com atributos, pontos de vida, defesas e ações clicáveis.

O Verso é **100% agnóstico de sistema**: você **nunca fica preso** a termos de D&D ou regras de d20. Você pode montar fichas para fantasia tradicional, terror investigativo, sci-fi/cyberpunk, sistemas narrativos ou mundos e regras que você mesmo inventou.

---

### Como montar sua ficha (Qualquer Sistema):

Uma ficha no Verso é escrita em YAML simples e flexível:

1. **Identificação**:
   - `nome: Nome do Personagem ou Ameaça`
   - Subtítulo com `tipo: ...` (ou `ocupacao:`, `classe:`, `conceito:`, `arquetipo:`)
2. **Defesas e Recursos Vitais**:
   - *Fantasia d20 / Tormenta*: `pv: 28 (4d8)`, `ca: 15`, `pm: 10`, `deslocamento: 9 m`
   - *Terror e Investigação (Call of Cthulhu / BRP)*: `pv: 11`, `sanidade: 45`, `sorte: 55`
   - *Cyberpunk / Sci-Fi*: `pv: 35`, `blindagem: 11`, `humanidade: 40`
   - Ou declare recursos próprios em `recursos:` (ex.: `Estresse: 2/5`, `Bateria: 80%`).
3. **Atributos (`atributos:` ou `stats:`)**:
   - Para sistemas d20 tradicionais: você pode usar os 6 atributos (`forca`, `destreza`, etc., ou `stats: [10, 14, 12, 10, 8, 14]`), onde o modificador (`+2`, `-1`) é calculado automaticamente.
   - Para **qualquer outro sistema**: liste os atributos do seu jogo (3, 4, 10 ou quantos tiver). Pode ser numérico puro, percentual ou descritivo:
     ```yaml
     atributos:
       - Gosma: 8
       - Gelo: 14
       - Fogo: 10
       - Doce: 10
     ```
4. **Qualquer Seção Personalizada**:
   Basta escrever o nome da seção e seus itens. O Verso formata automaticamente com títulos elegantes e dados clicáveis:
   - `armas:` (armas com expressões de dano como `1d10+2` ou `3d6`)
   - `pericias:` (ex.: `Investigação: 75%`, `Furtividade: +6`)
   - `ciberware:` ou `implantes:`
   - `magias:` ou `feitiços:`
   - `inventario:` ou `equipamento:` (listas simples como `- Lanterna`, `- Corda`)
   - `habilidades:`, `acoes:`, `aspectos:`, etc.
5. **Dados interativos integrados**:
   Qualquer expressão de dado no texto (`1d20+4`, `1d100`, `3d6`, `1d10`) vira uma pílula clicável que rola o dado imediatamente no Verso ao ser clicada.

---

### Exemplo 1: Sistema D20 / Fantasia Clássica

```statblock
layout: D&D 5e / D20 Clássico
nome: Goblin Rastreador
tipo: Humanoide (pequeno), caótico e neutro
ca: 15 (armadura de couro, escudo)
pv: 7 (2d6)
deslocamento: 9 m
forca: 8
destreza: 14
constituicao: 10
inteligencia: 10
sabedoria: 8
carisma: 8
pericias: Furtividade +6
sentidos: Visão no escuro 18 m, Percepção passiva 9
idiomas: Comum, Goblin
habilidades:
  - Fuga Ágil: "O goblin pode usar a ação de Desengajar ou Esconder-se como uma ação bônus em cada um dos seus turnos."
acoes:
  - Cimitarra: "Ataque com arma corpo a corpo: 1d20+4 para acertar, alcance 1,5 m, um alvo. Dano: 1d6+2 de dano cortante."
  - Arco Curto: "Ataque com arma à distância: 1d20+4 para acertar, alcance 24/96 m, um alvo. Dano: 1d6+2 de dano perfurante."
```

---

### Exemplo 2: Investigação e Horror (Call of Cthulhu / BRP)

```statblock
layout: Call of Cthulhu / Horror
nome: Detetive Silas Vance
ocupacao: Investigador de Ocultismo (Arkham, 1920)
pv: 11
sanidade: 45
sorte: 55
deslocamento: 8
pericias:
  - Armas de Fogo: 60%
  - Investigação: 75%
  - Ocultismo: 40%
  - Psicologia: 50%
armas:
  - Revólver .38: "Ataque com arma de fogo: 1d100 sob 60%. Dano: 1d10 de perfuração, alcance 15m."
  - Faca de Trincheira: "Corpo a corpo: 1d100 sob 45%. Dano: 1d4+1 de corte."
inventario:
  - Lanterna a querosene e fósforos
  - Caderno com anotações e símbolos arcanos
  - Conjunto de gazuas
```

---

### Exemplo 3: Cyberpunk / Ficção Científica

```statblock
layout: Cyberpunk RED / Sci-Fi
nome: Nyx
conceito: Solo Mercenário e Infiltrador
pv: 35
blindagem: 11
humanidade: 40
deslocamento: 14 m
atributos:
  - INT: 8
  - REF: 8
  - DEX: 7
  - TECH: 6
  - COOL: 8
  - WILL: 5
  - LUCK: 6
  - MOVE: 7
  - BODY: 8
  - EMP: 4
ciberware:
  - Olhos Kiroshi: "Visão noturna, termografia e zoom óptico 4x."
  - Braço Cibernético Reforçado: "Força aprimorada para escaladas e combate corporal."
armas:
  - Fuzil de Assalto Militech: "À distância: 1d20+14 no teste. Dano: 5d6 perfurante."
  - Lâmina Retrátil Mantis: "Corpo a corpo: 1d20+12 no teste. Dano: 3d6 cortante."
```

---

### Exemplo 4: Sistema Próprio ou Regras Narrativas

Se você inventou seu próprio cenário com atributos customizados (como *Gosma*, *Gelo*, *Fogo*, *Doce*):

```statblock
nome: Sentinela Alquímica
tipo: Autômato Elemental
pv: 28 (4d8+4)
blindagem: 6
deslocamento: 12 m
atributos:
  - Gosma: 8
  - Gelo: 14
  - Fogo: 10
  - Doce: 10
resistencias: Frio, Veneno
acoes:
  - Jato Cáustico: "Ataque elemental à distância: 1d20+5 para acertar. Dano: 2d6+2 de dano de gosma ácida."
  - Pulso Congelante: "Emite uma névoa gélida: 1d20+4 para acertar. Dano: 1d8+3 de frio."
```

---

### 🎛️ Gerenciador e Editor de Templates (Compatível com Fantasy Statblocks)

Assim como no consagrado plugin **Fantasy Statblocks** do Obsidian, o Verso possui uma central completa de configuração e criação de templates em **Ajustes (`⌘,`) › Fichas e Templates**:

1. **Escolha o Layout Padrão**: Defina qual template é usado quando você cria um bloco ```` ```statblock ```` sem especificar a propriedade `layout:`.
2. **Editor Visual de Templates (Layout Builder)**:
   - **Reordenação com 1 Clique**: Mova qualquer bloco para cima ou para baixo com os botões `▲` e `▼`.
   - **Edição Completa de Blocos**: Clique em `✎` em qualquer bloco para alterar seu Tipo (*Título, Subtítulo, Vitais, Atributos, Seções, Separador ou Imagem*), seu Título de Exibição e as chaves YAML correspondentes.
   - **Controle de Modificadores D20**: Ative ou desative o cálculo automático de modificadores d20 `((Valor - 10) / 2)` para blocos de atributos, garantindo compatibilidade tanto com D&D quanto com Cairn, Cyberpunk ou Call of Cthulhu.
   - **Inserção Intuitiva de Novos Blocos**: Escolha o tipo de bloco no seletor visual, digite o título da seção (ex.: *Movimentos de Medo, Armas, Ciberware*) e as chaves YAML desejadas.
   - **Aba "Código YAML"**: O editor inclui um gerador de código que mostra o YAML exato correspondente ao layout configurado, com botão de copiar para você colar direto na sua nota!
3. **Importar / Exportar JSON**: Compartilhe templates com facilidade ou importe arquivos `layout.json` do ecossistema do Obsidian Fantasy Statblocks.
4. **Troca Rápida de Layout**: No cabeçalho de qualquer cartão de ficha, o botão com o nome do template indica o layout em uso e permite abrir a central de templates com um clique.

---

### ⚔️ Fichas de Ameaças, Monstros e Inimigos (Mestres & Solo RPG)

Na prática de RPG de mesa e jogo solo, **a imensa maioria das fichas registradas em notas são monstros, oponentes, ameaças e encontros**, e não personagens de jogadores.

Em vários sistemas modernos, **a ficha do desafio é estruturalmente diferente da ficha de jogador**:

#### Exemplo: Daggerheart (Adversário / Ameaça)
Em *Daggerheart*, um adversário **não possui atributos normais** (como Agilidade ou Força). Ele possui:
- **Tier e Tipo**: (ex.: `Tier 1 Solo`, `Tier 2 Skirmisher`, `Tier 0 Minion`, `Tier 1 Bruiser`).
- **Dificuldade (DC)**: O número que os jogadores precisam igualar ou superar no dado de dualidade para acertar.
- **Limiares de Dano (Damage Thresholds)**: Os valores de corte (*Menor*, *Maior*, *Severo*, ex.: `7 / 14`), indicando quantos PVs a criatura perde em cada impacto.
- **PV e Estresse**: Recursos para absorver dano e abastecer ações.
- **Movimentos de Medo (Fear Moves)**: Ações que o mestre ativa gastando fichas de Medo geradas pelos jogadores.
- **Experiências**: Bônus contextuais (ex.: `Caçador Noturno +2`) que o mestre pode somar a testes gastando Medo.

```statblock
layout: Daggerheart: Adversários & Ameaças
nome: Drake das Sombras
tier: Tier 1 Solo
dificuldade: 13
limiares: 7 / 14
pv: 6
estresse: 3
ataques:
  - Mordida Cáustica: "+3 alcance Curto | 2d8+3 físico e ácido contínuo"
  - Garras Dilacerantes: "+2 corpo a corpo | 1d10+4 físico"
experiencias:
  - Caçador Noturno: "+2"
  - Emboscada Silenciosa: "+1"
movimentos_medo:
  - Baforada Tóxica (Ação): "Gaste 1 Medo para expelir ácido em cone de alcance Curto: teste de Agilidade contra DC 13 ou sofre 2d8 de dano."
  - Frenesi Sombrio (Reação): "Gaste 1 Medo quando sofrer dano Severo para contra-atacar imediatamente."
habilidades:
  - Escamas de Obsidiana: "Resistência natural a dano cortante e perfurante."
```

#### Exemplo: Alien RPG (Criaturas & Xenomorfos)
Xenomorfos e horrores espaciais não rolam atributos humanos comuns; possuem **Velocidade**, **Saúde**, **Blindagem**, **Sangue Ácido** e uma temível **Tabela d6 de Ataques de Assinatura**:

```statblock
layout: Alien RPG: Criaturas & Xenomorfos
nome: Xenomorfo Drone
estagio: Drone Adulto
velocidade: 2
saude: 7
blindagem: 6
ataques_assinatura:
  - 1. Silvo Aterrorizante: "Todos os personagens no mesmo setor recebem 1d6 de Estresse."
  - 2. Bote das Sombras: "Arrasta a vítima indefesa para os dutos de ventilação."
  - 3-4. Chicoteada de Cauda: "Ataque veloz com 8 dados de combate, 2 de dano e derruba o alvo."
  - 5-6. Mandíbula Retrátil: "Ataque fatal contra a cabeça com 10 dados, provoca ferimento crítico instantâneo."
habilidades:
  - Sangue Ácido: "Qualquer ataque perfurante ou cortante provoca respingos de ácido (8 dados, dano 1)."
```

#### Exemplo: Ironsworn / Starforged (Inimigo / Desafio)
No RPG solo *Ironsworn*, oponentes possuem um **Grau de Desafio (Rank)**, uma **Trilha de Progresso de 10 caixas** que você marca a cada acerto, **Dano** e **Táticas**:

```statblock
layout: Ironsworn / Starforged: Inimigos & Desafios
nome: Lobo do Pântano
rank: Perigoso (Dangerous)
trilha: "■■□□□□□□□□ (2/10)"
dano: 2 de Dano
impulso: Proteger a alcateia e defender a toca
taticas:
  - Cercar a Presa: "Move-se furtivamente pelas sombras procurando o flanco mais vulnerável."
  - Mordida no Jarrete: "Derruba o alvo se acertar com sucesso decisivo."
habilidades:
  - Faro Aguçado: "Impossível de ser surpreendido em alcance Próximo."
```

---

### 📚 Mais de 20 Sistemas Embutidos Prontos para Usar

Basta colocar `layout: <Nome do Sistema>` no início do seu bloco `statblock`. O Verso reconhece automaticamente tanto o nome completo quanto variações e siglas comuns:

| Sistema | O que escrever no `layout:` | Estilo Visual | Destaques |
|---|---|---|---|
| **Dungeon World** | `layout: Dungeon World` | Clássico | PV, Armadura, Dano, Modificadores (-1 a +3), Movimentos, Carga e Laços |
| **Ironsworn / Starforged** | `layout: Ironsworn` | Grim OSR | Ímpeto, Saúde, Espírito, Suprimentos, 5 Atributos, Votos de Ferro e Ativos |
| **PbtA Genérico** | `layout: PbtA` | Moderno | Cartilha, Dano/Harm, Experiência, Modificadores diretos, Movimentos Básicos e de Cartilha |
| **Cairn** | `layout: Cairn` | OSR | PV (Proteção), Armadura, Fadiga, STR/DEX/WIL, Armas, Relíquias e 10 Slots de Inventário |
| **Mausritter** | `layout: Mausritter` | OSR | PV, Armadura, Pips (Moedas), STR/DEX/WIL, Feitiços, Mochila & Patas (Slots) e Condições |
| **Daggerheart** | `layout: Daggerheart` | Moderno | Evasão, Limiares de Dano (HP), Armadura, Esperança, Estresse, 6 Traços e Cartas de Domínio |
| **Tales from the Loop** | `layout: Tales from the Loop` | Investigação | Idade, Sorte, Corpo/Coração/Mente/Tecnologia, Condições, Orgulho e Âncora |
| **Alien RPG** | `layout: Alien` | Cyberpunk | Saúde, Nível de Estresse, Blindagem, Força/Agilidade/Raciocínio/Empatia e Pânico |
| **The One Ring (O Um Anel)** | `layout: One Ring` ou `O Um Anel` | Clássico | Resistência, Esperança, Fadiga, Sombra, Força/Coração/Sagacidade, Perícias e Virtudes |
| **Year Zero Genérico (YZE)** | `layout: Year Zero` | Moderno | Força, Agilidade, Raciocínio, Empatia, Saúde, Estresse/Condições, Perícias e Talentos |
| **Forbidden Lands** | `layout: Forbidden Lands` ou `Terras Proibidas` | OSR | Dano nos 4 Atributos, Armadura, Perícias de Sobrevivência, Orgulho e Segredo Sombrio |
| **Blades in the Dark** | `layout: Blades in the Dark` ou `FitD` | Investigação | Estresse (0-9), Traumas, Dano (Harm 1-3), Carga, Percepção/Bravura/Determinação e Ações |
| **Storyteller / Mundo das Trevas** | `layout: Storyteller`, `Vampiro`, `Lobisomem`, `Mago` | Investigação | Vitalidade, Força de Vontade, Sangue/Fome/Gnose, 9 Atributos e Disciplinas/Dons/Esferas |
| **Fate Acelerado (FAE)** | `layout: Fate Acelerado` ou `FAE` | Moderno | 6 Abordagens (Ágil, Cuidadoso, Esperto, Chamativo, Poderoso, Sorrateiro), Proezas e Estresse |
| **Fate Condensado / Core** | `layout: Fate Condensado` ou `Fate Core` | Moderno | Aspectos (Principal, Dificuldade), Pirâmide de Perícias (+4 a +1), Proezas e Estresse |
| **Fractal RPG** | `layout: Fractal` ou `Fractal RPG` | Moderno | Núcleo, Facetas (Aspectos Fractais), Escala, Nível de Fratura, Impulsos e Ações de Fratura |
| **Pathfinder 2e** | `layout: Pathfinder` ou `PF2e` | Clássico | CA, PV, Salvaguardas (Fortitude, Reflexos, Vontade), 6 Atributos d20, Sistema de 3 Ações |
| **Savage Worlds (SWADE)** | `layout: Savage Worlds` ou `SWADE` | Clássico | Aparar, Resistência, Benas, 5 Atributos em dados (d4 a d12), Vantagens e Complicações |
| **Shadowrun** | `layout: Shadowrun` | Cyberpunk | Monitores de Condição Física/Atordoamento, Armadura, Borda, Essência, Ciberware e Magia |
| **Vaesen** | `layout: Vaesen` | Investigação | Condições Físicas/Mentais, 4 Atributos, Perícias, Talentos da Sociedade e Lembranças |
| **Delta Green** | `layout: Delta Green` | Investigação | PV, Vontade (WP), Sanidade (SAN), Ponto de Ruptura, Laços Pessoais e Perícias % |
| **Old-School Essentials (OSE)** | `layout: OSE` | OSR | CA Descendente/Ascendente, DV/PV, TAC0/BBA, Movimento, Moral, 6 Atributos e Salvaguardas |
| **Call of Cthulhu 7e** | `layout: Call of Cthulhu` | Investigação | Sanidade, Sorte, PV, Perícias percentuais, Armas de época e Inventário de Pistas |
| **Cyberpunk RED** | `layout: Cyberpunk RED` | Cyberpunk Neon | Blindagem, Humanidade, 10 Atributos, Ciberware, Armas e Programas de Netrunning |
| **Mörk Borg** | `layout: Mork Borg` | Grim Dark OSR | HP, Moral, Armadura, Armas e Habilidades Especiais em alto contraste |
| **Tormenta20** | `layout: Tormenta20` | Clássico | Defesa, PV, PM, 6 Atributos com modificadores, Ataques com fórmulas e Habilidades |
| **D&D 5e / D20** | `layout: D&D 5e` | Clássico | CA, PV, 6 Atributos d20, Ações, Ações Bônus, Reações e Ações Lendárias |

---

### Exemplos Rápidos de Outros Sistemas:

#### Exemplo: Ironsworn (Solo / Co-op)
```statblock
layout: Ironsworn
nome: Kaelen o Juramentado
conceito: Caçador de Monstros do Ermo
impeto: +2
saude: 5
espirito: 4
suprimentos: 3
atributos:
  - Astúcia: 3
  - Coração: 1
  - Ferro: 2
  - Sombra: 1
  - Razão: 2
votos:
  - Voto de Ferro: "Limpar o vale da presença do Wyrm Cinzento (Extremo)"
ativos:
  - Matador de Feras: "Ao atacar monstros com Ferro, adicione +1 em acertos fortes."
  - Falcão Rastreador: "Seu companheiro animal avisa sobre perigos iminentes."
equipamento:
  - Lança de ferro estelar
  - Manto de pele de urso
  - Kit de escalada e pederneira
```

#### Exemplo: Vampiro / Storyteller (Mundo das Trevas)
```statblock
layout: Vampiro
nome: Vincent Cross
cla: Ventrue
conceito: Magnata da Tecnologia e Manipulador
vitalidade: 7
forca_de_vontade: 6
fome: 2
humanidade: 6
atributos:
  - FOR: 2
  - DES: 3
  - VIG: 2
  - CAR: 4
  - MAN: 4
  - COM: 3
  - PER: 3
  - INT: 4
  - RAC: 3
habilidades:
  - Finanças: 4
  - Persuasão: 3
  - Lábia: 3
  - Investigação: 3
  - Armas de Fogo: 2
poderes:
  - Presença: "Olhar Atordoante e Encanto irresistível."
  - Dominação: "Comando verbal que força a obediência imediata."
  - Fortitude: "Resistência sobrenatural a danos físicos."
antecedentes:
  - Recursos 4 (Grande fortuna pessoal)
  - Rebanho 2 (Fontes de sangue seguras)
```

#### Exemplo: Blades in the Dark
```statblock
layout: Blades in the Dark
nome: Corvo Sombrio
cartilha: Espreitador (Lurker)
bando: Os Corvos Cinzentos
estresse: 3
traumas: Assombrado
harm: Nível 1 (Corte na perna)
carga: Média (5)
atributos:
  - Percepção: 2
  - Bravura: 3
  - Determinação: 1
acoes:
  - Espreitar: 3
  - Destreza: 2
  - Luta: 1
  - Rastrear: 2
habilidades:
  - Passos Fantasmagóricos: "Você pode se mover em silêncio absoluto e passar despercebido por sombras."
contatos:
  - Telda (Alquimista, Amiga)
  - Darmot (Inspetor dos Casacos Azuis, Rival)
equipamento:
  - Gazuas e ferramentas de arrombamento
  - Adaga silenciada
  - Frasco de óleo de sombra
```

---

### Dicas de Uso:

1. **Alternância Leitura / Edição**: No modo **Leitura**, clique no botão com ícone de código `<>` no canto superior direito do cartão para ver e editar o YAML puro.
2. **Edição ao Vivo (Live Preview)**: No modo **Editar**, enquanto o cursor estiver fora do bloco `statblock`, o cartão visual interativo é exibido exatamente como os seus leitores verão.
3. **Rolagens com um clique**: Qualquer jogador ou mestre pode clicar nos dados da ficha durante a sessão para ver o resultado na hora sem precisar de aplicativo externo.

---

## 🔮 Oráculos e Solo RPG

Para jogadores solo, improvisação de mestres ou escritores em busca de reviravoltas na trama, o Verso possui uma central de oráculos graduados e geradores de improviso.

### Destaque de Oráculo na Nota

O destaque de oráculo é um callout nativo interativo. Veja um exemplo real em funcionamento:

> [!oracle] A patrulha da guarda ouviu o barulho da invasão?
> **Sim, mas…** _(d100: 33, 50 / 50)_ um oficial novato acha que foi apenas um gato derrubando caixotes no beco.

No cabeçalho do destaque acima, o Verso exibe um botão **Consultar Oráculo**. Ao clicar nele, a janela do Oráculo se abre com a pergunta da nota já preenchida.

Para escrever um destaque desse tipo em qualquer nota, basta usar:
```text
> [!oracle] Sua pergunta aqui?
> Sua resposta ou anotação do oráculo.
```

---

### A Janela do Oráculo

Abra a qualquer momento com o atalho `/oraculo` no editor ou pela paleta de comandos (`⌘⇧P` › *Oráculo (sim/não e faíscas)…*). Ela possui três abas principais:

1. **Sim ou Não**: Escolha a probabilidade da pergunta (*Quase impossível*, *Improvável*, *50 / 50*, *Provável*, *Quase certo*). O Verso rola um `d100` calibrado e avalia o resultado em seis faixas narrativas:
   - *Sim, e…* (sucesso com benefício extra)
   - *Sim* (sucesso limpo)
   - *Sim, mas…* (sucesso com complicação)
   - *Não, mas…* (falha com alívio ou pista)
   - *Não* (falha simples)
   - *Não, e…* (falha crítica com perigo iminente)
2. **Faíscas de Ideias**: Sorteie pares de conceitos para destravar a imaginação (*Ação + Tema* ou *Descritor + Foco*, ex.: *Investigar Segredo*, *Sombrio Portal*).
3. **Tabelas do Cofre**: Sorteie diretamente em tabelas temáticas prontas (*Reviravoltas na Trama*, *Complicações & Perigos*, *Clima & Atmosfera*, *NPC: Disposição & Motivo*).

Ao obter um resultado, você pode usar **Copiar** ou **Inserir na nota** para gravá-lo no ponto exato do cursor como um destaque `[!oracle]`.

---

### 🎲 Como criar e customizar seus próprios Oráculos

No Verso, qualquer tabela Markdown ou lista com um identificador de bloco (`^id`) é tratada como um **oráculo sorteável**:

| d6 | Reviravolta Inesperada |
|:--:|---|
| 1 | Um aliado de confiança revela uma dívida ou lealdade secreta |
| 2 | O clima vira tempestade violenta ou névoa espessa |
| 3 | Um recurso vital (chave, mapa, suprimento) foi roubado ou danificado |
| 4 | Uma pista antiga aponta para uma ameaça muito mais urgente |
| 5 | Uma patrulha rival chega no momento mais inoportuno |
| 6 | Uma manifestação sobrenatural altera as regras do local |
^reviravolta

Você pode rolar o seu oráculo customizado de duas maneiras:
- **No texto**: escreva `dice: [[#^reviravolta]]` para criar um botão de sorteio que escolhe uma linha aleatória sempre que for clicado.
- **Pela janela do Oráculo**: acesse a aba *Tabelas do Cofre* para sortear ou consultar qualquer tabela que você criar nas suas notas.

---

## 🏰 Criar Novo Mundo ou Campanha

Em vez de criar dezenas de pastas e arquivos manualmente para organizar um novo cenário de RPG ou campanha de ficção, o Verso oferece um assistente estruturado:

1. Clique no botão **`+`** na barra lateral de arquivos e escolha **Novo projeto a partir de modelo…** (ou use a paleta de comandos: `⌘⇧P` › *Novo projeto a partir de modelo…*).
2. **Modelos Prontos**: Escolha entre pacotes embutidos como:
   - *Tormenta20 / Fantasia Medieval*: Pastas organizadas para Sessões, Facções, Personagens, Cidades, Itens e Ameaças, já com modelos pré-configurados.
   - *Ciberpunk / Ficção Científica*: Dossiês de megacorporações, implantes, missões e NPCs.
   - *Campanha Hexcrawl*: Controle de rumores, encontros aleatórios e hexágonos explorados.
3. **Gerador com IA**:
   - Clique na aba **Gerador com IA** e use o botão **Copiar System Prompt**.
   - Cole a instrução no Claude, ChatGPT ou Gemini dizendo qual o seu tema (ex.: *"Mundo de piratas fantasmagóricos"*).
   - A IA devolverá um JSON estruturado. Cole de volta no assistente e clique em **Validar e Importar**. Seu novo pacote aparecerá na lista para ser criado em qualquer pasta.

---

## 🎛️ Modos de Uso (Presets)

Se você utiliza o Verso apenas para escrever notas diárias e não quer botões de dados ou oráculos aparecendo nos menus, você pode ajustar o ambiente em **Ajustes (`⌘,`) › Geral › Modo de Uso (Preset)**:

- **Escrita Pura**: Interface limpa e minimalista. Esconde rolagens de dados, oráculos e botões de ficha, focando 100% na tipografia e no texto.
- **Construção de Mundos**: Ativa oráculos, tabelas sorteadas, infoboxes e modelos de criação de mundos, sem fichas de combate.
- **RPG Completo**: Todas as capacidades ativas — fichas visuais, dados, oráculos graduados e assistente de campanha.

> [!NOTE] Degradação Graciosa
> Trocar de modo nunca modifica ou apaga arquivos do seu computador. Se você abrir uma nota com `statblock` no modo Escrita Pura, o bloco continua lá, exibido de forma limpa como código formatado. Ao voltar para RPG Completo, os cartões visuais reaparecem instantaneamente.

---

Volte para as regras de rolagens em [[25 - Dados e Tabelas Sorteadas]], consulte a [[00 - Bem-vindo ao Verso|Página Inicial]] ou explore o [[Tour do Verso.canvas|Tour do Verso]].
