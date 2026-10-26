// A task's checkbox sits in the middle of its line, as in Obsidian, in
// reading and in Edit mode, the same in WebKit and in Chromium. The box is
// drawn by the stylesheet, not by the platform: a native checkbox is placed
// on the line differently by each engine, and `em` inside a control is the
// platform's 13px unless the font size is inherited — the bug of
// 2026-10-20, a box low on a bold line in the Mac window and centred in a
// browser.

import { test, expect } from "./fixtures.mjs";

const NOTE = "# Tarefas\n\n- [ ] **A — Dentro da pasta (`.verso`)** — todos que abrem a pasta veem os mesmos modelos\n- [x] Conhecer o Verso\n- [ ] Explorar as notas de demonstração\n";

// Where the box's centre is above the baseline of its line, in em of the
// line's text, and the box's height in em.
function measure(boxes) {
  return boxes.map((box) => {
    const line = box.parentElement;
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    line.appendChild(probe);
    const base = probe.getBoundingClientRect().top;
    probe.remove();
    const r = box.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(line).fontSize);
    return { centre: (base - (r.top + r.height / 2)) / fs, height: r.height / fs };
  });
}

test("a task's checkbox is centred on its line, in reading and in Edit mode", async ({ app, page }) => {
  await app.open();
  await app.writeOutside("Tarefas.md", NOTE);
  await app.folderChanged(["Tarefas.md"], true);
  await app.quickOpen("Tarefas");

  const preview = page.locator(".note-sheet > .preview:visible");
  await expect(preview.locator('input[type="checkbox"]')).toHaveCount(3);
  // The centre on the 0.36em line the bullets use; the box 0.9em.
  for (const m of await preview.locator('li > input[type="checkbox"], li > p:first-child > input[type="checkbox"]').evaluateAll(measure)) {
    expect(m.centre).toBeGreaterThan(0.3);
    expect(m.centre).toBeLessThan(0.42);
    expect(m.height).toBeCloseTo(0.9, 1);
  }

  await app.key("Mod+e");
  const checks = page.locator(".editor:visible input.cm-lp-task-check");
  await expect(checks).toHaveCount(3);
  for (const m of await checks.evaluateAll(measure)) {
    expect(m.centre).toBeGreaterThan(0.3);
    expect(m.centre).toBeLessThan(0.42);
    expect(m.height).toBeCloseTo(0.9, 1);
  }
  expect(await app.calls("write_note")).toEqual([]);
});
