---
title: Propriedades e Metadados
date: 2026-09-25
tags:
  - frontmatter
  - propriedades
  - yaml
  - organizacao
prioridade: alta
estimativa_horas: 12
concluido: false
revisor: "Sérgio"
url_referencia: https://verso.app
---

# Propriedades e Metadados

O Verso reconhece metadados escritos em formato YAML no início do arquivo (o chamado *frontmatter*) e os apresenta em um **Painel de Propriedades** elegante e editável logo acima do título da nota.

---

## 🗂️ Painel Retrátil de Propriedades

Observe a tabela de propriedades no topo desta nota:

1. **Botão Recolher/Expandir**: No canto superior do painel, clique em **Propriedades ▾** para recolher ou expandir a exibição. Sua preferência fica salva na sessão.
2. **Edição no Local**: Você pode clicar nos campos para alterar textos, selecionar datas, adicionar novas tags ou alternar valores booleanos.
3. **Persistência Limpa**: Todas as alterações feitas no painel são salvas diretamente no bloco YAML da nota sem alterar a formatação restante do texto.

---

## Tipos de Propriedades Suportados

| Tipo | Exemplo no YAML | Renderização na Interface |
| :--- | :--- | :--- |
| **Texto** | `revisor: "Sérgio"` | Campo de texto editável com sugestões |
| **Número** | `estimativa_horas: 12` | Campo numérico com formatação direta |
| **Data** | `date: 2026-09-25` | Seletor de data padrão |
| **Booleano** | `concluido: false` | Caixa de seleção (checkbox) rápida |
| **Tags** | `tags: [frontmatter, yaml]` | Pílulas coloridas com botão de remoção rápida e autocompletar |
| **Link** | `url_referencia: https://verso.app` | Link clicável com indicador externo |

---

## Integração com Bases

As propriedades definidas aqui são lidas automaticamente pelas **Bases do Verso** (`.base`), permitindo que você filtre, ordene e agrupe suas notas em tabelas dinâmicas e quadros Kanban, conforme demonstrado em [[04 - Visualização de Bases e Dados]].

Voltar para [[00 - Bem-vindo ao Verso|Início]] ou seguir para [[04 - Visualização de Bases e Dados]].
