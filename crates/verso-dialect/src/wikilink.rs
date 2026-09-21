// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Splitting the inside of `[[…]]` into its parts, as written (spec §4.2).

/// The parts of `target#heading|alias` or `target#^block|alias`.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Parts {
    pub target: String,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
}

/// Split the text between `[[` and `]]`.
///
/// The alias is everything after the first `|`; the fragment is everything
/// after the first `#` before that; a fragment starting with `^` is a block
/// reference. Nothing is trimmed or unescaped: the fixture asserts the target
/// "as written". Combined and escaped forms are Q23; this is the reading that
/// falls out of the field definitions of spec §4.2, nothing more.
pub(crate) fn split(inner: &str) -> Parts {
    let (before_pipe, alias) = match inner.split_once('|') {
        Some((before, alias)) => (before, Some(alias.to_owned())),
        None => (inner, None),
    };
    let (target, fragment) = match before_pipe.split_once('#') {
        Some((target, fragment)) => (target, Some(fragment)),
        None => (before_pipe, None),
    };
    let (heading, block) = match fragment {
        Some(fragment) => match fragment.strip_prefix('^') {
            Some(block) => (None, Some(block.to_owned())),
            None => (Some(fragment.to_owned()), None),
        },
        None => (None, None),
    };
    Parts {
        target: target.to_owned(),
        heading,
        block,
        alias,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parts(
        target: &str,
        heading: Option<&str>,
        block: Option<&str>,
        alias: Option<&str>,
    ) -> Parts {
        Parts {
            target: target.to_owned(),
            heading: heading.map(str::to_owned),
            block: block.map(str::to_owned),
            alias: alias.map(str::to_owned),
        }
    }

    #[test]
    fn spec_forms() {
        assert_eq!(
            split("Barão Vermelho"),
            parts("Barão Vermelho", None, None, None)
        );
        assert_eq!(
            split("Barão Vermelho|o barão"),
            parts("Barão Vermelho", None, None, Some("o barão"))
        );
        assert_eq!(
            split("Taverna#Porão"),
            parts("Taverna", Some("Porão"), None, None)
        );
        assert_eq!(
            split("Sessão 3#^juramento"),
            parts("Sessão 3", None, Some("juramento"), None)
        );
        assert_eq!(split("#seção"), parts("", Some("seção"), None, None));
        assert_eq!(split("nota.md"), parts("nota.md", None, None, None));
    }

    #[test]
    fn combined_forms_follow_the_field_definitions() {
        assert_eq!(
            split("nota#seção|alias"),
            parts("nota", Some("seção"), None, Some("alias"))
        );
        assert_eq!(
            split("nota#^bloco|alias"),
            parts("nota", None, Some("bloco"), Some("alias"))
        );
        assert_eq!(split("a|b|c"), parts("a", None, None, Some("b|c")));
        assert_eq!(split(" nota "), parts(" nota ", None, None, None));
    }
}
