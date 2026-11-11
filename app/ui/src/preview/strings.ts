// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// What the hover preview says (ADR 0085), in both languages (ADR 0035):
// the card, the command, the setting.

import { prettyKeys } from "../keyNames";
import { LANG } from "../strings";

const pt = {
  /** The card, as a screen reader names it. */
  card: (name: string) => `Prévia de ${name}`,
  loading: "Lendo…",
  missing: (target: string) => `Nenhuma nota responde por [[${target}]] ainda. Um clique a cria, como seguir o link.`,
  missingPanel: (target: string) => `Nenhuma nota responde por [[${target}]].`,
  noHeading: (heading: string) => `A nota não tem o título “${heading}”; ela aparece desde o começo.`,
  noBlock: (id: string) => `A nota não tem o bloco ^${id}; ela aparece desde o começo.`,
  unavailable: "A nota só está no iCloud e não deu para baixá-la: sem conexão, ou o iCloud não tem o conteúdo.",
  /** Under the card: what a click does. */
  clickOpens: "Clique para abrir",
  command: "Ver a prévia do link sob o cursor",
  noLink: "Nenhum link sob o cursor para mostrar.",
  setting: "Prévia ao passar o mouse",
  settingDesc: `Mostra a nota de um link quando o ponteiro para sobre ele — na Leitura, nos painéis, no grafo e no board; no modo Editar, com ${prettyKeys("Mod")} apertado. Desligada, a prévia continua no comando “Ver a prévia do link sob o cursor” e no toque.`,
};

const en: typeof pt = {
  card: (name) => `Preview of ${name}`,
  loading: "Reading…",
  missing: (target) => `No note answers to [[${target}]] yet. A click creates it, as following the link does.`,
  missingPanel: (target) => `No note answers to [[${target}]].`,
  noHeading: (heading) => `The note has no heading “${heading}”; it is shown from its start.`,
  noBlock: (id) => `The note has no block ^${id}; it is shown from its start.`,
  unavailable: "The note is only in iCloud and could not be downloaded: no connection, or iCloud does not have its content.",
  clickOpens: "Click to open",
  command: "Preview the link under the cursor",
  noLink: "No link under the cursor to preview.",
  setting: "Preview on hover",
  settingDesc: `Shows the note a link names when the pointer rests on it — in Reading, the panels, the graph and the board; in Edit mode, with ${prettyKeys("Mod")} held. Off, the preview stays in the command “Preview the link under the cursor” and on touch.`,
};

export type PreviewStrings = typeof pt;
export const pv: PreviewStrings = LANG.toLowerCase().startsWith("pt") ? pt : en;
