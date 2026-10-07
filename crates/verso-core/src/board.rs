// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A board (`.canvas`) read for an agent (ADR 0066 point 2): its cards, its
//! edges and the texts of its drawing, out of the JSON Canvas file and
//! Verso's `verso` key (ADR 0057). Pure: the caller reads the file.

use crate::canvas::{Canvas, Json, JsonError};

/// A card of a board: a node of the canvas.
#[derive(Debug, Clone, PartialEq)]
pub struct BoardCard {
    pub id: String,
    /// `text`, `file`, `link` or `group`, as the canvas names it.
    pub kind: String,
    /// A text card's Markdown.
    pub text: Option<String>,
    /// A file card's path from the folder's root.
    pub file: Option<String>,
    /// A link card's address.
    pub url: Option<String>,
    /// A group's label.
    pub label: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// The smallest group whose box holds this card's, if any.
    pub group: Option<String>,
}

/// An edge of a board: an arrow from a card to a card.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub from_side: Option<String>,
    pub to_side: Option<String>,
    pub label: Option<String>,
    /// The typed relation the edge stands for (`verso.relation`, ADR 0057
    /// point 4), if it was promoted to one.
    pub relation: Option<String>,
}

/// A board as an agent reads it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct BoardRead {
    /// The cards in the file's order, which is the stacking order.
    pub cards: Vec<BoardCard>,
    pub edges: Vec<BoardEdge>,
    /// The texts written in the board's drawing (`verso.drawing`), in its
    /// order: notes of the hand, never cards.
    pub annotations: Vec<String>,
}

fn text_of(node: &Json, key: &str) -> Option<String> {
    node.get(key).and_then(Json::as_str).map(str::to_owned)
}

fn number_of(node: &Json, key: &str) -> f64 {
    match node.get(key) {
        Some(Json::Number(n)) => n.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

/// Read a board's text. A text that is not a canvas this module can read is
/// an error; an object with no `nodes` or `edges` is an empty board.
pub fn read_board(text: &str) -> Result<BoardRead, JsonError> {
    let canvas = Canvas::parse(text)?;
    let mut cards: Vec<BoardCard> = canvas
        .nodes()
        .iter()
        .filter_map(|n| {
            let id = text_of(n, "id")?;
            let kind = text_of(n, "type")?;
            Some(BoardCard {
                id,
                text: text_of(n, "text"),
                file: text_of(n, "file"),
                url: text_of(n, "url"),
                label: text_of(n, "label"),
                x: number_of(n, "x"),
                y: number_of(n, "y"),
                width: number_of(n, "width"),
                height: number_of(n, "height"),
                group: None,
                kind,
            })
        })
        .collect();
    // A card's group: the smallest group whose box holds the card's box,
    // as the board draws it (`board/model.ts`, `toElements`).
    let groups: Vec<(String, f64, f64, f64, f64)> = cards
        .iter()
        .filter(|c| c.kind == "group")
        .map(|c| (c.id.clone(), c.x, c.y, c.width, c.height))
        .collect();
    for card in &mut cards {
        let holds = |g: &&(String, f64, f64, f64, f64)| {
            g.0 != card.id
                && card.x >= g.1
                && card.y >= g.2
                && card.x + card.width <= g.1 + g.3
                && card.y + card.height <= g.2 + g.4
        };
        card.group = groups
            .iter()
            .filter(holds)
            .min_by(|a, b| (a.3 * a.4).total_cmp(&(b.3 * b.4)))
            .map(|g| g.0.clone());
    }
    let edges = match canvas.root.get("edges") {
        Some(Json::Array(edges)) => edges
            .iter()
            .filter_map(|e| {
                Some(BoardEdge {
                    id: text_of(e, "id")?,
                    from: text_of(e, "fromNode")?,
                    to: text_of(e, "toNode")?,
                    from_side: text_of(e, "fromSide"),
                    to_side: text_of(e, "toSide"),
                    label: text_of(e, "label"),
                    relation: e.get("verso").and_then(|v| text_of(v, "relation")),
                })
            })
            .collect(),
        _ => Vec::new(),
    };
    let annotations = match canvas.root.get("verso").and_then(|v| v.get("drawing")) {
        Some(Json::Array(drawing)) => drawing
            .iter()
            .filter(|d| d.get("type").and_then(Json::as_str) == Some("text"))
            .filter(|d| !matches!(d.get("isDeleted"), Some(Json::Bool(true))))
            .filter_map(|d| text_of(d, "originalText").or_else(|| text_of(d, "text")))
            .filter(|t| !t.trim().is_empty())
            .collect(),
        _ => Vec::new(),
    };
    Ok(BoardRead {
        cards,
        edges,
        annotations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_board_reads_its_cards_groups_edges_relations_and_drawn_texts() {
        let text = r#"{
	"nodes":[
		{"id":"g","type":"group","x":0,"y":0,"width":1000,"height":600,"label":"Mesa"},
		{"id":"a","type":"file","file":"npcs/Barão.md","x":20,"y":40,"width":300,"height":200},
		{"id":"t","type":"text","text":"ver [[Barão]]","x":1200,"y":0,"width":250,"height":60},
		{"id":"l","type":"link","url":"https://jsoncanvas.org","x":40,"y":300,"width":200,"height":100}
	],
	"edges":[
		{"id":"e","fromNode":"a","fromSide":"right","toNode":"t","toSide":"left","label":"liga","verso":{"relation":"aliado"}},
		{"id":"f","fromNode":"l","toNode":"a"}
	],
	"verso":{"version":1,"drawing":[
		{"id":"d1","type":"text","text":"lembrar","originalText":"lembrar"},
		{"id":"d2","type":"rectangle"},
		{"id":"d3","type":"text","text":"apagado","isDeleted":true}
	]}
}"#;
        let b = read_board(text).unwrap();
        assert_eq!(b.cards.len(), 4);
        assert_eq!(b.cards[0].label.as_deref(), Some("Mesa"));
        assert_eq!(b.cards[1].file.as_deref(), Some("npcs/Barão.md"));
        assert_eq!(b.cards[1].group.as_deref(), Some("g"));
        assert_eq!(b.cards[2].group, None);
        assert_eq!(b.cards[3].url.as_deref(), Some("https://jsoncanvas.org"));
        assert_eq!(b.cards[3].group.as_deref(), Some("g"));
        assert_eq!(b.edges[0].relation.as_deref(), Some("aliado"));
        assert_eq!(b.edges[0].label.as_deref(), Some("liga"));
        assert_eq!(b.edges[0].from_side.as_deref(), Some("right"));
        assert_eq!(b.edges[1].relation, None);
        assert_eq!(b.annotations, ["lembrar"]);
    }

    #[test]
    fn a_text_that_is_not_json_is_an_error_and_an_empty_object_an_empty_board() {
        assert!(read_board("not json").is_err());
        assert_eq!(read_board("{}").unwrap(), BoardRead::default());
    }
}
