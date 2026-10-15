// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type JSX } from "react";
import { type MapStrings } from "./mapStrings";

export type MapRow = { id: string; label: string; secret?: boolean };

/** The maps and their pins in the outline (ADR 0090 item 7): the text
 *  equivalent of a map, a list of links in reading order — top to bottom,
 *  then left to right — each named after its note. Choosing a pin brings
 *  the view to it; activating it opens the note. A map is listed with the
 *  way back from being one, which a locked picture cannot be selected for. */
export function MapsPanel({
  ms,
  maps,
  pins,
  writable,
  onFocus,
  onOpenPin,
  stopMap,
}: {
  ms: MapStrings;
  maps: readonly MapRow[];
  pins: readonly MapRow[];
  writable: boolean;
  onFocus: (id: string) => void;
  onOpenPin: (id: string) => void;
  stopMap: (id: string) => void;
}): JSX.Element | null {
  if (maps.length === 0 && pins.length === 0) return null;
  return (
    <section className="board-maps-panel" data-testid="board-maps-panel">
      <h3>{ms.mapsHeading}</h3>
      <ul>
        {maps.map((m) => (
          <li key={m.id} className="board-outline-map">
            <button type="button" className="board-outline-item" onFocus={() => onFocus(m.id)} onClick={() => onFocus(m.id)}>
              {m.label}
            </button>
            {writable && (
              <button type="button" className="board-outline-act" onClick={() => stopMap(m.id)}>
                {ms.stopMap}
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3>{ms.pinsHeading}</h3>
      {pins.length === 0 ? (
        <p className="board-outline-empty">{ms.noPins}</p>
      ) : (
        <ul className="board-pin-list" aria-label={ms.pinsHeading}>
          {pins.map((p) => (
            <li key={p.id}>
              <button type="button" role="link" className="board-outline-item board-outline-pin" data-pin-link={p.id} onFocus={() => onFocus(p.id)} onClick={() => onOpenPin(p.id)}>
                {p.label}
                {p.secret ? ` (${ms.secretCard})` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
