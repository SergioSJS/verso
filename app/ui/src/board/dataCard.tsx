// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A data file on a card (ADR 0057 point 10, ADR 0106): the file's text, or
// its diagram when the feature is on (ADR 0103), switched on the card
// itself and kept in the node's own `verso`. The card only reads the file;
// the diagram takes the pointer only while the card is entered, like a web
// page's card (`page.tsx`).

import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import type { Draw } from "./cards";
import { CARD_TEXT_MAX, type CardView, cardText } from "./model";
import { BoardIcon } from "./tools";
import { type BoardHost, type DataDiagramHandle } from "./types";

/** The file's text, read again when the folder changes (`tick`): null while
 *  it has not been read, `false` when it could not be. */
export function useFileText(host: BoardHost, file: string, tick: number, on: boolean): string | null | false {
  const [text, setText] = useState<string | null | false>(null);
  useEffect(() => {
    if (!on) return;
    let gone = false;
    void host.fileText(file).then((t) => {
      if (gone) return;
      setText((was) => (t === null ? (was === null ? false : was) : t));
    });
    return () => {
      gone = true;
    };
  }, [host, file, tick, on]);
  // A card pointed at another file does not show the last one's.
  useEffect(() => setText(null), [file]);
  return text;
}

/** Whether the file can be drawn as a diagram now: the window has one, the
 *  file's type is read by it and its switch is on. */
export function useDiagramAvailable(host: BoardHost, file: string, on: boolean): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    const again = (): void => bump((n) => n + 1);
    window.addEventListener("verso:features-changed", again);
    return () => window.removeEventListener("verso:features-changed", again);
  }, []);
  return on && !!host.data?.available(file);
}

const MODE_ICON = {
  text: "M3 4h10M3 7h10M3 10h7",
  diagram: "M2.5 3.5h4v3h-4zM9.5 2h4v3h-4zM9.5 9h4v3h-4zM6.5 5l3-1.5M6.5 5l3 5",
};

/** "Text | Diagram" in the card's header, and the way in and out of the
 *  diagram. */
export function DataControls({
  id,
  file,
  view,
  setView,
  interacting,
  interact,
  host,
}: {
  id: string;
  file: string;
  view: CardView;
  setView: (v: CardView) => void;
  interacting: boolean;
  interact: (id: string, on: boolean) => void;
  host: BoardHost;
}): JSX.Element {
  const s = host.strings;
  const mode = (v: CardView, label: string, title: string): JSX.Element => (
    <button type="button" className="board-card-open board-card-mode" data-mode={v} title={title} aria-label={`${label}: ${file.split("/").pop() ?? file}`} aria-pressed={view === v} onClick={() => setView(v)}>
      <BoardIcon d={MODE_ICON[v]} />
      <span>{label}</span>
    </button>
  );
  return (
    <>
      <div className="board-card-modes" role="group" aria-label={s.dataViewAs}>
        {mode("text", s.dataText, s.dataTextTitle)}
        {mode("diagram", s.dataDiagram, s.dataDiagramTitle)}
      </div>
      {view === "diagram" && (
        <button
          type="button"
          className="board-card-open board-card-interact"
          data-testid="board-data-interact"
          title={interacting ? s.dataLeaveTitle : s.dataInteractTitle}
          aria-label={`${interacting ? s.dataLeave : s.dataInteract}: ${file.split("/").pop() ?? file}`}
          aria-pressed={interacting}
          onClick={() => interact(id, !interacting)}
        >
          <BoardIcon d={interacting ? "M4 4l8 8M12 4l-8 8" : "M5 2.5v9l2.2-2 1.6 3.5 1.7-.8-1.6-3.4h3z"} />
        </button>
      )}
    </>
  );
}

/** The text of a data file, scrollable once the card is entered, with the
 *  ellipsis when only the first part is shown. */
function DataText({ id, file, text, host, draw }: { id: string; file: string; text: string; host: BoardHost; draw: Draw }): JSX.Element {
  const code = useRef<HTMLPreElement>(null);
  const { shown, cut } = cardText(text);
  useEffect(() => {
    const el = code.current;
    if (!el) return;
    let gone = false;
    const cancel = draw(id, async () => {
      if (!gone) await host.renderCode(el, shown, file);
    });
    return () => {
      gone = true;
      cancel();
    };
  }, [id, file, shown, host, draw]);
  return (
    <div className="board-card-code-box">
      <pre className="board-card-code" ref={code} data-testid="board-data-text" />
      {cut && <p className="board-card-cut">{host.strings.dataCut(CARD_TEXT_MAX / 1024)}</p>}
    </div>
  );
}

/** The card's body for a file of text: its text, or its diagram. */
export function DataBody({
  id,
  file,
  host,
  view,
  text,
  draw,
  zoom,
  interacting,
  interact,
}: {
  id: string;
  file: string;
  host: BoardHost;
  view: CardView;
  text: string | null | false;
  draw: Draw;
  zoom: number;
  interacting: boolean;
  interact: (id: string, on: boolean) => void;
}): JSX.Element {
  const s = host.strings;
  const mount = useRef<HTMLDivElement>(null);
  const handle = useRef<DataDiagramHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [reason, setReason] = useState<"tooBig" | "tooMany" | "failed" | null>(null);
  const diagram = view === "diagram";
  // The diagram's code is fetched and the drawing made once the card shows it.
  useEffect(() => {
    const el = mount.current;
    if (!diagram || !el || !host.data) return;
    let gone = false;
    let made: DataDiagramHandle | null = null;
    void host.data.diagram(el, file).then((h) => {
      if (gone) return h?.destroy();
      if (!h) return setReason("failed");
      made = h;
      handle.current = h;
      setReady(true);
    });
    return () => {
      gone = true;
      handle.current = null;
      setReady(false);
      setReason(null);
      made?.destroy();
    };
  }, [diagram, file, host]);
  useEffect(() => {
    if (!ready || typeof text !== "string") return;
    setReason(handle.current?.set(text) ?? null);
  }, [ready, text]);
  // Not entered, nothing in the diagram is a Tab stop or takes a key.
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    el.inert = !interacting;
    if (interacting) handle.current?.focus();
  }, [interacting, ready, diagram]);
  const loaded = typeof text === "string";
  const showText = loaded && (!diagram || reason !== null);
  const why = reason === "tooBig" ? s.dataTooBig(host.data?.limitMb ?? 20) : reason === "tooMany" ? s.dataTooMany : reason === "failed" ? s.dataDiagramFailed : null;
  return (
    <>
      {text === false && <p className="board-card-note">{s.dataUnreadable}</p>}
      {text === null && (
        <p className="board-card-note" role="status">
          {s.dataLoading}
        </p>
      )}
      {diagram && (
        <div
          className="board-card-dg"
          hidden={reason !== null || !loaded}
          style={{ zoom: 1 / zoom } as CSSProperties}
          data-testid="board-data-diagram"
          onKeyDownCapture={(e) => {
            if (e.key !== "Escape" || !interacting || (e.target as HTMLElement).closest(".dg-search")) return;
            e.stopPropagation();
            e.preventDefault();
            // The focus is let go before the card stops being entered: it
            // would otherwise sit in a card the board does not look at.
            (document.activeElement as HTMLElement | null)?.blur();
            interact(id, false);
          }}
        >
          <div className="board-card-dg-mount" ref={mount} />
        </div>
      )}
      {why && (
        <p className="board-card-note" role="status">
          {why}
        </p>
      )}
      {showText && <DataText id={id} file={file} text={text as string} host={host} draw={draw} />}
    </>
  );
}
