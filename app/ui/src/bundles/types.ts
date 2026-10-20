// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Template Bundle Schema and validation (ADR 0098). */

export interface TemplateBundleFile {
  path: string;
  frontmatter?: Record<string, string | number | boolean | null | string[]>;
  content?: string;
}

export interface TemplateBundle {
  version: 1;
  id: string;
  name: string;
  description: string;
  category?: "rpg" | "world" | "writing" | "notes";
  folders: string[];
  files: TemplateBundleFile[];
}

export interface ValidationResult {
  valid: boolean;
  bundle?: TemplateBundle;
  error?: string;
  fixPrompt?: string;
  errorPrompt?: string;
}

/** Validate an unknown object or JSON string against the Template Bundle Schema v1.
 *  Returns a detailed error and a pre-formatted fix prompt to copy back
 *  to the user's AI assistant if validation fails. */
export function validateBundle(data: unknown): ValidationResult {
  let parsed: unknown = data;
  if (typeof data === "string") {
    let clean = data.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    try {
      parsed = JSON.parse(clean);
    } catch (err) {
      return failWith(
        `JSON inválido: ${err instanceof Error ? err.message : String(err)}`,
        "O texto fornecido não é um JSON válido. Verifique se copiou o JSON completo gerado pela IA."
      );
    }
  }

  if (typeof parsed !== "object" || parsed === null) {
    return failWith(
      "O JSON fornecido não é um objeto.",
      "O JSON fornecido não é um objeto JSON válido (esperava-se um objeto com chaves 'version', 'id', 'name', 'folders', 'files')."
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.version !== 1) {
    return failWith(
      "Campo 'version' inválido ou ausente: deve ser 1.",
      "O campo 'version' é obrigatório e deve ser exatamente o número 1."
    );
  }

  if (typeof obj.id !== "string" || !obj.id.trim()) {
    return failWith(
      "Campo 'id' inválido ou ausente: deve ser uma string identificadora única (ex: 'minha-campanha').",
      "O campo 'id' deve ser uma string sem espaços ou acentos que identifique o modelo (ex: 'campanha-tormenta20')."
    );
  }

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return failWith(
      "Campo 'name' inválido ou ausente: informe o nome do modelo.",
      "O campo 'name' deve ser o título legível do modelo (ex: 'Campanha de Fantasia')."
    );
  }

  if (typeof obj.description !== "string") {
    return failWith(
      "Campo 'description' inválido ou ausente: deve ser uma string.",
      "O campo 'description' deve ser uma string descrevendo brevemente o modelo."
    );
  }

  if (!Array.isArray(obj.folders)) {
    return failWith(
      "Campo 'folders' inválido ou ausente: deve ser uma lista de caminhos de pastas.",
      "O campo 'folders' deve ser um array de strings com as pastas a criar (ex: ['1. Grupo', '2. Sessões'])."
    );
  }

  for (let i = 0; i < obj.folders.length; i++) {
    if (typeof obj.folders[i] !== "string" || !obj.folders[i].trim()) {
      return failWith(
        `Pasta no índice ${i} é inválida. Todos os itens de 'folders' devem ser strings não vazias.`,
        `O item no índice ${i} do array 'folders' não é uma string válida. Todos os itens de 'folders' devem ser nomes de pastas.`
      );
    }
  }

  if (!Array.isArray(obj.files)) {
    return failWith(
      "Campo 'files' inválido ou ausente: deve ser uma lista de arquivos.",
      "O campo 'files' deve ser um array de objetos, onde cada objeto representa um arquivo com 'path' e 'content' opcional."
    );
  }

  for (let i = 0; i < obj.files.length; i++) {
    const file = obj.files[i];
    if (typeof file !== "object" || file === null) {
      return failWith(
        `Arquivo no índice ${i} é inválido: deve ser um objeto.`,
        `O item no índice ${i} de 'files' deve ser um objeto contendo a propriedade 'path'.`
      );
    }
    const fObj = file as Record<string, unknown>;
    if (typeof fObj.path !== "string" || !fObj.path.trim()) {
      return failWith(
        `Arquivo no índice ${i} não possui a propriedade obrigatória 'path'.`,
        `O arquivo no índice ${i} precisa ter a chave 'path' indicando o caminho relativo do arquivo (ex: '2. Sessões/Sessão 01.md').`
      );
    }
    if (fObj.frontmatter !== undefined && (typeof fObj.frontmatter !== "object" || fObj.frontmatter === null || Array.isArray(fObj.frontmatter))) {
      return failWith(
        `Propriedade 'frontmatter' do arquivo '${fObj.path}' deve ser um objeto chave-valor.`,
        `O campo 'frontmatter' do arquivo '${fObj.path}' deve ser um objeto com pares de propriedades (ex: { "tipo": "npc" }).`
      );
    }
    if (fObj.content !== undefined && typeof fObj.content !== "string") {
      return failWith(
        `Propriedade 'content' do arquivo '${fObj.path}' deve ser uma string de texto Markdown.`,
        `O campo 'content' do arquivo '${fObj.path}' deve ser uma string com o conteúdo Markdown do arquivo.`
      );
    }
  }

  return {
    valid: true,
    bundle: obj as unknown as TemplateBundle,
  };
}

function failWith(error: string, fixDetail: string): ValidationResult {
  const fixPrompt =
    `O Verso encontrou o seguinte erro ao validar o JSON do Template Bundle:\n` +
    `"${error}"\n\n` +
    `Detalhe: ${fixDetail}\n\n` +
    `Por favor, corrija o JSON mantendo estritamente o Schema v1 do Verso e devolva apenas o bloco de código JSON corrigido.`;

  return {
    valid: false,
    error,
    fixPrompt,
    errorPrompt: fixPrompt,
  };
}
