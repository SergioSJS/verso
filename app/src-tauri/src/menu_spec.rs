//! What the native menu holds, as data: which items, in which menu, under
//! which feature switch, in which words. `menu.rs` builds the bar from it;
//! the tests here read it without a window. Every item that is not one of
//! the host's own (quit, open folder, the edit commands…) carries the id of
//! a command of the window's registry (`app/ui/src/keys.ts`): a click is
//! sent to the window, which runs that command — the palette's own, so no
//! logic is written twice.

#[cfg(test)]
use std::collections::HashSet;

use crate::MenuState;

/// The prefix of an item whose id names a command of the window.
#[cfg(target_os = "macos")]
pub(crate) const COMMAND_PREFIX: &str = "verso-cmd-";

/// The host's own items, whose behaviour lives in `lib.rs`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Own {
    NewWindow,
    OpenFolder,
    OpenFile,
    OpenRecent,
    CloseTab,
    CloseWindow,
    Undo,
    Redo,
    SelectAll,
    Devtools,
}

/// The system's own items.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum System {
    Cut,
    Copy,
    Paste,
    Fullscreen,
    Minimize,
    Maximize,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Row {
    Sep,
    Own(Own),
    System(System),
    /// A command of the window; the feature switch (ADR 0103) that must
    /// be on for the item to show, if it has one.
    Command(&'static str, Option<&'static str>),
}

use Row::{Command as C, Own as O, Sep, System as S};

const fn c(id: &'static str) -> Row {
    C(id, None)
}
const fn f(id: &'static str, feature: &'static str) -> Row {
    C(id, Some(feature))
}

/// The menus after the app's own, in the bar's order: the key of the
/// title (a word in `title`) and the rows.
pub(crate) fn sections() -> Vec<(&'static str, Vec<Row>)> {
    vec![
        (
            "file",
            vec![
                c("new-note"),
                c("new-note-named"),
                c("new-folder"),
                c("new-board"),
                c("new-base"),
                c("new-web-page"),
                O(Own::NewWindow),
                Sep,
                O(Own::OpenFolder),
                O(Own::OpenFile),
                O(Own::OpenRecent),
                c("import-files"),
                c("open-sync"),
                Sep,
                c("save"),
                c("rename"),
                c("move-file"),
                c("save-template"),
                c("version-history"),
                c("open-trash"),
                Sep,
                O(Own::CloseTab),
                O(Own::CloseWindow),
            ],
        ),
        (
            "edit",
            vec![
                O(Own::Undo),
                O(Own::Redo),
                Sep,
                S(System::Cut),
                S(System::Copy),
                S(System::Paste),
                O(Own::SelectAll),
                Sep,
                c("find-in-note"),
                c("replace"),
                c("search"),
                Sep,
                c("add-property"),
                c("insert-template"),
                c("insert-base"),
            ],
        ),
        (
            "view",
            vec![
                c("toggle-mode"),
                c("source"),
                Sep,
                c("toggle-side"),
                c("toggle-right"),
                c("hide-tabs"),
                c("vertical-tabs"),
                Sep,
                c("split-right"),
                c("split-down"),
                c("maximize"),
                c("new-space"),
                Sep,
                c("zoom-in"),
                c("zoom-out"),
                c("zoom-reset"),
                Sep,
                c("graph-note"),
                c("graph-vault"),
                c("diagram-save-board"),
                c("fold-all-headings"),
                c("unfold-all-headings"),
                c("collapse-all"),
                Sep,
                c("settings-appearance"),
                c("more-themes"),
                Sep,
                S(System::Fullscreen),
                c("reload-window"),
                O(Own::Devtools),
            ],
        ),
        (
            "go",
            vec![
                c("nav-back"),
                c("nav-forward"),
                Sep,
                c("quick"),
                c("palette"),
                c("daily"),
                c("switch-focus"),
                Sep,
                c("reopen"),
                c("prev-tab"),
                c("next-tab"),
            ],
        ),
        (
            "rpg",
            vec![
                f("roll-dice", "diceRolling"),
                f("ask-oracle", "oracles"),
                f("world-wizard", "campaignBundles"),
                Sep,
                // Always there: with a switch off, its page says so and
                // offers to turn it on (ADR 0103 item 5).
                c("settings-rpg"),
            ],
        ),
        ("window", vec![S(System::Minimize), S(System::Maximize)]),
        (
            "help",
            vec![
                c("notifications"),
                c("import-demo-vault"),
                c("check-updates"),
                c("report-bug"),
                c("open-credits"),
            ],
        ),
    ]
}

