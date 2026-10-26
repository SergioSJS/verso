// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import type { TemplateBundle } from "./types";

/** Built-in presets inspired by Dados Críticos (Igor Téuri, https://linktr.ee/dadoscriticos), worldbuilding,
 *  and creative writing (ADR 0098). */

export const DADOS_CRITICOS_CAMPAIGN: TemplateBundle = {
  version: 1,
  id: "dados-criticos-campanha",
  name: "Campanha de RPG (Dados Críticos)",
  description: "Estrutura completa com grupos, sessões, facções, NPCs, locais, itens e hexcrawl. Baseada na estrutura de cofre do Dados Críticos, de Igor Téuri.",
  category: "rpg",
  folders: [
    "1. Grupo",
    "2. Sessões",
    "3. Facções",
    "4. NPCs",
    "5. Locais",
    "6. Itens",
    "7. Hexcrawl",
    "Modelos",
  ],
  files: [
    {
      path: "Visão Geral da Campanha.md",
      frontmatter: {
        tipo: "campanha",
        status: "ativa",
        data_inicio: "{{date}}",
      },
      content: `# {{title}}

## Visão Geral da Campanha

- **Mestre:** 
- **Sistema:** 
- **Tom / Atmosfera:** 

## Resumo dos Arcos

1. **Arco Inicial:** 
2. **Desenvolvimento:** 
3. **Clímax Previsto:** 

## Atalhos Rápidos
- [[Painel do Mestre|Painel Secreto do Mestre]]
- [[1. Grupo/Sessão Zero|Sessão Zero e Acordos]]
- [[1. Grupo/Objetivos dos Personagens|Objetivos do Grupo]]
- [[Modelos/Ficha de Personagem|Modelo de Ficha de Personagem]]
- [[Modelos/Ficha de NPC|Modelo de Ficha de NPC]]
`,
    },
    {
      path: "Painel do Mestre.md",
      content: `# Painel do Mestre — {{title}}

> [!secret]
> ## Segredos e Conspirações
> - **O Grande Vilão:** 
> - **A Reviravolta:** 
> - **Linha do Tempo dos Inimigos:** O que acontece se os heróis não agirem?

## Anotações Rápidas de Sessão
- **Rumor da Semana:** 
- **NPC em Destaque:** 
- **Próximo Encontro:** 
`,
    },
    {
      path: "Estrutura da Campanha.md",
      content: `# Estrutura da Campanha — {{title}}

## O Gancho Inicial

## As 3 Pistas Principais
1. 
2. 
3. 

## Os 3 Possíveis Finais
- **Vitória Triunfante:** 
- **Vitória Pírrica:** 
- **Derrota e Consequências:** 
`,
    },
    {
      path: "1. Grupo/Sessão Zero.md",
      content: `# Sessão Zero — {{title}}

## Acordos de Convivência & Linhas e Véus
- **Linhas (Não entram na mesa):** 
- **Véus (Acontecem fora de cena):** 

## Criação e Conexões dos Personagens
- Como o grupo se conheceu?
- Que dívida ou objetivo compartilham?
`,
    },
    {
      path: "1. Grupo/Objetivos dos Personagens.md",
      content: `# Objetivos dos Personagens — {{title}}

| Personagem | Jogador | Objetivo Curto Prazo | Objetivo Longo Prazo |
|---|---|---|---|
| | | | |
`,
    },
    {
      path: "Modelos/Ficha de Personagem.md",
      frontmatter: {
        tipo: "personagem",
        jogador: "",
        classe: "",
        nivel: 1,
      },
      content: `# {{title}}

\`\`\`statblock
name: {{title}}
hp: 10
ac: 10
speed: 9m
\`\`\`

## Biografia e Conceito
- **Conceito / Arquétipo:** 
- **Aparência e Presença:** 
- **Traços de Personalidade:** 

## Motivações & Objetivos
- **Objetivo Pessoal:** 
- **Vínculo com o Grupo:** 
- **Segredo ou Arrependimento:** 

## Equipamento & Inventário
- Mochila de Aventureiro
- Moedas: 
`,
    },
    {
      path: "Modelos/Ficha de NPC.md",
      frontmatter: {
        tipo: "npc",
        faccao: "",
        atitude: "neutro",
      },
      content: `# {{title}}

\`\`\`statblock
name: {{title}}
hp: 12
ac: 11
\`\`\`

> [!info] Resumo Rápido
> - **Ocupação / Papel:** 
> - **Localização Habitual:** 
> - **Primeira Impressão:** 

## Personalidade e Maneirismos

## Motivação e Desejos

> [!secret]
> ## Segredos e Ganchos
> O que este NPC esconde a todo custo.
`,
    },
    {
      path: "Modelos/Registro de Sessão.md",
      frontmatter: {
        tipo: "sessao",
        data: "{{date}}",
        numero: 1,
      },
      content: `# Sessão — {{title}}

- **Data:** {{date}}
- **Presentes:** 
- **Local no Início:** 

## Acontecimentos Principais
1. 
2. 
3. 

## Pistas e Revelações

## Recompensas e Despojos

## Gancho para a Próxima Sessão
`,
    },
    {
      path: "Modelos/Ficha de Local.md",
      frontmatter: {
        tipo: "local",
        regiao: "",
      },
      content: `# {{title}}

## Descrição Sensorial
- **O que se vê:** 
- **O que se ouve:** 
- **O que se cheira:** 

## Pontos de Interesse
1. 
2. 
3. 

> [!secret]
> ## Perigos e Oportunidades
> Perigos ocultos, armadilhas ou passagens secretas deste local.
`,
    },
    {
      path: "Modelos/Ficha de Facção.md",
      frontmatter: {
        tipo: "faccao",
        influencia: "moderada",
      },
      content: `# {{title}}

- **Líder:** 
- **Sede:** 
- **Objetivo Público:** 

## Membros Notáveis

> [!secret]
> ## Agenda Oculta
> O plano secreto desta facção.
`,
    },
  ],
};

