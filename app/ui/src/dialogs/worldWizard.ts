// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { asDialog, closed, opened } from "./a11y";
import { afterFileChange } from "../changes";
import { currentPreset } from "../capabilities";
import { instantiateBundle } from "../bundles/instantiate";
import { BUILTIN_PRESETS } from "../bundles/presets";
import { BUNDLE_SYSTEM_PROMPT } from "../bundles/systemPrompt";
import { type TemplateBundle, validateBundle } from "../bundles/types";
import { h, ui } from "../dom";
import { openNote } from "../layout/spaces";
import { icon } from "../icons";
import { t } from "../strings";

let shade: HTMLElement | null = null;
const customBundles: TemplateBundle[] = [];

/** Filter available bundles according to the active preset (ADR 0098 / ADR 0103). */
function getAvailableBundles(): TemplateBundle[] {
  const preset = currentPreset();
  return [...customBundles, ...BUILTIN_PRESETS].filter((bundle) => {
    if (preset === "writing") return bundle.category === "writing" || bundle.category === "notes";
    if (preset === "worldbuilding") return bundle.category !== "rpg";
    return true;
  });
}

/** Open the World and Campaign Creation Wizard (ADR 0098). */
export function showWorldWizard(defaultFolder = ""): void {
  if (!shade) shade = build();
  populate(shade, defaultFolder);
  shade.hidden = false;
  opened(shade);
  const nameInput = shade.querySelector<HTMLInputElement>(".world-name-input");
  nameInput?.focus();
}