/// A command's words in the menu: Portuguese, then English.
const LABELS: &[(&str, &str, &str)] = &[
    ("new-note", "Nova nota", "New Note"),
    (
        "new-note-named",
        "Nova nota com nome…",
        "New Note with Name…",
    ),
    ("new-folder", "Nova pasta", "New Folder"),
    ("new-board", "Novo board", "New Board"),
    ("new-base", "Nova base", "New Base"),
    ("new-web-page", "Nova página web…", "New Web Page…"),
    ("import-files", "Importar arquivos…", "Import Files…"),
    ("open-sync", "Sincronizar com…", "Sync with…"),
    ("save", "Salvar", "Save"),
    ("rename", "Renomear…", "Rename…"),
    ("move-file", "Mover para…", "Move To…"),
    (
        "save-template",
        "Salvar como template…",
        "Save as Template…",
    ),
    (
        "version-history",
        "Histórico de versões…",
        "Version History…",
    ),
    ("open-trash", "Lixeira…", "Trash…"),
    ("find-in-note", "Buscar na nota…", "Find in Note…"),
    ("replace", "Substituir…", "Replace…"),
    ("search", "Buscar nas notas", "Search Notes"),
    ("add-property", "Adicionar propriedade", "Add Property"),
    ("insert-template", "Inserir template…", "Insert Template…"),
    ("insert-base", "Inserir base…", "Insert Base…"),
    (
        "toggle-mode",
        "Alternar leitura / edição",
        "Toggle Reading / Editing",
    ),
    ("source", "Modo fonte", "Source Mode"),
    ("toggle-side", "Painel esquerdo", "Left Panel"),
    ("toggle-right", "Painel direito", "Right Panel"),
    ("hide-tabs", "Barra de abas", "Tab Bar"),
    ("vertical-tabs", "Abas verticais", "Vertical Tabs"),
    ("split-right", "Dividir à direita", "Split Right"),
    ("split-down", "Dividir abaixo", "Split Down"),
    ("maximize", "Maximizar painel", "Maximize Pane"),
    ("new-space", "Novo espaço de trabalho", "New Workspace"),
    ("zoom-in", "Aumentar zoom", "Zoom In"),
    ("zoom-out", "Diminuir zoom", "Zoom Out"),
    ("zoom-reset", "Zoom real (100%)", "Actual Size"),
    ("graph-note", "Grafo da nota", "Note Graph"),
    ("graph-vault", "Grafo da pasta", "Folder Graph"),
    (
        "diagram-save-board",
        "Salvar diagrama como board",
        "Save Diagram as Board",
    ),
    (
        "fold-all-headings",
        "Dobrar todos os títulos",
        "Fold All Headings",
    ),
    (
        "unfold-all-headings",
        "Desdobrar todos os títulos",
        "Unfold All Headings",
    ),
    (
        "collapse-all",
        "Recolher todas as pastas",
        "Collapse All Folders",
    ),
    (
        "settings-appearance",
        "Aparência e temas…",
        "Appearance and Themes…",
    ),
    ("more-themes", "Mais temas…", "More Themes…"),
    ("reload-window", "Recarregar a janela", "Reload Window"),
    ("nav-back", "Voltar", "Back"),
    ("nav-forward", "Avançar", "Forward"),
    ("quick", "Abrir nota…", "Quick Open…"),
    ("palette", "Paleta de comandos…", "Command Palette…"),
    ("daily", "Nota diária", "Daily Note"),
    ("switch-focus", "Trocar foco…", "Switch Focus…"),
    ("reopen", "Reabrir aba fechada", "Reopen Closed Tab"),
    ("prev-tab", "Aba anterior", "Previous Tab"),
    ("next-tab", "Próxima aba", "Next Tab"),
    ("roll-dice", "Rolar dados…", "Roll Dice…"),
    ("ask-oracle", "Perguntar ao oráculo", "Ask the Oracle"),
    (
        "world-wizard",
        "Novo projeto a partir de modelo…",
        "New Project from Template…",
    ),
    (
        "settings-rpg",
        "Ajustes de Dados e RPG…",
        "Dice and RPG Settings…",
    ),
    ("notifications", "Notificações", "Notifications"),
    (
        "import-demo-vault",
        "Importar o tutorial…",
        "Import the Tutorial…",
    ),
    (
        "check-updates",
        "Verificar atualizações…",
        "Check for Updates…",
    ),
    ("report-bug", "Relatar um problema…", "Report a Problem…"),
    ("open-credits", "Créditos…", "Credits…"),
];

