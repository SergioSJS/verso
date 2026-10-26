// A folder of this computer syncs with a cloud the person already has
// (ADR 0104 item 16): WebDAV and S3 in the folder's "Sincronizar com…".
// The harness has no service; it answers the host's check by what the form
// says (a wrong password, plain HTTP, a service that cannot keep an edit
// safe, or accepted). The real checks are the host's, run against fakes of
// both services in Rust.

import { test, expect } from "./fixtures.mjs";

async function openSync(app) {
  await app.key("Mod+,");
  await app.page.locator(".settings-nav-item", { hasText: "Sincronizar" }).click();
}

const choose = (app, value) => app.page.locator('select[aria-label="Sincronizar com…"]').selectOption(value);

test("the folder's name for a conflict's copy is set without any server", async ({ app }) => {
  await app.open();
  await openSync(app);
  // No server is signed in to, and the name is there to set.
  const name = app.page.locator('input[aria-label="Nome deste computador"]');
  await expect(name).toHaveValue("Mac de Teste");
  await name.fill("Estúdio");
  await name.press("Tab");
  await expect(app.page.locator(".sync-saved")).toHaveText("Nome guardado");
  expect((await app.calls("set_device_name")).map((c) => c.name)).toEqual(["Estúdio"]);
});

test("a WebDAV folder is checked, refused for what it is, accepted, started and disconnected", async ({ app }) => {
  await app.open();
  await openSync(app);
  // A UniVerso or a cloud; the clouds that come later are shown, not chosen.
  const select = app.page.locator('select[aria-label="Sincronizar com…"]');
  await expect(select.locator("option")).toHaveText([
    "Um UniVerso (servidor)",
    "WebDAV (Nextcloud e parecidos)",
    "S3 (Amazon, Backblaze, MinIO, Cloudflare R2…)",
    "Dropbox — em breve",
    "OneDrive — em breve",
    "Google Drive — em breve",
  ]);
  await expect(select.locator("option:disabled")).toHaveCount(3);
  await choose(app, "webdav");

  const address = app.page.locator('input[aria-label="Endereço da pasta"]');
  const user = app.page.locator('input[aria-label="Usuário"]');
  const password = app.page.locator('input[aria-label="Senha"]');
  await expect(password).toHaveAttribute("type", "password");
  // HTTP outside the local network never carries a password.
  await address.fill("http://nuvem.exemplo.com/dav");
  await user.fill("ana");
  await password.fill("segredo");
  await app.page.getByRole("button", { name: "Verificar a nuvem" }).click();
  const failure = app.page.locator(".sync-failure");
  await expect(failure).toContainText("Uma senha não vai por HTTP fora da sua rede local");
  await expect(failure).toHaveAttribute("role", "alert");
  // The secret was sent once, and the field is empty again.
  await expect(password).toHaveValue("");
  expect((await app.calls("folder_sync_cloud_check")).map((c) => c.secret)).toEqual(["segredo"]);

  // A wrong password is said as one.
  await address.fill("https://nuvem.exemplo.com/remote.php/dav/files/ana/Verso");
  await password.fill("errada");
  await app.page.getByRole("button", { name: "Verificar a nuvem" }).click();
  await expect(failure).toContainText("recusou o usuário e a senha");
  await expect(app.page.locator(".sync-cloud-ok")).toHaveCount(0);

  // A service that would lose an edit is refused, with the reason.
  await address.fill("https://inseguro.exemplo.com/dav");
  await password.fill("segredo");
  await app.page.getByRole("button", { name: "Verificar a nuvem" }).click();
  await expect(failure).toContainText("não consegue guardar as edições com segurança");
  await expect(failure).toContainText("If-Match");
  await expect(app.page.getByRole("button", { name: "Sincronizar esta pasta" })).toHaveCount(0);
  expect(await app.calls("folder_sync_cloud_start")).toHaveLength(0);

  // Accepted: what is there, what the first sync does, what a deletion
  // is, what does not apply and the phone.
  await address.fill("https://nuvem.exemplo.com/remote.php/dav/files/ana/Verso");
  await password.fill("segredo");
  await app.page.getByRole("button", { name: "Verificar a nuvem" }).click();
  const ok = app.page.locator(".sync-cloud-ok");
  await expect(ok).toBeFocused();
  await expect(ok).toContainText("Destino: nuvem.exemplo.com/remote.php/dav/files/ana/Verso");
  await expect(ok).toContainText("Já há 3 arquivos na nuvem");
  await expect(ok).toContainText("Esta pasta tem");
  await expect(ok).toContainText("Na primeira vez, nada é apagado.");
  await expect(ok).toContainText("é definitivo");
  await expect(ok).toContainText("edição ao mesmo tempo");
  await expect(ok).toContainText("No celular e no navegador, use um UniVerso");

  await ok.getByRole("button", { name: "Sincronizar esta pasta" }).click();
  await expect(app.page.locator("#sync-state")).toHaveText("Sincronizada");
  expect(await app.calls("folder_sync_cloud_start")).toHaveLength(1);
  // Drawn as a cloud's: where, no rooms, its own lines, the name beside.
  await expect(app.page.locator(".sync-meta")).toContainText("WebDAV · nuvem.exemplo.com");
  await expect(app.page.locator(".sync-together")).toHaveCount(0);
  await expect(app.page.locator(".sync-cloud")).toContainText("No celular e no navegador, use um UniVerso");
  await expect(app.page.locator('input[aria-label="Nome deste computador"]')).toBeVisible();

  // Disconnect: asked first; the form is back.
  await app.page.getByRole("button", { name: "Desconectar…" }).click();
  await app.page.locator(".confirm-box").getByRole("button", { name: "Desconectar" }).click();
  await expect(app.page.locator("#sync-state")).toBeHidden();
  await expect(app.page.locator('select[aria-label="Sincronizar com…"]')).toBeVisible();
  expect(await app.calls("folder_sync_stop")).toHaveLength(1);
});

test("an S3 bucket asks for the bucket, the prefix and the key, and a bucket that keeps versions says so", async ({ app }) => {
  await app.open();
  await openSync(app);
  await choose(app, "s3");
  for (const label of ["Região", "Bucket", "Pasta dentro do bucket", "ID da chave de acesso", "Chave secreta"]) {
    await expect(app.page.locator(`input[aria-label="${label}"]`)).toBeVisible();
  }
  await app.page.locator('input[aria-label="Bucket"]').fill("versionado");
  await app.page.locator('input[aria-label="Pasta dentro do bucket"]').fill("Verso/Campanha");
  await app.page.locator('input[aria-label="ID da chave de acesso"]').fill("AKIA123");
  await app.page.locator('input[aria-label="Chave secreta"]').fill("xyz");
  await app.page.getByRole("button", { name: "Verificar a nuvem" }).click();
  const ok = app.page.locator(".sync-cloud-ok");
  await expect(ok).toContainText("Destino: s3://versionado/Verso/Campanha");
  await expect(ok).toContainText("guarda versões anteriores");
  const sent = (await app.calls("folder_sync_cloud_check"))[0];
  expect(sent.settings).toMatchObject({ provider: "s3", bucket: "versionado", prefix: "Verso/Campanha", user: "AKIA123" });
  // Cancelled: the host is told, and the panel goes.
  await ok.getByRole("button", { name: "Cancelar" }).click();
  await expect(ok).toHaveCount(0);
  expect(await app.calls("folder_sync_cloud_cancel")).toHaveLength(1);
});
