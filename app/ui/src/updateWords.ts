// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the updater says, in the window's language. The host says each
// step as a code, `update.<code>`, then `: ` and a detail when there is
// one — an error's own text, a path (app/src-tauri/src/update/pick.rs) —
// inside the messages the contract already carries; this words it in
// pt-BR or English (ADR 0035). Any other text, an unknown code included
// (a host older or newer than this window), is shown as it came.

type Words = Record<string, string | ((detail: string) => string)>;

const pt: Words = {
  client: (d) => `O Verso não conseguiu preparar a conexão para verificar atualizações (${d}).`,
  unreachable: (d) => `Não foi possível verificar atualizações: ${d}`,
  rate_limited: "Limite de requisições do GitHub atingido. Tente novamente mais tarde.",
  no_release: "O repositório de atualizações não tem versão publicada (o GitHub respondeu 404).",
  http: (d) => `O servidor de atualizações respondeu HTTP ${d}.`,
  bad_answer: (d) => `A resposta do servidor de atualizações não pôde ser lida (${d}).`,
  task: (d) => `A atualização parou no meio (${d}).`,
  version: (d) => `A versão deste app não pôde ser lida: ${d}`,
  none: "Nenhuma atualização disponível.",
  no_package: "A versão nova não tem um pacote para esta plataforma.",
  url_refused: "Endereço de download não permitido.",
  no_checksum: "O pacote não tem checksum publicado; baixe a atualização pela página de versões.",
  too_big: "O pacote de atualização é grande demais. Nada foi instalado.",
  wrong_version: "O pacote não é desta versão; baixe a atualização pela página de versões.",
  no_signed_list: "A versão nova não tem a lista de checksums assinada; baixe a atualização pela página de versões.",
  download_failed: (d) => `Erro ao baixar a atualização: ${d}`,
  file_too_big: (d) => `${d} é grande demais para o que diz ser.`,
  bad_signature: "A assinatura publicada não é uma assinatura. Nada foi instalado.",
  list_mismatch: (d) => `A lista de checksums da versão nova não confere (${d}). Nada foi instalado.`,
  disk: (d) => `Não foi possível gravar a atualização no disco: ${d}`,
  checksum: (d) => `O checksum do download não confere com o publicado (${d}). Nada foi instalado.`,
  not_listed: (d) => `O download não é o da lista assinada (${d}). Nada foi instalado.`,
  extracting: "Descompactando arquivos…",
  installing: "Instalando a nova versão…",
  bad_zip: (d) => `O arquivo baixado não é um ZIP válido (${d}).`,
  mac_no_app: "Nenhum pacote .app encontrado no arquivo baixado.",
  installed_restart: "Atualização instalada. Reinicie o Verso para usar a nova versão.",
  mac_rollback: (d) => `A instalação falhou e o app anterior não pôde voltar ao lugar. Uma cópia intacta está em: ${d}`,
  downloads_failed: (d) => `Não foi possível pôr a atualização em Downloads: ${d}`,
  mac_in_downloads: (d) => `Nova versão copiada para Downloads: ${d}`,
  win_run_failed: (d) => `Não foi possível abrir o instalador: ${d}`,
  win_started: "Instalador aberto. Siga as instruções na tela para concluir a atualização.",
  linux_not_appimage: "Este app não roda de um AppImage; baixe a atualização pela página de versões.",
  linux_in_downloads: (d) => `Pacote de atualização salvo em: ${d}. Instale-o com o gerenciador de pacotes do sistema.`,
  android_prompt: "O Android vai perguntar se instala a versão nova.",
  android_allow: "Permita que o Verso instale apps na página do Android que abriu, volte e toque em atualizar de novo. Nada foi baixado ainda.",
  android_failed: (d) => `O Android não abriu a instalação: ${d}`,
  unsupported: "Esta plataforma não se atualiza por aqui.",
};

const en: Words = {
  client: (d) => `Verso could not set up the connection to check for updates (${d}).`,
  unreachable: (d) => `Could not check for updates: ${d}`,
  rate_limited: "GitHub's request limit was reached. Try again later.",
  no_release: "The update repository has no published version (GitHub answered 404).",
  http: (d) => `The update server answered HTTP ${d}.`,
  bad_answer: (d) => `The update server's answer could not be read (${d}).`,
  task: (d) => `The update stopped halfway (${d}).`,
  version: (d) => `This app's version could not be read: ${d}`,
  none: "No update available.",
  no_package: "The new version has no package for this platform.",
  url_refused: "Download address not allowed.",
  no_checksum: "The package has no published checksum; download the update from the releases page.",
  too_big: "The update package is too large. Nothing was installed.",
  wrong_version: "The package is not of this version; download the update from the releases page.",
  no_signed_list: "The new version has no signed checksums list; download the update from the releases page.",
  download_failed: (d) => `Error downloading the update: ${d}`,
  file_too_big: (d) => `${d} is too large for what it claims to be.`,
  bad_signature: "The published signature is not a signature. Nothing was installed.",
  list_mismatch: (d) => `The new version's checksums list does not match (${d}). Nothing was installed.`,
  disk: (d) => `Could not write the update to disk: ${d}`,
  checksum: (d) => `The download's checksum does not match the published one (${d}). Nothing was installed.`,
  not_listed: (d) => `The download is not the one in the signed list (${d}). Nothing was installed.`,
  extracting: "Extracting files…",
  installing: "Installing the new version…",
  bad_zip: (d) => `The downloaded file is not a valid ZIP (${d}).`,
  mac_no_app: "No .app bundle found in the downloaded file.",
  installed_restart: "Update installed. Restart Verso to use the new version.",
  mac_rollback: (d) => `The install failed and the previous app could not be put back. An intact copy is at: ${d}`,
  downloads_failed: (d) => `Could not put the update in Downloads: ${d}`,
  mac_in_downloads: (d) => `New version copied to Downloads: ${d}`,
  win_run_failed: (d) => `Could not open the installer: ${d}`,
  win_started: "Installer opened. Follow the instructions on screen to finish the update.",
  linux_not_appimage: "This app does not run from an AppImage; download the update from the releases page.",
  linux_in_downloads: (d) => `Update package saved at: ${d}. Install it with your system's package manager.`,
  android_prompt: "Android will ask whether to install the new version.",
  android_allow: "Allow Verso to install apps on the Android page that opened, come back and tap update again. Nothing was downloaded yet.",
  android_failed: (d) => `Android did not open the install: ${d}`,
  unsupported: "This platform does not update from here.",
};

/** The codes the host says (pick.rs), for the tests. */
export const UPDATE_CODES: readonly string[] = Object.keys(en);

const CODED = /^update\.([a-z_]+)(?:: ([\s\S]*))?$/;

/** `message` as the window in `locale` ("pt-BR" or "en") shows it. */
export function updateWords(message: string, locale: string): string {
  const m = CODED.exec(message);
  if (!m) return message;
  const words = (locale.toLowerCase().startsWith("pt") ? pt : en)[m[1] ?? ""];
  if (words === undefined) return message;
  const detail = m[2] ?? "";
  return typeof words === "function" ? words(detail) : words;
}

/** Both catalogues name the same codes (the unit test asks). */
export function updateCatalogues(): { pt: readonly string[]; en: readonly string[] } {
  return { pt: Object.keys(pt), en: Object.keys(en) };
}
