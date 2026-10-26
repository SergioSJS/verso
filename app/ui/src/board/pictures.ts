// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { type ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { isBarePicture } from "./cards";
import { plainOf, wrapLines } from "./export";
import { cardCrop, cardText, type Crop, type El, isNode, isPage, nodeData, nodeName, pageOrigin } from "./model";
import { BoardHost } from "./types";
import { ext, IMAGE, kindOf } from "../paths";
import { Api } from "./view";

/** The colours a card is drawn in on a picture: the app's light paper, as
 *  an exported picture is light unless asked dark (Excalidraw inverts it). */
export const PICTURE = { paper: "#f7f1e8", ink: "#2b2622", title: "#8a5a24", hair: "#d9cfc2", page: "#fbf7f0" };
export const CARD_FONT = 6;
export const CARD_LINE = 1.35;

export function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function sizeOf(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** The part `crop` of a picture, as a PNG of its own pixels. */
export function cropped(url: string, size: { w: number; h: number }, crop: Crop): Promise<{ dataURL: string; size: { w: number; h: number } } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sw = Math.max(1, Math.round(crop.w * size.w));
      const sh = Math.max(1, Math.round(crop.h * size.h));
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, crop.x * size.w, crop.y * size.h, sw, sh, 0, 0, sw, sh);
      resolve({ dataURL: canvas.toDataURL("image/png"), size: { w: sw, h: sh } });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** A picture of the folder as an image element of the picture's export,
 *  fitted in a box and centred: its bytes go in `files`. Null when the
 *  file cannot be read. */
export async function pictureOf(host: BoardHost, file: string, id: string, files: Record<string, unknown>, x: number, y: number, w: number, h: number, crop: Crop | null = null): Promise<unknown> {
  try {
    const blob = await (await fetch(host.fileSrc(file))).blob();
    let dataURL = await dataUrlOf(blob);
    let size = await sizeOf(dataURL);
    if (!size) return null;
    // A cropped card: the picture's part it shows, drawn anew as a PNG.
    if (crop) {
      const cut = await cropped(dataURL, size, crop);
      if (cut) {
        dataURL = cut.dataURL;
        size = cut.size;
      }
    }
    const k = Math.min(w / size.w, h / size.h);
    const iw = size.w * k;
    const ih = size.h * k;
    const fileId = `picture-${id}`;
    files[fileId] = { id: fileId, dataURL, mimeType: dataURL.startsWith("data:image/png") && crop ? "image/png" : blob.type || (ext(file) === "svg" ? "image/svg+xml" : `image/${ext(file)}`), created: Date.now() };
    return { type: "image", fileId, x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih };
  } catch {
    return null;
  }
}

/** The board's elements with each card turned into shapes Excalidraw
 *  draws — its box, its name, a line, its text or picture — in its place in
 *  the order; `only`: the selection and what belongs to it. */
