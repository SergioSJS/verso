// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The guardrail of ADR 0087 item 9 at the dialect's level: the projection
//! a UniVerso serves a reader (`verso_dialect::project`). Generated notes
//! hold secret callouts (`> [!secret]`) anywhere — at the top level, inside
//! another callout at any depth, inside a list item, at the end of the file
//! without a line break, with CRLF line ends, with links, tags, `^id`s,
//! headings and callouts inside them — beside plain callouts and prose.
//! Every word of a secret block is a token found nowhere else in the note.
//!
//! 1. No token of a secret block is in the projection, nor in any derived
//!    report of it (links, tags, headings, ids).
//! 2. Every token outside a secret block is kept, and the lines outside
//!    the secret blocks are kept byte for byte, in order.
//! 3. The projection of a projection is itself.
//! 4. A note with no secret callout is its own projection, untouched,
//!    whatever plain callouts it holds.

use proptest::prelude::*;
use verso_dialect::{Secrets, project};

/// A piece of a generated note: its text, the tokens a reader may read
/// and those a reader must never hold.
#[derive(Debug, Clone, Default)]
struct Piece {
    text: String,
    public: Vec<String>,
    secret: Vec<String>,
}

/// `depth` quote markers, as a line inside that many quotes starts.
fn quotes(depth: usize) -> String {
    "> ".repeat(depth)
}

/// The header of a secret callout, in one of the spellings that read as
/// the kind `secret` (Q5 compares kinds lower-cased).
fn header(variant: u8, title: &str) -> String {
    match variant % 5 {
        0 => "[!secret]".to_owned(),
        1 => format!("[!Secret] {title}"),
        2 => "[!SECRET]-".to_owned(),
        3 => format!("[!secret]+ {title}"),
        _ => "[! secret ]".to_owned(),
    }
}

/// A secret callout at `depth` quotes deep (0: at the top level), holding
/// prose, a link, an embed, a tag, a heading, a `^id`, and maybe a callout
/// of its own; each of its words is a fresh secret token.
fn secret_block(n: usize, depth: usize, variant: u8, inner: bool) -> Piece {
    let q = quotes(depth);
    let s = |k: &str| format!("zs{n}{k}q");
    let lines = [
        format!("{q}> {}", header(variant, &s("title"))),
        format!(
            "{q}> {} [[{}]] ![[{}]] #{}",
            s("a"),
            s("link"),
            s("embed"),
            s("tag")
        ),
        format!("{q}> # {}", s("head")),
        format!("{q}> {} ^{}", s("b"), s("id")),
    ];
    let mut text = lines.join("\n");
    let mut secret = vec![
        s("a"),
        s("link"),
        s("embed"),
        s("tag"),
        s("head"),
        s("b"),
        s("id"),
    ];
    if variant % 5 == 1 || variant % 5 == 3 {
        secret.push(s("title"));
    }
    if inner {
        text.push_str(&format!(
            "\n{q}>\n{q}> > [!note] {}\n{q}> > {}",
            s("inner"),
            s("deep")
        ));
        secret.push(s("inner"));
        secret.push(s("deep"));
    }
    text.push('\n');
    Piece {
        text,
        public: Vec::new(),
        secret,
    }
}

/// A plain paragraph with a public token.
fn paragraph(n: usize) -> Piece {
    let w = format!("zp{n}q");
    Piece {
        text: format!("{w} [[{w}link]] #{w}tag\n"),
        public: vec![w.clone(), format!("{w}link"), format!("{w}tag")],
        secret: Vec::new(),
    }
}

/// A plain callout (any kind but `secret`) holding public words and, at
/// `depth` 1 inside it, maybe a secret block.
fn plain_callout(n: usize, kind: &str, with_secret: Option<(u8, bool)>) -> Piece {
    let w = format!("zp{n}q");
    let mut piece = Piece {
        text: format!("> [!{kind}] {w}title\n> {w}\n"),
        public: vec![format!("{w}title"), w.clone()],
        secret: Vec::new(),
    };
    if let Some((variant, inner)) = with_secret {
        // A blank quoted line before and after: the inner quote is its own
        // block, and the outer's next line is no lazy continuation of it.
        piece.text.push_str(">\n");
        let s = secret_block(n, 1, variant, inner);
        piece.text.push_str(&s.text);
        piece.secret.extend(s.secret);
        piece.text.push_str(&format!(">\n> {w}after\n"));
        piece.public.push(format!("{w}after"));
    }
    piece
}

