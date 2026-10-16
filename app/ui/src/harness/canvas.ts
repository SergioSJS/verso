// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A canvas laid out as Verso writes one (verso-core canvas.rs): a
 *  container holding only scalars on one line, any other one entry per
 *  line, tabs, no final newline. */
export function canvasLayout(value: unknown, depth = 0): string {
  const scalar = (v: unknown): boolean => v === null || typeof v !== "object";
  const tab = (n: number): string => "\t".repeat(n);
  if (Array.isArray(value)) {
    if (value.every(scalar)) return `[${value.map((v) => canvasLayout(v, depth + 1)).join(",")}]`;
    return `[\n${value.map((v) => tab(depth + 1) + canvasLayout(v, depth + 1)).join(",\n")}\n${tab(depth)}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.every(([, v]) => scalar(v))) return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canvasLayout(v, depth + 1)}`).join(",")}}`;
    return `{\n${entries.map(([k, v]) => `${tab(depth + 1)}${JSON.stringify(k)}:${canvasLayout(v, depth + 1)}`).join(",\n")}\n${tab(depth)}}`;
  }
  return JSON.stringify(value);
}
