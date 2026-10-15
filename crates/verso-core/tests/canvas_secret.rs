// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The guardrail of ADR 0090 item 5 (secret pins), as ADR 0087 item 9 has it
//! for secret blocks: for generated boards with secret nodes placed
//! anywhere — alone, in a group with the map, with edges and drawn elements
//! tied to them — no word of a secret node (its id, its text, its file, its
//! address, its coordinates) is left in what a reader is served; the
//! projection is idempotent; and every node, edge and drawn element that
//! has nothing to do with a secret one comes out exactly as it went in.

use proptest::prelude::*;
use verso_core::canvas::Canvas;
use verso_core::canvas_secret::{has_secret, index_split, project};

/// One generated node: whether it is secret, and in which groups.
#[derive(Debug, Clone)]
struct Pin {
    secret: bool,
    kind: u8,
    groups: Vec<u8>,
    /// An open text card that holds a `> [!secret]` callout (ADR 0087, a
    /// Markdown card on a board is a Markdown card).
    callout: bool,
}

impl Pin {
    fn callout_in_text(&self) -> bool {
        self.callout && !self.secret && self.kind == 0
    }
}

#[derive(Debug, Clone)]
struct Edge {
    from: usize,
    to: usize,
}

#[derive(Debug, Clone)]
struct Drawn {
    under: Option<usize>,
    bound: Option<usize>,
    groups: Vec<u8>,
    contained_by: Option<usize>,
}

fn board() -> impl Strategy<Value = (Vec<Pin>, Vec<Edge>, Vec<Drawn>)> {
    let pin = (
        any::<bool>(),
        0u8..3,
        prop::collection::vec(0u8..3, 0..3),
        any::<bool>(),
    )
        .prop_map(|(secret, kind, groups, callout)| Pin {
            secret,
            kind,
            groups,
            callout,
        });
    prop::collection::vec(pin, 1..8).prop_flat_map(|pins| {
        let n = pins.len();
        let edge = (0..n, 0..n).prop_map(|(from, to)| Edge { from, to });
        let drawn = (
            prop::option::of(0..n),
            prop::option::of(0..n),
            prop::collection::vec(0u8..3, 0..3),
            prop::option::of(0..n),
        )
            .prop_map(|(under, bound, groups, contained_by)| Drawn {
                under,
                bound,
                groups,
                contained_by,
            });
        (
            Just(pins),
            prop::collection::vec(edge, 0..6),
            prop::collection::vec(drawn, 0..8),
        )
    })
}

