// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Making a plan on disk (ADR 0098 item 5), one command at a time, and
 *  saying what each one answered. A refusal is counted as a refusal: the
 *  core never overwrites (ADR 0012), so a path that stands is reported as
 *  left alone, and anything else as not made. */

import type { Plan } from "./plan";

export type Answer = { status: "ok" } | { status: "error"; error: { kind: string; message: string } };

/** The three commands of the contract the plan needs. */
export interface Writer {
  createFolder(path: string): Promise<Answer>;
  createNote(path: string, text: string): Promise<Answer>;
  createFile(path: string, base64: string): Promise<Answer>;
}

export interface Report {
  madeFolders: string[];
  madeFiles: string[];
  /** Already there: left as it was. */
  existed: string[];
  /** Refused for another reason. */
  failed: { path: string; message: string }[];
}

/** UTF-8 text as the base64 `createFile` takes. */
export function toBase64(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Make the plan: folders first, then files. A step that throws is a
 *  failure like a refusal; nothing aborts the rest. */
export async function applyPlan(plan: Plan, io: Writer): Promise<Report> {
  const report: Report = { madeFolders: [], madeFiles: [], existed: [], failed: [] };
  const take = (path: string, answer: Answer, made: string[]): void => {
    if (answer.status === "ok") made.push(path);
    else if (answer.error.kind === "exists") report.existed.push(path);
    else report.failed.push({ path, message: answer.error.message });
  };
  const run = async (path: string, made: string[], go: () => Promise<Answer>): Promise<void> => {
    try {
      take(path, await go(), made);
    } catch (err) {
      report.failed.push({ path, message: err instanceof Error ? err.message : String(err) });
    }
  };
  for (const folder of plan.folders) await run(folder, report.madeFolders, () => io.createFolder(folder));
  for (const file of plan.files) {
    await run(file.path, report.madeFiles, () => (file.note ? io.createNote(file.path, file.text) : io.createFile(file.path, toBase64(file.text))));
  }
  return report;
}

/** Whether the report holds something the person must read before the
 *  window goes away. */
export function needsReading(report: Report): boolean {
  return report.existed.length > 0 || report.failed.length > 0;
}
