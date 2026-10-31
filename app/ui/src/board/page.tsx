// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { type JSX, useLayoutEffect, useRef, useState } from "react";
import { pageOrigin } from "./model";
import { type BoardStrings } from "./strings";
import { BoardIcon, OpenIcon } from "./tools";
import { type BoardHost, type BoardWeb } from "./types";

/** A link card that shows its page (ADR 0057 point 10, decided
 *  2026-10-21; ADR 0056): the page in a sandboxed `<iframe>` when its
 *  origin is approved and its site allows being framed. A site that
 *  forbids framing gets a placeholder with a link to open it in a tab — the
 *  native clipped web view of the notes is not used in the board.
 *  The frame takes the pointer only while the card is entered (`interacting`);
 *  otherwise the board's drag and zoom own the pointer (the slot's
 *  `pointer-events`), and the frame is not a Tab stop either. */
export function PageCard({
  id,
  url,
  host,
  web,
  interacting,
  interact,
}: {
  id: string;
  url: string;
  host: BoardHost;
  web: BoardWeb;
  interacting: boolean;
  interact: (id: string, on: boolean) => void;
}): JSX.Element {
  const s: BoardStrings = host.strings;
  const origin = pageOrigin(url) ?? "";
  // Approving changes what `gate` answers; this makes the card ask again.
  const [, again] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [framed, setFramed] = useState<boolean | null>(null);
  const gate = web.gate(url);
  const open = gate === null;
  // Layout effects, not passive ones: they run at the commit, so the page
  // is asked for and mounted at once (a passive effect was seen waiting
  // behind the board's own work in WebKit).
  // The window's functions, kept by reference: a host rebuilt on a render
  // must not make the check start over.
  const win = useRef(web);
  win.current = web;
  useLayoutEffect(() => {
    // Nothing is asked of the network for an origin not approved.
    if (!open) {
      setFramed(null);
      return;
    }
    let gone = false;
    void win.current.frameable(url).then((ok) => {
      if (!gone) setFramed(ok);
    });
    return () => {
      gone = true;
    };
  }, [open, url]);
  const mount = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  useLayoutEffect(() => {
    const el = mount.current;
    if (!el || !open || framed !== true) return;
    const f = win.current.frame(url, s.pageFrame(origin));
    frame.current = f;
    el.replaceChildren(f);
    return () => {
      frame.current = null;
      f.remove();
    };
  }, [open, framed, url, origin, s]);
  // Not entered, the frame is not a Tab stop: the keyboard would fall into
  // a page the board has not been told to give the pointer to.
  useLayoutEffect(() => {
    const f = frame.current;
    if (!f) return;
    f.tabIndex = interacting ? 0 : -1;
    if (interacting) f.focus({ preventScroll: true });
  }, [interacting, framed, open]);

  const approve = async (anyway: boolean): Promise<void> => {
    if (gate?.why !== "origin") return;
    setBusy(true);
    try {
      if (!anyway) {
        // The warning comes before the confirmation (ADR 0056.aviso).
        const warn = await web.warn(url);
        if (warn) {
          setWarning(warn);
          return;
        }
      }
      if (await web.approve(gate.origin)) setWarning(null);
    } finally {
      setBusy(false);
      again((n) => n + 1);
    }
  };

  const link = (
    <button type="button" className="board-card-press board-card-page-link" onClick={() => host.openUrl(url)}>
      {s.pageOpenTab}
    </button>
  );
  let body: JSX.Element;
  if (gate?.why === "invalid" || origin === "") {
    body = <p className="board-card-note">{s.pageNotAddress}</p>;
  } else if (gate?.why === "remote") {
    body = (
      <div className="board-card-note" role="status">
        <p>{s.pageRemoteOff}</p>
        {link}
      </div>
    );
  } else if (gate) {
    let local = false;
    try {
      local = web.isLocal(new URL(url).hostname);
    } catch {
      /* not an address: handled above */
    }
    body = (
      <div className="board-card-note board-card-gate">
        <code className="board-card-url">{gate.origin}</code>
        <p>{local ? web.words.local : s.pageAsk}</p>
        {warning && (
          <p className="board-card-page-warn" role="alert">
            {warning}
          </p>
        )}
        <div className="board-card-gate-actions">
          {warning && (
            <button type="button" className="ghost board-card-press" onClick={() => setWarning(null)}>
              {s.pageCancel}
            </button>
          )}
          <button type="button" className="save board-card-press" disabled={busy} onClick={() => void approve(warning !== null)}>
            {warning ? web.words.approveAnyway : web.words.approve}
          </button>
        </div>
      </div>
    );
  } else if (framed === null) {
    body = (
      <p className="board-card-note" role="status">
        {s.pageChecking}
      </p>
    );
  } else if (framed === false) {
    body = (
      <div className="board-card-note" role="status">
        <p>{s.pageForbidden}</p>
        {link}
      </div>
    );
  } else {
    body = <div className="board-card-page-frame" ref={mount} />;
  }
  const showing = open && framed === true;
  return (
    <div className="board-card-link board-card-page" data-page-state={showing ? "frame" : gate ? "gate" : framed === false ? "forbidden" : "checking"}>
      <div className="board-card-head" onKeyDown={(e) => { if (e.key === "Escape" && interacting) { e.stopPropagation(); e.preventDefault(); interact(id, false); } }}>
        <span className="board-card-title">{origin || s.pageCard}</span>
        {showing && (
          <button type="button" className="board-card-open board-card-interact" title={interacting ? s.pageLeaveTitle : s.pageInteractTitle} aria-label={`${interacting ? s.pageLeave : s.pageInteract}: ${origin}`} aria-pressed={interacting} onClick={() => interact(id, !interacting)}>
            <BoardIcon d={interacting ? "M4 4l8 8M12 4l-8 8" : "M5 2.5v9l2.2-2 1.6 3.5 1.7-.8-1.6-3.4h3z"} />
          </button>
        )}
        <button type="button" className="board-card-open" title={url} aria-label={`${s.open}: ${url}`} onClick={() => host.openUrl(url)}>
          <OpenIcon />
        </button>
      </div>
      {body}
    </div>
  );
}
