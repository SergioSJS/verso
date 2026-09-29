// Test harness for running Verso in the browser with mock Tauri IPC.
import { mockWindows, mockIPC } from "@tauri-apps/api/mocks";
import YAML from "yaml";
import { DEMO_VAULT_FILES } from "./demoVault";
import type { Property, PropertyValue } from "./bindings";

function b64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function parseFrontmatter(text: string): { properties: Property[]; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match || !match[1] || match[2] === undefined) return { properties: [], body: text };
  const rawYaml = match[1];
  const body = match[2];
  try {
    const parsed = YAML.parse(rawYaml);
    if (!parsed || typeof parsed !== "object") return { properties: [], body };
    const properties: Property[] = [];
    for (const [key, val] of Object.entries(parsed)) {
      let value: PropertyValue;
      if (typeof val === "boolean") {
        value = { kind: "checkbox", value: val };
      } else if (typeof val === "number") {
        value = { kind: "number", value: String(val) };
      } else if (typeof val === "string") {
        value = { kind: "text", value: val };
      } else if (Array.isArray(val)) {
        value = { kind: "list", value: val.map(String) };
      } else if (val === null || val === undefined) {
        value = { kind: "empty" };
      } else {
        value = { kind: "nested", value: JSON.stringify(val) };
      }
      properties.push({ key, value });
    }
    return { properties, body };
  } catch {
    return { properties: [], body };
  }
}

function wrapLists(items: Array<{ indent: number; ordered: boolean; html: string }>): string {
  let out = "";
  const stack: Array<{ indent: number; tag: string }> = [];
  for (const it of items) {
    const tag = it.ordered ? "ol" : "ul";
    while (stack.length > 0 && stack[stack.length - 1]!.indent > it.indent) {
      out += `</li></${stack.pop()!.tag}>`;
    }
    if (stack.length > 0 && stack[stack.length - 1]!.indent === it.indent && stack[stack.length - 1]!.tag !== tag) {
      out += `</li></${stack.pop()!.tag}>`;
    }
    if (stack.length === 0 || stack[stack.length - 1]!.indent < it.indent) {
      stack.push({ indent: it.indent, tag });
      out += `<${tag}><li>${it.html}`;
    } else {
      out += `</li><li>${it.html}`;
    }
  }
  while (stack.length > 0) {
    out += `</li></${stack.pop()!.tag}>`;
  }
  return out;
}