function build(): HTMLElement {
  const el = h("div", "confirm world-wizard-shade");
  el.hidden = true;
  const box = h("div", "confirm-box world-wizard-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  const titleId = "world-wizard-title";
  const header = h("div", "world-wizard-header");
  const title = h("h2", "world-wizard-title", t.worldWizard.title);
  title.id = titleId;
  title.prepend(icon("world"));

  const closeBtn = h("button", "ghost iconic world-wizard-close");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", t.close);
  closeBtn.append(icon("close"));
  header.append(title, closeBtn);

  const body = h("div", "world-wizard-body");
  box.append(header, body);
  el.append(box);
  document.body.append(el);

  const hide = () => {
    el.hidden = true;
    closed(el);
  };

  asDialog(el, t.worldWizard.title, hide, titleId);
  closeBtn.addEventListener("click", hide);
  el.addEventListener("mousedown", (e) => {
    if (e.target === el) hide();
  });

  return el;
}

function populate(dialog: HTMLElement, defaultFolder: string): void {
  const body = dialog.querySelector(".world-wizard-body")!;
  body.replaceChildren();

  // Tab Navigation
  let activeTab: "presets" | "ai" = "presets";
  const tabNav = h("div", "world-wizard-tabs");
  tabNav.setAttribute("role", "tablist");

  const presetsTabBtn = h("button", "world-tab-btn active", t.worldWizard.tabPresets);
  presetsTabBtn.type = "button";
  presetsTabBtn.setAttribute("role", "tab");
  presetsTabBtn.setAttribute("aria-selected", "true");

  const aiTabBtn = h("button", "world-tab-btn", t.worldWizard.tabAi);
  aiTabBtn.type = "button";
  aiTabBtn.setAttribute("role", "tab");
  aiTabBtn.setAttribute("aria-selected", "false");
  aiTabBtn.prepend(icon("sparkles"));

  tabNav.append(presetsTabBtn, aiTabBtn);

  const contentArea = h("div", "world-wizard-content");
  body.append(tabNav, contentArea);

  const initialAvailable = getAvailableBundles();
  let selectedBundle: TemplateBundle = initialAvailable[0] ?? BUILTIN_PRESETS[0]!;

  function render(): void {
    contentArea.replaceChildren();
    if (activeTab === "presets") {
      renderPresetsTab(contentArea, defaultFolder, selectedBundle, (bundle) => {
        selectedBundle = bundle;
        render();
      });
    } else {
      renderAiTab(contentArea, (newBundle) => {
        customBundles.unshift(newBundle);
        selectedBundle = newBundle;
        activeTab = "presets";
        presetsTabBtn.classList.add("active");
        presetsTabBtn.setAttribute("aria-selected", "true");
        aiTabBtn.classList.remove("active");
        aiTabBtn.setAttribute("aria-selected", "false");
        render();
      });
    }
  }

  presetsTabBtn.addEventListener("click", () => {
    if (activeTab === "presets") return;
    activeTab = "presets";
    presetsTabBtn.classList.add("active");
    presetsTabBtn.setAttribute("aria-selected", "true");
    aiTabBtn.classList.remove("active");
    aiTabBtn.setAttribute("aria-selected", "false");
    render();
  });

  aiTabBtn.addEventListener("click", () => {
    if (activeTab === "ai") return;
    activeTab = "ai";
    aiTabBtn.classList.add("active");
    aiTabBtn.setAttribute("aria-selected", "true");
    presetsTabBtn.classList.remove("active");
    presetsTabBtn.setAttribute("aria-selected", "false");
    render();
  });

  render();
}

function renderPresetsTab(
  host: HTMLElement,
  defaultFolder: string,
  selectedBundle: TemplateBundle,
  onSelect: (bundle: TemplateBundle) => void
): void {
  const form = h("form", "world-form");

  // 1. Name Field Row
  const nameRow = h("div", "world-form-row");
  const nameLabel = h("label", "world-field-label", t.worldWizard.nameLabel);
  const nameInput = h("input", "world-input world-name-input");
  nameInput.type = "text";
  nameInput.required = true;
  nameInput.placeholder = t.worldWizard.namePlaceholder;
  nameRow.append(nameLabel, nameInput);

  // 2. Destination Folder Field Row
  const folderRow = h("div", "world-form-row");
  const folderLabel = h("label", "world-field-label", t.worldWizard.folderLabel);
  const folderInput = h("input", "world-input world-folder-input");
  folderInput.type = "text";
  folderInput.value = defaultFolder;
  folderInput.placeholder = t.worldWizard.folderPlaceholder;
  const folderHint = h("span", "world-field-hint", t.worldWizard.folderHint);
  folderRow.append(folderLabel, folderInput, folderHint);

  // 3. Bundle Selector Cards Row
  const bundleRow = h("div", "world-form-row");
  const bundleLabel = h("div", "world-field-label", t.worldWizard.bundleLabel);
  const bundlesList = h("div", "world-bundles-grid");

  const allAvailable = getAvailableBundles();
  if (!allAvailable.some((b) => b.id === selectedBundle.id) && allAvailable.length > 0) {
    selectedBundle = allAvailable[0]!;
  }

  for (const bundle of allAvailable) {
    const isSelected = bundle.id === selectedBundle.id;
    const card = h("button", `world-bundle-card ${isSelected ? "selected" : ""}`);
    card.type = "button";
    const cardTitle = h("strong", "world-bundle-title", bundle.name);
    const cardDesc = h("p", "world-bundle-desc", bundle.description);
    card.append(cardTitle, cardDesc);
    card.addEventListener("click", () => onSelect(bundle));
    bundlesList.append(card);
  }
  bundleRow.append(bundleLabel, bundlesList);

  // 4. Bundle Preview Section
  const previewBox = h("div", "world-bundle-preview");
  const previewHeading = h("span", "world-preview-title", "Estrutura que será criada:");
  const projectSummary = h("p", "world-preview-root", `📁 Pasta principal: <Nome do mundo ou campanha>/`);
  const foldersSummary = h(
    "p",
    "world-preview-folders",
    `↳ 📂 ${selectedBundle.folders.length} Subpastas: ${selectedBundle.folders.join(", ")}`
  );
  const filesSummary = h(
    "p",
    "world-preview-files",
    `↳ 📄 ${selectedBundle.files.length} Notas modelo com propriedades e seções prontas.`
  );
  previewBox.append(previewHeading, projectSummary, foldersSummary, filesSummary);

  nameInput.addEventListener("input", () => {
    const val = nameInput.value.trim();
    projectSummary.textContent = `📁 Pasta principal: ${val || "<Nome do mundo ou campanha>"}/`;
  });

  // 5. Status & Submit Action Row
  const actionRow = h("div", "world-actions");
  const statusLine = h("div", "world-status-line");
  const submitBtn = h("button", "save world-submit-btn", t.worldWizard.create);
  submitBtn.type = "submit";
  submitBtn.prepend(icon("plus"));
  actionRow.append(statusLine, submitBtn);

  form.append(nameRow, folderRow, bundleRow, previewBox, actionRow);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleVal = nameInput.value.trim();
    if (!titleVal) return;

    submitBtn.setAttribute("disabled", "true");
    submitBtn.textContent = t.worldWizard.creating;

    try {
      const res = await instantiateBundle(folderInput.value.trim(), titleVal, selectedBundle);
      afterFileChange();
      statusLine.textContent = t.worldWizard.created(res.createdFolders, res.createdFiles);
      if (res.firstFilePath) {
        openNote(res.firstFilePath, false);
      }
      setTimeout(() => {
        if (shade) {
          shade.hidden = true;
          closed(shade);
        }
      }, 700);
    } catch (err) {
      statusLine.textContent = `Erro ao criar: ${err}`;
      submitBtn.removeAttribute("disabled");
      submitBtn.textContent = t.worldWizard.create;
    }
  });

  host.append(form);
}

