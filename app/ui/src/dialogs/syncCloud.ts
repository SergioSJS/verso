// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Sync with a cloud the person already has (ADR 0104 item 16): the form
// for WebDAV and S3 in the folder's "Sincronizar com…", the host's check
// of the service and what it found — the space, what the first sync does,
// what does not apply to a cloud folder, that a phone cannot reach it —
// and the lines a folder that syncs with a cloud adds to its section. The
// secret is typed once, sent once, and the field is emptied at once: the
// host keeps it in the system's keychain and never sends it back (ADR
// 0026).

import { commands, type CloudCheck, type CloudSettings, type SyncStatus } from "../bindings";
import { h } from "../dom";
import { fail } from "../errors";
import type { Words } from "./syncView";

/** The providers the form knows, in the order it offers them. */
export const CLOUDS = ["webdav", "s3"] as const;
export type Cloud = (typeof CLOUDS)[number];
/** The providers of ADR 0104 that come after: shown, not chosen. */
export const SOON = ["dropbox", "onedrive", "gdrive"] as const;

const pt = {
  syncWith: "Sincronizar com…",
  syncWithDesc: "Um UniVerso, ou uma nuvem que você já tem. Uma pasta sincroniza com um só destino.",
  universo: "Um UniVerso (servidor)",
  webdav: "WebDAV (Nextcloud e parecidos)",
  s3: "S3 (Amazon, Backblaze, MinIO, Cloudflare R2…)",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  gdrive: "Google Drive",
  soon: "em breve",
  // WebDAV
  address: "Endereço da pasta",
  addressDesc: "Por exemplo https://nuvem.exemplo.com/remote.php/dav/files/ana/Verso. A pasta é criada se não existir.",
  user: "Usuário",
  password: "Senha",
  passwordDesc: "No Nextcloud, crie uma senha de aplicativo em Segurança. Ela fica no chaveiro do sistema, nunca na pasta nem nos ajustes.",
  plainHttp: "Este endereço é da minha rede local; permitir HTTP sem criptografia",
  plainHttpDesc: "A senha vai sem criptografia por esta rede. Só marque se o servidor é seu.",
  // S3
  endpoint: "Endereço do serviço",
  endpointDesc: "Vazio para a Amazon S3. Para MinIO, Backblaze, Cloudflare R2 ou outro: o endereço que o serviço dá, como https://s3.us-west-004.backblazeb2.com.",
  region: "Região",
  regionDesc: "Por exemplo us-east-1 ou sa-east-1. Vazio vale us-east-1.",
  bucket: "Bucket",
  prefix: "Pasta dentro do bucket",
  prefixDesc: "Opcional. Use uma pasta só para esta: crie a chave de acesso com permissão só neste bucket e nesta pasta (o tutorial mostra como).",
  access: "ID da chave de acesso",
  secret: "Chave secreta",
  secretDesc: "Fica no chaveiro do sistema, nunca na pasta nem nos ajustes.",
  pathStyle: "O bucket vai no caminho do endereço",
  pathStyleDesc: "Marcado para MinIO e a maioria dos serviços que você mesmo hospeda.",
  // The check
  check: "Verificar a nuvem",
  checking: "Verificando…",
  checkWhy: "Verificar escreve e apaga um arquivo de teste na nuvem para ter certeza de que ela não deixa uma edição de outro aparelho se perder.",
  problems: {
    invalid: "Falta algo no formulário",
    plain_http_unconfirmed: "Este endereço usa HTTP sem criptografia. Se é da sua rede local, marque a caixa de confirmação",
    plain_http_refused: "Uma senha não vai por HTTP fora da sua rede local. Use um endereço https://",
    auth: "A nuvem recusou o usuário e a senha (ou a chave) — ou ela não deixa esta conta escrever aqui",
    unreachable: "Não foi possível falar com a nuvem. Confira o endereço e a rede",
    service_refused: "Esta nuvem não consegue guardar as edições com segurança, então o Verso não sincroniza com ela",
    no_conditional_delete: "Esta nuvem não confere a versão antes de apagar um arquivo, e uma edição de outro aparelho poderia se perder junto. O Verso não sincroniza com ela",
    no_keyring: "Este computador não tem um chaveiro para guardar a senha. No Linux, instale e abra um (GNOME Keyring ou KWallet) e tente de novo",
    failed: "Algo deu errado ao verificar a nuvem",
  } as Record<string, string>,
  // What the check found
  okTitle: "A nuvem serve",
  where: (label: string) => `Destino: ${label}`,
  there: (files: number, size: string) => (files === 0 ? "A pasta na nuvem está vazia." : `Já há ${files} arquivos na nuvem, ${size}.`),
  free: (size: string) => `Espaço livre na nuvem: ${size}.`,
  here: (files: number, size: string) => `Esta pasta tem ${files} arquivos, ${size}.`,
  firstSafe: "Na primeira vez, nada é apagado.",
  firstHow: "O que só um lado tem vai para o outro; um arquivo diferente nos dois fica duas vezes — a versão da nuvem com o nome, a deste computador ao lado.",
  deletionsFinal: "Apagar um arquivo aqui o apaga na nuvem, e lá não há como desfazer: é definitivo. (Neste computador ele vai para a lixeira da pasta.)",
  deletionsKept: "Apagar um arquivo aqui o apaga na nuvem, mas ela guarda versões anteriores: dá para recuperar pelo próprio serviço.",
  deletionsUnknown: "Não deu para saber se a nuvem guarda os arquivos apagados. Trate apagar como definitivo.",
  notApply: "Numa pasta ligada a uma nuvem não há edição ao mesmo tempo, compartilhamento com outras pessoas, papéis nem a lixeira do servidor. Para isso, use um UniVerso.",
  phone: "No celular e no navegador, use um UniVerso: eles não sincronizam com uma nuvem.",
  start: "Sincronizar esta pasta",
  cancel: "Cancelar",
  // The device's name (C.13)
  deviceTitle: "Nome deste computador",
  deviceDesc: "Aparece na cópia de um conflito (“conflito, nome, data”) e nas listas de sessões de um UniVerso. Não depende de servidor nenhum.",
  deviceSaved: "Nome guardado",
  // A folder that syncs with a cloud
  provider: { webdav: "WebDAV", s3: "S3" } as Record<string, string>,
  aboutTitle: "Sobre esta nuvem",
  moreNotes: "O que a verificação achou",
  turnOff: "Desconectar…",
  turnOffAsk: "Desconectar esta pasta da nuvem? Os arquivos ficam como estão, aqui e na nuvem. A senha sai do chaveiro deste computador; conectar a mesma nuvem de novo continua de onde parou.",
  turnOffYes: "Desconectar",
  connecting: "Conectando à nuvem…",
  serverBack: "As mudanças esperam e cruzam quando ela voltar.",
  unreachable: (label: string) => `Não foi possível falar com ${label}.`,
  calm: "Nada esperando por você. O que mudar aqui ou na nuvem cruza sozinho.",
  conflictWhy: (n: number) =>
    n === 1
      ? "Mudou em dois lugares ao mesmo tempo. A versão da nuvem ficou com o nome; a outra está numa cópia."
      : `Mudou em vários lugares ao mesmo tempo. A versão da nuvem ficou com o nome; as outras ${n} estão em cópias.`,
  quotaTitle: (n: number) => (n === 1 ? "Um arquivo que não coube na nuvem" : `${n} arquivos que não couberam na nuvem`),
  quotaDo: "A nuvem está cheia. Libere espaço nela, ou aumente o plano.",
  invalidTitle: (n: number) => (n === 1 ? "Um arquivo com um nome que a nuvem não guarda" : `${n} arquivos com nomes que a nuvem não guarda`),
  invalidDo: "Renomeie: tire o ponto ou o espaço do fim, os sinais < > : \" | ? * \\, nomes como CON, e os que o serviço guarda para si (.part, .filepart, .htaccess). Depois eles sincronizam sozinhos.",
  twinTitle: (n: number) => (n === 1 ? "Dois nomes que só diferem em maiúsculas e minúsculas na nuvem; este computador guarda um" : `${n} arquivos da nuvem com nomes que só diferem de outros em maiúsculas e minúsculas; este computador guarda um de cada`),
  twinDo: "Num Mac ou no Windows os dois seriam um arquivo só. Renomeie um deles na própria nuvem e os dois chegam aqui.",
  problemsRun: {
    cloud_auth: "a nuvem recusou o usuário e a senha: desconecte esta pasta e conecte de novo",
    no_keyring: "este computador não tem um chaveiro para guardar a senha: instale um (GNOME Keyring ou KWallet) e conecte de novo",
    cloud_refused: "a nuvem não consegue guardar as edições com segurança; o log do app diz por quê",
  } as Record<string, string>,
  what: { deleted_there: "apagado na nuvem", renamed_there: "renomeado na nuvem" } as Record<string, string>,
};
const en: typeof pt = {
  syncWith: "Sync with…",
  syncWithDesc: "A UniVerso, or a cloud you already have. A folder syncs with one place.",
  universo: "A UniVerso (server)",
  webdav: "WebDAV (Nextcloud and the like)",
  s3: "S3 (Amazon, Backblaze, MinIO, Cloudflare R2…)",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  gdrive: "Google Drive",
  soon: "coming soon",
  address: "The folder's address",
  addressDesc: "For example https://cloud.example.com/remote.php/dav/files/ana/Verso. The folder is made if it does not exist.",
  user: "User",
  password: "Password",
  passwordDesc: "On Nextcloud, make an app password under Security. It is kept in the system's keychain, never in the folder or the settings.",
  plainHttp: "This address is on my local network; allow HTTP without encryption",
  plainHttpDesc: "The password goes unencrypted over this network. Tick it only if the server is yours.",
  endpoint: "The service's address",
  endpointDesc: "Empty for Amazon S3. For MinIO, Backblaze, Cloudflare R2 or another: the address the service gives, such as https://s3.us-west-004.backblazeb2.com.",
  region: "Region",
  regionDesc: "For example us-east-1 or sa-east-1. Empty means us-east-1.",
  bucket: "Bucket",
  prefix: "Folder inside the bucket",
  prefixDesc: "Optional. Use a folder just for this one: make the access key with permission only on this bucket and this folder (the tutorial shows how).",
  access: "Access key ID",
  secret: "Secret key",
  secretDesc: "It is kept in the system's keychain, never in the folder or the settings.",
  pathStyle: "The bucket goes in the address's path",
  pathStyleDesc: "Ticked for MinIO and most services you host yourself.",
  check: "Check the cloud",
  checking: "Checking…",
  checkWhy: "Checking writes and deletes a test file in the cloud to make sure it does not let another device's edit get lost.",
  problems: {
    invalid: "Something is missing from the form",
    plain_http_unconfirmed: "This address uses HTTP without encryption. If it is on your local network, tick the confirmation box",
    plain_http_refused: "A password does not go over HTTP outside your local network. Use an https:// address",
    auth: "The cloud refused the user and password (or the key) — or it does not let this account write here",
    unreachable: "The cloud could not be reached. Check the address and the network",
    service_refused: "This cloud cannot keep edits safe, so Verso does not sync with it",
    no_conditional_delete: "This cloud does not check a file's version before deleting it, so another device's edit could be lost with it. Verso does not sync with it",
    no_keyring: "This computer has no keyring to keep the password in. On Linux, install and open one (GNOME Keyring or KWallet) and try again",
    failed: "Something went wrong checking the cloud",
  },
  okTitle: "The cloud will do",
  where: (label) => `Destination: ${label}`,
  there: (files, size) => (files === 0 ? "The folder in the cloud is empty." : `There are ${files} files in the cloud already, ${size}.`),
  free: (size) => `Free space in the cloud: ${size}.`,
  here: (files, size) => `This folder has ${files} files, ${size}.`,
  firstSafe: "The first time, nothing is deleted.",
  firstHow: "What one side alone has goes to the other; a file that differs on both is kept twice — the cloud's version under the name, this computer's beside it.",
  deletionsFinal: "Deleting a file here deletes it in the cloud, and there is no way back there: it is final. (On this computer it goes to the folder's bin.)",
  deletionsKept: "Deleting a file here deletes it in the cloud, but the cloud keeps earlier versions: it can be recovered from the service itself.",
  deletionsUnknown: "Could not tell whether the cloud keeps deleted files. Treat deleting as final.",
  notApply: "A folder tied to a cloud has no simultaneous editing, no sharing with other people, no roles and no server bin. For those, use a UniVerso.",
  phone: "On the phone and in the browser, use a UniVerso: they do not sync with a cloud.",
  start: "Sync this folder",
  cancel: "Cancel",
  deviceTitle: "This computer's name",
  deviceDesc: "It appears in a conflict's copy (“conflict, name, date”) and in a UniVerso's list of sessions. It does not depend on any server.",
  deviceSaved: "Name saved",
  provider: { webdav: "WebDAV", s3: "S3" },
  aboutTitle: "About this cloud",
  moreNotes: "What the check found",
  turnOff: "Disconnect…",
  turnOffAsk: "Disconnect this folder from the cloud? The files stay as they are, here and in the cloud. The password leaves this computer's keychain; connecting the same cloud again goes on from where it stopped.",
  turnOffYes: "Disconnect",
  connecting: "Connecting to the cloud…",
  serverBack: "Changes wait, and cross when it is back.",
  unreachable: (label) => `Could not reach ${label}.`,
  calm: "Nothing waits for you. What changes here or in the cloud crosses on its own.",
  conflictWhy: (n) =>
    n === 1
      ? "It changed in two places at once. The cloud's version kept the name; the other is in a copy."
      : `It changed in several places at once. The cloud's version kept the name; the other ${n} are in copies.`,
  quotaTitle: (n) => (n === 1 ? "A file that did not fit in the cloud" : `${n} files that did not fit in the cloud`),
  quotaDo: "The cloud is full. Free space in it, or raise the plan.",
  invalidTitle: (n) => (n === 1 ? "A file whose name the cloud does not keep" : `${n} files whose names the cloud does not keep`),
  invalidDo: "Rename them: no trailing dot or space, none of < > : \" | ? * \\, no names such as CON, and none the service keeps for itself (.part, .filepart, .htaccess). Then they sync on their own.",
  twinTitle: (n) => (n === 1 ? "Two names that differ only in case in the cloud; this computer keeps one" : `${n} files in the cloud whose names differ from others only in case; this computer keeps one of each`),
  twinDo: "On a Mac or Windows the two would be one file. Rename one of them in the cloud itself and both come here.",
  problemsRun: {
    cloud_auth: "the cloud refused the user and password: disconnect this folder and connect again",
    no_keyring: "this computer has no keyring to keep the password in: install one (GNOME Keyring or KWallet) and connect again",
    cloud_refused: "the cloud cannot keep edits safe; the app's log says why",
  },
  what: { deleted_there: "deleted in the cloud", renamed_there: "renamed in the cloud" },
};

