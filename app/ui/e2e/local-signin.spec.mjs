// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The player's way in at a game master's computer that serves (ADR 0117 D3
// item 2): the server's own page (`web.html`, the window's build) with its
// API answered by the test — the sign-in, with how an invited player
// makes an account, and the owner's phone's pairing beside it, on the
// network and, since ADR 0117 D5 (R3), through the internet link too. At a
// phone's size too.

import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const page_ = join(fileURLToPath(new URL(".", import.meta.url)), ".site", "web.html");

/** The computer's server as the page meets it: `pairing`, `passkeys` and
 *  `link` are the door's — both pair (ADR 0117 D5); the network's offers no
 *  passkey, the link's does (ADR 0117 D9). `link` is the door. */
async function serve(page, pairing, passkeys = !pairing, link = passkeys) {
  const sent = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/state") {
      return route.fulfill({ json: { version: null, contract: null, secure: true, web: true, mail: false, local: true, accounts: true, pairing, passkeys, link, setup: false, account: null, csrf: null } });
    }
    if (path === "/api/signin" && req.method() === "POST") {
      sent.push(req.postDataJSON());
      return route.fulfill({ status: 401, json: { error: "bad_credentials", message: "wrong e-mail or password" } });
    }
    return route.fulfill({ status: 404, json: { error: "not_found", message: path } });
  });
  // The page itself at the addresses the server answers it at.
  await page.route(
    (url) => url.pathname === "/signin" || url.pathname === "/pair",
    (route) => route.fulfill({ path: page_, contentType: "text/html; charset=utf-8" }),
  );
  return sent;
}

test("through the internet link: a sign-in, how an invited player makes an account, and the owner's pairing @layout", async ({ page }) => {
  const sent = await serve(page, true, true, true);
  await page.goto("/signin?next=%2F");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("Abra primeiro o link do convite", { exact: false })).toBeVisible();
  await expect(page.getByText("nada é enviado", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Parear este celular com um código" })).toBeVisible();
  await page.getByLabel("E-mail").fill("bia@casa.example");
  await page.getByLabel("Senha").fill("uma senha longa o bastante");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ email: "bia@casa.example", password: "uma senha longa o bastante" });
  // A refusal is said on the page.
  await expect(page.getByRole("alert")).not.toBeEmpty();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("on the network: the sign-in and, beside it, the owner's phone's pairing with a code", async ({ page }) => {
  await serve(page, true);
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.getByRole("link", { name: "Parear este celular com um código" }).click();
  await expect(page.getByRole("heading", { name: "Conectar este celular" })).toBeVisible();
  await expect(page.getByLabel(/código/i).first()).toBeVisible();
});

test("on the network no passkey is offered: the sign-in says to use the password; through the link the button is there @layout", async ({ page }) => {
  await serve(page, true);
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com passkey" })).toBeHidden();
  await expect(page.getByText("Nesta rede, entre com a senha: passkeys só pelo link da internet de quem mestra.")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Through the link: offered wherever this browser can make one.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await serve(page, true, true, true);
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("passkeys só pelo link da internet", { exact: false })).toHaveCount(0);
  const can = await page.evaluate(() => typeof window.PublicKeyCredential === "function" && window.isSecureContext);
  if (can) await expect(page.getByRole("button", { name: "Entrar com passkey" })).toBeVisible();
});

test("through the internet link the pairing page says it is the link, and nothing of the network's certificate", async ({ page }) => {
  await serve(page, true, true, true);
  await page.goto("/signin");
  await page.getByRole("link", { name: "Parear este celular com um código" }).click();
  await expect(page.getByRole("heading", { name: "Conectar este celular" })).toBeVisible();
  await expect(page.getByText("Este é o link na internet de um computador", { exact: false })).toBeVisible();
  await expect(page.getByText("certificado que o próprio app fez", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel(/código/i).first()).toBeVisible();
});