export const DADOS_CRITICOS_MUNDO: TemplateBundle = {
  version: 1,
  id: "dados-criticos-mundo",
  name: "Construção de Mundo (Worldbuilding)",
  description: "Bases sólidas de cenário: lore, mitos de criação, divindades, idiomas e cultura.",
  category: "world",
  folders: [
    "Regiões",
    "Panteão",
    "Facções",
  ],
  files: [
    {
      path: "Lore.md",
      content: `# Lore e História de {{title}}

## As Eras do Mundo
- **Era dos Mitos:** 
- **Era Antiga:** 
- **Era Atual:** 

## Grandes Conflitos Passados
`,
    },
    {
      path: "Mito de Criação.md",
      content: `# Mito de Criação — {{title}}

## A Origem do Cosmo

## Os Primeiros Seres
`,
    },
    {
      path: "Divindades.md",
      content: `# Divindades e Crenças — {{title}}

| Divindade | Domínios | Símbolo Sagrado | Relação com os Mortais |
|---|---|---|---|
| | | | |
`,
    },
    {
      path: "Cultura.md",
      content: `# Costumes e Cultura — {{title}}

## Tradições e Festividades
## Gastronomia e Vestimentas
## Crenças e Superstições
`,
    },
    {
      path: "Idiomas.md",
      content: `# Idiomas e Dialetos — {{title}}

- **Língua Comum:** 
- **Dialetos Regionais:** 
- **Línguas Arcanas ou Esquecidas:** 
`,
    },
  ],
};

export const ESCRITA_FICCAO: TemplateBundle = {
  version: 1,
  id: "escrita-ficcao",
  name: "Escrita de Romance e Ficção",
  description: "Estrutura para autores: atos, capítulos, personagens, cenários e linha do tempo.",
  category: "writing",
  folders: [
    "1. Capítulos",
    "2. Personagens",
    "3. Cenários",
    "4. Linha do Tempo",
    "5. Pesquisa",
  ],
  files: [
    {
      path: "_Sinopse e Visão Geral — {{title}}.md",
      content: `# {{title}}

## Logline
Uma frase que resume o protagonista, o conflito central e a aposta.

## Sinopse Completa

## Estrutura em 3 Atos
- **Ato 1 (Incitação):** 
- **Ato 2 (Complicações & Ponto Médio):** 
- **Ato 3 (Clímax & Resolução):** 
`,
    },
    {
      path: "1. Capítulos/Capítulo 01.md",
      content: `# Capítulo 01

*Comece aqui com uma imagem forte ou ação marcante...*
`,
    },
    {
      path: "2. Personagens/Protagonista.md",
      frontmatter: {
        papel: "protagonista",
      },
      content: `# Protagonista

- **Idade / Ocupação:** 
- **O que ele quer (Objetivo Consciente):** 
- **Do que ele precisa (Necessidade Inconsciente):** 
- **A Mentira em que ele acredita:** 
- **A Ferida do Passado (Ghost):** 
`,
    },
  ],
};

export const CADERNO_PESSOAL: TemplateBundle = {
  version: 1,
  id: "caderno-pessoal-para",
  name: "Organização Pessoal (P.A.R.A.)",
  description: "Método de organização por Projetos, Áreas, Recursos e Arquivos.",
  category: "notes",
  folders: [
    "1. Projetos",
    "2. Áreas",
    "3. Recursos",
    "4. Arquivo",
  ],
  files: [
    {
      path: "_Painel de Foco.md",
      content: `# Meu Painel de Foco

## Projetos Ativos (Com prazo e resultado definido)
- Veja a pasta 1. Projetos

## Áreas de Responsabilidade (Padrões a manter)
- Saúde, Finanças, Carreira, Casa.

## Recursos Úteis (Temas de interesse para consulta)
- Veja a pasta 3. Recursos
`,
    },
  ],
};

export const BUILTIN_PRESETS: TemplateBundle[] = [
  DADOS_CRITICOS_CAMPAIGN,
  DADOS_CRITICOS_MUNDO,
  ESCRITA_FICCAO,
  CADERNO_PESSOAL,
];