/// The titles of the menus in this file's list.
pub(crate) fn title(lang: &str, key: &str) -> &'static str {
    let pt = lang != "en";
    match (key, pt) {
        ("file", true) => "Arquivo",
        ("file", false) => "File",
        ("edit", true) => "Edição",
        ("edit", false) => "Edit",
        ("view", true) => "Visualização",
        ("view", false) => "View",
        ("go", true) => "Ir",
        ("go", false) => "Go",
        ("rpg", _) => "RPG",
        ("window", true) => "Janela",
        ("window", false) => "Window",
        ("help", true) => "Ajuda",
        ("help", false) => "Help",
        _ => "",
    }
}

/// The key that opens a menu with Alt on Windows and Linux (the letter
/// underlined in its title), per language. None repeats within a language,
/// and none is a letter the window binds with Alt alone (keys.ts binds
/// only Alt-Enter and combinations with Mod).
pub(crate) fn mnemonic(lang: &str, key: &str) -> &'static str {
    let pt = lang != "en";
    match (key, pt) {
        ("file", true) => "a",
        ("file", false) => "f",
        ("edit", _) => "e",
        ("view", _) => "v",
        ("go", true) => "i",
        ("go", false) => "g",
        ("rpg", _) => "r",
        ("window", true) => "j",
        ("window", false) => "w",
        ("help", true) => "u",
        ("help", false) => "h",
        _ => "",
    }
}

/// The words of the host's own and the system's items, and of the app
/// menu's, in the window's language ("pt" is the default, as the product's;
/// ADR 0035). The macOS bar keeps the system's own words for the
/// predefined items; the in-window menu of Windows and Linux uses these.
pub(crate) fn word(lang: &str, key: &str) -> &'static str {
    let (pt, en) = match key {
        "quit" => ("Encerrar o Verso", "Quit Verso"),
        "settings" => ("Ajustes…", "Settings…"),
        "new-window" => ("Nova janela", "New Window"),
        "open-folder" => ("Abrir pasta…", "Open Folder…"),
        "open-file" => ("Abrir arquivo…", "Open File…"),
        "open-recent" => ("Abrir recente", "Open Recent"),
        "close-tab" => ("Fechar aba", "Close Tab"),
        "close-window" => ("Fechar janela", "Close Window"),
        "undo" => ("Desfazer", "Undo"),
        "redo" => ("Refazer", "Redo"),
        "select-all" => ("Selecionar tudo", "Select All"),
        "cut" => ("Recortar", "Cut"),
        "copy" => ("Copiar", "Copy"),
        "paste" => ("Colar", "Paste"),
        "fullscreen" => ("Tela cheia", "Full Screen"),
        "minimize" => ("Minimizar", "Minimize"),
        "maximize" => ("Maximizar", "Maximize"),
        "devtools" => ("Abrir console", "Open Console"),
        _ => ("", ""),
    };
    if lang == "en" { en } else { pt }
}

