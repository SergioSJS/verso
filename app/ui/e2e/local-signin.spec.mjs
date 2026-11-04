// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The player's way in at a game master's computer that serves (ADR 0117 D3
// item 2): the server's own page (`web.html`, the window's build) with its
// API answered by the test — through the internet link a sign-in alone,
// with how an invited player makes an account; on the network the same,
// and the owner's phone's pairing beside it. At a phone's size too.

import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const page_ = join(fileURLToPath(new URL(".", import.meta.url)), ".site", "web.html");

/** The computer's server as the page meets it: `pairing` is the door's. */
async function serve(page, pairing) {
  const sent = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/state") {
      return route.fulfill({ json: { version: null, contract: null, secure: true, web: true, mail: false, local: true, accounts: true, pairing, setup: false, account: null, csrf: null } });
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

test("through the internet link: a sign-in, how an invited player makes an account, and no pairing @layout", async ({ page }) => {
  const sent = await serve(page, false);
  await page.goto("/signin?next=%2F");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("Abra primeiro o link do convite", { exact: false })).toBeVisible();
  await expect(page.getByText("nada é enviado", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Parear este celular com um código" })).toHaveCount(0);
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
