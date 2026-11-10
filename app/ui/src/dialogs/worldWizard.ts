// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { asDialog, closed, opened } from "./a11y";
import { afterFileChange } from "../changes";
import { commands } from "../bindings";
import { checkEdited, type Plan, planBundle } from "../bundles/plan";
import { BUILTIN_PRESETS } from "../bundles/presets";
import { bundleInLanguage } from "../bundles/presetsEn";
import { applyPlan, needsReading, type Report } from "../bundles/run";
import { systemPromptFor } from "../bundles/systemPrompt";
import { freeId, loadFolderBundles, saveFolderBundle } from "../bundles/store";
import { MAX_PASTE_BYTES, type TemplateBundle, validateBundle } from "../bundles/types";
import { bundleWords, PRESET_TEXT_EN } from "../bundles/words";
import { h, ui } from "../dom";
import { onFolderData } from "../folderData";
import { openNote } from "../layout/spaces";
import { icon } from "../icons";
import { LANG, t } from "../strings";
import { openFolders } from "../tree/tree";
import { focusOnOpen } from "../screen/openFocus";

const bw = bundleWords(LANG);
const isPt = LANG.toLowerCase().startsWith("pt");

let shade: HTMLElement | null = null;
/** The bundles the folder keeps in `.verso/bundles/` (ADR 0098 item 2),
 *  read each time the wizard opens and when the folder's data changes. */
let folderBundles: TemplateBundle[] = [];
/** What the last read of them has to say: a file that is no bundle. */
let folderNotes: string[] = [];
/** Bundles that could not be kept in the folder (a read-only member, a
 *  refusal): they last until the window closes, and the person is told. */
const sessionBundles: TemplateBundle[] = [];
/** Draws the cards again when the folder's bundles are read. */
let onFolderBundles: (() => void) | null = null;
let ids = 0;

async function refreshFolderBundles(): Promise<void> {
  try {
    const read = await loadFolderBundles(bw);
    folderBundles = read.bundles;
    folderNotes = read.notes;
  } catch {
    // No folder open, or its list cannot be read now: the built-in ones remain.
    folderBundles = [];
    folderNotes = [];
  }
  onFolderBundles?.();
}
onFolderData("bundles", () => void refreshFolderBundles());

/** The name and description of a bundle in the window's language: the
 *  built-in ones are translated, an imported one reads as its author wrote. */
function textOf(bundle: TemplateBundle): { name: string; description: string } {
  const en = !isPt && BUILTIN_PRESETS.includes(bundle) ? PRESET_TEXT_EN[bundle.id] : undefined;
  return en ?? { name: bundle.name, description: bundle.description };
}

/** Every bundle, whatever the features' switches say: the wizard is itself
 *  a feature (ADR 0103, revised 2026-10-20), and its categories are not. */
function getAvailableBundles(): TemplateBundle[] {
  return [...sessionBundles, ...folderBundles, ...BUILTIN_PRESETS];
}

/** The ids no import may take: every bundle the wizard lists. */
function takenIds(): Set<string> {
  return new Set(getAvailableBundles().map((b) => b.id));
}

/** Open the World and Campaign Creation Wizard (ADR 0098). */
export function showWorldWizard(defaultFolder = ""): void {
  if (!shade) shade = build();
  populate(shade, defaultFolder);
  void refreshFolderBundles();
  shade.hidden = false;
  opened(shade);
  const nameInput = shade.querySelector<HTMLInputElement>(".world-name-input");
  focusOnOpen(nameInput);
}

function hideWizard(): void {
  if (!shade) return;
  shade.hidden = true;
  closed(shade);
}

function build(): HTMLElement {
  const el = h("div", "confirm world-wizard-shade");
  el.hidden = true;
  // The shade is the dialog (asDialog names it and keeps Tab inside); the
  // box is only its page.
  const box = h("div", "confirm-box world-wizard-box");

  const titleId = "world-wizard-title";
  const header = h("div", "world-wizard-header");
  const title = h("h2", "world-wizard-title", t.worldWizard.title);
  title.id = titleId;
  title.prepend(icon("world"));

  const closeBtn = h("button", "ghost iconic world-wizard-close");
  closeBtn.type = "button";
  closeBtn.title = t.close;
  closeBtn.setAttribute("aria-label", t.close);
  closeBtn.append(icon("close"));
  header.append(title, closeBtn);

  const body = h("div", "world-wizard-body");
  box.append(header, body);
  el.append(box);
  document.body.append(el);

  asDialog(el, t.worldWizard.title, hideWizard, titleId);
  closeBtn.addEventListener("click", hideWizard);
  el.addEventListener("mousedown", (e) => {
    if (e.target === el) hideWizard();
  });

  return el;
}

