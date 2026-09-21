// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Byte ranges and their translation to line and column (spec §4.4).

/// A half-open byte range `start..end` into the source text.
///
/// Every construct the parser reports carries one. Slicing the source with it
/// gives back the construct's own text (Q18, property 3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Span {
    pub start: usize,
    pub end: usize,
}

impl Span {
    /// The text of the source covered by this span, or `None` if the span does
    /// not fall on character boundaries of `source`.
    #[must_use]
    pub fn slice<'a>(&self, source: &'a str) -> Option<&'a str> {
        source.get(self.start..self.end)
    }
}

/// A position in the source: `line` and `col` start at 1, `col` counts Unicode
/// scalar values, not bytes (spec §4.4), so that the editor and the parser
/// agree on the number.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Pos {
    pub line: u32,
    pub col: u32,
}

/// Byte offsets where each line starts, computed once per document, so that
/// translating an offset to a [`Pos`] is a binary search plus one character
/// count over a single line.
pub(crate) struct LineIndex {
    starts: Vec<usize>,
}

impl LineIndex {
    pub(crate) fn new(source: &str) -> Self {
        let mut starts = vec![0];
        starts.extend(
            source
                .bytes()
                .enumerate()
                .filter(|&(_, b)| b == b'\n')
                .map(|(i, _)| i + 1),
        );
        Self { starts }
    }

    /// Position of the character that starts at byte `offset`.
    ///
    /// `offset` past the end or off a character boundary cannot come from the
    /// base parser; if it does, `col` is 1: the line is right, the column is
    /// not claimed.
    pub(crate) fn pos(&self, source: &str, offset: usize) -> Pos {
        // Index of the last line start that is <= offset; never 0 because
        // starts[0] == 0 <= offset.
        let line = self.starts.partition_point(|&s| s <= offset);
        let line_start = self.starts.get(line.wrapping_sub(1)).copied().unwrap_or(0);
        let col = source
            .get(line_start..offset)
            .map_or(0, |s| s.chars().count());
        Pos {
            line: u32::try_from(line).unwrap_or(u32::MAX),
            col: u32::try_from(col + 1).unwrap_or(u32::MAX),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_characters_not_bytes() {
        let source = "ção [[a]]\nx";
        let index = LineIndex::new(source);
        let link = source.find("[[").unwrap();
        assert_eq!(index.pos(source, link), Pos { line: 1, col: 5 });
        assert_eq!(index.pos(source, source.len() - 1), Pos { line: 2, col: 1 });
        assert_eq!(index.pos(source, 0), Pos { line: 1, col: 1 });
    }

    #[test]
    fn crlf_counts_one_line() {
        let source = "a\r\nb";
        let index = LineIndex::new(source);
        assert_eq!(index.pos(source, 3), Pos { line: 2, col: 1 });
    }
}