/// A command's label in the menu, in the window's language; empty for an
/// id the table does not know (a test catches that).
pub(crate) fn label(lang: &str, command: &str) -> &'static str {
    LABELS
        .iter()
        .find(|(id, _, _)| *id == command)
        .map_or("", |(_, pt, en)| if lang == "en" { en } else { pt })
}

/// One row of a menu, as the window gets it (Windows and Linux draw the
/// menu inside the window; macOS has the native bar and never asks).
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, specta::Type)]
pub(crate) struct MenuEntry {
    /// "sep", "command" (a command of the window's registry, `id`), "own"
    /// (the host's own, run by the window: `id` names the action) or
    /// "system" (an editing or window action of the web view).
    pub(crate) kind: String,
    pub(crate) id: String,
    pub(crate) label: String,
    /// The feature switch (ADR 0103) that must be on for the row to show.
    pub(crate) feature: Option<String>,
    /// The fixed key of an own or system row, as the window writes it
    /// (`Mod-z`); a command's key is the window's, as bound now.
    pub(crate) key: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, specta::Type)]
pub(crate) struct MenuSection {
    pub(crate) key: String,
    pub(crate) title: String,
    /// The letter that opens it with Alt.
    pub(crate) mnemonic: String,
    pub(crate) items: Vec<MenuEntry>,
}

fn entry(kind: &str, id: &str, label: &str, feature: Option<&str>, key: Option<&str>) -> MenuEntry {
    MenuEntry {
        kind: kind.to_owned(),
        id: id.to_owned(),
        label: label.to_owned(),
        feature: feature.map(str::to_owned),
        key: key.map(str::to_owned),
    }
}

fn own_id(own: Own) -> (&'static str, Option<&'static str>) {
    match own {
        Own::NewWindow => ("new-window", None),
        Own::OpenFolder => ("open-folder", None),
        Own::OpenFile => ("open-file", None),
        Own::OpenRecent => ("open-recent", None),
        Own::CloseTab => ("close-tab", None),
        Own::CloseWindow => ("close-window", None),
        Own::Undo => ("undo", Some("Mod-z")),
        Own::Redo => ("redo", Some("Mod-Shift-z")),
        Own::SelectAll => ("select-all", Some("Mod-a")),
        Own::Devtools => ("devtools", None),
    }
}

fn system_id(system: System) -> (&'static str, Option<&'static str>) {
    match system {
        System::Cut => ("cut", Some("Mod-x")),
        System::Copy => ("copy", Some("Mod-c")),
        System::Paste => ("paste", Some("Mod-v")),
        System::Fullscreen => ("fullscreen", None),
        System::Minimize => ("minimize", None),
        System::Maximize => ("maximize", None),
    }
}

/// The menus as the window of Windows and Linux draws them: the Mac bar's
/// menus (`sections`), every row with its words, and — where Windows and
/// Linux users look for them — Settings… and Quit at the end of File (the
/// Mac has them in the app menu, which is not here). The rows whose feature
/// is off, and the separators left alone, are dropped by `visible`, as for
/// the bar; the window greys the rows the palette cannot run.
pub(crate) fn window_menu(lang: &str, state: &MenuState) -> Vec<MenuSection> {
    sections()
        .into_iter()
        .map(|(key, rows)| {
            let mut items: Vec<MenuEntry> = visible(&rows, state)
                .into_iter()
                .map(|row| match row {
                    Row::Sep => entry("sep", "", "", None, None),
                    Row::Own(own) => {
                        let (id, k) = own_id(own);
                        entry("own", id, word(lang, id), None, k)
                    }
                    Row::System(system) => {
                        let (id, k) = system_id(system);
                        entry("system", id, word(lang, id), None, k)
                    }
                    Row::Command(id, feature) => {
                        entry("command", id, label(lang, id), feature, None)
                    }
                })
                .collect();
            if key == "file" {
                if items.last().is_some_and(|i| i.kind != "sep") {
                    items.push(entry("sep", "", "", None, None));
                }
                items.push(entry("own", "settings", word(lang, "settings"), None, None));
                items.push(entry("own", "quit", word(lang, "quit"), None, None));
            }
            MenuSection {
                key: key.to_owned(),
                title: title(lang, key).to_owned(),
                mnemonic: mnemonic(lang, key).to_owned(),
                items,
            }
        })
        .collect()
}