type Tab = "presets" | "ai";

function listOf(lines: string[]): HTMLElement {
  const ul = h("ul", "world-report-list");
  for (const line of lines) ul.append(h("li", "", line));
  return ul;
}

function populate(dialog: HTMLElement, defaultFolder: string): void {
  const body = dialog.querySelector(".world-wizard-body")!;
  body.replaceChildren();

  const tabNav = h("div", "world-wizard-tabs");
  tabNav.setAttribute("role", "tablist");
  tabNav.setAttribute("aria-label", bw.tabsLabel);

  const tabs: Record<Tab, HTMLButtonElement> = {
    presets: h("button", "world-tab-btn", t.worldWizard.tabPresets),
    ai: h("button", "world-tab-btn", t.worldWizard.tabAi),
  };
  tabs.ai.prepend(icon("sparkles"));
  const panels: Record<Tab, HTMLElement> = { presets: h("div", "world-wizard-content"), ai: h("div", "world-wizard-content") };
  for (const key of ["presets", "ai"] as const) {
    const tab = tabs[key];
    const panel = panels[key];
    tab.type = "button";
    tab.id = `world-tab-${key}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `world-panel-${key}`);
    panel.id = `world-panel-${key}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
  }
  tabNav.append(tabs.presets, tabs.ai);
  body.append(tabNav, panels.presets, panels.ai);

  const show = (key: Tab, focus = false): void => {
    for (const k of ["presets", "ai"] as const) {
      const on = k === key;
      tabs[k].classList.toggle("active", on);
      tabs[k].setAttribute("aria-selected", String(on));
      tabs[k].tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    }
    if (focus) tabs[key].focus();
  };
  for (const key of ["presets", "ai"] as const) tabs[key].addEventListener("click", () => show(key));
  // Arrow keys move between the tabs, as a tablist does.
  tabNav.addEventListener("keydown", (e) => {
    const order: Tab[] = ["presets", "ai"];
    const now = order.find((k) => tabs[k] === document.activeElement);
    if (!now) return;
    let next: Tab | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") next = now === "presets" ? "ai" : "presets";
    else if (e.key === "Home") next = "presets";
    else if (e.key === "End") next = "ai";
    if (!next) return;
    e.preventDefault();
    show(next, true);
  });

  const presets = renderPresetsTab(panels.presets, defaultFolder);
  renderAiTab(panels.ai, async (bundle) => {
    // Kept in the folder, so a reload and whoever opens the folder have it
    // (ADR 0098 item 2); a bundle with the id of another gets a new one.
    const notes: string[] = [];
    const saved = await saveFolderBundle(bundle, takenIds());
    let fresh: TemplateBundle;
    if (saved.ok) {
      fresh = saved.bundle;
      if (saved.renamed) notes.push(bw.importedRenamed(fresh.name));
      notes.push(bw.savedInFolder(fresh.name));
      folderBundles = [...folderBundles.filter((b) => b.id !== fresh.id), fresh];
    } else {
      fresh = { ...bundle, id: freeId(bundle.id, takenIds()) };
      if (fresh.id !== bundle.id) notes.push(bw.importedRenamed(fresh.name));
      notes.push(bw.keptHere(fresh.name, saved.message));
      sessionBundles.unshift(fresh);
    }
    presets.add(fresh);
    // The import button is now hidden: focus goes to the tab it left for,
    // or the keyboard (Esc) would no longer reach the dialog.
    show("presets", true);
    ui.status.textContent = [t.worldWizard.importSuccess(fresh.name), ...notes].join(" ");
    presets.say(notes.join(" "));
  });
  show("presets");
}

