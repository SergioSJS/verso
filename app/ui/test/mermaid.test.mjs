import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

// Setup browser DOM environment for Mermaid
const win = new Window({ url: "http://localhost" });
global.window = win;
global.document = win.document;
global.DOMParser = win.DOMParser;
global.HTMLElement = win.HTMLElement;
global.SVGElement = win.SVGElement;
global.SVGGraphicsElement = win.SVGGraphicsElement;
win.SVGGraphicsElement.prototype.getBBox = function () {
  return { x: 0, y: 0, width: 60, height: 20 };
};
global.CSSStyleSheet = win.CSSStyleSheet;
global.matchMedia = () => ({ matches: false });

// Import our mermaid wrapper module
const { renderMermaid, ensureMermaid, isDarkMode } = await import("../src/mermaid.js").catch(async () => {
  // If not compiled yet, compile on the fly with esbuild
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: ["src/mermaid.ts"],
    bundle: false,
    format: "esm",
    outfile: "dist/mermaid.test-bundle.mjs",
  });
  return import("../dist/mermaid.test-bundle.mjs");
});

describe("Mermaid diagrams integration", () => {
  test("initializes without error", () => {
    assert.doesNotThrow(() => ensureMermaid());
  });

  test("detects light and dark mode properly", () => {
    document.documentElement.dataset["theme"] = "dark";
    assert.equal(isDarkMode(), true);
    document.documentElement.dataset["theme"] = "light";
    assert.equal(isDarkMode(), false);
  });

  test("renders valid flowchart to SVG in container", async () => {
    const container = document.createElement("div");
    const code = "graph TD\n  A[Início] --> B[Fim]";
    const ok = await renderMermaid(code, container);

    assert.equal(ok, true, "renderMermaid should return true for valid syntax");
    const svg = container.querySelector("svg");
    assert.ok(svg, "container should contain an SVG element");
    assert.ok(container.innerHTML.includes("<svg"), "SVG markup should be present");
  });

  test("renders sequence diagram", async () => {
    const container = document.createElement("div");
    const code = "sequenceDiagram\n  Alice->>Bob: Olá\n  Bob-->>Alice: Oi";
    const ok = await renderMermaid(code, container);

    assert.equal(ok, true);
    const svg = container.querySelector("svg");
    assert.ok(svg);
  });

  test("renders class diagram", async () => {
    const container = document.createElement("div");
    const code = "classDiagram\n  class Animal {\n    +String name\n  }";
    const ok = await renderMermaid(code, container);

    assert.equal(ok, true);
    assert.ok(container.querySelector("svg"));
  });

  test("handles empty or whitespace code without error", async () => {
    const container = document.createElement("div");
    const ok = await renderMermaid("   \n   ", container);

    assert.equal(ok, true);
    assert.equal(container.textContent, "");
  });

  test("handles syntax error gracefully by displaying error badge instead of crashing", async () => {
    const container = document.createElement("div");
    const invalidCode = "graph TD\n  A --->>>> invalid syntax !!!";
    const ok = await renderMermaid(invalidCode, container);

    assert.equal(ok, false, "renderMermaid should return false on syntax error");
    const errorBox = container.querySelector(".mermaid-error");
    assert.ok(errorBox, "container should render .mermaid-error box");
    assert.ok(container.querySelector(".mermaid-error-msg"), "error message should be visible");
    assert.ok(container.querySelector(".mermaid-source-preview"), "source preview should be preserved");
  });

  test("strips malicious script tags and inline event handlers (defense-in-depth)", async () => {
    const container = document.createElement("div");
    // Attempting XSS injection via Mermaid node label
    const maliciousCode = 'graph TD\n  A["<script>alert(1)</script>"] --> B["<img src=x onerror=alert(2)>"]';
    await renderMermaid(maliciousCode, container);

    // Verify no script tags exist in rendered container
    const scripts = container.querySelectorAll("script");
    assert.equal(scripts.length, 0, "No <script> tags should survive rendering");

    // Verify no onerror, onclick, etc attributes survive
    for (const el of container.querySelectorAll("*")) {
      for (const attr of Array.from(el.attributes)) {
        assert.ok(!attr.name.toLowerCase().startsWith("on"), `Attribute ${attr.name} must not start with on`);
        assert.ok(!attr.value.toLowerCase().includes("javascript:"), `Attribute ${attr.name} must not contain javascript:`);
      }
    }
  });
});
