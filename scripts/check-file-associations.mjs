#!/usr/bin/env node
// Verso as a handler for .md on three systems (ADR 0114 section A, item
// 29), and for the structured-data files the diagram reads (.json, .yaml,
// .yml, .toml, .xml, .csv; items 31 and 33, amended 2026-10-31): what the
// bundle declares is checked here, at its sources, so a change cannot
// quietly take the default or lose the registration.
//   macOS   tauri.macos.conf.json  fileAssociations: md + markdown, role
//           Editor, rank Alternate, the system's Markdown type;
//           Info.plist imports that type (older systems); each data
//           type its own entry, Editor and Alternate, with the system's
//           type (public.json, public.yaml, public.xml,
//           public.comma-separated-values-text) and, for TOML, which the
//           system does not declare, io.toml imported in Info.plist.
//   Linux   tauri.linux.conf.json  mimeType text/markdown and the data
//           types' (application/json, application/yaml, application/x-yaml,
//           application/toml, application/xml, text/xml, text/csv), so the
//           generated .desktop's MimeType= names them, and its template
//           (linux/verso.desktop) Exec=… %F, so the file reaches argv; (the built package is the
//           Linux VM's check, scripts/check-linux-vm.sh).
//   Windows no fileAssociations in tauri.conf.json / tauri.windows.conf.json
//           (Tauri's would write the .md default value); the NSIS hook
//           writes OpenWithProgids on every extension, Capabilities and
//           RegisteredApplications, removes them on uninstall, and never
//           writes an extension key's default value.
// Usage: node scripts/check-file-associations.mjs [app/src-tauri]
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "app/src-tauri";
const problems = [];
const read = (name) => readFileSync(join(root, name), "utf8");
const json = (name) => JSON.parse(read(name));

// The data files Verso is offered for (item 31): the extensions, the
// system's type on macOS, the MIME types on Linux, the ProgID's define in
// the NSIS hook.
const DATA = [
  { name: "JSON", ext: ["json"], uti: "public.json", mime: ["application/json"], progid: "VERSO_PROGID_JSON" },
  { name: "YAML", ext: ["yaml", "yml"], uti: "public.yaml", mime: ["application/yaml", "application/x-yaml"], progid: "VERSO_PROGID_YAML" },
  { name: "TOML", ext: ["toml"], uti: "io.toml", mime: ["application/toml"], progid: "VERSO_PROGID_TOML", imported: true },
  { name: "XML", ext: ["xml"], uti: "public.xml", mime: ["application/xml", "text/xml"], progid: "VERSO_PROGID_XML" },
  { name: "CSV", ext: ["csv"], uti: "public.comma-separated-values-text", mime: ["text/csv"], progid: "VERSO_PROGID_CSV" },
];
const ALL_EXT = ["md", "markdown", ...DATA.flatMap((d) => d.ext)];

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
  for (const d of DATA) {
    const a = assoc.find((x) => Array.isArray(x.ext) && x.ext.includes(d.ext[0]));
    if (!a) { problems.push(`macOS: no fileAssociations entry for ${d.ext[0]}`); continue; }
    for (const e of d.ext) if (!a.ext.includes(e)) problems.push(`macOS: the ${d.name} association lacks ${e}`);
    if (a.rank !== "Alternate") problems.push(`macOS: ${d.name}'s LSHandlerRank must be Alternate (item 31), is ${a.rank}`);
    if (a.role !== "Editor") problems.push(`macOS: ${d.name}'s role must be Editor, is ${a.role}`);
    if (!(a.contentTypes ?? []).includes(d.uti)) problems.push(`macOS: ${d.name}'s contentTypes lacks ${d.uti}`);
  }
  const names = assoc.map((a) => a.name);
  if (new Set(names).size !== names.length) problems.push("macOS: two document types share a name (install-beta.sh checks them by name)");
  for (const a of assoc) for (const e of a.ext ?? []) if (!ALL_EXT.includes(e)) problems.push(`macOS: an extension beyond the decided ones: ${e} (Q13, item 31)`);
  const plist = read("Info.plist");
  if (!plist.includes("<key>UTImportedTypeDeclarations</key>")) problems.push("macOS: Info.plist imports no type");
  if (!plist.includes("<string>net.daringfireball.markdown</string>")) problems.push("macOS: Info.plist does not import net.daringfireball.markdown");
  if (!plist.includes("<string>public.utf8-plain-text</string>")) problems.push("macOS: the imported type must conform to public.utf8-plain-text");
  if (plist.includes("<key>UTExportedTypeDeclarations</key>")) problems.push("macOS: Verso must not export (own) the Markdown type");
  for (const d of DATA.filter((x) => x.imported)) {
    if (!plist.includes(`<string>${d.uti}</string>`)) problems.push(`macOS: Info.plist does not import ${d.uti}`);
  }
  // The system's own types are the system's: never imported over them.
  for (const d of DATA.filter((x) => !x.imported)) {
    if (plist.includes(`<string>${d.uti}</string>`)) problems.push(`macOS: Info.plist redeclares the system's ${d.uti}`);
  }
} catch (e) {
  problems.push(`macOS: ${e.message}`);
}