export function cloudStrings(): typeof pt {
  return document.documentElement.lang.startsWith("pt") ? pt : en;
}

/** What a folder tied to a cloud says differently from one tied to a
 *  UniVerso (ADR 0104 item 4): the words that name "the server". */
export function cloudWords(base: Words): Words {
  const c = cloudStrings();
  return {
    ...base,
    connecting: c.connecting,
    serverBack: c.serverBack,
    calm: c.calm,
    turnOff: c.turnOff,
    turnOffAsk: c.turnOffAsk,
    turnOffYes: c.turnOffYes,
    conflictWhy: c.conflictWhy,
    reasonTitle: { ...base.reasonTitle, quota: c.quotaTitle, name_invalid: c.invalidTitle, case_twin_there: c.twinTitle },
    reasonDo: { ...base.reasonDo, quota: c.quotaDo, name_invalid: c.invalidDo, case_twin_there: c.twinDo },
    what: { ...base.what, ...c.what },
  };
}

/** The provider's name, for the line that says where. */
export function providerName(provider: string): string {
  return cloudStrings().provider[provider] ?? provider;
}

/** The sentence a cloud problem is said with, or null when it is not one. */
export function cloudProblem(problem: string | null): string | null {
  return (problem && cloudStrings().problemsRun[problem]) || null;
}

