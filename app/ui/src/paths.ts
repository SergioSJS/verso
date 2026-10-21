// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.



export function name(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}
export function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}
export function ext(path: string): string {
  const base = (path.split("/").pop() ?? "").split(/[#?|]/)[0] ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}
export const IMAGE = /^(png|jpe?g|gif|webp|svg|bmp|avif)$/;
export const TEXT = /^(txt|json|jsonc|jsonl|ndjson|csv|tsv|yaml|yml|toml|xml|css|js|ts|py|rs|sh|log|ini|cfg)$/;
export type Kind = "note" | "image" | "text" | "pdf" | "frame" | "other" | "folder" | "graph" | "base" | "board" | "data" | "theme";
export function kindOf(path: string): Kind {
  const e = ext(path);
  if (e === "md") return "note";
  // A view over the folder (ADR 0053); its YAML is the other mode of the tab.
  if (e === "base") return "base";
  // A board (ADR 0057); its JSON is the other mode of the tab.
  if (e === "canvas") return "board";
  if (IMAGE.test(e)) return "image";
  // A page first; its source is a mode of the same tab (htmlModes).
  if (e === "html" || e === "htm") return "frame";
  if (TEXT.test(e)) return "text";
  if (e === "pdf") return "pdf";
  return "other";
}
export function iconFor(kind: Kind): string {
  return kind === "note" ? "note" : kind === "image" ? "image" : kind === "text" ? "text" : kind === "pdf" ? "pdf" : kind === "frame" ? "frame" : kind === "folder" ? "folder" : kind === "graph" ? "graph" : kind === "base" ? "base" : kind === "board" ? "board" : kind === "data" ? "diagram" : kind === "theme" ? "palette" : "text";
}
