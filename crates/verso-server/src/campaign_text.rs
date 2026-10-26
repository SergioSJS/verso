// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Links to notes a player may not see yet (ADR 0110 item 7, MC.4 = B):
//! the text a player is served has no link to a hidden note.
//!
//! - A wikilink `[[Name#Heading|alias]]` to a hidden note becomes plain
//!   text with a lock: the alias when there is one, else the name as the
//!   game master wrote it (its last part only: never a folder, a heading
//!   or a block id), then ` 🔒`. It is not a link: it leads nowhere.
//! - A note marked "secret name" is drawn [`REDACTED`] whatever was
//!   written: four blocks, always, so the length says nothing.
//! - An embed `![[Name]]` of a hidden note, or an image or a link
//!   `![](x.png)` / `[t](x.md)` to a hidden file, becomes a locked
//!   placeholder in the player's language.
//!
//! Pure: no IO. What a target reaches is the caller's (`resolve`): the
//! same text is scanned in the body and in the frontmatter, in code too
//! (fails closed: a name in a code block is still a name).

/// How a link to a note whose name is a secret is drawn.
pub const REDACTED: &str = "▒▒▒▒";
/// The lock that ends a link to a hidden note.
pub const LOCK: &str = "🔒";

/// What a target reaches, as the player is concerned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fate {
    /// Something the player may see, or nothing at all: left as written.
    Open,
    /// A hidden note: its text with a lock.
    Locked,
    /// A hidden note whose name is a secret.
    SecretName,
}

/// The placeholder of a locked embed or image, by language.
#[must_use]
pub fn placeholder(lang: &str) -> String {
    if lang.starts_with("pt") {
        format!("{LOCK} (ainda não revelado)")
    } else {
        format!("{LOCK} (not revealed yet)")
    }
}

/// The words of a locked card on a board, for a player who does not see its
/// file: the one text every locked card has, whether the file is hidden, hidden
/// with a secret name, or not there at all (a card never says which). Both
/// ways a player is served a board use it (`campaign_serve`,
/// `collab_players::Locks`).
#[must_use]
pub fn locked_card(lang: &str) -> String {
    placeholder(lang)
}

/// The parts of `target#heading|alias`: (target, alias).
fn split(inner: &str) -> (&str, Option<&str>) {
    let (before, alias) = match inner.split_once('|') {
        Some((b, a)) => (b, Some(a)),
        None => (inner, None),
    };
    let target = before.split_once('#').map_or(before, |(t, _)| t);
    (target, alias)
}

/// What the game master wrote of a name, as far as it is the note's name:
/// the last part of the path, without its `.md`.
fn shown_name(target: &str) -> &str {
    let last = target.rsplit('/').next().unwrap_or(target).trim();
    last.strip_suffix(".md")
        .or_else(|| last.strip_suffix(".canvas"))
        .unwrap_or(last)
}

/// `text` as a player is served it: every link `resolve` judges not
/// [`Fate::Open`] drawn as the module says. `source` is the note's path
/// (for the caller's resolution); `lang` the player's.
pub fn veil(text: &str, resolve: &dyn Fn(&str) -> Fate, lang: &str) -> String {
    let hold = placeholder(lang);
    let once = wikilinks(text, resolve, &hold);
    markdown_links(&once, resolve, &hold)
}

/// The longest `[[…]]` that is read as a link.
const LONGEST: usize = 600;

fn wikilinks(text: &str, resolve: &dyn Fn(&str) -> Fate, hold: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    let mut copied = 0;
    while i + 1 < bytes.len() {
        if bytes[i] != b'[' || bytes[i + 1] != b'[' {
            i += 1;
            continue;
        }
        let embed = i > 0 && bytes[i - 1] == b'!';
        let start = i + 2;
        let limit = (start + LONGEST).min(bytes.len());
        let window = &text.as_bytes()[start..limit];
        // The closing `]]` before any line break or another `[[`.
        let mut close = None;
        let mut k = 0;
        while k + 1 < window.len() {
            if window[k] == b'\n' || window[k] == b'\r' {
                break;
            }
            if window[k] == b'[' && window[k + 1] == b'[' {
                break;
            }
            if window[k] == b']' && window[k + 1] == b']' {
                close = Some(k);
                break;
            }
            k += 1;
        }
        let Some(k) = close else {
            i += 2;
            continue;
        };
        let inner = &text[start..start + k];
        let end = start + k + 2;
        let (target, alias) = split(inner);
        let fate = if target.trim().is_empty() {
            Fate::Open
        } else {
            resolve(target.trim())
        };
        if fate == Fate::Open {
            i = end;
            continue;
        }
        let from = if embed { i - 1 } else { i };
        out.push_str(&text[copied..from]);
        out.push_str(&drawn(fate, embed, alias, target, hold));
        copied = end;
        i = end;
    }
    out.push_str(&text[copied..]);
    out
}

