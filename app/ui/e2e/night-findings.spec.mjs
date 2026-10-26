// Findings of the live test of 2026-10-23 night (server, browser 1440x900 and a phone 390x844).
// Screenshots: docs/media/test-runs/2026-10-23-mesa (SHOT_PHASE=antes for the code before a fix).

import { test, expect } from "./fixtures.mjs";
import { shot, phase } from "./shots.mjs";

async function showMesa(page) {
  const phone = (page.viewportSize()?.width ?? 1500) <= 760;
  if (phone) await page.locator(".bar-right").click();
  else await page.evaluate(() => document.body.classList.remove("no-right"));
  await page.locator("#right-tabs").getByRole("tab", { name: /^Mesa/ }).click();
  const view = page.locator(".table-view");
  await expect(view).toBeVisible();
  return view;
}

// G: the folder's table is a subfolder; the panel does not offer to make the parent a table.
test("the Mesa panel of a folder whose table is a subfolder offers no 'make this folder a table' @layout", async ({ app, page }) => {
  await app.open("?vault=empty&table=owner");
  await app.writeOutside("Mundo/Cripta.md", "# Cripta\n");
  await app.folderChanged(["Mundo/Cripta.md"], true);
  await page.evaluate(() => {
    const c = window.__harness.campaign;
    c.tables = [{ root: "Mundo", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  const view = await showMesa(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shot(`106-${phase}-painel-mesa-subpasta-${page.viewportSize().width <= 760 ? "telefone" : "desktop"}-claro`) });
  await expect(view.locator(".table-make-button")).toHaveCount(0);
  // The panel is at the subfolder's table: its window is one press away, named even when only the icon shows.
  await expect(view.getByRole("button", { name: "Abrir a janela da Mesa" })).toBeVisible();
  await expect(view.locator(".table-make")).toBeHidden();
  // No button of the panel is without a name.
  for (const b of await view.locator("button:visible").all()) {
    const name = ((await b.getAttribute("aria-label")) ?? "") + (await b.innerText());
    expect(name.trim(), await b.evaluate((e) => e.outerHTML.slice(0, 120))).not.toBe("");
  }
});

// B: nothing of the window is wider than the screen on a phone or tablet (the right panel's hidden sheet was 392px at 390).
test("the page is not wider than the screen, with the right panel closed @layout", async ({ app, page }) => {
  await app.open("?vault=empty&table=owner&side=server");
  // The right panel on the Mesa tab, closed: its sheet waits off the screen.
  await page.evaluate(() => (document.body.dataset.rightTab = "table"));
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")]
      .map((e) => [e, e.getBoundingClientRect()])
      .filter(([, r]) => r.width > 0 && r.right > vw + 0.5 && r.left < vw)
      .slice(0, 8)
      .map(([e, r]) => `${e.tagName}.${e.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
    const info = ["aside.right", "aside.right .right-close", "aside.right .right-tabs", "aside.right .right-body"].map((q) => {
      const e = document.querySelector(q);
      if (!e) return q + " none";
      const r = e.getBoundingClientRect(), c = getComputedStyle(e);
      return `${q} ${Math.round(r.left)}..${Math.round(r.right)} w${r.width} ${c.boxSizing} bl${c.borderLeftWidth} pos${c.position} disp${c.display}`;
    });
    return { info, vw, sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, wide };
  });
  const per = await page.evaluate(() => {
    const out = [];
    for (const t of [...document.querySelectorAll(".right-tab[data-tab]")].map((e) => e.dataset.tab)) {
      document.body.dataset.rightTab = t;
      for (const open of [false, true]) {
        document.body.classList.toggle("right-open", open);
        const a = document.querySelector("aside.right").getBoundingClientRect();
        out.push(`${t}/${open ? "open" : "closed"} ${Math.round(a.left)}..${Math.round(a.right)} sw${document.documentElement.scrollWidth}`);
      }
    }
    document.body.classList.remove("right-open");
    return out;
  });
  console.log("per-tab", per.join(" | "));
  console.log("overflow-probe", page.viewportSize().width, JSON.stringify(m));
  await page.screenshot({ path: shot(`107-${phase}-sem-rolagem-lateral-${page.viewportSize().width}`) });
  expect(m.sw, JSON.stringify(m)).toBeLessThanOrEqual(m.vw);
  expect(m.bw, JSON.stringify(m)).toBeLessThanOrEqual(m.vw);
});

// F: the game master opens the table; the player waiting outside is let in at once, not at the next timer (15 s .. 30 s).
test("a player waiting on a closed table gets in the moment the server says it opened", async ({ app, page }) => {
  await app.open("?vault=empty&table=player&side=server&role=reader&closed=1");
  const state = page.locator(".table-closed-state");
  await expect(state).toBeVisible();
  await page.evaluate(() => (window.__harnessShutOut = false));
  await page.evaluate(() => window.__harness.emit("table-opened", { folder: "f1" }));
  await expect(page.locator(".table-closed-state")).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator("#folder")).not.toBeEmpty();
  app.expectFault(/mesa está fechada/);
});

// D: dragging a tab is for a mouse.
test("the empty pane tells a phone to pick a file, and a mouse also to drag a tab @layout", async ({ app, page }) => {
  await app.open("?vault=empty");
  const touch = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  const hint = page.locator(".pane-empty:visible p").first();
  await expect(hint).toBeVisible();
  await page.screenshot({ path: shot(`108-${phase}-painel-vazio-${touch ? "telefone" : "desktop"}-claro`) });
  if (touch) {
    await expect(hint).toHaveText("Escolha um arquivo na lista.");
  } else {
    await expect(hint).toHaveText("Escolha um arquivo na lista, ou arraste uma aba para cá.");
  }
});

// C: the plain-HTTP notice sits under every dialog.
test("the plain-HTTP notice does not cover an open dialog @layout", async ({ app, page }) => {
  await app.open("?vault=empty&table=owner&side=server");
  await page.evaluate(() => {
    const bar = document.createElement("div");
    bar.className = "plain-http-bar";
    bar.setAttribute("role", "status");
    bar.append("Conexão sem HTTPS: a senha e as notas passam abertas na rede. Modo offline, notificações e passkeys ficam desligados.");
    document.querySelector(".work-notices").append(bar);
  });
  const bar = page.locator(".plain-http-bar");
  await expect(bar).toBeVisible();
  const covered = async (selector) =>
    page.evaluate((sel) => {
      const r = document.querySelector(".plain-http-bar").getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !top?.closest(sel) ? top?.className : null;
    }, selector);
  // The quick switcher, the settings, and the table's window.
  await app.key("Mod+p");
  await expect(page.locator(".quick:not([hidden])").first()).toBeVisible();
  await page.screenshot({ path: shot(`109-${phase}-aviso-http-sob-busca-${page.viewportSize().width <= 760 ? "telefone" : "desktop"}-claro`) });
  expect(await covered(".quick")).toBeNull();
  await page.keyboard.press("Escape");
  await app.key("Mod+,");
  await expect(page.locator(".quick.settings:not([hidden])")).toBeVisible();
  expect(await covered(".quick")).toBeNull();
  await page.keyboard.press("Escape");
  // The table's window.
  await page.evaluate(() => {
    window.__harness.campaign.tables = [{ root: "", open: true, log_max: 20000, image_max: 10 * 1024 * 1024 }];
    window.__harness.emit("campaign-changed", { paths: [] });
  });
  const view = await showMesa(page);
  // (The notice may sit over the button on a tablet: press it from the page.)
  await view.getByRole("button", { name: "Abrir a janela da Mesa" }).evaluate((b) => b.click());
  await expect(page.locator(".campaign-overlay")).toBeVisible();
  await page.screenshot({ path: shot(`110-${phase}-aviso-http-sob-janela-da-mesa-${page.viewportSize().width <= 760 ? "telefone" : "desktop"}-claro`) });
  expect(await covered(".campaign-overlay")).toBeNull();
});

// A reader of a folder synced on the desktop: the window can write (the server refuses), so the lock and the notice follow the sync's role.
test("a reader of a synced folder gets the closed lock and the notice on an attempt", async ({ app, page }) => {
  await app.open("?vault=empty");
  const lock = page.locator("#open .folder-lock");
  await expect(lock).toBeHidden();
  await page.evaluate(() => dispatchEvent(new CustomEvent("verso:sync-state", { detail: { on: true, role: "reader", status: "synced" } })));
  await expect(lock).toBeVisible();
  await page.screenshot({ path: shot(`111-${phase}-leitor-pasta-sincronizada-cadeado-desktop-claro`) });
  await app.key("Mod+n");
  await expect(page.locator(".reader-notice")).toBeVisible();
  await expect(page.locator(".reader-notice")).toHaveText("Você só lê esta pasta.");
  await page.evaluate(() => dispatchEvent(new CustomEvent("verso:sync-state", { detail: { on: true, role: "editor", status: "synced" } })));
  await expect(lock).toBeHidden();
});

// F (minor): the news of another folder's table is not this one's.
test("the news that another folder's table opened does not retry this one", async ({ app, page }) => {
  await app.open("?vault=empty&table=player&side=server&role=reader&closed=1&folder=mine");
  const state = page.locator(".table-closed-state");
  await expect(state).toBeVisible();
  await page.evaluate(() => (window.__harnessShutOut = false));
  await page.evaluate(() => window.__harness.emit("table-opened", { folder: "other" }));
  await page.waitForTimeout(800);
  await expect(state).toBeVisible();
  await page.evaluate(() => window.__harness.emit("table-opened", { folder: "mine" }));
  await expect(page.locator(".table-closed-state")).toHaveCount(0, { timeout: 3000 });
  app.expectFault(/mesa está fechada/);
});

// C (minor): a phone's drawers are above the notice too.
test("the plain-HTTP notice is under the phone's drawer @layout", async ({ app, page }) => {
  await app.open("?vault=empty&table=owner&side=server");
  test.skip((page.viewportSize()?.width ?? 1500) > 760, "the drawers are a phone's");
  await page.evaluate(() => {
    const bar = document.createElement("div");
    bar.className = "plain-http-bar";
    bar.append("Conexão sem HTTPS: a senha e as notas passam abertas na rede.");
    document.querySelector(".work-notices").append(bar);
    document.body.classList.add("side-open");
  });
  await page.waitForTimeout(500);
  const under = await page.evaluate(() => {
    const r = document.querySelector(".plain-http-bar").getBoundingClientRect();
    const top = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
    return top?.closest("aside.side") !== null;
  });
  expect(under).toBe(true);
  await page.screenshot({ path: shot(`112-${phase}-aviso-http-sob-gaveta-telefone-claro`) });
});

// The plain-HTTP notice is a row of the work area, not an overlay: the panes shrink under it.
test("the plain-HTTP notice takes its own row and covers no pane control @layout", async ({ app, page }) => {
  await app.open("?vault=empty&table=owner");
  const before = await page.evaluate(() => document.querySelector(".panes").getBoundingClientRect().top);
  await page.evaluate(() => {
    const bar = document.createElement("div");
    bar.className = "plain-http-bar";
    bar.setAttribute("role", "status");
    bar.append("Conexão sem HTTPS: a senha e as notas passam abertas na rede. Modo offline, notificações e passkeys ficam desligados.");
    const close = document.createElement("button");
    close.className = "plain-http-close";
    close.setAttribute("aria-label", "Fechar");
    close.textContent = "×";
    bar.append(close);
    document.querySelector(".work-notices").append(bar);
  });
  const m = await page.evaluate(() => {
    const bar = document.querySelector(".plain-http-bar").getBoundingClientRect();
    const panes = document.querySelector(".panes").getBoundingClientRect();
    // The first one that is drawn: a control hidden at this width (the pane switch) has no box to compare.
    const first = [...document.querySelectorAll(".panes button, .panes [tabindex], .panes a, .panes input")].find((x) => x.getClientRects().length > 0);
    return { barBottom: bar.bottom, panesTop: panes.top, firstTop: first ? first.getBoundingClientRect().top : null, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(m.panesTop).toBeGreaterThan(before);
  expect(m.barBottom).toBeLessThanOrEqual(m.panesTop + 0.5);
  if (m.firstTop !== null) expect(m.barBottom).toBeLessThanOrEqual(m.firstTop + 0.5);
  expect(m.scroll).toBeLessThanOrEqual(0);
});