function renderMarkdown(raw: string): string {
  const { body } = parseFrontmatter(raw);
  const lines = body.split("\n");
  const htmlParts: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeBuffer: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // Code fence
    if (line.startsWith("```")) {
      if (inCode) {
        inCode = false;
        const codeText = codeBuffer.join("\n");
        if (codeLang === "base") {
          htmlParts.push(`<pre><code class="language-base">${escapeHtml(codeText)}</code></pre>`);
        } else {
          htmlParts.push(`<pre><code class="language-${codeLang}">${escapeHtml(codeText)}</code></pre>`);
        }
        codeBuffer = [];
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Table rows
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      if (!inTable) {
        inTable = true;
        htmlParts.push("<table>");
      }
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        // separator row, skip
        continue;
      }
      htmlParts.push("<tr>" + cells.map((c) => `<td>${formatInline(c)}</td>`).join("") + "</tr>");
      continue;
    } else if (inTable) {
      inTable = false;
      htmlParts.push("</table>");
    }

    // Callout
    if (line.startsWith("> [!")) {
      const match = line.match(/^>\s*\[!(\w+)\]/);
      const calloutType = match && match[1] ? match[1].toLowerCase() : "note";
      const calloutLines: string[] = [];
      while (i + 1 < lines.length && (lines[i + 1] ?? "").startsWith(">")) {
        i++;
        calloutLines.push((lines[i] ?? "").replace(/^>\s?/, ""));
      }
      htmlParts.push(
        `<blockquote class="callout" data-callout="${calloutType}"><div class="callout-title"><span class="callout-icon"></span><span class="callout-title-inner">${calloutType.toUpperCase()}</span></div><p>${formatInline(calloutLines.join(" "))}</p></blockquote>`,
      );
      continue;
    }

    // Lists: unordered or ordered (including tasks)
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch && listMatch[2] && listMatch[3] !== undefined) {
      const listItems: Array<{ indent: number; ordered: boolean; html: string }> = [];
      let j = i;
      while (j < lines.length) {
        const lj = lines[j];
        if (lj === undefined) break;
        const lm = lj.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (!lm || !lm[2] || lm[3] === undefined) break;
        const indent = (lm[1]!.match(/\t/g) ?? []).length * 4 + lm[1]!.replace(/\t/g, "").length;
        const isOrdered = /^\d+\./.test(lm[2]);
        const text = lm[3];
        const taskCheck = text.match(/^\[([ xX])\]\s*(.*)$/);
        if (taskCheck && taskCheck[1] && taskCheck[2] !== undefined) {
          const checked = taskCheck[1].toLowerCase() === "x";
          const content = taskCheck[2];
          listItems.push({
            indent,
            ordered: isOrdered,
            html: `<input disabled="" type="checkbox" ${checked ? 'checked="" ' : ""}data-task-line="${j + 1}"/>\n${formatInline(content)}`,
          });
        } else {
          listItems.push({
            indent,
            ordered: isOrdered,
            html: formatInline(text),
          });
        }
        j++;
      }
      i = j - 1;
      htmlParts.push(wrapLists(listItems));
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch && hMatch[1] && hMatch[2] !== undefined) {
      const level = hMatch[1].length;
      const text = hMatch[2];
      const id = text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      htmlParts.push(`<h${level} id="${id}">${formatInline(text)}</h${level}>`);
      continue;
    }

    // Divider
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      htmlParts.push("<hr>");
      continue;
    }

    // Math block $$
    if (line.trim() === "$$") {
      const mathLines: string[] = [];
      i++;
      while (i < lines.length && (lines[i] ?? "").trim() !== "$$") {
        const ml = lines[i];
        if (ml !== undefined) mathLines.push(ml);
        i++;
      }
      htmlParts.push(`<div class="math math-display">${escapeHtml(mathLines.join("\n"))}</div>`);
      continue;
    }

    // Raw HTML / iframes
    if (line.trim().startsWith("<iframe")) {
      htmlParts.push(line.trim());
      continue;
    }

    // Paragraph
    if (line.trim() !== "") {
      htmlParts.push(`<p>${formatInline(line)}</p>`);
    }
  }

  if (inTable) htmlParts.push("</table>");

  return htmlParts.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatInline(text: string): string {
  let s = text;
  // Math inline $...$
  s = s.replace(/\$([^\$]+)\$/g, '<span class="math">$1</span>');
  // Embeds ![[...]]
  s = s.replace(/!\[\[(.*?)\]\]/g, '<span class="embed" data-target="$1"></span>');
  // Images ![...](...)
  s = s.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1">');
  // Wikilinks [[...]]
  s = s.replace(/\[\[(.*?)\]\]/g, (_, target: string) => {
    const parts = target.split("|");
    const linkTarget = (parts[0] ?? "").trim();
    const label = parts[1] ? parts[1].trim() : linkTarget;
    return `<a class="wikilink" data-target="${escapeHtml(linkTarget)}">${escapeHtml(label)}</a>`;
  });
  // Bold
  s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italic
  s = s.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Strikethrough
  s = s.replace(/~~(.*?)~~/g, "<del>$1</del>");
  // Code inline
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

mockWindows("main");

const fileMap = new Map<string, string>();
for (const f of DEMO_VAULT_FILES) {
  fileMap.set(f.path, f.b64);
}
fileMap.set("teste.md", btoa(unescape(encodeURIComponent(`# teste

---
Você ferrou a adição de Propriedades… muito bem...:
---
# Backlog2

- Vários problemas na lida com bullets
	- Ao editar a no modo Editar, se estiver editando uma linha com bullet ele vira traço e vai mega pra frante, parecendo qu está dentro da hierarquia como no printe abaixo, todos estão no msm nível, a linha dois é onde ta o cursor, nesse mesmo exemplo, ta todo cagado se eu uso setas do teclado pra navegar das linhas ele vai da linha 1 para linha 3, e se vc notar, com dificuldade eu consegui jogar o cursor na linha 2 e visualmente ta marcando a linha 1
	- ![[Backlog2 20260927222209.png]]
	- O traço vertical está bugadasso, passando por cima dos bullets e está feio vc fez errado a linha deveria estar alinhada com o bullet pai daquele grupo e ir até o fim ou até o próximo pai daquele nível, para os bullets de checkbox essa linha vertical está certa
	- ![[Backlog2 20260927222556.png]]
	- Os checkbox estão com problema na navegação com setas e está extremamente dificil de clicar na linha certa pra colocar o cursor pra editar, também está com problema de, na linha que está com o cursor, surge o caractere de traço
	- ![[Backlog2 20260927222906.png]]

- modo Leitura está TODO CAGADO, as linhas de separação não estão aparecendo mais, so aparecem se tiver uma linha vazia em cima e embaixo, a visão dos bullets de checkbox tão ferrada, vc ta renderizando o bullet do primeiro checkbox, os bloco de contrair e expandir estão todos errados, em fim, até o que funcionava nisso vc ferrou, nao era pra ser diferente a configuração visual entre Leitura e Editar, toda hora é um bug imbecil diferente, dito isso revise tudo, tente viabilizar que o estilo seja o mesmo ou o mais próximo possível. Dito isso olha a merda do modo de leitura, ta uma bosta, a primeira linha dos blocos de bullets tem um espaço gigantesco.

- ![[Backlog2 20260927224043.png]]

- A adição de propriedades é outra que está toda ferrada… isso está irritante, o projeto ta no começo e a gente pede um ajuste e vc sai ferrando várias partes que estavam bem e não dispara erro algum… ![[Backlog2 20260927224441.png]]

- a experiencia ta tao ruim que está sendo melhor editar no modo Fonte que no modo Editar, PUTA QUE PARIU!!!!!

- deveria ser fácil abrir mais uma janela do aplicativo, se eu clicar com botão direito na barra deveria ter opção de nova janela, a mesma coisa dentro da aplicação

- Pq diabos a opção de localizar e substituir faz aparecer a merda de uma caixa vazia no fundo e o modal estranho e seco, sem ícones (qual seu problema em inserir icones na aplicação, nao tem em lugar algum se eu não pedir) por cima?![[Backlog2 20260927224735.png]] 


- Deveria ser possível abrir o msm arquivo em mais de uma aba, aparacendo essa opções nas abas e ao clicar com botão direito
- Deveria ter como copiar o caminho relativo e o caminho completo dos arquivos
---
- linha 1
- linha 2
- linha 3
---
- Linha 1 nível 1
- Linha 2 nível 1
	- Linha 1 nível 2
	- Linha 2 nível 2

teste

- [ ] Check 1
- [ ] Check 2
	- [ ] Check 3
		- [ ] Check 4	 

---

Aaa

- [ ] Nível 1
	- [ ] Nível 2
		- [ ] Nível 3
	 
- Nível 1
	- Nível 2
		- Nível 3

1. Nível 1
	1. Nível 2
		1. Nível 3`))));

// Convert file src mock:
(window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (p: string) => string } }).__TAURI_INTERNALS__.convertFileSrc = (filePath: string) => {
  const clean = filePath.replace(/^\/+/, "");
  const found = fileMap.get(clean);
  if (found) {
    if (clean.endsWith(".svg")) return `data:image/svg+xml;base64,${found}`;
    if (clean.endsWith(".pdf")) return `data:application/pdf;base64,${found}`;
  }
  return `/assets/${filePath}`;
};