// Linux
try {
  const linux = json("tauri.linux.conf.json");
  const assoc = linux.bundle?.fileAssociations ?? [];
  if (!assoc.some((a) => a.mimeType === "text/markdown")) problems.push("Linux: no fileAssociations entry with mimeType text/markdown");
  for (const d of DATA) for (const m of d.mime) if (!assoc.some((a) => a.mimeType === m)) problems.push(`Linux: no fileAssociations entry with mimeType ${m}`);
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
    for (const ext of ALL_EXT.map((e) => `.${e}`)) {
      if (!post.includes(`"Software\\Classes\\${ext}\\OpenWithProgids"`)) problems.push(`Windows: no OpenWithProgids for ${ext}`);
      if (!pre.includes(`"Software\\Classes\\${ext}\\OpenWithProgids"`)) problems.push(`Windows: the uninstaller leaves OpenWithProgids for ${ext}`);
      if (!post.includes(`Capabilities\\FileAssociations" "${ext}"`)) problems.push(`Windows: Capabilities\\FileAssociations lacks ${ext}`);
    }
    // Each data type its own ProgID, per channel, with its open command,
    // removed on uninstall.
    for (const d of DATA) {
      const id = "${" + d.progid + "}";
      if ((nsh.match(new RegExp(`!define ${d.progid} "Verso\\.\\w+(\\.Beta)?\\.1"`, "g")) ?? []).length !== 2) problems.push(`Windows: ${d.progid} must be defined for the release and the beta, versioned`);
      if (!post.includes(`"Software\\Classes\\${id}\\shell\\open\\command" "" '"$INSTDIR\\\${MAINBINARYNAME}.exe" "%1"'`)) problems.push(`Windows: ${d.name}'s open command must be "<exe>" "%1", both quoted`);
      if (!pre.includes(`DeleteRegKey SHCTX "Software\\Classes\\${id}"`)) problems.push(`Windows: the uninstaller leaves the ${d.name} ProgID`);
      for (const ext of d.ext) if (!post.includes(`"Software\\Classes\\.${ext}\\OpenWithProgids" "${id}"`)) problems.push(`Windows: .${ext} is not offered with ${d.progid}`);
    }
    if (!post.includes('"Software\\RegisteredApplications"')) problems.push("Windows: no RegisteredApplications");
    if (!pre.includes('"Software\\RegisteredApplications"')) problems.push("Windows: the uninstaller leaves RegisteredApplications");
    if (!/shell\\open\\command" "" '"\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe" "%1"'/.test(post)) problems.push('Windows: the open command must be "<exe>" "%1", both quoted');
    // Never the extension's default value: `WriteRegStr SHCTX "Software\Classes\.md" "" ...`.
    for (const ext of ALL_EXT.map((e) => `.${e}`)) {
      if (new RegExp(`WriteRegStr\\s+\\S+\\s+"Software\\\\Classes\\\\${ext.replace(".", "\\.")}"\\s+""`).test(nsh)) problems.push(`Windows: the hook writes the default value of ${ext} (Q6: never)`);
    }
    if (!post.includes("SHChangeNotify")) problems.push("Windows: the shell is not told (SHChangeNotify)");
  }
} catch (e) {
  problems.push(`Windows: ${e.message}`);
}

if (problems.length > 0) {
  console.error("file associations (ADR 0114 items 29 and 33):");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`file associations (ADR 0114 items 29 and 33): ${ALL_EXT.map((e) => "." + e).join(" ")} on macOS, Linux and Windows as decided`);
