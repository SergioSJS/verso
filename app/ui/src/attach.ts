// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The editor's "insert image" (the toolbar's last button): what it says in
// both languages (ADR 0035) and the system's picker it opens. The picker is
// the page's own `<input type="file">` on every side — the desktop's web
// view opens the system's panel for it, a phone's browser offers the
// camera and the gallery — so no path ever reaches the window and the
// desktop's capabilities gain no dialog permission (ADR 0026 rule 4). The
// copy into the folder is `create_file` of the contract (editing.ts).

import { LANG } from "./strings";

const pt = {
  menu: "Inserir imagem",
  fromComputer: "Do computador…",
  fromDevice: "Fotos e arquivos…",
  takePhoto: "Tirar foto",
  fromFolder: "Da pasta…",
  copying: (name: string) => `Copiando “${name}”…`,
  done: (name: string, where: string) => `Imagem anexada: “${name}”${where ? ` (em ${where}/)` : ""}.`,
  tooBig: (name: string, mb: number) => `“${name}” passa de ${mb} MB, o máximo que o servidor recebe de uma vez; nada foi copiado.`,
  notImage: (name: string) => `“${name}” não é uma imagem, um PDF nem um áudio; nada foi copiado.`,
  notImageOnly: (name: string) => `“${name}” não é uma imagem; nada foi copiado.`,
  noSend: "O mestre não te deu o direito de enviar arquivos.",
  unreadable: (name: string) => `Não foi possível ler “${name}”; nada foi copiado.`,
};
const en: typeof pt = {
  menu: "Insert image",
  fromComputer: "From this computer…",
  fromDevice: "Photos and files…",
  takePhoto: "Take a photo",
  fromFolder: "From the folder…",
  copying: (name) => `Copying “${name}”…`,
  done: (name, where) => `Image attached: “${name}”${where ? ` (in ${where}/)` : ""}.`,
  tooBig: (name, mb) => `“${name}” is over ${mb} MB, the most the server takes at once; nothing was copied.`,
  notImage: (name) => `“${name}” is not an image, a PDF or audio; nothing was copied.`,
  notImageOnly: (name) => `“${name}” is not an image; nothing was copied.`,
  noSend: "The game master has not given you the right to send files.",
  unreadable: (name) => `“${name}” could not be read; nothing was copied.`,
};
export const a = LANG.toLowerCase().startsWith("pt") ? pt : en;

/** A finger is the pointer: a phone or a tablet, which offer the camera. */
export function touchScreen(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

/** The system's picker for images, opened now — it must be called from the
 *  click that asks for it, before any `await`, or Safari refuses to open
 *  it. `camera` asks a phone for its camera instead of the gallery (the
 *  gallery stays a choice of its own). Resolves with the files chosen,
 *  none when the person cancels. */
export function pickImages(camera: boolean, accept = "image/*"): Promise<File[]> {
  document.querySelectorAll("input[data-attach-picker]").forEach((e) => e.remove());
  return new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = !camera;
    if (camera) input.setAttribute("capture", "environment");
    input.hidden = true;
    input.dataset["attachPicker"] = "";
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => done([]));
    document.body.append(input);
    input.click();
  });
}
