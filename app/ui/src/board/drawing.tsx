// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import { type BinaryFileData } from "@excalidraw/excalidraw/types";
import { type JSX, useEffect, useMemo, useState } from "react";
import { dataUrlOf } from "./pictures";
import { ext } from "../paths";
import { Api } from "./view";

/** A drawing of Obsidian's Excalidraw plugin, shown as it is drawn and
 *  never changed (ADR 0057 point 5, revised 2026-10-06): its scene's
 *  elements, and its pictures by the files `pictures` names (fileId →
 *  path of the folder). */
export type DrawingPreview = {
  elements: readonly Record<string, unknown>[];
  pictures: ReadonlyMap<string, string>;
  fileSrc: (path: string) => string;
  /** Whether the window is dark now: the drawing follows a change of it. */
  dark: () => boolean;
  lang: string;
};

export function DrawingView({ elements, pictures, fileSrc, dark: isDark, lang }: DrawingPreview): JSX.Element {
  const [api, setApi] = useState<Api | null>(null);
  // The theme, as the board follows it: the system's, or the one chosen.
  const [dark, setDark] = useState(isDark());
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const theme = (): void => setDark(isDark());
    media.addEventListener("change", theme);
    const watch = new MutationObserver(theme);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", theme);
      watch.disconnect();
    };
  }, [isDark]);
  const scene = useMemo(() => restoreElements(elements as never, null, { repairBindings: true }), [elements]);
  useEffect(() => {
    if (!api) return;
    let alive = true;
    void (async () => {
      const files: BinaryFileData[] = [];
      for (const [id, path] of pictures) {
        try {
          const blob = await (await fetch(fileSrc(path))).blob();
          files.push({ id: id as never, dataURL: (await dataUrlOf(blob)) as never, mimeType: (blob.type || `image/${ext(path) === "svg" ? "svg+xml" : ext(path)}`) as never, created: Date.now() });
        } catch {
          // A picture that cannot be read is drawn as Excalidraw draws a missing one.
        }
      }
      if (alive && files.length > 0) api.addFiles(files);
    })();
    return () => {
      alive = false;
    };
  }, [api, pictures, fileSrc]);
  return (
    <Excalidraw
      onExcalidrawAPI={(a) => a && setApi(a)}
      initialData={{ elements: scene, scrollToContent: true }}
      viewModeEnabled
      aiEnabled={false}
      theme={dark ? "dark" : "light"}
      langCode={lang.toLowerCase().startsWith("pt") ? "pt-BR" : "en"}
      UIOptions={{
        canvasActions: { loadScene: false, saveToActiveFile: false, export: false, clearCanvas: false, toggleTheme: false, changeViewBackgroundColor: false, saveAsImage: false },
      }}
    />
  );
}