/** The cloud's own section of a folder that syncs with one: what a
 *  deletion means there (item 9), what the checks found, what does not
 *  apply and that a phone cannot reach it (items 4 and 5). */
export function aboutCloud(st: SyncStatus): HTMLElement | null {
  const cloud = st.cloud;
  if (!cloud) return null;
  const c = cloudStrings();
  const box = h("section", "sync-cloud");
  box.setAttribute("aria-labelledby", "sync-cloud-title");
  const title = h("h3", "sync-h", c.aboutTitle);
  title.id = "sync-cloud-title";
  const list = h("ul", "sync-cloud-list");
  const deletions = cloud.deletions === "final" ? c.deletionsFinal : cloud.deletions === "kept" ? c.deletionsKept : c.deletionsUnknown;
  for (const line of [deletions, c.notApply, c.phone, ...cloud.notes]) list.append(h("li", "", line));
  box.append(title, list);
  return box;
}

/** The device's name, set in a place that does not depend on a server
 *  (ADR 0104 item 4, C.13). */
export function deviceNameRow(item: (title: string, desc: string, control: HTMLElement | null) => HTMLElement): HTMLElement {
  const c = cloudStrings();
  const name = h("input");
  name.type = "text";
  name.autocomplete = "off";
  name.spellcheck = false;
  name.setAttribute("aria-label", c.deviceTitle);
  name.addEventListener("keydown", (e) => e.stopPropagation());
  const said = h("span", "sync-saved");
  said.setAttribute("role", "status");
  void commands.deviceName().then((r) => {
    if (r.status === "ok") name.value = r.data.name;
  });
  name.addEventListener("change", () => {
    void commands.setDeviceName(name.value).then((r) => {
      if (r.status !== "ok") return fail(r.error);
      name.value = r.data.device.name;
      said.textContent = c.deviceSaved;
    });
  });
  const row = item(c.deviceTitle, c.deviceDesc, name);
  row.classList.add("sync-device");
  row.append(said);
  return row;
}