/// A locked link drawn.
fn drawn(fate: Fate, embed: bool, alias: Option<&str>, target: &str, hold: &str) -> String {
    if embed {
        return hold.to_owned();
    }
    match fate {
        Fate::SecretName => REDACTED.to_owned(),
        _ => {
            let name = alias
                .map(str::trim)
                .filter(|a| !a.is_empty())
                .unwrap_or_else(|| shown_name(target));
            format!("{name} {LOCK}")
        }
    }
}

/// Decode `%20`-style escapes of a link's address.
fn unescape(url: &str) -> String {
    let b = url.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%'
            && i + 2 < b.len()
            && let (Some(h), Some(l)) = (
                (b[i + 1] as char).to_digit(16),
                (b[i + 2] as char).to_digit(16),
            )
        {
            out.push(u8::try_from(h * 16 + l).unwrap_or(b'?'));
            i += 3;
            continue;
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Whether an address leaves the folder (or stays in the page).
fn external(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with('#')
        || lower.starts_with("//")
        || lower.split_once(':').is_some_and(|(scheme, _)| {
            scheme.len() > 1 && scheme.chars().all(|c| c.is_ascii_alphabetic())
        })
}

fn markdown_links(text: &str, resolve: &dyn Fn(&str) -> Fate, hold: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut copied = 0;
    let mut i = 0;
    while i + 1 < bytes.len() {
        if !(bytes[i] == b']' && bytes[i + 1] == b'(') {
            i += 1;
            continue;
        }
        // The address, up to the closing parenthesis on the same line.
        let from = i + 2;
        let limit = (from + LONGEST).min(bytes.len());
        let Some(len) = text.as_bytes()[from..limit]
            .iter()
            .position(|b| matches!(b, b')' | b'\n' | b'\r'))
            .filter(|n| bytes[from + n] == b')')
        else {
            i += 2;
            continue;
        };
        let raw = &text[from..from + len];
        // The label opens at the nearest `[` before, on the same line.
        let line_start = text[..i].rfind('\n').map_or(0, |n| n + 1);
        let Some(open) = text[line_start..i].rfind('[').map(|n| line_start + n) else {
            i += 2;
            continue;
        };
        // The address as written, whole (Obsidian takes spaces in it), and
        // its first word as CommonMark ends it: either reaching a hidden
        // note hides the link (fails closed).
        let whole = raw.trim().trim_start_matches('<').trim_end_matches('>');
        let first = whole.split([' ', '"']).next().unwrap_or_default();
        let mut target = String::new();
        let mut fate = Fate::Open;
        for candidate in [whole, first] {
            let address = unescape(candidate);
            let t = address
                .split('#')
                .next()
                .unwrap_or_default()
                .trim()
                .to_owned();
            if t.is_empty() || external(&address) {
                continue;
            }
            let f = resolve(&t);
            if f != Fate::Open && fate != Fate::SecretName {
                fate = f;
                target = t;
            }
        }
        if fate == Fate::Open {
            i = from + len + 1;
            continue;
        }
        let image = open > 0 && bytes[open - 1] == b'!';
        let label = text[open + 1..i].trim();
        let begin = if image { open - 1 } else { open };
        // An overlap with a previous replacement is left alone.
        if begin < copied {
            i = from + len + 1;
            continue;
        }
        out.push_str(&text[copied..begin]);
        if image || fate == Fate::SecretName {
            out.push_str(if fate == Fate::SecretName {
                REDACTED
            } else {
                hold
            });
        } else {
            let shown = if label.is_empty() {
                shown_name(&target)
            } else {
                label
            };
            out.push_str(&format!("{shown} {LOCK}"));
        }
        copied = from + len + 1;
        i = copied;
    }
    out.push_str(&text[copied..]);
    out
}

/// Every address `text` links or embeds, as the veil reads them: the
/// target of each `[[…]]` and the address of each `](…)`, without
/// headings, aliases or the escapes of an address. What a released note
/// opens of the attachments (ADR 0110 item 4).
#[must_use]
pub fn targets(text: &str) -> Vec<String> {
    let found = std::cell::RefCell::new(Vec::new());
    let note = |t: &str| {
        found.borrow_mut().push(t.to_owned());
        Fate::Open
    };
    let _ = veil(text, &note, "en");
    found.into_inner()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn locked(name: &'static str, secret: bool) -> impl Fn(&str) -> Fate {
        move |t: &str| {
            let t = t.trim_end_matches(".md");
            if t.rsplit('/').next() == Some(name) || t == name {
                if secret {
                    Fate::SecretName
                } else {
                    Fate::Locked
                }
            } else {
                Fate::Open
            }
        }
    }

    #[test]
    fn a_link_to_a_hidden_note_is_text_with_a_lock() {
        let r = locked("Barão", false);
        assert_eq!(
            veil("Fale com [[Barão]].", &r, "pt-BR"),
            "Fale com Barão 🔒."
        );
        assert_eq!(
            veil("[[Segredos/Barão#Cena|um rumor]]", &r, "pt-BR"),
            "um rumor 🔒"
        );
        assert_eq!(veil("[[Barão#^id9]]", &r, "pt-BR"), "Barão 🔒");
        assert_eq!(
            veil("[[Outro]] e [[Barão]]", &r, "pt-BR"),
            "[[Outro]] e Barão 🔒"
        );
    }

    #[test]
    fn a_secret_name_is_four_blocks_whatever_was_written() {
        let r = locked("Barão", true);
        assert_eq!(veil("[[Barão]]", &r, "pt-BR"), REDACTED);
        assert_eq!(veil("[[Barão|um rumor]]", &r, "pt-BR"), REDACTED);
        assert_eq!(veil("![[Barão]]", &r, "pt-BR"), "🔒 (ainda não revelado)");
    }

    #[test]
    fn an_embed_is_a_placeholder_in_the_players_language() {
        let r = locked("Mapa", false);
        assert_eq!(veil("![[Mapa]]", &r, "pt-BR"), "🔒 (ainda não revelado)");
        assert_eq!(veil("![[Mapa]]", &r, "en"), "🔒 (not revealed yet)");
        assert_eq!(veil("![[Mapa.md]]", &r, "en"), "🔒 (not revealed yet)");
    }

    #[test]
    fn markdown_links_and_images_to_hidden_files_are_covered() {
        let r = locked("Barão", false);
        assert_eq!(
            veil(
                "see [o barão](Segredos/Bar%C3%A3o.md#x) now",
                &|t| r(&t.replace("Segredos/", "")),
                "pt-BR"
            ),
            "see o barão 🔒 now"
        );
        let r2 = locked("mapa", false);
        assert_eq!(veil("![x](mapa.md)", &r2, "en"), "🔒 (not revealed yet)");
        assert_eq!(
            veil("[x](https://mapa.md)", &r2, "en"),
            "[x](https://mapa.md)"
        );
    }

    #[test]
    fn frontmatter_and_code_are_scanned_too() {
        let r = locked("Barão", false);
        let text = "---\nrelated: \"[[Barão]]\"\n---\n```\n[[Barão]]\n```\n";
        let out = veil(text, &r, "en");
        assert!(!out.contains("[["), "{out}");
        assert!(out.contains("related: \"Barão 🔒\""));
    }

    #[test]
    fn an_unclosed_link_is_left_alone_and_never_panics() {
        let r = locked("Barão", false);
        assert_eq!(veil("[[Barão", &r, "en"), "[[Barão");
        assert_eq!(veil("[[a\n]]", &r, "en"), "[[a\n]]");
        assert_eq!(veil("]( ) [ ](", &r, "en"), "]( ) [ ](");
        let _ = veil("日本語[[日本語]]🔒![[", &r, "en");
    }

    /// Generated notes: whatever is written around a link to a hidden
    /// note, its folder, heading and block id never reach the text.
    #[test]
    fn a_players_text_never_holds_the_hidden_notes_path_heading_or_id() {
        let r = |t: &str| {
            if t.contains("Cripta") {
                Fate::Locked
            } else {
                Fate::Open
            }
        };
        let forms = [
            "[[Cripta]]",
            "[[Mundo/Cripta]]",
            "[[Mundo/Cripta.md#Armadilha do 3o piso]]",
            "[[Mundo/Cripta#^zq81]]",
            "![[Mundo/Cripta#Armadilha do 3o piso]]",
            "[[Mundo/Cripta#^zq81|um lugar]]",
            "[x](Mundo/Cripta.md#Armadilha)",
            "![x](Mundo/Cripta.md)",
        ];
        let around = ["", "> ", "- ", "# ", "| a | ", "**", "`", "_"];
        let mut seed: u64 = 7;
        let mut next = move || {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (seed >> 33) as usize
        };
        for _ in 0..500 {
            let mut text = String::from("---\nprop: \"[[Mundo/Cripta]]\"\n---\n");
            for _ in 0..(1 + next() % 6) {
                text.push_str(around[next() % around.len()]);
                text.push_str(forms[next() % forms.len()]);
                text.push_str(" ✦ ");
                if next() % 3 == 0 {
                    text.push('\n');
                }
            }
            let out = veil(&text, &r, "pt-BR");
            for leak in ["Mundo", "Armadilha", "zq81", ".md", "[[", "]]", "(Mundo"] {
                assert!(!out.contains(leak), "{leak} in {out:?} from {text:?}");
            }
        }
    }
}
