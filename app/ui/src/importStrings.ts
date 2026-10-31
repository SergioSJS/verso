// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of "Import files…" (A11Y.10), in pt-BR and English (ADR 0035).

import { LANG } from "./strings";
import type { PickSkip } from "./bindings";

export type ImportReport = {
  made: number;
  renamed: string[];
  skipped: { name: string; reason: PickSkip }[];
  failed: string[];
  /** The limit of one file in megabytes, said beside a file that was too large. */
  limitMb: number;
};

type Words = {
  command: string;
  imported: (n: number) => string;
  renamed: (pairs: string) => string;
  skipped: (list: string) => string;
  failed: (name: string) => string;
  /** " (grande demais — o limite é N MB)": what a skipped file's reason says when it is the size. */
  limit: (mb: number) => string;
  /** The status line after an import or a drop. */
  summary: (r: ImportReport) => string;
  reason: Record<PickSkip, string>;
};

function summarize(w: Words, r: ImportReport): string {
  return [
    r.made > 0 ? w.imported(r.made) : "",
    r.renamed.length > 0 ? w.renamed(r.renamed.join(", ")) : "",
    r.skipped.length > 0 ? w.skipped(r.skipped.map((s) => `${s.name} (${s.reason === "too_large" ? w.limit(r.limitMb) : w.reason[s.reason]})`).join(", ")) : "",
    ...r.failed.map((n) => w.failed(n)),
  ]
    .filter(Boolean)
    .join(" ");
}

const pt: Words = {
  command: "Importar arquivos…",
  imported: (n) => (n === 1 ? "1 arquivo importado." : `${n} arquivos importados.`),
  renamed: (pairs) => `Renomeado por já existir: ${pairs}.`,
  skipped: (list) => `Não importado: ${list}.`,
  failed: (name) => `Não foi possível importar ${name}.`,
  reason: { not_a_file: "não é um arquivo", placeholder: "está só na nuvem", too_large: "grande demais", unreadable: "ilegível" },
  limit: (mb) => `grande demais, o limite é ${mb} MB`,
  summary: (r) => summarize(pt, r),
};

const en: Words = {
  command: "Import files…",
  imported: (n) => (n === 1 ? "1 file imported." : `${n} files imported.`),
  renamed: (pairs) => `Renamed, the name was taken: ${pairs}.`,
  skipped: (list) => `Not imported: ${list}.`,
  failed: (name) => `Could not import ${name}.`,
  reason: { not_a_file: "not a file", placeholder: "kept in the cloud only", too_large: "too large", unreadable: "unreadable" },
  limit: (mb) => `too large, the limit is ${mb} MB`,
  summary: (r) => summarize(en, r),
};

export const imp: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
