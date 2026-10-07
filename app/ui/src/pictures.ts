// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertFileSrc } from "@tauri-apps/api/core";
import { LANG } from "./strings";

/* A note back from its own window, to the window of its folder the host
 * names (ADR 0065). */
/** A picture's own menu: a right click on a picture of a note, of the
 *  board, a cover or a picture's tab. WebKit's menu there ("Open Image in
 *  New Window", "Download Image"…) needs hooks a desktop app's window does
 *  not give a page, and did nothing; this one acts as the app does. */
export const imageText = LANG.toLowerCase().startsWith("pt")
  ? { download: "Baixar imagem", copy: "Copiar imagem", copied: "Imagem copiada.", copyFailed: "Não foi possível copiar a imagem.", openInBrowser: "Abrir no navegador", copyAddress: "Copiar endereço da imagem", downloaded: (name: string) => `Baixado em Downloads: ${name}.`, downloadFailed: "O download não terminou." }
  : { download: "Download image", copy: "Copy image", copied: "Image copied.", copyFailed: "The image could not be copied.", openInBrowser: "Open in the browser", copyAddress: "Copy image address", downloaded: (name: string) => `Downloaded to Downloads: ${name}.`, downloadFailed: "The download did not finish." };
/** The folder's file a picture shows, by its `data-path` or its address. */
export function pictureFile(img: HTMLImageElement): string | null {
  const own = img.closest<HTMLElement>("[data-path]")?.dataset["path"];
  if (own) return own;
  const base = convertFileSrc("", "verso");
  const src = img.currentSrc || img.src;
  if (!src.startsWith(base)) return null;
  try {
    return decodeURIComponent(src.slice(base.length).split(/[?#]/)[0] ?? "") || null;
  } catch {
    return null;
  }
}
/** A picture as a PNG, for the clipboard: an SVG or a JPEG drawn again. */
export async function picturePng(src: string): Promise<Blob> {
  const blob = await (await fetch(src)).blob();
  if (blob.type === "image/png") return blob;
  const pic = new Image();
  pic.src = URL.createObjectURL(blob);
  try {
    await pic.decode();
    const canvas = document.createElement("canvas");
    canvas.width = pic.naturalWidth || 1;
    canvas.height = pic.naturalHeight || 1;
    canvas.getContext("2d")?.drawImage(pic, 0, 0);
    return await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("no png"))), "image/png"));
  } finally {
    URL.revokeObjectURL(pic.src);
  }
}