/// A secret block in a list item.
fn in_list(n: usize, variant: u8) -> Piece {
    let w = format!("zp{n}q");
    let s = secret_block(n, 0, variant, false);
    let indented: String = s.text.lines().map(|l| format!("  {l}\n")).collect();
    Piece {
        text: format!("- {w}\n\n{indented}"),
        public: vec![w],
        secret: s.secret,
    }
}

fn piece(n: usize) -> impl Strategy<Value = Piece> {
    prop_oneof![
        3 => Just(paragraph(n)),
        3 => (any::<u8>(), any::<bool>()).prop_map(move |(v, i)| secret_block(n, 0, v, i)),
        2 => (any::<u8>(), any::<bool>(), 0usize..4).prop_map(move |(v, i, d)| {
            // A secret block `d` callouts deep: plain callouts around it.
            let mut p = secret_block(n, d, v, i);
            for level in (0..d).rev() {
                let q = quotes(level);
                let w = format!("zp{n}w{level}q");
                p.text = format!("{q}> [!info] {w}\n{q}>\n{}{q}>\n{q}> {w}x\n", p.text);
                p.public.push(w.clone());
                p.public.push(format!("{w}x"));
            }
            p
        }),
        2 => prop_oneof![Just("note"), Just("warning"), Just("secrets"), Just("tip")]
            .prop_map(move |k| plain_callout(n, k, None)),
        2 => (any::<u8>(), any::<bool>()).prop_map(move |(v, i)| plain_callout(n, "note", Some((v, i)))),
        1 => any::<u8>().prop_map(move |v| in_list(n, v)),
    ]
}

