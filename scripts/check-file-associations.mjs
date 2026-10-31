#!/usr/bin/env node
// Verso as a handler for .md on three systems (ADR 0114 section A, item
// 29): what the bundle declares is checked here, at its sources, so a
// change cannot quietly take the default or lose the registration.
//   macOS   tauri.macos.conf.json  fileAssociations: md + markdown, role
//           Editor, rank Alternate, the system's Markdown type;
//           Info.plist imports that type (older systems).
//   Linux   tauri.linux.conf.json  mimeType text/markdown, so the generated
//           .desktop says MimeType=text/markdown, and its template
//           (linux/verso.desktop) Exec=… %F, so the file reaches argv; (the built package is the
//           Linux VM's check, scripts/check-linux-vm.sh).
//   Windows no fileAssociations in tauri.conf.json / tauri.windows.conf.json
//           (Tauri's would write the .md default value); the NSIS hook
//           writes OpenWithProgids on both extensions, Capabilities and
//           RegisteredApplications, removes them on uninstall, and never
//           writes Software\Classes\.md's default value.
// Usage: node scripts/check-file-associations.mjs [app/src-tauri]
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "app/src-tauri";
const problems = [];
const read = (name) => readFileSync(join(root, name), "utf8");
const json = (name) => JSON.parse(read(name));

// macOS
try {
  const mac = json("tauri.macos.conf.json");
  const assoc = mac.bundle?.fileAssociations ?? [];
  const md = assoc.find((a) => Array.isArray(a.ext) && a.ext.includes("md"));
  if (!md) problems.push("macOS: no fileAssociations entry for md");
  else {
    if (!md.ext.includes("markdown")) problems.push("macOS: the association lacks the markdown extension");
    if (md.ext.some((e) => !["md", "markdown"].includes(e))) problems.push("macOS: an extension beyond md and markdown (Q13)");
    if (md.rank !== "Alternate") problems.push(`macOS: LSHandlerRank must be Alternate (Q7), is ${md.rank}`);
    if (md.role !== "Editor") problems.push(`macOS: the role must be Editor, is ${md.role}`);
    if (!(md.contentTypes ?? []).includes("net.daringfireball.markdown")) problems.push("macOS: contentTypes lacks net.daringfireball.markdown");
  }
  const plist = read("Info.plist");
  if (!plist.includes("<key>UTImportedTypeDeclarations</key>")) problems.push("macOS: Info.plist imports no type");
  if (!plist.includes("<string>net.daringfireball.markdown</string>")) problems.push("macOS: Info.plist does not import net.daringfireball.markdown");
  if (!plist.includes("<string>public.utf8-plain-text</string>")) problems.push("macOS: the imported type must conform to public.utf8-plain-text");
  if (plist.includes("<key>UTExportedTypeDeclarations</key>")) problems.push("macOS: Verso must not export (own) the Markdown type");
} catch (e) {
  problems.push(`macOS: ${e.message}`);
}

// Linux
try {
  const linux = json("tauri.linux.conf.json");
  const assoc = linux.bundle?.fileAssociations ?? [];
  if (!assoc.some((a) => a.mimeType === "text/markdown")) problems.push("Linux: no fileAssociations entry with mimeType text/markdown");
  // Tauri's own .desktop says `Exec=verso-app`, with no field code: a file
  // manager's "Open with" then starts the app with no file in argv (seen on
  // Ubuntu, 2026-10-31). The package's template carries %F.
  for (const kind of ["deb", "rpm"]) {
    const t = linux.bundle?.linux?.[kind]?.desktopTemplate;
    if (!t) { problems.push(`Linux: no bundle.linux.${kind}.desktopTemplate (Tauri's default Exec carries no %F)`); continue; }
    const text = read(t);
    if (!/^Exec=\{\{exec\}\} %[FU]$/m.test(text)) problems.push(`Linux: ${t} must say Exec={{exec}} %F`);
    if (!/^MimeType=\{\{mime_type\}\}$/m.test(text)) problems.push(`Linux: ${t} must carry MimeType={{mime_type}}`);
  }
} catch (e) {
  problems.push(`Linux: ${e.message}`);
}

// Windows
try {
  const base = json("tauri.conf.json");
  if (base.bundle?.fileAssociations) problems.push("tauri.conf.json: fileAssociations would reach the Windows installer (Q6)");
  const win = json("tauri.windows.conf.json");
  if (win.bundle?.fileAssociations) problems.push("Windows: fileAssociations must not be used (Q6)");
  const hooks = win.bundle?.windows?.nsis?.installerHooks;
  if (!hooks) problems.push("Windows: no installerHooks");
  else if (!existsSync(join(root, hooks))) problems.push(`Windows: the hooks file ${hooks} is missing`);
  else {
    const nsh = read(hooks);
    const post = nsh.slice(nsh.indexOf("!macro NSIS_HOOK_POSTINSTALL"), nsh.indexOf("!macroend", nsh.indexOf("!macro NSIS_HOOK_POSTINSTALL")));
    const pre = nsh.slice(nsh.indexOf("!macro NSIS_HOOK_PREUNINSTALL"), nsh.indexOf("!macroend", nsh.indexOf("!macro NSIS_HOOK_PREUNINSTALL")));
    if (!post) problems.push("Windows: no NSIS_HOOK_POSTINSTALL");
    if (!pre) problems.push("Windows: no NSIS_HOOK_PREUNINSTALL");
    for (const ext of [".md", ".markdown"]) {
      if (!post.includes(`"Software\\Classes\\${ext}\\OpenWithProgids"`)) problems.push(`Windows: no OpenWithProgids for ${ext}`);
      if (!pre.includes(`"Software\\Classes\\${ext}\\OpenWithProgids"`)) problems.push(`Windows: the uninstaller leaves OpenWithProgids for ${ext}`);
    }
    if (!/Capabilities\\FileAssociations" "\.md"/.test(post)) problems.push("Windows: Capabilities\\FileAssociations lacks .md");
    if (!post.includes('"Software\\RegisteredApplications"')) problems.push("Windows: no RegisteredApplications");
    if (!pre.includes('"Software\\RegisteredApplications"')) problems.push("Windows: the uninstaller leaves RegisteredApplications");
    if (!/shell\\open\\command" "" '"\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe" "%1"'/.test(post)) problems.push('Windows: the open command must be "<exe>" "%1", both quoted');
    // Never the extension's default value: `WriteRegStr SHCTX "Software\Classes\.md" "" ...`.
    for (const ext of [".md", ".markdown"]) {
      if (new RegExp(`WriteRegStr\\s+\\S+\\s+"Software\\\\Classes\\\\${ext.replace(".", "\\.")}"\\s+""`).test(nsh)) problems.push(`Windows: the hook writes the default value of ${ext} (Q6: never)`);
    }
    if (!post.includes("SHChangeNotify")) problems.push("Windows: the shell is not told (SHChangeNotify)");
  }
} catch (e) {
  problems.push(`Windows: ${e.message}`);
}

if (problems.length > 0) {
  console.error("file associations (ADR 0114):");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("file associations (ADR 0114): macOS, Linux and Windows declarations as decided");