/** What the form needs of the section that holds it. */
export interface Deps {
  item: (title: string, desc: string, control: HTMLElement | null) => HTMLElement;
  size: (bytes: number | null) => string;
  /** The folder's status after the host started the sync. */
  started: (st: SyncStatus) => void;
}

function field(type: "text" | "password" | "url", label: string, value = ""): HTMLInputElement {
  const input = h("input");
  input.type = type === "url" ? "text" : type;
  input.autocomplete = type === "password" ? "new-password" : "off";
  input.spellcheck = false;
  input.value = value;
  input.setAttribute("aria-label", label);
  input.addEventListener("keydown", (e) => e.stopPropagation());
  return input;
}

function tick(label: string, checked: boolean): { row: HTMLLabelElement; box: HTMLInputElement } {
  const row = h("label", "sync-together");
  const box = h("input");
  box.type = "checkbox";
  box.checked = checked;
  row.append(box, h("span", "sync-together-words", label));
  return { row, box };
}

/** The form for `provider`, then the check, then the start. */
export function drawCloudForm(box: HTMLElement, provider: Cloud, deps: Deps): void {
  const c = cloudStrings();
  const { item } = deps;
  const web = provider === "webdav";
  const address = field("url", web ? c.address : c.endpoint);
  const user = field("text", web ? c.user : c.access);
  const secret = field("password", web ? c.password : c.secret);
  const region = field("text", c.region);
  const bucket = field("text", c.bucket);
  const prefix = field("text", c.prefix);
  const pathStyle = tick(c.pathStyle, true);
  const http = tick(c.plainHttp, false);
  http.box.setAttribute("aria-describedby", "sync-cloud-http-why");
  const httpRow = h("div", "sync-cloud-http");
  httpRow.append(http.row, Object.assign(h("p", "sync-item-why", c.plainHttpDesc), { id: "sync-cloud-http-why" }));
  httpRow.hidden = true;
  address.addEventListener("input", () => (httpRow.hidden = !address.value.trim().toLowerCase().startsWith("http://")));
  const failure = h("div", "sync-failure");
  failure.setAttribute("role", "alert");
  failure.hidden = true;
  const result = h("div", "sync-cloud-result");
  result.setAttribute("aria-live", "polite");
  const check = h("button", "btn primary", c.check);
  check.type = "button";

  const rows: HTMLElement[] = web
    ? [item(c.address, c.addressDesc, address), item(c.user, "", user), item(c.password, c.passwordDesc, secret), httpRow]
    : [
        item(c.endpoint, c.endpointDesc, address),
        httpRow,
        item(c.region, c.regionDesc, region),
        item(c.bucket, "", bucket),
        item(c.prefix, c.prefixDesc, prefix),
        item(c.access, "", user),
        item(c.secret, c.secretDesc, secret),
        item(c.pathStyle, c.pathStyleDesc, pathStyle.row),
      ];
  const settings = (): CloudSettings => ({
    provider,
    endpoint: address.value.trim(),
    bucket: web ? "" : bucket.value.trim(),
    prefix: web ? "" : prefix.value.trim(),
    region: web ? "" : region.value.trim(),
    user: user.value.trim(),
    path_style: !web && (address.value.trim() === "" ? false : pathStyle.box.checked),
    plain_http: http.box.checked,
  });

  check.addEventListener("click", () => {
    failure.hidden = true;
    result.replaceChildren();
    check.disabled = true;
    check.textContent = c.checking;
    // Sent once and emptied at once: the window keeps no secret.
    const typed = secret.value;
    secret.value = "";
    void commands.folderSyncCloudCheck(settings(), typed).then(async (r) => {
      check.disabled = false;
      check.textContent = c.check;
      if (r.status !== "ok") return fail(r.error);
      if (!r.data.accepted) {
        const why = (r.data.problem && c.problems[r.data.problem]) || c.problems["failed"]!;
        failure.textContent = r.data.message ? `${why}. ${r.data.message}` : why;
        failure.hidden = false;
        secret.focus();
        return;
      }
      await showChecked(result, r.data, deps, () => {
        result.replaceChildren();
        secret.focus();
      });
    });
  });
  const go = h("div", "sync-go");
  go.append(h("p", "sync-first", c.checkWhy), failure, check, result);
  box.append(...rows, go);
}

