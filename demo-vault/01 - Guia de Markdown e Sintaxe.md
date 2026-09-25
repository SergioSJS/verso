---
title: Guia de Markdown e Sintaxe
date: 2026-09-25
tags:
  - markdown
  - sintaxe
  - edicao
  - codigo
status: revisado
---

# Guia de Markdown e Sintaxe

Este documento demonstra os elementos visuais e de edição do Markdown suportados pelo Verso, incluindo blocos de código com cópia rápida, fórmulas matemáticas, tabelas redimensionáveis e elementos recolhíveis.

---

## Títulos e Recolhimento de Seções

O Verso suporta calha de dobra de código e títulos (`foldGutter`). Ao passar o mouse pela margem esquerda ao lado dos títulos abaixo, clique no ícone da seta para recolher ou expandir a seção correspondente:

### Subtítulo H3: Exemplo de Seção
Esta seção pode ser recolhida usando a seta na margem esquerda. O conteúdo abaixo ficará oculto até que a seção seja expandida novamente.

#### Subtítulo H4: Detalhes Internos
Texto detalhado de apoio para testar a hierarquia visual.

---

## Formatação de Texto

Você pode formatar texto usando sintaxe Markdown padrão ou através da barra flutuante de formatação:
- **Negrito** com `**texto**`
- *Itálico* com `*texto*`
- ~~Tachado~~ com `~~texto~~`
- `Código inline` com `` `código` ``
- Citação em bloco:
> O conhecimento estruturado em texto puro sobrevive ao tempo e aos formatos transitórios de aplicativos proprietários.

---

## Listas e Tarefas Interativas

As listas suportam indentação inteligente via `Tab` e `Shift-Tab`, com níveis visuais destacados:

- Item de nível principal
  - Subitem indentado com `Tab`
    - Terceiro nível de profundidade
- Lista de tarefas com caixas clicáveis diretamente no modo Editar:
  - [x] Tarefa 1: Instalação e configuração inicial concluídas
  - [ ] Tarefa 2: Testar clique nesta caixa de seleção para alternar estado
  - [ ] Tarefa 3: Verificar que tarefas concluídas recebem estilo tachado automático

---

## Blocos de Código com Botão de Copiar

Passe o cursor sobre qualquer bloco de código abaixo para visualizar o botão **Copiar** no canto superior direito:

### Rust
```rust
fn main() {
    let app_name = "Verso";
    println!("Bem-vindo ao {} — seu editor em Markdown.", app_name);
}
```

### TypeScript
```typescript
interface Note {
  path: string;
  title: string;
  tags: string[];
  isFavorite: boolean;
}

const welcome: Note = {
  path: "00 - Bem-vindo ao Verso.md",
  title: "Bem-vindo ao Verso",
  tags: ["verso", "guia"],
  isFavorite: true,
};
```

### Python
```python
def fibonacci(n: int) -> list[int]:
    sequence = [0, 1]
    while len(sequence) < n:
        sequence.append(sequence[-1] + sequence[-2])
    return sequence[:n]

print("Primeiros 10 números de Fibonacci:", fibonacci(10))
```

---

## Fórmulas Matemáticas em KaTeX

O Verso inclui renderização matemática ultrarrápida via KaTeX:

Fórmula em linha: $E = mc^2$ e $\lim_{x \to 0} \frac{\sin(x)}{x} = 1$.

Fórmula em bloco destacado:
$$
\int_{-\infty}^{\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

Matriz de rotação em $\mathbb{R}^2$:
$$
R(\theta) = \begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix}
$$

---

## Tabelas com Colunas Redimensionáveis

No modo de Leitura (`Cmd+E`), passe o mouse sobre a linha divisória entre os cabeçalhos da tabela e arraste para redimensionar a largura das colunas:

| Recurso | Descrição | Status no Verso |
| :--- | :--- | :--- |
| **Edição ao Vivo** | Preview em tempo real dos elementos Markdown | Suportado |
| **Tarefas Interativas** | Checkboxes alternáveis via clique no editor | Suportado |
| **Bases de Dados** | Visualização de dados tipo Obsidian Bases | Suportado |
| **PDF Spread Mode** | Visualização em página dupla lado a lado | Suportado |
| **Fórmulas KaTeX** | Expressões matemáticas inline e em bloco | Suportado |

Voltar para a [[00 - Bem-vindo ao Verso|Página Inicial]] ou continuar para [[02 - Links, Âncoras e Notas Incorporadas]].
