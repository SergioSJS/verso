// A table moved to its other server (ADR 0117 D8, R9), the window's part:
// the game master of a folder with two hosts is offered *Move this table
// to …* in the table's window, asked first; moved, the window says where it
// went, and the table's window there says it moved, with no switch and no
// invitation; a player who opens the table where it was is told it moved
// and to ask for a new invitation, and is not kept waiting. The harness
// plays the hosts (`?moveTo=`, `?closed=moved`, `src/harness.ts`); the
// hosts themselves are tried in `app/src-tauri/src/tests_table_move.rs` and
// `crates/verso-server/src/tests_table_move.rs`.

import { test, expect } from "./fixtures.mjs";

async function tableWindow(app) {
  await app.page.locator("#tree-root").dispatchEvent("contextmenu", { clientX: 40, clientY: 40 });
  await app.page.getByRole("menuitem", { name: /^Tornar a pasta toda uma mesa|^Mesa…/ }).click();
  const dialog = app.page.getByRole("dialog", { name: /^Mesa da pasta/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("the game master moves the table to this computer, asked first, and the table's window says it moved", async ({ app }) => {
  await app.open("?vault=empty&table=owner&moveTo=here");
  const dialog = await tableWindow(app);
  const move = dialog.getByRole("button", { name: "Mudar esta mesa para: este computador" });
  await expect(move).toBeVisible();
  await move.click();
  // Asked first, saying what stays and what is new.
  await expect(dialog.getByRole("group", { name: /^Mudar a mesa para: este computador\?/ })).toBeVisible();
  await expect(dialog).toContainText("convide-os de novo");
  await dialog.getByRole("button", { name: "Sim" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(app.page.locator("#status")).toContainText("A mesa mudou para: este computador");
  // The host was asked to move the whole folder's table; the old host's
  // table is closed and marked moved.
  expect((await app.calls("local_server_move_table")).at(-1)).toMatchObject({ root: "" });
  expect(await app.page.evaluate(() => window.__harness.campaign.tables[0])).toMatchObject({ root: "", open: false, moved: true });
  // Its window there: what it means, no switch, no invitation; undo stays.
  const again = await tableWindow(app);
  await expect(again).toContainText("Esta mesa mudou de servidor");
  await expect(again).toContainText("tira dela os jogadores que a mesa tinha: eles perdem o acesso");
  await expect(again.getByRole("switch", { name: "Mesa aberta" })).toBeHidden();
  await expect(again.getByRole("heading", { name: "Convidar jogadores" })).toBeHidden();
  await expect(again.getByRole("button", { name: "Desfazer mesa" })).toBeVisible();
  // Undoing it says the old players lose access here.
  await again.getByRole("button", { name: "Desfazer mesa" }).click();
  await expect(again.getByRole("group", { name: /os jogadores que ela tinha perdem o acesso/ })).toBeVisible();
  await again.getByRole("button", { name: "Cancelar" }).click();
  await expect(again.getByRole("button", { name: "Abrir a mesa nova (este computador)" })).toBeVisible();
});

test("with no other server the table's window offers no move", async ({ app }) => {
  await app.open("?vault=empty&table=owner");
  const dialog = await tableWindow(app);
  await expect(dialog.getByRole("switch", { name: "Mesa aberta" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Mudar esta mesa/ })).toHaveCount(0);
});

test("a player who opens a table that moved is told so, on a phone, and not kept waiting", async ({ app }) => {
  await app.page.setViewportSize({ width: 390, height: 844 });
  await app.open("?vault=empty&table=player&side=server&role=reader&closed=moved");
  const state = app.page.locator(".table-closed-state");
  await expect(state).toContainText("A mesa mudou de servidor");
  await expect(state).toContainText("Peça a ele um convite novo.");
  await expect(state.getByRole("button", { name: "Tentar agora" })).toHaveCount(0);
  app.expectFault(/mesa está fechada/);
});
