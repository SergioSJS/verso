// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The embedded terminal (ADR 0115 item 5): a shell of this computer in a
//! tab. What crosses is a size, an opaque id, the text the shell prints and
//! the keys typed — never a path (ADR 0026 rule 4): the host forms the
//! folder's directory on its side and hands it to the operating system
//! only. A folder below the root is named by its path relative to the open
//! folder, as every entry is.

use serde::{Deserialize, Serialize};
use specta::Type;

/// One terminal of this app, as the window names it: opaque, unique for the
/// app's run, so that a layout brought back after a restart never names a
/// terminal of another run.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub struct TerminalId(pub String);

/// The terminal's size in character cells.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TerminalSize {
    pub cols: u16,
    pub rows: u16,
}

/// Where the shell started (ADR 0115, Q4 decided 2026-10-31): in the
/// folder of this computer the window shows — a synced one included, it is
/// files on this disk (ADR 0079) — or, for a server's folder with no copy
/// here, in the person's home directory, which the window says in a line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum TerminalAt {
    Folder,
    Home,
}

/// The shell to start on Windows (ADR 0115, Q7 decided 2026-10-31):
/// PowerShell — `pwsh.exe` when found, else `powershell.exe` — or the
/// Command Prompt, chosen in Settings › Terminal and agents. Elsewhere the
/// person's `$SHELL` is started whatever this says.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum TerminalShell {
    #[serde(rename = "powershell")]
    PowerShell,
    Cmd,
}

/// The AI command-line tools the terminal offers to start (ADR 0115 item
/// 14, Q3 decided 2026-10-31; OpenCode and Cursor's CLI added by the
/// maintainer the same day), each by the command its maker installs. A
/// fixed list: the window names one, the host knows the word. A tool more
/// is a variant here, its word and page in the host (`pty::cli_word`,
/// `terminal::install_page`) and its name in the window's strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AiCli {
    /// Claude Code, `claude`.
    Claude,
    /// Gemini CLI, `gemini`.
    Gemini,
    /// Codex, `codex`.
    Codex,
    /// Antigravity's CLI, `agy`.
    Antigravity,
    /// OpenCode, `opencode`.
    #[serde(rename = "opencode")]
    OpenCode,
    /// Cursor's CLI, `cursor-agent`.
    CursorAgent,
}

/// Whether the person's login shell finds an AI command-line tool (ADR 0115
/// item 14): asked on a click, never at start.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AiCliFound {
    pub cli: AiCli,
    pub found: bool,
}

/// How the window asks a terminal to start (ADR 0115 items 4, 5 and 14).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TerminalStart {
    pub size: TerminalSize,
    /// A folder below the open one, relative to it ("Open terminal here");
    /// none is the folder's root (Q2).
    pub folder: Option<String>,
    /// An AI tool to start in it, its command typed in once the shell runs.
    pub cli: Option<AiCli>,
    /// Windows: which shell (Q7); none is PowerShell.
    pub shell: Option<TerminalShell>,
    /// The system's language as the window has it (`pt-BR`), for `LANG`
    /// where the app was started without one.
    pub locale: Option<String>,
}

/// A terminal started or found again after a reload of the window.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TerminalOpened {
    pub id: TerminalId,
    pub at: TerminalAt,
    /// The shell's program name, for the tab (`zsh`, `pwsh`): a name, never
    /// its path.
    pub shell: String,
}

/// What a terminal sends the window on its channel: the text the shell
/// printed (UTF-8, never a character cut between two messages), or its end,
/// with the exit code when the system gave one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalOutput {
    Data { text: String },
    Ended { code: Option<u32> },
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The AI tools cross as the window's words (ADR 0115 item 14 and its
    /// amendment of 2026-10-31: OpenCode and Cursor's CLI added).
    #[test]
    fn the_ai_tools_cross_by_their_words() {
        let words: Vec<String> = [
            AiCli::Claude,
            AiCli::Gemini,
            AiCli::Codex,
            AiCli::Antigravity,
            AiCli::OpenCode,
            AiCli::CursorAgent,
        ]
        .iter()
        .filter_map(|c| serde_json::to_string(c).ok())
        .collect();
        assert_eq!(
            words,
            [
                "\"claude\"",
                "\"gemini\"",
                "\"codex\"",
                "\"antigravity\"",
                "\"opencode\"",
                "\"cursor_agent\""
            ]
        );
        let back: Result<AiCli, _> = serde_json::from_str("\"cursor_agent\"");
        assert_eq!(back.ok(), Some(AiCli::CursorAgent));
    }
}