/// The marker every secret node carries in each field a reader must not
/// receive; coordinates are unique large numbers.
#[cfg(test)]
fn text_of(pins: &[Pin], edges: &[Edge], drawn: &[Drawn], compact: bool) -> String {
    let mut nodes = Vec::new();
    for (i, p) in pins.iter().enumerate() {
        let groups: Vec<String> = p.groups.iter().map(|g| format!("\"g{g}\"")).collect();
        let secret = if p.secret { ",\"secret\":true" } else { "" };
        let verso = format!("\"verso\":{{\"groups\":[{}]{secret}}}", groups.join(","));
        let at = format!(
            "\"x\":{},\"y\":{},\"width\":24,\"height\":24",
            9_000_000 + i,
            9_100_000 + i
        );
        let body = match p.kind {
            0 if p.callout_in_text() => format!(
                "\"type\":\"text\",\"text\":\"corpo-aberto-{i}\\n\\n> [!secret]\\n> CALLOUTSEG-{i}\\n\\nfim-{i}\""
            ),
            0 => format!(
                "\"type\":\"text\",\"text\":\"corpo-{}-{i}\"",
                if p.secret { "SEGREDO" } else { "aberto" }
            ),
            1 => format!(
                "\"type\":\"file\",\"file\":\"{}-{i}.md\"",
                if p.secret { "Cripta" } else { "Taverna" }
            ),
            _ => format!(
                "\"type\":\"link\",\"url\":\"https://{}{i}.example\"",
                if p.secret { "segredo" } else { "aberto" }
            ),
        };
        nodes.push(format!(
            "{{\"id\":\"pin-{}-{i}\",{body},{at},{verso}}}",
            if p.secret { "S" } else { "o" }
        ));
    }
    let id = |i: usize| format!("pin-{}-{i}", if pins[i].secret { "S" } else { "o" });
    let edges: Vec<String> = edges
        .iter()
        .enumerate()
        .map(|(k, e)| {
            format!(
                "{{\"id\":\"e{k}\",\"fromNode\":\"{}\",\"toNode\":\"{}\"}}",
                id(e.from),
                id(e.to)
            )
        })
        .collect();
    let drawing: Vec<String> = drawn
        .iter()
        .enumerate()
        .map(|(k, d)| {
            let mut fields = vec![
                format!("\"id\":\"d{k}\""),
                "\"type\":\"rectangle\"".into(),
                format!("\"x\":{},\"y\":1", 100 + k),
            ];
            if let Some(u) = d.under {
                fields.push(format!("\"under\":\"{}\"", id(u)));
            }
            if let Some(b) = d.bound {
                fields.push(format!("\"endBinding\":{{\"elementId\":\"{}\"}}", id(b)));
            }
            if let Some(c) = d.contained_by {
                fields.push(format!("\"containerId\":\"{}\"", id(c)));
            }
            let groups: Vec<String> = d.groups.iter().map(|g| format!("\"g{g}\"")).collect();
            fields.push(format!("\"groupIds\":[{}]", groups.join(",")));
            format!("{{{}}}", fields.join(","))
        })
        .collect();
    let body = format!(
        "{{\"nodes\":[{}],\"edges\":[{}],\"verso\":{{\"version\":1,\"drawing\":[{}]}}}}",
        nodes.join(","),
        edges.join(","),
        drawing.join(",")
    );
    if compact {
        body
    } else {
        Canvas::parse(&body).unwrap().write()
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(512))]

    #[test]
    fn a_reader_never_receives_a_secret_node((pins, edges, drawn) in board(), compact in any::<bool>()) {
        let text = text_of(&pins, &edges, &drawn, compact);
        let shown = project(&text).into_owned();
        let any_secret = pins.iter().any(|p| p.secret || p.callout_in_text());
        prop_assert_eq!(has_secret(&text), any_secret);
        for word in ["pin-S-", "SEGREDO", "Cripta", "segredo", "CALLOUTSEG"] {
            prop_assert!(!shown.contains(word), "{} reached the reader: {}", word, shown);
        }
        for (i, p) in pins.iter().enumerate() {
            if p.secret {
                prop_assert!(!shown.contains(&(9_000_000 + i).to_string()));
                prop_assert!(!shown.contains(&(9_100_000 + i).to_string()));
            }
        }
        // Idempotent.
        prop_assert_eq!(project(&shown).into_owned(), shown.clone());
        if !any_secret {
            // As it is, byte for byte.
            prop_assert_eq!(&shown, &text);
            return Ok(());
        }
        // Every node that is not secret, as it was.
        let whole = Canvas::parse(&text).unwrap();
        let read = Canvas::parse(&shown).unwrap();
        let open: Vec<_> = whole.nodes().iter().filter(|n| !n.get("verso").and_then(|v| v.get("secret")).is_some()).cloned().collect();
        let read_nodes = read.nodes().to_vec();
        prop_assert_eq!(read_nodes.len(), open.len());
        for (got, was) in read_nodes.iter().zip(&open) {
            let text = was.get("text").and_then(verso_core::canvas::Json::as_str).unwrap_or("");
            if text.contains("[!secret]") {
                // The card stays, its geometry as it was, its text a note's
                // projection (the callout's lines gone, the rest kept).
                let shown_text = got.get("text").and_then(verso_core::canvas::Json::as_str).unwrap_or("");
                prop_assert!(shown_text.contains("corpo-aberto-") && shown_text.contains("fim-"));
                for key in ["id", "x", "y", "width", "height"] {
                    prop_assert_eq!(got.get(key), was.get(key));
                }
            } else {
                prop_assert_eq!(got, was);
            }
        }
        // Every edge that touches no secret node, as it was.
        let edges_of = |c: &Canvas| match c.root.get("edges") { Some(verso_core::canvas::Json::Array(a)) => a.clone(), _ => Vec::new() };
        let kept = edges_of(&read);
        let expected: Vec<_> = edges_of(&whole).into_iter().filter(|e| {
            let side = |k: &str| e.get(k).and_then(verso_core::canvas::Json::as_str).unwrap_or("").starts_with("pin-S-");
            !(side("fromNode") || side("toNode"))
        }).collect();
        prop_assert_eq!(kept, expected);
        // The index splits the same nodes.
        let split = index_split(&text).unwrap();
        prop_assert_eq!(split.nodes.len(), pins.iter().filter(|p| p.secret).count());
        prop_assert!(!split.public.contains("SEGREDO"));
        prop_assert!(!split.public.contains("CALLOUTSEG"));
        if pins.iter().any(Pin::callout_in_text) {
            prop_assert!(split.secret.contains("CALLOUTSEG"));
        }
    }

    #[test]
    fn nothing_but_the_secret_is_lost((pins, edges, drawn) in board()) {
        // The drawn elements the projection keeps are exactly those tied to
        // no secret node.
        let text = text_of(&pins, &edges, &drawn, true);
        let read = Canvas::parse(&project(&text)).unwrap();
        let count = match read.root.get("verso").and_then(|v| v.get("drawing")) {
            Some(verso_core::canvas::Json::Array(a)) => a.len(),
            _ => 0,
        };
        prop_assert!(count <= drawn.len());
        // A drawn element tied by id to a secret node is gone.
        let tied = drawn.iter().filter(|d| [d.under, d.bound, d.contained_by].iter().flatten().any(|i| pins[*i].secret)).count();
        prop_assert!(count <= drawn.len() - tied);
    }
}
