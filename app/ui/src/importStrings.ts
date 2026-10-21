// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The words of "Import files…" (A11Y.10), in pt-BR and English (ADR 0035).

import { LANG } from "./strings";
import type { PickSkip } from "./bindings";

type Words = {
  command: string;
  imported: (n: number) => string;
  renamed: (pairs: string) => string;
  skipped: (list: string) => string;
  failed: (name: string) => string;
  reason: Record<PickSkip, string>;
};

const pt: Words = {
  command: "Importar arquivos…",
  imported: (n) => (n === 1 ? "1 arquivo importado." : `${n} arquivos importados.`),
  renamed: (pairs) => `Renomeado por já existir: ${pairs}.`,
  skipped: (list) => `Não importado: ${list}.`,
  failed: (name) => `Não foi possível importar ${name}.`,
  reason: { not_a_file: "não é um arquivo", placeholder: "está só na nuvem", too_large: "grande demais", unreadable: "ilegível" },
};

const en: Words = {
  command: "Import files…",
  imported: (n) => (n === 1 ? "1 file imported." : `${n} files imported.`),
  renamed: (pairs) => `Renamed, the name was taken: ${pairs}.`,
  skipped: (list) => `Not imported: ${list}.`,
  failed: (name) => `Could not import ${name}.`,
  reason: { not_a_file: "not a file", placeholder: "kept in the cloud only", too_large: "too large", unreadable: "unreadable" },
};

export const imp: Words = LANG.toLowerCase().startsWith("pt") ? pt : en;
