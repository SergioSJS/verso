// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The closed form of a roller's dice appearance (ADR 0107 item 11,
//! decided 2026-10-21). The window sends its look with a roll; every
//! viewer draws it, so what crosses is values from a fixed set and
//! nothing a viewer could be made to load: colours as `#rrggbb`, a
//! texture and a material from the lists below, which mirror the
//! window's (`app/ui/src/dice3d/look.ts`, `TEXTURES` and `MATERIALS`; a
//! test reads that file and compares). Anything else is refused, never
//! cleaned up.

use verso_contract::{DiceStyle, DiceStyles};

/// The textures the window draws (`TEXTURES` in `look.ts`).
pub const TEXTURES: [&str; 20] = [
    "none",
    "marble",
    "speckles",
    "glitter",
    "stars",
    "astral",
    "cloudy",
    "fire",
    "water",
    "ice",
    "paper",
    "wood",
    "metal",
    "stainedglass",
    "skulls",
    "dragon",
    "leopard",
    "tiger",
    "lizard",
    "bird",
];

/// The materials (`MATERIALS` in `look.ts`).
pub const MATERIALS: [&str; 6] = ["auto", "plastic", "metal", "wood", "glass", "none"];

/// Whether `c` is `#rrggbb`, exactly.
#[must_use]
pub fn is_colour(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_hexdigit())
}

fn style(s: &DiceStyle) -> Result<DiceStyle, String> {
    for (name, c) in [
        ("body", &s.body),
        ("number", &s.number),
        ("outline", &s.outline),
    ] {
        if !is_colour(c) {
            return Err(format!("dice style: {name} is a colour as #rrggbb"));
        }
    }
    if !TEXTURES.contains(&s.texture.as_str()) {
        return Err("dice style: a texture of the list".to_owned());
    }
    if !MATERIALS.contains(&s.material.as_str()) {
        return Err("dice style: a material of the list".to_owned());
    }
    Ok(DiceStyle {
        body: s.body.to_ascii_lowercase(),
        number: s.number.to_ascii_lowercase(),
        outline: s.outline.to_ascii_lowercase(),
        texture: s.texture.clone(),
        material: s.material.clone(),
        // `app` is a flag: only `true` is kept.
        app: s.app.filter(|a| *a),
    })
}

/// `styles` if every one of its three looks is in the closed form (colours
/// lower-cased), or why not. Unknown fields never get here: the contract's
/// types refuse them when read.
pub fn check(styles: &DiceStyles) -> Result<DiceStyles, String> {
    Ok(DiceStyles {
        s1: style(&styles.s1)?,
        s2: style(&styles.s2)?,
        s3: style(&styles.s3)?,
    })
}

/// A presence colour: `#rrggbb`, lower-cased, or why not.
pub fn colour(c: &str) -> Result<String, String> {
    if is_colour(c) {
        Ok(c.to_ascii_lowercase())
    } else {
        Err("a colour as #rrggbb".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok() -> DiceStyle {
        DiceStyle {
            body: "#1D9E75".into(),
            number: "#f4f7f5".into(),
            outline: "#0c3527".into(),
            texture: "marble".into(),
            material: "glass".into(),
            app: None,
        }
    }

    fn styles(s: DiceStyle) -> DiceStyles {
        DiceStyles {
            s1: s.clone(),
            s2: s.clone(),
            s3: s,
        }
    }

    #[test]
    fn the_lists_mirror_the_windows() {
        let look = include_str!("../../../app/ui/src/dice3d/look.ts");
        let list = |name: &str| -> Vec<String> {
            let at = look.find(&format!("export const {name} = [")).unwrap();
            let rest = &look[at..];
            let open = rest.find('[').unwrap();
            let close = rest.find(']').unwrap();
            rest[open + 1..close]
                .split(',')
                .map(|w| w.trim().trim_matches('"').to_owned())
                .filter(|w| !w.is_empty())
                .collect()
        };
        assert_eq!(list("TEXTURES"), TEXTURES);
        assert_eq!(list("MATERIALS"), MATERIALS);
    }

    #[test]
    fn a_closed_form_look_is_kept_with_lower_case_colours() {
        let got = check(&styles(ok())).unwrap();
        assert_eq!(got.s1.body, "#1d9e75");
        assert_eq!(got.s2.texture, "marble");
    }

    #[test]
    fn anything_but_the_closed_form_is_refused() {
        for body in [
            "red", "#12345", "#1234567", "#gggggg", "url(x)", "#12345g", "",
        ] {
            let mut s = ok();
            s.body = body.into();
            assert!(check(&styles(s)).is_err(), "{body}");
        }
        for texture in ["https://x/y.png", "../x", "MARBLE", ""] {
            let mut s = ok();
            s.texture = texture.into();
            assert!(check(&styles(s)).is_err(), "{texture}");
        }
        let mut s = ok();
        s.material = "gold".into();
        assert!(check(&styles(s)).is_err());
        let mut third = styles(ok());
        third.s3.outline = "#abc".into();
        assert!(check(&third).is_err());
    }

    #[test]
    fn a_look_with_a_field_beyond_the_form_does_not_read() {
        let json = r##"{"1":{"body":"#000000","number":"#000000","outline":"#000000","texture":"none","material":"none","src":"x"},"2":{"body":"#000000","number":"#000000","outline":"#000000","texture":"none","material":"none"},"3":{"body":"#000000","number":"#000000","outline":"#000000","texture":"none","material":"none"}}"##;
        assert!(serde_json::from_str::<DiceStyles>(json).is_err());
    }
}
