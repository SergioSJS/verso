// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type JSX } from "react";
import { isBarePicture } from "./cards";
import { type MapStrings } from "./mapStrings";
import { type CanvasNode, type El, isMap, isSecret } from "./model";
import { ICO, ToolButton } from "./tools";
import { type Tracing } from "./tracing";
import { BoardHost } from "./types";

/** What acts on the selected card for maps (ADR 0090): "Use as map" /
 *  "Stop using as map" on a picture, "Send to back" and "Bring to front"
 *  on every card, "Pin a note here…" once the board has a map, the card's
 *  secret mark where the board may be written, the writer's "View as a
 *  reader", and "Show the tracing" on an imported map (ADR 0120). */
export function MapTools({
  ms,
  host,
  selected,
  data,
  hasMap,
  writable,
  holdsSecret,
  viewing,
  actions,
  toggleReader,
  tracing = "none",
}: {
  ms: MapStrings;
  host: BoardHost;
  selected: El | undefined;
  data: CanvasNode | null | undefined;
  hasMap: boolean;
  writable: boolean;
  /** Some card of the board is secret, and the server can say how a reader
   *  receives it. */
  holdsSecret: boolean;
  viewing: boolean;
  actions: { useAsMap: (id: string) => void; stopMap: (id: string) => void; toBack: (id: string) => void; toFront: (id: string) => void; toggleSecret: (id: string) => void; pinHere: () => Promise<void>; showTracing: (show: boolean) => void };
  toggleReader: () => void;
  tracing?: Tracing;
}): JSX.Element | null {
  const card = selected && data ? selected : undefined;
  const picture = card && data && isBarePicture(data, host);
  const map = card && data && isMap(data);
  if (viewing) return <ToolButton label={ms.viewReader} title={ms.viewReaderTitle} onClick={toggleReader} icon={ICO.reader} pressed testId="board-tool-reader" />;
  if (!writable && !holdsSecret) return null;
  return (
    <>
      {writable && picture && !map && card && <ToolButton label={ms.useAsMap} title={ms.useAsMapTitle} onClick={() => actions.useAsMap(card.id)} icon={ICO.map} testId="board-tool-map" />}
      {writable && map && card && <ToolButton label={ms.stopMap} title={ms.stopMapTitle} onClick={() => actions.stopMap(card.id)} icon={ICO.map} pressed testId="board-tool-map" />}
      {writable && card && !map && <ToolButton label={ms.toBack} title={ms.toBackTitle} onClick={() => actions.toBack(card.id)} icon={ICO.back} testId="board-tool-back" />}
      {writable && card && !map && <ToolButton label={ms.toFront} title={ms.toFrontTitle} onClick={() => actions.toFront(card.id)} icon={ICO.front} testId="board-tool-front" />}
      {writable && tracing !== "none" && <ToolButton label={ms.tracing} title={ms.tracingTitle} onClick={() => actions.showTracing(tracing !== "shown")} icon={ICO.trace} pressed={tracing === "shown"} testId="board-tool-tracing" />}
      {writable && hasMap && <ToolButton label={ms.pinNote} title={ms.pinNoteTitle} onClick={() => void actions.pinHere()} icon={ICO.pin} testId="board-tool-pin" />}
      {writable && card && data && host.secret && <ToolButton label={ms.secret} title={ms.secretTitle} onClick={() => actions.toggleSecret(card.id)} icon={ICO.lock} pressed={isSecret(data)} testId="board-tool-secret" />}
      {holdsSecret && <ToolButton label={ms.viewReader} title={ms.viewReaderTitle} onClick={toggleReader} icon={ICO.reader} pressed={false} testId="board-tool-reader" />}
    </>
  );
}
