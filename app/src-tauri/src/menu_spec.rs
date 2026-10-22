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
pub(crate) const COMMAND_PREFIX: &str = "verso-cmd-";

/// The host's own items, whose behaviour lives in `lib.rs`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Own {
    NewWindow,
    OpenFolder,
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
        ("go", true) => "Ir",
        ("go", false) => "Go",
        ("rpg", _) => "RPG",
        ("help", true) => "Ajuda",
        ("help", false) => "Help",
        _ => "",
    }
}

/// A command's label in the menu, in the window's language; empty for an
/// id the table does not know (a test catches that).
pub(crate) fn label(lang: &str, command: &str) -> &'static str {
    LABELS
        .iter()
        .find(|(id, _, _)| *id == command)
        .map_or("", |(_, pt, en)| if lang == "en" { en } else { pt })
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
pub(crate) fn item_id(command: &str) -> String {
    format!("{COMMAND_PREFIX}{command}")
}

/// Whether a command's item is enabled: before the window says anything,
/// every one is.
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

    #[test]
    fn a_command_not_enabled_is_disabled_and_before_any_word_all_are_enabled() {
        let mut s = MenuState::default();
        assert!(is_enabled(&s, "save"));
        s.enabled = Some(["quick".to_owned()].into_iter().collect());
        assert!(is_enabled(&s, "quick"));
        assert!(!is_enabled(&s, "save"));
    }
}