function renderAiTab(host: HTMLElement, onImported: (bundle: TemplateBundle) => void): void {
  const container = h("div", "world-ai-container");

  const intro = h(
    "p",
    "world-ai-intro",
    "Copie o prompt arquiteto abaixo e cole no Claude, ChatGPT ou Gemini. A IA fará perguntas para entender sua campanha/mundo e devolverá um JSON no padrão do Verso."
  );

  // Copy Prompt Button
  const copyPromptBtn = h("button", "save world-copy-prompt-btn", t.worldWizard.copyPrompt);
  copyPromptBtn.type = "button";
  copyPromptBtn.prepend(icon("copy"));

  const copyStatus = h("span", "world-copy-status");

  copyPromptBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(BUNDLE_SYSTEM_PROMPT);
      copyStatus.textContent = t.worldWizard.promptCopied;
    } catch {
      copyStatus.textContent = "Não foi possível copiar automaticamente.";
    }
  });

  const promptActionRow = h("div", "world-prompt-action-row");
  promptActionRow.append(copyPromptBtn, copyStatus);

  // Import Section
  const importLabel = h("label", "world-field-label", t.worldWizard.importLabel);
  const jsonArea = h("textarea", "world-json-input");
  jsonArea.rows = 8;
  jsonArea.placeholder = t.worldWizard.importPlaceholder;

  const errorBox = h("div", "world-error-box");
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
    } catch {}
  });

  const importBtn = h("button", "save world-import-btn", t.worldWizard.validateAndImport);
  importBtn.type = "button";
  importBtn.prepend(icon("check"));

  importBtn.addEventListener("click", () => {
    const raw = jsonArea.value.trim();
    if (!raw) return;

    errorBox.hidden = true;
    copyFixBtn.hidden = true;

    // Remove markdown codeblock fence if pasted
    let cleanJson = raw;
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    }

    try {
      const parsed = JSON.parse(cleanJson);
      const validation = validateBundle(parsed);
      if (!validation.valid || !validation.bundle) {
        errorBox.hidden = false;
        errorBox.textContent = validation.error ?? "JSON inválido";
        if (validation.fixPrompt) {
          currentFixPrompt = validation.fixPrompt;
          copyFixBtn.hidden = false;
        }
        return;
      }

      onImported(validation.bundle);
      ui.status.textContent = t.worldWizard.importSuccess(validation.bundle.name);
    } catch (parseErr) {
      errorBox.hidden = false;
      errorBox.textContent = `Erro de sintaxe JSON: ${(parseErr as Error).message}`;
      currentFixPrompt =
        `O Verso não conseguiu fazer o parse do JSON:\n"${(parseErr as Error).message}"\n\nPor favor, corrija o formato e devolva estritamente o JSON válido.`;
      copyFixBtn.hidden = false;
    }
  });

  container.append(
    intro,
    promptActionRow,
    importLabel,
    jsonArea,
    errorBox,
    copyFixBtn,
    importBtn
  );

  host.append(container);
}