const defaultIndex = {
  indexed: fileMap.size,
  unchanged: 0,
  removed: 0,
  placeholders: 0,
  problems: [],
  unwatched: null,
  unindexed: null,
};

async function handleIPC(cmd: string, args: unknown): Promise<any> {
  if (cmd === "current_folder" || cmd === "pick_folder" || cmd === "reopen_folder") {
    return {
      status: "ok",
      data: {
        key: "demo-vault",
        name: "demo-vault",
        index: { ...defaultIndex, indexed: fileMap.size },
      },
    };
  }

  if (cmd === "open_initial") {
    return {
      status: "ok",
      data: {
        key: "demo-vault",
        name: "demo-vault",
        index: { ...defaultIndex, indexed: fileMap.size },
      },
    };
  }

  if (cmd === "list_notes") {
    const notes: string[] = [];
    for (const p of fileMap.keys()) {
      if (p.endsWith(".md")) notes.push(p);
    }
    return { status: "ok", data: notes };
  }

  if (cmd === "list_files") {
    const files: string[] = [];
    for (const p of fileMap.keys()) {
      if (!p.endsWith(".md")) files.push(p);
    }
    return { status: "ok", data: files };
  }

  if (cmd === "list_folders") {
    const folders = new Set<string>();
    for (const p of fileMap.keys()) {
      const parts = p.split("/");
      if (parts.length > 1 && parts[0]) {
        folders.add(parts[0]);
      }
    }
    return { status: "ok", data: Array.from(folders) };
  }

  if (cmd === "list_entries") {
    const entries: Array<{ path: string; name: string; kind: "note" | "file"; size: number; modified: string }> = [];
    for (const p of fileMap.keys()) {
      entries.push({
        path: p,
        name: p.split("/").pop() ?? p,
        kind: p.endsWith(".md") ? "note" : "file",
        size: 1024,
        modified: "2026-09-25T12:00:00Z",
      });
    }
    return { status: "ok", data: entries };
  }

  if (cmd === "list_web_notes") {
    return { status: "ok", data: [] };
  }

  if (cmd === "list_tags") {
    return {
      status: "ok",
      data: [
        { tag: "verso", count: 1 },
        { tag: "boas-vindas", count: 1 },
        { tag: "template", count: 4 },
        { tag: "guia", count: 2 },
        { tag: "markdown", count: 2 },
        { tag: "sintaxe", count: 1 },
        { tag: "projeto", count: 3 },
      ],
    };
  }

  if (cmd === "read_note") {
    const p = (args as { path: string }).path;
    const b64 = fileMap.get(p) ?? fileMap.get(`${p}.md`);
    if (b64 !== undefined) {
      const text = b64ToUtf8(b64);
      const { properties } = parseFrontmatter(text);
      const html = renderMarkdown(text);
      return {
        status: "ok",
        data: {
          path: p,
          text,
          html,
          properties,
          lines: text.split("\n"),
          revision: "1",
          is_gone: false,
          dirty: false,
        },
      };
    }
    return { status: "error", error: { kind: "not_found", message: `Note ${p} not found` } };
  }

  if (cmd === "read_file_text" || cmd === "read_text") {
    const p = (args as { path: string }).path;
    const b64 = fileMap.get(p);
    if (b64 !== undefined) {
      const text = b64ToUtf8(b64);
      if (cmd === "read_text") {
        return { status: "ok", data: { path: p, text, revision: "1" } };
      }
      return { status: "ok", data: text };
    }
    return { status: "error", error: { kind: "not_found", message: `File ${p} not found` } };
  }

  if (cmd === "write_note") {
    const { path, text } = args as { path: string; text: string; revision: string };
    const b64 = btoa(unescape(encodeURIComponent(text)));
    fileMap.set(path, b64);
    return { status: "ok", data: { revision: String(Date.now()) } };
  }

  if (cmd === "write_text") {
    const { path, text } = args as { path: string; text: string; revision: string };
    const b64 = btoa(unescape(encodeURIComponent(text)));
    fileMap.set(path, b64);
    return { status: "ok", data: { path, text, revision: String(Date.now()) } };
  }

  if (cmd === "create_note") {
    const { name, text } = args as { name: string; text: string };
    const path = name.endsWith(".md") ? name : `${name}.md`;
    const b64 = btoa(unescape(encodeURIComponent(text)));
    fileMap.set(path, b64);
    const { properties } = parseFrontmatter(text);
    const html = renderMarkdown(text);
    return {
      status: "ok",
      data: {
        path,
        text,
        html,
        properties,
        lines: text.split("\n"),
        revision: "1",
        is_gone: false,
        dirty: false,
      },
    };
  }

  if (cmd === "create_file") {
    const { path, base64 } = args as { path: string; base64: string };
    fileMap.set(path, base64);
    return { status: "ok", data: path };
  }

  if (cmd === "create_folder") {
    return { status: "ok", data: (args as { path: string }).path };
  }

  if (cmd === "links") {
    return { status: "ok", data: [] };
  }

  if (cmd === "backlinks") {
    return { status: "ok", data: [] };
  }

  if (cmd === "graph") {
    return {
      status: "ok",
      data: [
        { from: "00 - Bem-vindo ao Verso.md", to: "01 - Guia de Markdown e Sintaxe.md" },
        { from: "00 - Bem-vindo ao Verso.md", to: "02 - Links, Âncoras e Notas Incorporadas.md" },
        { from: "00 - Bem-vindo ao Verso.md", to: "03 - Propriedades e Metadados.md" },
        { from: "00 - Bem-vindo ao Verso.md", to: "04 - Visualização de Bases e Dados.md" },
        { from: "00 - Bem-vindo ao Verso.md", to: "05 - Visualização de Grafo e Conexões.md" },
        { from: "00 - Bem-vindo ao Verso.md", to: "06 - Documentos e Mídia.md" },
        { from: "projetos/Projeto Alpha.md", to: "projetos/Projeto Beta.md" },
        { from: "projetos/Projeto Alpha.md", to: "projetos/Pesquisa e Descobertas.md" },
      ],
    };
  }

  if (cmd === "search") {
    const words = (args as { words: string }).words.toLowerCase();
    const hits: Array<{ path: string; line: number; text: string }> = [];
    for (const [p, b64] of fileMap.entries()) {
      if (!p.endsWith(".md")) continue;
      const text = b64ToUtf8(b64);
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && line.toLowerCase().includes(words)) {
          hits.push({ path: p, line: i + 1, text: line });
          if (hits.length >= 20) break;
        }
      }
    }
    return { status: "ok", data: hits };
  }

  if (cmd === "reindex") {
    return {
      status: "ok",
      data: {
        indexed: fileMap.size,
        unchanged: 0,
        removed: 0,
        placeholders: 0,
        unreadable: [],
        problems: [],
        unwatched: null,
        unindexed: null,
      },
    };
  }

  if (cmd === "app_info") {
    return { status: "ok", data: { version: "0.3.0-beta.1", is_dev: true } };
  }

  if (cmd === "cli_status") {
    return { status: "ok", data: "ours" };
  }
  if (cmd === "install_cli") {
    return { status: "ok", data: "ours" };
  }
  if (cmd === "uninstall_cli") {
    return { status: "ok", data: "missing" };
  }

  if (cmd.startsWith("plugin:event|") || cmd.startsWith("plugin:window|")) {
    return { status: "ok", data: null };
  }

  console.log("[Mock IPC]", cmd, args);
  return { status: "ok", data: null };
}

mockIPC(async (cmd, args) => {
  const res = await handleIPC(cmd, args);
  if (res && typeof res === "object" && "status" in res) {
    if (res.status === "ok") return res.data;
    if (res.status === "error") throw res.error;
  }
  return res;
});

// Now import main application code:
import("./main");