/// A note of up to `most` pieces, blank lines between them; maybe with a
/// frontmatter, maybe CRLF, maybe with no line break at its end, maybe
/// behind a byte order mark.
fn note(most: usize) -> impl Strategy<Value = (String, Vec<String>, Vec<String>)> {
    (
        prop::collection::vec(any::<u8>(), 0..most),
        any::<bool>(),
        any::<bool>(),
        any::<bool>(),
        any::<bool>(),
    )
        .prop_flat_map(|(seeds, frontmatter, crlf, open_end, bom)| {
            let pieces: Vec<_> = (0..seeds.len()).map(piece).collect();
            (pieces, Just((frontmatter, crlf, open_end, bom)))
        })
        .prop_map(|(pieces, (frontmatter, crlf, open_end, bom))| {
            let mut text = String::new();
            if bom {
                text.push('\u{feff}');
            }
            if frontmatter {
                text.push_str("---\ntitle: zpfrontq\ntags: [zpfmtagq]\n---\n");
            }
            let mut public = Vec::new();
            let mut secret = Vec::new();
            if frontmatter {
                public.push("zpfrontq".to_owned());
            }
            for (i, p) in pieces.iter().enumerate() {
                if i > 0 {
                    text.push('\n');
                }
                text.push_str(&p.text);
                public.extend(p.public.iter().cloned());
                secret.extend(p.secret.iter().cloned());
            }
            if open_end && text.ends_with('\n') {
                text.pop();
            }
            if crlf {
                text = text.replace('\n', "\r\n");
            }
            (text, public, secret)
        })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    #[test]
    fn no_byte_of_a_secret_block_reaches_the_projection((text, _public, secret) in note(8)) {
        let projected = project(&text);
        for s in &secret {
            prop_assert!(!projected.contains(s.as_str()), "{s:?} leaked in {projected:?}\nfrom {text:?}");
        }
        // Nor in what a reader's index would be built from.
        let report = verso_dialect::parse(&projected);
        for l in &report.links {
            prop_assert!(!secret.contains(&l.target));
        }
        for t in verso_dialect::body_tags(&projected) {
            prop_assert!(!secret.contains(&t.name));
        }
        for h in &report.headings {
            prop_assert!(!secret.iter().any(|s| h.text.contains(s.as_str())));
        }
        for b in &report.blocks {
            prop_assert!(!secret.contains(&b.id));
        }
        let html = verso_dialect::to_html(&projected);
        for s in &secret {
            prop_assert!(!html.contains(s.as_str()));
        }
    }

    #[test]
    fn what_is_not_secret_is_kept((text, public, _secret) in note(8)) {
        let projected = project(&text);
        for p in &public {
            prop_assert!(projected.contains(p.as_str()), "{p:?} lost from {projected:?}\nfrom {text:?}");
        }
        // Whole lines removed, nothing else touched: the projection is the
        // source with some of its lines taken out, the others in order.
        let mut kept = text.split_inclusive('\n');
        for line in projected.split_inclusive('\n') {
            prop_assert!(kept.any(|l| l == line), "{line:?} is not a line of the source");
        }
    }

    #[test]
    fn the_projection_of_a_projection_is_itself((text, _p, _s) in note(8)) {
        let once = project(&text).into_owned();
        let twice = project(&once).into_owned();
        prop_assert_eq!(&once, &twice);
        prop_assert!(Secrets::of(&once).is_empty());
    }

    #[test]
    fn a_note_with_no_secret_callout_is_untouched(n in 0usize..6, kinds in prop::collection::vec(0u8..4, 0..6)) {
        let mut text = String::new();
        for (i, k) in kinds.iter().enumerate() {
            let kind = ["note", "secrets", "warning", "secret-ish"][usize::from(*k)];
            text.push_str(&plain_callout(n + i, kind, None).text);
            text.push_str(&paragraph(n + i).text);
            text.push('\n');
        }
        // A secret callout written inside code is code, not a block.
        text.push_str("```\n> [!secret]\n> zpcodeq\n```\n");
        let projected = project(&text);
        prop_assert!(matches!(projected, std::borrow::Cow::Borrowed(_)));
        prop_assert_eq!(projected.as_ref(), text.as_str());
    }
}

#[test]
fn a_secret_block_goes_with_its_lines_and_nothing_else() {
    let text = "# Taverna\n\nO barão governa.\n\n> [!secret] Segredo\n> Ele está morto.\n> [[Barão]] #morto\n\nFim.\n";
    assert_eq!(project(text), "# Taverna\n\nO barão governa.\n\n\nFim.\n");
}

#[test]
fn a_lazy_line_of_the_block_goes_with_it() {
    // CommonMark: an unquoted line right after a quoted paragraph belongs
    // to it, and the reading view draws it inside the callout.
    let text = "> [!secret]\n> escondido\ntambém escondido\n\nà vista\n";
    assert_eq!(project(text), "\nà vista\n");
}

#[test]
fn a_secret_inside_another_callout_goes_and_the_other_stays() {
    let text = "> [!note] Nota\n> visível\n>\n> > [!secret]\n> > escondido\n>\n> visível também\n";
    assert_eq!(
        project(text),
        "> [!note] Nota\n> visível\n>\n>\n> visível também\n"
    );
}

#[test]
fn a_byte_order_mark_before_a_first_line_secret_does_not_hide_it_from_the_projection() {
    // Review of ADR 0087 (I2): a BOM is not content; the callout on the
    // first line is a callout, and the projection stays itself.
    for text in [
        "\u{feff}> [!secret]\n> escondido\n\nà vista\n",
        "\u{feff}> [!secret]\r\n> escondido\r\n\r\nà vista\r\n",
        "\u{feff}# T\n\n> [!secret]\n> escondido\n",
    ] {
        let once = project(text).into_owned();
        assert!(!once.contains("escondido"), "{once:?}");
        assert!(Secrets::of(&once).is_empty());
        assert_eq!(project(&once), once.as_str());
    }
    // Only the callout's lines go: the mark of a kept first line stays.
    assert_eq!(
        project("\u{feff}# T\n\n> [!secret]\n> escondido\n"),
        "\u{feff}# T\n\n"
    );
}

