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

mockIPC(async (cmd, args) => {
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
    return { status: "ok", data: { kind: "missing" } };
  }

  if (cmd.startsWith("plugin:event|") || cmd.startsWith("plugin:window|")) {
    return { status: "ok", data: null };
  }

  console.log("[Mock IPC]", cmd, args);
  return { status: "ok", data: null };
});

// Now import main application code:
import("./main");