export async function pictureScene(api: Api, host: BoardHost, only: readonly string[] | null, omit: ReadonlySet<string> | null = null): Promise<{ elements: ExcalidrawElement[]; files: Record<string, unknown> }> {
  const s = host.strings;
  let all = api.getSceneElements() as readonly ExcalidrawElement[];
  // The secret cards a writer asked to leave out (ADR 0090 item 6), and
  // what is bound to them.
  if (omit) all = all.filter((e) => !omit.has(e.id) && !("containerId" in e && e.containerId && omit.has(e.containerId as string)));
  if (only && only.length > 0) {
    const keep = new Set(only);
    all = all.filter((e) => keep.has(e.id) || (e.frameId && keep.has(e.frameId)) || ("containerId" in e && e.containerId && keep.has(e.containerId as string)));
  }
  try {
    await document.fonts.load("16px Nunito");
  } catch {
    // Measured with the fallback font.
  }
  const ctx = document.createElement("canvas").getContext("2d");
  const measure = (size: number) => (text: string): number => {
    if (!ctx) return text.length * size * 0.55;
    ctx.font = `${size}px Nunito, sans-serif`;
    return ctx.measureText(text).width;
  };
  const files: Record<string, unknown> = { ...api.getFiles() };
  const out: ExcalidrawElement[] = [];
  for (const e of all) {
    const node = e.type === "embeddable" && isNode(e as unknown as El) ? nodeData(e as unknown as El) : null;
    if (!node) {
      out.push(e);
      continue;
    }
    const { x, y, width: w, height: h } = e;
    const pad = 12;
    const file = typeof node.file === "string" ? node.file : "";
    const missing = node.type === "file" && !host.exists(file);
    // A picture card is the picture alone, as the board shows it.
    if (isBarePicture(node, host)) {
      const picture = await pictureOf(host, file, e.id, files, x, y, w, h, cardCrop(node));
      if (picture) {
        out.push(...(convertToExcalidrawElements([picture] as never, { regenerateIds: true }) as unknown as ExcalidrawElement[]));
        continue;
      }
    }
    const skels: unknown[] = [
      {
        type: "rectangle",
        x,
        y,
        width: w,
        height: h,
        strokeColor: e.strokeColor,
        backgroundColor: e.backgroundColor && e.backgroundColor !== "transparent" ? e.backgroundColor : PICTURE.paper,
        fillStyle: "solid",
        strokeWidth: e.strokeWidth,
        roughness: 0,
        roundness: e.roundness,
      },
    ];
    let top = y + 10;
    const page = isPage(node);
    const title = node.type === "file" ? nodeName(node, s) : node.type === "link" ? (page ? s.pageCard : s.linkCard) : "";
    if (title) {
      const line = wrapLines(title, w - 2 * pad, 1, measure(16));
      skels.push({ type: "text", x: x + pad, y: top, text: line.join("\n"), fontSize: 16, fontFamily: CARD_FONT, strokeColor: PICTURE.title });
      top += 16 * CARD_LINE + 6;
      skels.push({ type: "line", x, y: top, width: w, height: 0, points: [[0, 0], [w, 0]], strokeColor: PICTURE.hair, strokeWidth: 1, roughness: 0 });
      top += 8;
    }
    const room = y + h - pad - top;
    let body = "";
    if (missing) body = s.missing;
    else if (node.type === "file" && ext(file) === "md") {
      // The note's own first heading repeats the card's name: said once.
      const lines = plainOf(await host.noteText(file)).split("\n");
      if ((lines[0] ?? "").trim().toLowerCase() === title.trim().toLowerCase()) lines.shift();
      body = lines.join("\n").trim();
    }
    // A file of text or data is drawn as its box with the file's first lines:
    // the diagram is never captured, whichever the card shows.
    else if (node.type === "file" && kindOf(file) === "text") body = cardText((await host.fileText(file)) ?? "").shown.slice(0, 2000);
    else if (node.type === "text" && typeof node.text === "string") body = plainOf(node.text);
    // A page card is drawn as its box with the origin: the frame is never captured.
    else if (node.type === "link" && typeof node.url === "string") body = page ? (pageOrigin(node.url) ?? node.url) : node.url;
    else if (node.type === "file" && IMAGE.test(ext(file)) && room > 8) {
      const picture = await pictureOf(host, file, e.id, files, x + pad, top, w - 2 * pad, room);
      if (picture) skels.push(picture);
      else body = nodeName(node, s);
    }
    if (body) {
      const lines = wrapLines(body, w - 2 * pad, Math.floor(room / (13 * CARD_LINE)), measure(13));
      if (lines.length > 0) skels.push({ type: "text", x: x + pad, y: top, text: lines.join("\n"), fontSize: 13, fontFamily: CARD_FONT, strokeColor: PICTURE.ink });
    }
    out.push(...(convertToExcalidrawElements(skels as never, { regenerateIds: true }) as unknown as ExcalidrawElement[]));
  }
  return { elements: out, files };
}