async function showChecked(result: HTMLElement, found: CloudCheck, deps: Deps, back: () => void): Promise<void> {
  const c = cloudStrings();
  const panel = h("article", "sync-item sync-cloud-ok");
  panel.tabIndex = -1;
  const lines = h("ul", "sync-cloud-list");
  lines.append(h("li", "", c.where(found.label)), h("li", "", c.there(found.remote_files ?? 0, deps.size(found.remote_bytes))));
  if (found.free !== null) lines.append(h("li", "", c.free(deps.size(found.free))));
  const here = await commands.folderSpace();
  if (here.status === "ok") lines.append(h("li", "", c.here(here.data.files, deps.size(here.data.total))));
  const first = h("p", "sync-first");
  first.append(h("strong", "", c.firstSafe), ` ${c.firstHow}`);
  const deletions = found.deletions === "final" ? c.deletionsFinal : found.deletions === "kept" ? c.deletionsKept : c.deletionsUnknown;
  const rest = h("ul", "sync-cloud-list");
  for (const line of [deletions, c.notApply, c.phone, ...found.notes]) rest.append(h("li", "", line));
  const start = h("button", "btn primary", c.start);
  start.type = "button";
  const cancel = h("button", "btn quiet", c.cancel);
  cancel.type = "button";
  start.addEventListener("click", () => {
    start.disabled = true;
    void commands.folderSyncCloudStart().then((r) => {
      start.disabled = false;
      if (r.status !== "ok") return fail(r.error);
      deps.started(r.data);
    });
  });
  cancel.addEventListener("click", () => void commands.folderSyncCloudCancel().then(back));
  const buttons = h("div", "sync-buttons");
  buttons.append(start, cancel);
  panel.append(h("h4", "sync-item-title", c.okTitle), lines, first, rest, buttons);
  result.replaceChildren(panel);
  panel.focus();
}

/** The choice of where the folder syncs: a UniVerso, a cloud, or one that
 *  comes later (shown, not chosen). */
export function chooser(choice: string, change: (value: string) => void, deps: Deps): HTMLElement {
  const c = cloudStrings();
  const select = h("select");
  select.setAttribute("aria-label", c.syncWith);
  for (const [value, label] of [
    ["universo", c.universo],
    ["webdav", c.webdav],
    ["s3", c.s3],
    ["dropbox", `${c.dropbox} — ${c.soon}`],
    ["onedrive", `${c.onedrive} — ${c.soon}`],
    ["gdrive", `${c.gdrive} — ${c.soon}`],
  ] as const) {
    const o = h("option", "", label);
    o.value = value;
    o.disabled = (SOON as readonly string[]).includes(value);
    select.append(o);
  }
  select.value = choice;
  select.addEventListener("change", () => change(select.value));
  return deps.item(c.syncWith, c.syncWithDesc, select);
}