/// What a menu shows now: the rows whose feature is off dropped, and the
/// separators left with nothing between them (or at an end) dropped too.
pub(crate) fn visible(rows: &[Row], state: &MenuState) -> Vec<Row> {
    let mut out: Vec<Row> = Vec::new();
    for row in rows {
        if let Row::Command(_, Some(feature)) = row
            && !state.features.contains(*feature)
        {
            continue;
        }
        if *row == Row::Sep && matches!(out.last(), None | Some(Row::Sep)) {
            continue;
        }
        out.push(*row);
    }
    while out.last() == Some(&Row::Sep) {
        out.pop();
    }
    out
}

/// The id a command's item has in the bar.
#[cfg(target_os = "macos")]
pub(crate) fn item_id(command: &str) -> String {
    format!("{COMMAND_PREFIX}{command}")
}

/// Whether a command's item is enabled: before the window says anything,
/// every one is.
#[cfg(target_os = "macos")]
pub(crate) fn is_enabled(state: &MenuState, command: &str) -> bool {
    state
        .enabled
        .as_ref()
        .is_none_or(|set| set.contains(command))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_on() -> MenuState {
        MenuState {
            features: ["diceRolling", "oracles", "campaignBundles"]
                .iter()
                .map(|s| (*s).to_owned())
                .collect(),
            ..MenuState::default()
        }
    }

    fn commands(key: &str, state: &MenuState) -> Vec<&'static str> {
        let rows = sections()
            .into_iter()
            .find(|(k, _)| *k == key)
            .map(|(_, r)| r)
            .unwrap_or_default();
        visible(&rows, state)
            .into_iter()
            .filter_map(|r| match r {
                Row::Command(id, _) => Some(id),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn the_new_features_are_in_the_menus() {
        let s = all_on();
        assert!(commands("rpg", &s).contains(&"roll-dice"));
        assert!(commands("rpg", &s).contains(&"ask-oracle"));
        assert!(commands("rpg", &s).contains(&"world-wizard"));
        assert!(commands("file", &s).contains(&"open-sync"));
        assert!(commands("file", &s).contains(&"import-files"));
        assert!(commands("view", &s).contains(&"zoom-in"));
        assert!(commands("view", &s).contains(&"more-themes"));
        assert!(commands("view", &s).contains(&"vertical-tabs"));
        assert!(commands("help", &s).contains(&"report-bug"));
        assert!(commands("help", &s).contains(&"import-demo-vault"));
    }

    #[test]
    fn a_feature_that_is_off_has_no_item_but_its_settings_stay() {
        let off = MenuState::default();
        let rpg = commands("rpg", &off);
        assert_eq!(rpg, vec!["settings-rpg"]);
        let mut one = MenuState::default();
        one.features.insert("oracles".to_owned());
        assert_eq!(commands("rpg", &one), vec!["ask-oracle", "settings-rpg"]);
    }

    #[test]
    fn no_separator_is_left_at_an_end_or_doubled() {
        for state in [MenuState::default(), all_on()] {
            for (_, rows) in sections() {
                let rows = visible(&rows, &state);
                assert_ne!(rows.first(), Some(&Row::Sep));
                assert_ne!(rows.last(), Some(&Row::Sep));
                assert!(rows.windows(2).all(|w| w != [Row::Sep, Row::Sep]));
            }
        }
    }

    #[test]
    fn every_command_has_both_labels_and_is_in_one_menu_only() {
        let mut seen = HashSet::new();
        for (_, rows) in sections() {
            for row in rows {
                if let Row::Command(id, _) = row {
                    assert!(seen.insert(id), "{id} is in two places");
                    assert!(!label("pt", id).is_empty(), "{id} has no Portuguese label");
                    assert!(!label("en", id).is_empty(), "{id} has no English label");
                    assert_ne!(label("pt", id), label("en", id), "{id} is not translated");
                }
            }
        }
        // A label for a command no menu holds is a leftover.
        for (id, _, _) in LABELS {
            assert!(seen.contains(id), "{id} has a label and no place");
        }
    }

    #[test]
    fn the_titles_follow_the_language() {
        assert_eq!(title("pt", "go"), "Ir");
        assert_eq!(title("en", "go"), "Go");
        assert_eq!(title("pt", "help"), "Ajuda");
        assert_eq!(title("en", "help"), "Help");
        assert_eq!(label("pt", "roll-dice"), "Rolar dados…");
        assert_eq!(label("en", "roll-dice"), "Roll Dice…");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_command_not_enabled_is_disabled_and_before_any_word_all_are_enabled() {
        let mut s = MenuState::default();
        assert!(is_enabled(&s, "save"));
        s.enabled = Some(["quick".to_owned()].into_iter().collect());
        assert!(is_enabled(&s, "quick"));
        assert!(!is_enabled(&s, "save"));
    }

    #[test]
    fn every_menu_has_a_title_and_its_own_mnemonic_in_both_languages() {
        for lang in ["pt", "en"] {
            let mut seen = HashSet::new();
            for section in window_menu(lang, &all_on()) {
                assert!(!section.title.is_empty(), "{lang} {}", section.key);
                assert_eq!(section.mnemonic.len(), 1, "{lang} {}", section.key);
                assert!(
                    section.title.to_lowercase().contains(&section.mnemonic),
                    "{lang}: the {} menu's letter is not in its title",
                    section.key
                );
                assert!(seen.insert(section.mnemonic), "{lang}: a letter twice");
                for item in section.items {
                    if item.kind != "sep" {
                        assert!(!item.label.is_empty(), "{} has no {lang} label", item.id);
                    }
                }
            }
        }
    }

    #[test]
    fn the_window_menu_has_the_bars_menus_and_settings_and_quit_in_file() {
        let menu = window_menu("en", &all_on());
        let keys: Vec<_> = menu.iter().map(|s| s.key.as_str()).collect();
        let bar: Vec<_> = sections().iter().map(|(k, _)| *k).collect();
        assert_eq!(keys, bar);
        let file: Vec<_> = menu[0].items.iter().map(|i| i.id.as_str()).collect();
        assert_eq!(&file[file.len() - 3..], ["", "settings", "quit"]);
        let rpg = menu.iter().find(|s| s.key == "rpg").map(|s| &s.items);
        let dice = rpg.and_then(|r| r.iter().find(|i| i.id == "roll-dice"));
        assert_eq!(dice.and_then(|i| i.feature.as_deref()), Some("diceRolling"));
        // A feature that is off has no row, as in the bar.
        let off = window_menu("en", &MenuState::default());
        let rpg_off: Vec<_> = off
            .iter()
            .find(|s| s.key == "rpg")
            .map(|s| s.items.iter().map(|i| i.id.as_str()).collect())
            .unwrap_or_default();
        assert_eq!(rpg_off, vec!["settings-rpg"]);
    }

    /// The browser harness has no host: it reads this file. It is the
    /// spec as the host exposes it, so a change of the spec fails here
    /// until the file is written again (`scripts/menu-spec.sh`). The
    /// file comes in at compile time and the script writes it from what
    /// this test prints: no `std::fs` in the app's crate (ADR 0029).
    #[test]
    fn the_harness_has_the_spec_the_host_exposes() {
        let have = include_str!("../../ui/src/harness/menuSpec.json");
        let now = serde_json::to_string_pretty(&serde_json::json!({
            "pt": window_menu("pt", &all_on()),
            "en": window_menu("en", &all_on()),
        }))
        .unwrap_or_default()
            + "\n";
        if std::env::var_os("VERSO_PRINT_MENU_SPEC").is_some() {
            println!("<<<menu-spec\n{now}menu-spec>>>");
            return;
        }
        assert_eq!(
            have, now,
            "app/ui/src/harness/menuSpec.json is stale: scripts/menu-spec.sh"
        );
    }
}
