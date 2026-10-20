// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { commands } from "../bindings";
import type { TemplateBundle } from "./types";

export interface InstantiateResult {
  createdFolders: number;
  createdFiles: number;
  firstFilePath?: string;
  warnings: string[];
  errors: string[];
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowTimeString(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Sanitize a title string so it can be safely used in path segments (ADR 0070 item 3). */
export function sanitizePathName(name: string): string {
  return name.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_").trim();
}

/**
 * Validate that a relative path segment is safe (ADR 0098 security & IO):
 * - Does not escape target folder (no '..')
 * - Does not start with '/' or '\'
 * - Does not use Windows forbidden characters: < > : " | ? *
 * - Does not target hidden internal folders: .verso, .obsidian, .git
 */
export function validateRelativePath(path: string): { ok: boolean; reason?: string } {
  if (!path || path.trim() === "") {
    return { ok: false, reason: "Path cannot be empty" };
  }
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return { ok: false, reason: "Absolute paths are forbidden" };
  }
  const segments = normalized.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      return { ok: false, reason: "Path traversal ('..') is forbidden" };
    }
    if (seg === ".verso" || seg === ".obsidian" || seg === ".git") {
      return { ok: false, reason: `Modification of internal directory '${seg}' is forbidden` };
    }
    // Check for Windows forbidden characters: < > : " | ? * and ASCII control characters (0-31)
    if (/[\x00-\x1f<>:"|?*]/.test(seg)) {
      return { ok: false, reason: `Path segment contains forbidden characters: ${seg}` };
    }
  }
  return { ok: true };
}

const YAML_BOOLEAN_OR_KEYWORD = /^(?:yes|no|y|n|true|false|on|off|null|~)$/i;

/** Format a string value safely for YAML frontmatter. */
function formatYamlString(value: string): string {
  if (
    value.includes("\n") ||
    value.includes(":") ||
    value.startsWith("[[") ||
    /^[[{#*&!|>'"%@`-]/.test(value) ||
    YAML_BOOLEAN_OR_KEYWORD.test(value.trim())
  ) {
    return JSON.stringify(value);
  }
  return value;
}

/** Serialize frontmatter object into Markdown YAML block (compatible with Obsidian & ADR 0015). */
export function renderFrontmatter(props?: Record<string, unknown>): string {
  if (!props || Object.keys(props).length === 0) return "";
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) {
      lines.push(`${key}:`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${formatYamlString(value)}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        if (typeof item === "string") {
          lines.push(`  - ${formatYamlString(item)}`);
        } else {
          lines.push(`  - ${JSON.stringify(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

/** Substitute template placeholders in a string. */
export function substituteVariables(
  text: string,
  title: string,
  uuidGen: () => string = () => crypto.randomUUID()
): string {
  const dateStr = todayDateString();
  const timeStr = nowTimeString();
  return text
    .replaceAll("{{title}}", title)
    .replaceAll("{{date}}", dateStr)
    .replaceAll("{{time}}", timeStr)
    .replace(/\{\{uuid\}\}/g, () => uuidGen());
}

/** Join path segments cleanly without double slashes. */
function joinPath(base: string, sub: string): string {
  const cleanBase = base.trim().replace(/^\/+|\/+$/g, "");
  const cleanSub = sub.trim().replace(/^\/+/, "");
  if (!cleanBase) return cleanSub;
  if (!cleanSub) return cleanBase;
  return `${cleanBase}/${cleanSub}`;
}

/** Instantiate a Template Bundle in the open vault (ADR 0098). */
export async function instantiateBundle(
  targetFolder: string,
  title: string,
  bundle: TemplateBundle
): Promise<InstantiateResult> {
  const cleanTitle = title.trim();
  const safeTitleForPath = sanitizePathName(cleanTitle);

  let createdFolders = 0;
  let createdFiles = 0;
  let firstFilePath: string | undefined;
  const warnings: string[] = [];
  const errors: string[] = [];

  // Validate targetFolder itself if provided
  if (targetFolder && targetFolder.trim()) {
    const targetCheck = validateRelativePath(targetFolder.trim());
    if (!targetCheck.ok) {
      errors.push(`Target folder invalid: ${targetCheck.reason}`);
      return { createdFolders, createdFiles, warnings, errors };
    }
  }

  // Always create a dedicated project root folder named after the campaign/world (ADR 0098)
  const projectRoot = targetFolder && targetFolder.trim()
    ? joinPath(targetFolder.trim(), safeTitleForPath)
    : safeTitleForPath;

  const rootCheck = validateRelativePath(projectRoot);
  if (!rootCheck.ok) {
    errors.push(`Project folder invalid: ${rootCheck.reason}`);
    return { createdFolders, createdFiles, warnings, errors };
  }

  try {
    await commands.createFolder(projectRoot);
    createdFolders++;
  } catch (err) {
    warnings.push(`Folder '${projectRoot}': ${(err as Error).message || "already exists or skipped"}`);
  }

  // 1. Create all declared folders inside the project root
  for (const folderPattern of bundle.folders) {
    const renderedFolder = substituteVariables(folderPattern, safeTitleForPath);
    const pathCheck = validateRelativePath(renderedFolder);
    if (!pathCheck.ok) {
      errors.push(`Skipped folder '${renderedFolder}': ${pathCheck.reason}`);
      continue;
    }

    const fullFolderPath = joinPath(projectRoot, renderedFolder);
    try {
      await commands.createFolder(fullFolderPath);
      createdFolders++;
    } catch (err) {
      warnings.push(`Folder '${fullFolderPath}': ${(err as Error).message || "already exists or skipped"}`);
    }
  }

  // 2. Create all declared files inside the project root
  for (const fileDef of bundle.files) {
    const renderedFilePath = substituteVariables(fileDef.path, safeTitleForPath);
    const pathCheck = validateRelativePath(renderedFilePath);
    if (!pathCheck.ok) {
      errors.push(`Skipped file '${renderedFilePath}': ${pathCheck.reason}`);
      continue;
    }

    const fullFilePath = joinPath(projectRoot, renderedFilePath);

    const fm = fileDef.frontmatter
      ? Object.fromEntries(
          Object.entries(fileDef.frontmatter).map(([k, v]) => [
            k,
            typeof v === "string" ? substituteVariables(v, cleanTitle) : v,
          ])
        )
      : undefined;

    const rawContent = fileDef.content ? substituteVariables(fileDef.content, cleanTitle) : "";
    const fmBlock = renderFrontmatter(fm);
    const finalContent = fmBlock ? `${fmBlock}${rawContent}` : rawContent;

    try {
      await commands.createNote(fullFilePath, finalContent);
      createdFiles++;
      if (!firstFilePath) firstFilePath = fullFilePath.endsWith(".md") ? fullFilePath : `${fullFilePath}.md`;
    } catch (err) {
      errors.push(`Failed to create note '${fullFilePath}': ${(err as Error).message || err}`);
    }
  }

  return {
    createdFolders,
    createdFiles,
    firstFilePath,
    warnings,
    errors,
  };
}