#[test]
fn a_callout_whose_header_is_on_its_second_line_is_still_found() {
    // The reading view draws it as a callout (its first paragraph opens
    // with the header), so the projection removes it too.
    let text = "antes\n\n>\n> [!secret]\n> escondido\n\ndepois\n";
    assert!(!project(text).contains("escondido"));
}

#[test]
fn secret_ranges_map_lines_and_offsets() {
    let text = "a\n> [!secret]\n> x\nb\n\nc\n";
    let secrets = Secrets::of(text);
    // `b` is a lazy line of the quote: lines 2 to 4 go.
    assert_eq!(secrets.lines(), vec![(2, 4)]);
    assert_eq!(secrets.line(1), Some(1));
    assert_eq!(secrets.line(3), None);
    assert_eq!(secrets.line(6), Some(3));
    assert!(secrets.hides(text.find('x').unwrap_or(0)));
    assert!(!secrets.hides(text.rfind('c').unwrap_or(0)));
    assert_eq!(secrets.secret_text(text), "> [!secret]\n> x\nb\n");
    assert_eq!(project(text), "a\n\nc\n");
}

/// A fragment of note dense in quotes, callouts and the secret's header:
/// shapes no structured generator thinks of.
fn soup_fragment() -> impl Strategy<Value = String> {
    prop_oneof![
        4 => Just("\n> [!secret] ".to_owned()),
        2 => Just("\n> > [!SECRET]- ".to_owned()),
        2 => Just("\n>\n> [!secret]\n".to_owned()),
        2 => Just("\n> [!note] ".to_owned()),
        3 => Just("\n> ".to_owned()),
        2 => Just("\n> > ".to_owned()),
        2 => Just("\n- ".to_owned()),
        2 => Just("\n  > ".to_owned()),
        1 => Just("[^1]: > [!secret] x\n".to_owned()),
        1 => Just("\n```\n".to_owned()),
        1 => Just("\n$$\n".to_owned()),
        1 => Just("\n| a | b |\n|---|---|\n".to_owned()),
        1 => Just("---\nt: [!secret]\n---\n".to_owned()),
        1 => Just("%%".to_owned()),
        1 => Just("<div>\n".to_owned()),
        4 => Just("\n".to_owned()),
        1 => Just("\r\n".to_owned()),
        2 => Just("\n\n".to_owned()),
        3 => "[a-z ]{1,6}",
        1 => "\\PC{0,4}",
    ]
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(2048))]

    #[test]
    fn any_note_s_projection_settles_and_keeps_only_its_own_lines(
        parts in prop::collection::vec(soup_fragment(), 0..40)
    ) {
        let text = parts.concat();
        let once = project(&text).into_owned();
        prop_assert!(Secrets::of(&once).is_empty(), "a secret callout left in {once:?}\nfrom {text:?}");
        let again = project(&once).into_owned();
        prop_assert_eq!(&again, &once);
        let mut kept = text.split_inclusive('\n');
        for line in once.split_inclusive('\n') {
            prop_assert!(kept.any(|l| l == line), "{line:?} is not a line of {text:?}");
        }
        // The lines a reader is told of are the projection's.
        let secrets = Secrets::of(&text);
        let lines: Vec<&str> = text.split_inclusive('\n').collect();
        let shown: Vec<&str> = once.split_inclusive('\n').collect();
        for (i, line) in lines.iter().enumerate() {
            let n = u32::try_from(i + 1).unwrap_or(u32::MAX);
            if let Some(p) = secrets.line(n) {
                let at = usize::try_from(p).unwrap_or(usize::MAX) - 1;
                // The last line of the source may lose its break with the
                // block after it gone; its text stays.
                prop_assert_eq!(shown.get(at).map(|s| s.trim_end_matches(['\r', '\n'])),
                    Some(line.trim_end_matches(['\r', '\n'])));
            }
        }
    }
}