function renderPresetsTab(host: HTMLElement, defaultFolder: string): { add: (bundle: TemplateBundle) => void; say: (text: string) => void } {
  const form = h("form", "world-form");
  form.noValidate = true;
  const uid = ++ids;

  // 1. Name field
  const nameRow = h("div", "world-form-row");
  const nameLabel = h("label", "world-field-label", t.worldWizard.nameLabel);
  const nameInput = h("input", "world-input world-name-input");
  nameInput.id = `world-name-${uid}`;
  nameLabel.htmlFor = nameInput.id;
  nameInput.type = "text";
  nameInput.required = true;
  nameInput.setAttribute("aria-required", "true");
  nameInput.placeholder = t.worldWizard.namePlaceholder;
  nameRow.append(nameLabel, nameInput);

  // 2. Destination folder
  const folderRow = h("div", "world-form-row");
  const folderLabel = h("label", "world-field-label", t.worldWizard.folderLabel);
  const folderInput = h("input", "world-input world-folder-input");
  folderInput.id = `world-folder-${uid}`;
  folderLabel.htmlFor = folderInput.id;
  folderInput.type = "text";
  folderInput.value = defaultFolder;
  folderInput.placeholder = t.worldWizard.folderPlaceholder;
  const folderHint = h("span", "world-field-hint", t.worldWizard.folderHint);
  folderHint.id = `world-folder-hint-${uid}`;
  folderInput.setAttribute("aria-describedby", folderHint.id);
  folderRow.append(folderLabel, folderInput, folderHint);

  // 3. Bundle cards: chosen in place, so what was typed stays typed.
  const bundleRow = h("div", "world-form-row");
  const bundleLabel = h("div", "world-field-label", t.worldWizard.bundleLabel);
  bundleLabel.id = `world-bundles-label-${uid}`;
  const bundlesList = h("div", "world-bundles-grid");
  bundlesList.setAttribute("role", "group");
  bundlesList.setAttribute("aria-labelledby", bundleLabel.id);
  const folderNote = h("p", "world-field-hint world-folder-bundles-note");
  folderNote.setAttribute("role", "status");
  folderNote.hidden = true;
  bundleRow.append(bundleLabel, bundlesList, folderNote);

  // 4. Preview
  const previewBox = h("div", "world-bundle-preview");
  const previewHeading = h("span", "world-preview-title", bw.previewTitle);
  const projectSummary = h("p", "world-preview-root");
  const foldersSummary = h("p", "world-preview-folders");
  const filesSummary = h("p", "world-preview-files");
  const listing = h("details", "world-preview-list");
  listing.append(h("summary", "", bw.showFiles));
  const listBody = h("ul", "world-preview-ul");
  listing.append(listBody);
  const problemBox = h("ul", "world-preview-problems");
  problemBox.hidden = true;
  previewBox.append(previewHeading, projectSummary, foldersSummary, filesSummary, listing, problemBox);

  // 5. Status and submit
  const actionRow = h("div", "world-actions");
  const statusLine = h("div", "world-status-line");
  statusLine.setAttribute("role", "status");
  statusLine.setAttribute("aria-live", "polite");
  const submitBtn = h("button", "save world-submit-btn", t.worldWizard.create);
  submitBtn.type = "submit";
  submitBtn.prepend(icon("plus"));
  actionRow.append(statusLine, submitBtn);
  const reportBox = h("div", "world-report");
  reportBox.hidden = true;
  reportBox.setAttribute("role", "group");
  reportBox.setAttribute("aria-label", bw.reportLabel);

  form.append(nameRow, folderRow, bundleRow, previewBox, actionRow, reportBox);

  let selected: TemplateBundle = getAvailableBundles()[0] ?? BUILTIN_PRESETS[0]!;
  const cards = new Map<string, HTMLButtonElement>();

  /** The chosen bundle in the window's language (ADR 0098 item 10). */
  const chosen = (): TemplateBundle => bundleInLanguage(selected, isPt);
  const planNow = (): Plan => planBundle(chosen(), { target: folderInput.value, title: nameInput.value || "x", now: new Date(), uuid: () => crypto.randomUUID(), words: bw, lang: isPt ? "pt-BR" : "en" });

  const paintPreview = (): void => {
    const typed = nameInput.value.trim();
    projectSummary.textContent = bw.rootLine(typed || bw.rootPlaceholder);
    const bundle = chosen();
    foldersSummary.textContent = bw.foldersLine(bundle.folders.length, bundle.folders.join(", "));
    filesSummary.textContent = bw.filesLine(bundle.files.length);
    const plan = planNow();
    listBody.replaceChildren(...plan.folders.map((f) => h("li", "", `📂 ${f}/`)), ...plan.files.map((f) => h("li", "", `📄 ${f.path}`)));
    // Problems of the bundle itself show at once; the name's wait for one.
    const shown = plan.problems.filter((p) => typed || p.at !== "/title");
    problemBox.replaceChildren(...shown.map((p) => h("li", "", bw.problemAt(p.at, p.message))));
    problemBox.hidden = shown.length === 0;
  };

  const choose = (bundle: TemplateBundle): void => {
    selected = bundle;
    for (const [id, card] of cards) {
      const on = id === bundle.id;
      card.classList.toggle("selected", on);
      card.setAttribute("aria-pressed", String(on));
    }
    paintPreview();
  };

  const drawCards = (): void => {
    cards.clear();
    const available = getAvailableBundles();
    if (!available.some((b) => b.id === selected.id) && available[0]) selected = available[0];
    const nodes: HTMLElement[] = [];
    for (const bundle of available) {
      const text = textOf(bundle);
      const card = h("button", "world-bundle-card");
      card.type = "button";
      card.append(h("strong", "world-bundle-title", text.name), h("p", "world-bundle-desc", text.description));
      card.addEventListener("click", () => choose(bundle));
      cards.set(bundle.id, card);
      nodes.push(card);
    }
    if (nodes.length === 0) nodes.push(h("p", "world-field-hint", bw.noBundles));
    bundlesList.replaceChildren(...nodes);
    folderNote.textContent = folderNotes.join(" ");
    folderNote.hidden = folderNotes.length === 0;
    choose(selected);
  };

  nameInput.addEventListener("input", () => {
    statusLine.textContent = "";
    paintPreview();
  });
  folderInput.addEventListener("input", paintPreview);
  drawCards();
  // The folder's bundles arrive after the dialog is drawn (and again when
  // they change): the cards are drawn again, the choice kept.
  onFolderBundles = drawCards;

  const showReport = (plan: Plan, report: Report | null): void => {
    reportBox.replaceChildren();
    if (!report) {
      reportBox.append(h("p", "world-report-head", bw.planRefused(plan.problems.length)));
      reportBox.append(listOf(plan.problems.map((p) => bw.problemAt(p.at, p.message))));
      reportBox.hidden = false;
      return;
    }
    const made = report.madeFolders.length + report.madeFiles.length;
    reportBox.append(h("p", "world-report-head", made === 0 ? bw.nothingMade : bw.made(report.madeFolders.length, report.madeFiles.length)));
    if (report.existed.length > 0) {
      reportBox.append(h("p", "", bw.alreadyThere(report.existed.length)));
      reportBox.append(listOf(report.existed));
    }
    if (report.failed.length > 0) {
      reportBox.append(h("p", "", bw.refused(report.failed.length)));
      reportBox.append(listOf(report.failed.map((f) => `${f.path} — ${f.message}`)));
    }
    reportBox.hidden = false;
  };

  const confirmBox = h("div", "world-confirm");
  confirmBox.hidden = true;

  /** Write the plan and say what each command answered. */
  const execute = async (plan: Plan): Promise<void> => {
    confirmBox.hidden = true;
    form.hidden = false;
    submitBtn.disabled = true;
    submitBtn.textContent = t.worldWizard.creating;
    statusLine.textContent = bw.dryRun(plan.folders.length, plan.files.length);
    try {
      const report = await applyPlan(plan, {
        createFolder: (p) => commands.createFolder(p),
        createNote: (p, text) => commands.createNote(p, text),
        createFile: (p, b64) => commands.createFile(p, b64),
      });
      // The walk does not list an empty folder: the tree shows them open.
      for (const folder of report.madeFolders) openFolders.add(folder);
      await afterFileChange();
      const summary = report.madeFolders.length + report.madeFiles.length === 0 ? bw.nothingMade : bw.made(report.madeFolders.length, report.madeFiles.length);
      statusLine.textContent = summary;
      ui.status.textContent = summary;
      showReport(plan, report);
      if (!needsReading(report)) {
        const first = plan.files.find((f) => f.note && report.madeFiles.includes(f.path));
        if (first) openNote(first.path, false);
        hideWizard();
        return;
      }
    } catch (err) {
      statusLine.textContent = `${bw.nothingMade} ${err instanceof Error ? err.message : String(err)}`;
    }
    // Something was left alone or refused: the page stays, with the list.
    submitBtn.disabled = false;
    submitBtn.textContent = t.worldWizard.create;
    submitBtn.prepend(icon("plus"));
  };

  /** The tree, before anything is written (ADR 0098 item 15): every folder
   *  and file with a box to leave it out and a name to change. */
  const confirm = (plan: Plan): void => {
    type Row = { kind: "folder" | "note" | "file"; path: string; on: boolean; input: HTMLInputElement; box: HTMLInputElement; old: string };
    const rows: Row[] = [];
    const list = h("ul", "world-confirm-list");
    const add = (kind: Row["kind"], path: string): void => {
      const li = h("li", "world-confirm-row");
      const box = h("input");
      box.type = "checkbox";
      box.checked = true;
      box.setAttribute("aria-label", bw.include(path));
      const input = h("input", "world-input world-confirm-name");
      input.type = "text";
      input.value = path;
      input.setAttribute("aria-label", bw.rename(path));
      input.spellcheck = false;
      input.addEventListener("keydown", (e) => e.stopPropagation());
      li.append(box, h("span", "", kind === "folder" ? "📂" : "📄"), input);
      list.append(li);
      const row: Row = { kind, path, on: true, input, box, old: path };
      rows.push(row);
      box.addEventListener("change", () => {
        row.on = box.checked;
        // A folder takes what is inside it along; what is inside a folder left
        // out cannot be put back alone (its file would have no folder to go in).
        if (kind === "folder") for (const r of rows) if (r !== row && r.old.startsWith(`${row.old}/`)) { r.on = box.checked; r.box.checked = box.checked; r.box.disabled = !box.checked; }
      });
      input.addEventListener("change", () => {
        const next = input.value.trim().replace(/^\/+|\/+$/g, "");
        const was = row.old;
        row.old = next;
        input.value = next;
        // Renaming a folder renames the paths under it.
        if (kind === "folder") for (const r of rows) if (r !== row && r.old.startsWith(`${was}/`)) { r.old = `${next}${r.old.slice(was.length)}`; r.input.value = r.old; }
      });
    };
    for (const f of plan.folders) add("folder", f);
    for (const f of plan.files) add(f.note ? "note" : "file", f.path);

    const problems = h("ul", "world-preview-problems");
    problems.hidden = true;
    const back = h("button", "ghost", bw.confirmBack);
    back.type = "button";
    const go = h("button", "save world-submit-btn", bw.confirmCreate);
    go.type = "button";
    const actions = h("div", "world-actions");
    actions.append(back, go);
    const heading = h("h3", "world-confirm-title", bw.confirmTitle);
    heading.tabIndex = -1;
    confirmBox.replaceChildren(heading, h("p", "world-field-hint", bw.confirmHint), list, problems, actions);
    form.hidden = true;
    confirmBox.hidden = false;
    heading.focus();

    back.addEventListener("click", () => {
      confirmBox.hidden = true;
      form.hidden = false;
      nameInput.focus();
    });
    go.addEventListener("click", () => {
      const chosen = rows.filter((r) => r.on);
      const edited: Plan = {
        folders: chosen.filter((r) => r.kind === "folder").map((r) => r.old),
        files: chosen
          .filter((r) => r.kind !== "folder")
          .map((r) => {
            const original = plan.files.find((f) => f.path === r.path)!;
            const note = original.note;
            return { path: note && !/\.md$/i.test(r.old) ? `${r.old}.md` : r.old, text: original.text, note };
          }),
        problems: [],
      };
      if (edited.folders.length + edited.files.length === 0) {
        problems.replaceChildren(h("li", "", bw.nothingChosen));
        problems.hidden = false;
        return;
      }
      const bad = checkEdited(edited, bw);
      problems.replaceChildren(...bad.map((p) => h("li", "", bw.problemAt(p.at, p.message))));
      problems.hidden = bad.length === 0;
      if (bad.length > 0) return;
      void execute(edited);
    });
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleVal = nameInput.value.trim();
    if (!titleVal) {
      statusLine.textContent = bw.nameRequired;
      nameInput.focus();
      return;
    }
    reportBox.hidden = true;
    const plan = planBundle(chosen(), { target: folderInput.value, title: titleVal, now: new Date(), uuid: () => crypto.randomUUID(), words: bw, lang: isPt ? "pt-BR" : "en" });
    if (plan.problems.length > 0) {
      statusLine.textContent = bw.planRefused(plan.problems.length);
      showReport(plan, null);
      return;
    }
    confirm(plan);
  });

  host.append(form, confirmBox);
  return {
    add: (bundle) => {
      selected = bundle;
      drawCards();
    },
    say: (text) => {
      statusLine.textContent = text;
    },
  };
}

