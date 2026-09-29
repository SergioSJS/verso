// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import mermaid from "mermaid";

let initializedTheme: string | null = null;
let idCounter = 0;

export function isDarkMode(): boolean {
  const theme = document.documentElement.dataset["theme"];
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ensureMermaid(): void {
  const isDark = isDarkMode();
  const themeKey = isDark ? "dark" : "light";
  if (initializedTheme !== themeKey) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: isDark ? "dark" : "default",
      fontFamily: 'var(--ui, "Instrument Sans", -apple-system, sans-serif)',
      themeVariables: isDark
        ? {
            darkMode: true,
            background: "transparent",
            mainBkg: "#231f1c",
            primaryColor: "#2e2824",
            primaryTextColor: "#f1ede4",
            primaryBorderColor: "#4a4038",
            lineColor: "#9a8e80",
            secondaryColor: "#27221f",
            tertiaryColor: "#1e1a18",
          }
        : {
            darkMode: false,
            background: "transparent",
            mainBkg: "#fcfaf6",
            primaryColor: "#f4efe6",
            primaryTextColor: "#2a221a",
            primaryBorderColor: "#d8cebf",
            lineColor: "#7a6e60",
            secondaryColor: "#f8f4ec",
            tertiaryColor: "#ffffff",
          },
      suppressErrorRendering: true,
    });
    initializedTheme = themeKey;
  }
}

export async function renderMermaid(
  code: string,
  container: HTMLElement,
): Promise<boolean> {
  ensureMermaid();
  const trimmed = code.trim();
  if (!trimmed) {
    container.textContent = "";
    return true;
  }

  const id = `verso-mermaid-${Date.now()}-${++idCounter}`;
  try {
    const { svg } = await mermaid.render(id, trimmed);
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) throw new Error("Falha ao gerar SVG do diagrama");

    // Remove any unexpected script tags or inline event handlers (defense-in-depth)
    for (const s of svgEl.querySelectorAll("script")) s.remove();
    for (const el of svgEl.querySelectorAll("*")) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.toLowerCase().startsWith("on") || attr.value.toLowerCase().includes("javascript:")) {
          el.removeAttribute(attr.name);
        }
      }
    }

    svgEl.style.maxWidth = "100%";
    svgEl.style.height = "auto";
    svgEl.style.display = "block";
    svgEl.style.margin = "0 auto";

    // Clean up temporary dummy elements mermaid might leave in document.body
    const dummy = document.getElementById(id) ?? document.getElementById(`d${id}`);
    dummy?.remove();

    container.replaceChildren(svgEl);
    return true;
  } catch (err: unknown) {
    // Clean up any temporary elements created by mermaid on error
    const dummy = document.getElementById(id) ?? document.getElementById(`d${id}`);
    dummy?.remove();

    const message = err instanceof Error ? err.message : String(err);
    const errorBox = document.createElement("div");
    errorBox.className = "mermaid-error";

    const title = document.createElement("div");
    title.className = "mermaid-error-title";
    title.textContent = "Diagrama Mermaid com erro de sintaxe:";

    const pre = document.createElement("pre");
    pre.className = "mermaid-error-msg";
    pre.textContent = message.split("\n")[0] ?? message;

    const source = document.createElement("pre");
    source.className = "mermaid-source-preview";
    source.textContent = trimmed;

    errorBox.append(title, pre, source);
    container.replaceChildren(errorBox);
    return false;
  }
}
