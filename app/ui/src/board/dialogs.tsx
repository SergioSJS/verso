// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import { type JSX, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { mapStrings } from "./mapStrings";
import { type Crop } from "./model";
import { dataUrlOf, PICTURE, pictureScene } from "./pictures";
import { type BoardStrings } from "./strings";
import { BoardHost } from "./types";
import { Api } from "./view";
import { focusOnOpen } from "../screen/openFocus";

/** A picture card's crop (ADR 0057 point 10, revised 2026-10-06): the whole
 *  picture, and over it the part the card shows, moved by dragging inside
 *  it and sized by its corners and sides. Applied, the card shows that part
 *  at its proportions; the picture's file is never written. */
export function CropDialog({ src, crop, strings: s, onApply, onClose }: { src: string; crop: Crop | null; strings: BoardStrings; onApply: (crop: Crop | null, aspect: number) => void; onClose: () => void }): JSX.Element {
  const [c, setC] = useState<Crop>(crop ?? { x: 0, y: 0, w: 1, h: 1 });
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button.primary")?.focus();
  }, []);
  const MIN = 0.03;
  /** A drag of the rectangle (`move`) or of its edges (`n`, `se`...). */
  const drag = (kind: string) => (down: ReactPointerEvent<HTMLElement>) => {
    down.preventDefault();
    down.stopPropagation();
    const f = frame.current?.getBoundingClientRect();
    if (!f) return;
    const start = { ...c };
    const x0 = down.clientX;
    const y0 = down.clientY;
    const target = down.currentTarget;
    target.setPointerCapture(down.pointerId);
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - x0) / f.width;
      const dy = (e.clientY - y0) / f.height;
      let { x, y, w, h } = start;
      if (kind === "move") {
        x = Math.min(Math.max(0, x + dx), 1 - w);
        y = Math.min(Math.max(0, y + dy), 1 - h);
      } else {
        if (kind.includes("w")) {
          const nx = Math.min(Math.max(0, x + dx), x + w - MIN);
          w += x - nx;
          x = nx;
        }
        if (kind.includes("e")) w = Math.min(Math.max(MIN, w + dx), 1 - x);
        if (kind.includes("n")) {
          const ny = Math.min(Math.max(0, y + dy), y + h - MIN);
          h += y - ny;
          y = ny;
        }
        if (kind.includes("s")) h = Math.min(Math.max(MIN, h + dy), 1 - y);
      }
      setC({ x, y, w, h });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  const apply = () => {
    if (!size) return;
    onApply(c, (c.w * size.w) / (c.h * size.h));
  };
  const pct = (n: number) => `${n * 100}%`;
  return (
    <div
      className="board-export board-crop-dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
        else if (e.key === "Enter") {
          e.preventDefault();
          apply();
        }
      }}
    >
      <div className="board-export-box" role="dialog" aria-modal="true" aria-label={s.cropTitle} ref={box}>
        <h2>{s.cropTitle}</h2>
        <p className="board-crop-hint">{s.cropHint}</p>
        <div className="board-crop-stage">
          <div className="board-crop-frame" ref={frame}>
            <img
              src={src}
              alt=""
              draggable={false}
              // Laid out at a size from its own proportions: a picture with
              // no size of its own (an SVG) would show at none.
              style={size ? (() => {
                const k = Math.min((Math.min(window.innerWidth * 0.7, 640)) / size.w, (window.innerHeight * 0.55) / size.h);
                return { width: `${Math.round(size.w * k)}px`, height: `${Math.round(size.h * k)}px` };
              })() : { width: "1px", height: "1px" }}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
            />
            <div className="board-crop-dim" aria-hidden="true">
              <div style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }} />
            </div>
            <div className="board-crop-rect" data-testid="board-crop-rect" style={{ left: pct(c.x), top: pct(c.y), width: pct(c.w), height: pct(c.h) }} onPointerDown={drag("move")}>
              {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((k) => (
                <span key={k} className={`board-crop-handle h-${k}`} data-handle={k} onPointerDown={drag(k)} />
              ))}
            </div>
          </div>
        </div>
        <div className="board-export-actions">
          <button type="button" className="primary" disabled={!size} onClick={apply}>
            {s.cropApply}
          </button>
          {crop && (
            <button type="button" onClick={() => onApply(null, size ? size.w / size.h : 1)}>
              {s.cropRestore}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {s.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Excalidraw's export dialog drew each card as an empty web embed; this
 *  one draws the board as it reads (`pictureScene`), and saves the picture
 *  in the folder, in Downloads, or copies it. */
export function ExportDialog({ api, host, selected, secretIds, onClose }: { api: Api; host: BoardHost; selected: readonly string[]; secretIds?: () => Promise<ReadonlySet<string>>; onClose: () => void }): JSX.Element {
  const s = host.strings;
  const ms = mapStrings(host.lang);
  // A board with secret cards asks whether to leave them out of the
  // picture, left out by default (ADR 0090 item 6).
  const [leaveOut, setLeaveOut] = useState(true);
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [scale, setScale] = useState(2);
  const [background, setBackground] = useState(true);
  const [dark, setDark] = useState(false);
  const [only, setOnly] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // The previews' URLs, oldest first: one is revoked only once a newer one
  // is drawn. Revoked while its picture is still shown, WebKit may ask for
  // it again and fail (seen in the window's tests, 2026-10-16).
  const urls = useRef<string[]>([]);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hasSelection = selected.length > 0;

  const render = useCallback(
    async (fmt: "png" | "svg", k: number): Promise<Blob> => {
      const omit = secretIds && leaveOut ? await secretIds() : null;
      const { elements, files } = await pictureScene(api, host, only && hasSelection ? selected : null, omit);
      const bg = api.getAppState().viewBackgroundColor;
      const appState = {
        exportBackground: background,
        viewBackgroundColor: bg && bg !== "transparent" ? bg : PICTURE.page,
        exportWithDarkMode: dark,
        exportEmbedScene: false,
      };
      if (fmt === "svg") {
        const svg = await exportToSvg({ elements: elements as never, appState: appState as never, files: files as never, exportPadding: 24 });
        return new Blob([svg.outerHTML], { type: "image/svg+xml" });
      }
      return exportToBlob({
        elements: elements as never,
        appState: appState as never,
        files: files as never,
        mimeType: "image/png",
        exportPadding: 24,
        getDimensions: (w: number, h: number) => ({ width: w * k, height: h * k, scale: k }),
      });
    },
    [api, host, only, hasSelection, selected, background, dark, secretIds, leaveOut],
  );

  useEffect(() => {
    let gone = false;
    void render("png", 1).then(
      (blob) => {
        if (gone) return;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setPreview(url);
      },
      () => !gone && host.status(s.exportFailed),
    );
    return () => {
      gone = true;
    };
  }, [render, host, s]);

  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    },
    [],
  );

  /** `src` is drawn: the previews before it are revoked. */
  const drawn = (src: string): void => {
    const at = urls.current.indexOf(src);
    if (at <= 0) return;
    for (const url of urls.current.slice(0, at)) URL.revokeObjectURL(url);
    urls.current = urls.current.slice(at);
  };

  useEffect(() => {
    focusOnOpen(box.current?.querySelector<HTMLElement>("button, input"));
  }, []);

  const name = `${host.name()}.${format}`;
  const run = (task: () => Promise<void>): void => {
    setBusy(true);
    void task()
      .catch(() => host.status(s.exportFailed))
      .finally(() => setBusy(false));
  };
  const toFolder = (): void =>
    run(async () => {
      const blob = await render(format, scale);
      const url = await dataUrlOf(blob);
      const path = await host.saveImage(name, url.split(",")[1] ?? "");
      if (path) {
        host.status(s.exportSavedTo(path));
        onClose();
      }
    });
  const toDownloads = (): void =>
    run(async () => {
      const blob = await render(format, scale);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      host.status(s.exportDownloaded(name));
      onClose();
    });
  const copy = (): void =>
    run(async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": render("png", scale) })]);
        host.status(s.exportCopied);
        onClose();
      } catch {
        // Over plain HTTP the image clipboard does not exist (ADR 0073 item
        // 6, amended 2026-10-16): said as what it is, not as a failure.
        host.status(window.isSecureContext ? s.exportCopyFailed : s.exportCopyNeedsHttps);
      }
    });

  return (
    <div
      className="board-export"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="board-export-box" role="dialog" aria-modal="true" aria-label={s.exportTitle} ref={box}>
        <h2>{s.exportTitle}</h2>
        <div className="board-export-preview" aria-hidden="true">
          {preview ? <img src={preview} alt="" onLoad={() => drawn(preview)} /> : <span>{s.exportRendering}</span>}
        </div>
        <div className="board-export-options">
          <div className="board-export-row" role="radiogroup" aria-label={s.exportFormat}>
            <span>{s.exportFormat}</span>
            {(["png", "svg"] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          {format === "png" && (
            <div className="board-export-row" role="radiogroup" aria-label={s.exportScale}>
              <span>{s.exportScale}</span>
              {[1, 2, 3].map((k) => (
                <button key={k} type="button" role="radio" aria-checked={scale === k} onClick={() => setScale(k)}>
                  {k}×
                </button>
              ))}
            </div>
          )}
          <label>
            <input type="checkbox" checked={background} onChange={(e) => setBackground(e.currentTarget.checked)} /> {s.exportBackground}
          </label>
          <label>
            <input type="checkbox" checked={dark} onChange={(e) => setDark(e.currentTarget.checked)} /> {s.exportDark}
          </label>
          <label className={hasSelection ? "" : "is-off"}>
            <input type="checkbox" disabled={!hasSelection} checked={only && hasSelection} onChange={(e) => setOnly(e.currentTarget.checked)} /> {s.exportSelection}
          </label>
          {secretIds && (
            <label>
              <input type="checkbox" checked={leaveOut} onChange={(e) => setLeaveOut(e.currentTarget.checked)} data-testid="board-export-secret" /> {ms.exportSecret}
            </label>
          )}
        </div>
        <div className="board-export-actions">
          <button type="button" className="primary" disabled={busy} title={s.exportToFolderTitle} onClick={toFolder}>
            {s.exportToFolder}
          </button>
          <button type="button" disabled={busy} onClick={toDownloads}>
            {s.exportToDownloads}
          </button>
          {format === "png" && (
            <button type="button" disabled={busy} onClick={copy}>
              {s.exportCopy}
            </button>
          )}
          <span className="board-export-gap" />
          <button type="button" onClick={onClose}>
            {s.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