function renderAiTab(host: HTMLElement, onImported: (bundle: TemplateBundle) => Promise<void>): void {
  const container = h("div", "world-ai-container");
  const uid = ++ids;

  const intro = h("p", "world-ai-intro", bw.intro);

  const copyPromptBtn = h("button", "save world-copy-prompt-btn", t.worldWizard.copyPrompt);
  copyPromptBtn.type = "button";
  copyPromptBtn.prepend(icon("copy"));

  const copyStatus = h("span", "world-copy-status");
  copyStatus.setAttribute("role", "status");
  copyStatus.setAttribute("aria-live", "polite");

  copyPromptBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(systemPromptFor(LANG));
      copyStatus.textContent = t.worldWizard.promptCopied;
    } catch {
      copyStatus.textContent = bw.copyFailed;
    }
  });

  const promptActionRow = h("div", "world-prompt-action-row");
  promptActionRow.append(copyPromptBtn, copyStatus);

  const importLabel = h("label", "world-field-label", t.worldWizard.importLabel);
  const jsonArea = h("textarea", "world-json-input");
  jsonArea.id = `world-json-${uid}`;
  importLabel.htmlFor = jsonArea.id;
  jsonArea.rows = 8;
  jsonArea.maxLength = MAX_PASTE_BYTES;
  jsonArea.spellcheck = false;
  jsonArea.placeholder = t.worldWizard.importPlaceholder;

  const errorBox = h("div", "world-error-box");
  errorBox.setAttribute("role", "alert");
  errorBox.hidden = true;

  const copyFixBtn = h("button", "ghost world-copy-fix-btn", t.worldWizard.copyFixPrompt);
  copyFixBtn.type = "button";
  copyFixBtn.prepend(icon("copy"));
  copyFixBtn.hidden = true;

  let currentFixPrompt = "";
  copyFixBtn.addEventListener("click", async () => {
    if (!currentFixPrompt) return;
    try {
      await navigator.clipboard.writeText(currentFixPrompt);
      errorBox.textContent = t.worldWizard.fixPromptCopied;
    } catch {
      errorBox.textContent = bw.copyFailed;
    }
  });

  const importBtn = h("button", "save world-import-btn", t.worldWizard.validateAndImport);
  importBtn.type = "button";
  importBtn.prepend(icon("check"));

  let importing = false;
  importBtn.addEventListener("click", async () => {
    const raw = jsonArea.value.trim();
    if (!raw) return;

    errorBox.hidden = true;
    copyFixBtn.hidden = true;

    const validation = validateBundle(raw, bw);
    if (!validation.valid || !validation.bundle) {
      errorBox.hidden = false;
      errorBox.textContent = validation.error ?? bw.invalidJson("").error;
      if (validation.fixPrompt) {
        currentFixPrompt = validation.fixPrompt;
        copyFixBtn.hidden = false;
      }
      return;
    }
    // Not disabled while it works: a button that loses its focus takes
    // the keyboard (Esc) away from the dialog with it.
    if (importing) return;
    importing = true;
    try {
      await onImported(validation.bundle);
      jsonArea.value = "";
    } finally {
      importing = false;
    }
  });

  container.append(intro, promptActionRow, importLabel, jsonArea, errorBox, copyFixBtn, importBtn);
  host.append(container);
}
