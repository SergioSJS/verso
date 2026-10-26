// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Template Bundle Schema and validation (ADR 0098). */

import type { BundleWords } from "./words";

export type FrontmatterValue = string | number | boolean | null | (string | number)[];

export interface TemplateBundleFile {
  path: string;
  frontmatter?: Record<string, FrontmatterValue>;
  content?: string;
}

export const CATEGORIES = ["rpg", "world", "writing", "notes"] as const;

export interface TemplateBundle {
  version: 1;
  id: string;
  name: string;
  description: string;
  category?: (typeof CATEGORIES)[number];
  folders: string[];
  files: TemplateBundleFile[];
}

export interface ValidationResult {
  valid: boolean;
  bundle?: TemplateBundle;
  error?: string;
  fixPrompt?: string;
  errorPrompt?: string;
}

/** The most text the wizard reads when a bundle is pasted. */
export const MAX_PASTE_BYTES = 6 * 1024 * 1024;

/** The fence an AI wraps its answer in, if any, taken off. */
export function unfence(text: string): string {
  const clean = text.trim();
  if (!clean.startsWith("```")) return clean;
  return clean.replace(/^```[A-Za-z]*[ \t]*\r?\n?/, "").replace(/\r?\n?```\s*$/, "").trim();
}

/** Validate an unknown object or JSON string against the Template Bundle
 *  Schema v1, in the language of `w`. Returns a detailed error and a
 *  pre-formatted fix prompt to copy back to the person's AI assistant if
 *  validation fails. */
export function validateBundle(data: unknown, w: BundleWords): ValidationResult {
  let parsed: unknown = data;
  if (typeof data === "string") {
    if (data.length > MAX_PASTE_BYTES) return failWith(w, w.tooBig(MAX_PASTE_BYTES / 1024 / 1024));
    try {
      parsed = JSON.parse(unfence(data));
    } catch (err) {
      return failWith(w, w.invalidJson(err instanceof Error ? err.message : String(err)));
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return failWith(w, w.notObject);
  const obj = parsed as Record<string, unknown>;

  if (obj.version !== 1) return failWith(w, w.version);
  if (typeof obj.id !== "string" || !obj.id.trim()) return failWith(w, w.id);
  if (typeof obj.name !== "string" || !obj.name.trim()) return failWith(w, w.name);
  if (typeof obj.description !== "string") return failWith(w, w.description);
  if (obj.category !== undefined && !(CATEGORIES as readonly unknown[]).includes(obj.category)) return failWith(w, w.category);
  if (!Array.isArray(obj.folders)) return failWith(w, w.folders);
  for (let i = 0; i < obj.folders.length; i++) {
    const f: unknown = obj.folders[i];
    if (typeof f !== "string" || !f.trim()) return failWith(w, w.folderItem(i));
  }
  if (!Array.isArray(obj.files)) return failWith(w, w.files);
  for (let i = 0; i < obj.files.length; i++) {
    const file: unknown = obj.files[i];
    if (typeof file !== "object" || file === null || Array.isArray(file)) return failWith(w, w.fileItem(i));
    const f = file as Record<string, unknown>;
    if (typeof f.path !== "string" || !f.path.trim()) return failWith(w, w.filePath(i));
    if (f.frontmatter !== undefined) {
      if (typeof f.frontmatter !== "object" || f.frontmatter === null || Array.isArray(f.frontmatter)) return failWith(w, w.frontmatterObject(f.path));
      for (const [key, value] of Object.entries(f.frontmatter)) {
        if (!key.trim() || /[\r\n\x00-\x1f]/.test(key)) return failWith(w, w.frontmatterKey(f.path, key));
        if (!frontmatterValueOk(value)) return failWith(w, w.frontmatterValue(f.path, key));
      }
    }
    if (f.content !== undefined && typeof f.content !== "string") return failWith(w, w.content(f.path));
  }
  return { valid: true, bundle: obj as unknown as TemplateBundle };
}

function frontmatterValueOk(v: unknown): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  return Array.isArray(v) && v.every((x) => typeof x === "string" || (typeof x === "number" && Number.isFinite(x)));
}

function failWith(w: BundleWords, why: { error: string; fix: string }): ValidationResult {
  const fixPrompt = w.fixIntro(why.error, why.fix);
  return { valid: false, error: why.error, fixPrompt, errorPrompt: fixPrompt };
}
