// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The expression language of a base's filters and formulas, as Obsidian
//! documents it ("Bases syntax" and "Functions", `obsidian.md/help`): the
//! operators of JavaScript's arithmetic, comparison and logic, literals of
//! numbers, strings, booleans, `null`, lists, objects and regular
//! expressions, names (`price`, `file.name`, `note["price"]`), and calls of
//! global functions and methods (`if(a, b)`, `file.hasTag("x")`).
//!
//! This module reads the text into an [`Expr`] tree and nothing else; what a
//! name or a call means is the evaluator's (`verso-core`). The text comes
//! from a file of the folder, which may come from anyone: the length, the
//! nesting and the depth of the tree are bounded, so that neither this
//! parser nor a recursive walk over its tree can exhaust the stack.

/// Longest expression read, in bytes. A filter or a formula is a line.
pub const MAX_EXPRESSION_LEN: usize = 16 * 1024;

/// Deepest tree accepted. Nested parentheses, calls, lists and chains of
/// operators all add a level; real formulas stay under ten.
pub const MAX_DEPTH: usize = 128;

/// An expression, as written. Names are not resolved here.
#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Null,
    Bool(bool),
    Number(f64),
    Str(String),
    /// A regular expression literal, `/pattern/flags`, as written.
    Regex {
        pattern: String,
        flags: String,
    },
    List(Vec<Expr>),
    /// `{"a": 1}`: keys in the order written.
    Object(Vec<(String, Expr)>),
    /// A bare name: `file`, `note`, `formula`, `this`, `values`, `value`,
    /// `index`, `acc`, a global function, or a note property.
    Ident(String),
    /// `target.name`.
    Member(Box<Expr>, String),
    /// `target[key]`.
    Index(Box<Expr>, Box<Expr>),
    /// `callee(arguments)`: a global function when the callee is a name, a
    /// method when it is a member.
    Call(Box<Expr>, Vec<Expr>),
    Unary(UnaryOp, Box<Expr>),
    Binary(BinaryOp, Box<Expr>, Box<Expr>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnaryOp {
    /// `!`
    Not,
    /// `-`
    Neg,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinaryOp {
    Or,
    And,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Add,
    Sub,
    Mul,
    Div,
    Rem,
}

/// Why a text is not an expression, and where: `at` counts characters from
/// the start of the text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExprError {
    pub kind: ExprErrorKind,
    pub at: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExprErrorKind {
    /// Longer than [`MAX_EXPRESSION_LEN`].
    TooLong,
    /// Deeper than [`MAX_DEPTH`].
    TooDeep,
    /// Nothing to read: an empty text.
    Empty,
    /// A character no token starts with.
    UnexpectedChar(char),
    /// A string or a regular expression without its closing quote or slash.
    Unterminated,
    /// A token where it cannot stand, as written.
    Unexpected(String),
    /// The text ended where something had to follow.
    UnexpectedEnd,
    /// A number the text cannot hold (`1e999`).
    BadNumber,
}

impl std::fmt::Display for ExprError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let at = self.at + 1;
        match &self.kind {
            ExprErrorKind::TooLong => {
                write!(f, "expression longer than {MAX_EXPRESSION_LEN} bytes")
            }
            ExprErrorKind::TooDeep => write!(f, "expression nested deeper than {MAX_DEPTH} levels"),
            ExprErrorKind::Empty => write!(f, "empty expression"),
            ExprErrorKind::UnexpectedChar(c) => write!(f, "unexpected `{c}` at {at}"),
            ExprErrorKind::Unterminated => write!(f, "unterminated literal starting at {at}"),
            ExprErrorKind::Unexpected(t) => write!(f, "unexpected `{t}` at {at}"),
            ExprErrorKind::UnexpectedEnd => write!(f, "unexpected end of expression"),
            ExprErrorKind::BadNumber => write!(f, "number out of range at {at}"),
        }
    }
}

impl std::error::Error for ExprError {}

/// Read `source` as one expression.
///
/// # Errors
///
/// When the text is not an expression of the language, or is longer or
/// deeper than the bounds of this module.
pub fn parse_expression(source: &str) -> Result<Expr, ExprError> {
    if source.len() > MAX_EXPRESSION_LEN {
        return Err(ExprError {
            kind: ExprErrorKind::TooLong,
            at: 0,
        });
    }
    let tokens = lex(source)?;
    if tokens.len() == 1 {
        return Err(ExprError {
            kind: ExprErrorKind::Empty,
            at: 0,
        });
    }
    let mut parser = Parser {
        tokens,
        pos: 0,
        nesting: 0,
    };
    let (expr, _) = parser.expr(0)?;
    match parser.peek() {
        Tok::End => Ok(expr),
        other => Err(parser.unexpected(other.clone())),
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(f64),
    Str(String),
    Regex(String, String),
    Ident(String),
    Op(&'static str),
    Punct(char),
    End,
}

impl Tok {
    fn text(&self) -> String {
        match self {
            Tok::Num(n) => n.to_string(),
            Tok::Str(s) => format!("\"{s}\""),
            Tok::Regex(p, f) => format!("/{p}/{f}"),
            Tok::Ident(s) => s.clone(),
            Tok::Op(o) => (*o).to_owned(),
            Tok::Punct(c) => c.to_string(),
            Tok::End => String::new(),
        }
    }

    /// Whether a `/` after this token divides (it follows a value) rather
    /// than opening a regular expression.
    fn ends_value(&self) -> bool {
        matches!(
            self,
            Tok::Num(_)
                | Tok::Str(_)
                | Tok::Regex(..)
                | Tok::Ident(_)
                | Tok::Punct(')' | ']' | '}')
        )
    }
}

const OPERATORS: [&str; 14] = [
    "||", "&&", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "!",
];

/// The tokens of `source`, each with the character offset it starts at,
/// ending with [`Tok::End`].
fn lex(source: &str) -> Result<Vec<(Tok, usize)>, ExprError> {
    let chars: Vec<char> = source.chars().collect();
    let mut out: Vec<(Tok, usize)> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
            continue;
        }
        let start = i;
        if c.is_ascii_digit() || (c == '.' && chars.get(i + 1).is_some_and(char::is_ascii_digit)) {
            let (n, next) = number(&chars, i)?;
            out.push((Tok::Num(n), start));
            i = next;
            continue;
        }
        if c == '"' || c == '\'' {
            let (s, next) = string(&chars, i)?;
            out.push((Tok::Str(s), start));
            i = next;
            continue;
        }
        if c == '/' && !out.last().is_some_and(|(t, _)| t.ends_value()) {
            let (pattern, flags, next) = regex(&chars, i)?;
            out.push((Tok::Regex(pattern, flags), start));
            i = next;
            continue;
        }
        if c.is_alphabetic() || c == '_' || c == '$' {
            let mut j = i + 1;
            while j < chars.len()
                && (chars[j].is_alphanumeric() || chars[j] == '_' || chars[j] == '$')
            {
                j += 1;
            }
            out.push((Tok::Ident(chars[i..j].iter().collect()), start));
            i = j;
            continue;
        }
        if let Some(op) = OPERATORS.iter().find(|op| {
            op.chars()
                .enumerate()
                .all(|(k, oc)| chars.get(i + k) == Some(&oc))
        }) {
            out.push((Tok::Op(op), start));
            i += op.chars().count();
            continue;
        }
        if "()[]{},.:".contains(c) {
            out.push((Tok::Punct(c), start));
            i += 1;
            continue;
        }
        return Err(ExprError {
            kind: ExprErrorKind::UnexpectedChar(c),
            at: start,
        });
    }
    out.push((Tok::End, chars.len()));
    Ok(out)
}

/// A number from `i`: digits, an optional fraction — a `.` counts only when
/// a digit follows it, so that `1.isTruthy()` is a method on `1` — and an
/// optional exponent.
fn number(chars: &[char], mut i: usize) -> Result<(f64, usize), ExprError> {
    let start = i;
    while i < chars.len() && chars[i].is_ascii_digit() {
        i += 1;
    }
    if chars.get(i) == Some(&'.') && chars.get(i + 1).is_some_and(char::is_ascii_digit) {
        i += 1;
        while i < chars.len() && chars[i].is_ascii_digit() {
            i += 1;
        }
    }
    if matches!(chars.get(i), Some('e' | 'E')) {
        let mut j = i + 1;
        if matches!(chars.get(j), Some('+' | '-')) {
            j += 1;
        }
        if chars.get(j).is_some_and(char::is_ascii_digit) {
            while j < chars.len() && chars[j].is_ascii_digit() {
                j += 1;
            }
            i = j;
        }
    }
    let text: String = chars[start..i].iter().collect();
    match text.parse::<f64>() {
        Ok(n) if n.is_finite() => Ok((n, i)),
        _ => Err(ExprError {
            kind: ExprErrorKind::BadNumber,
            at: start,
        }),
    }
}

/// A quoted string from `i`, with JavaScript's escapes: `\n`, `\t`, `\r`,
/// `\\`, the quotes, `\uXXXX`; any other escaped character stands for
/// itself.
fn string(chars: &[char], i: usize) -> Result<(String, usize), ExprError> {
    let quote = chars[i];
    let mut out = String::new();
    let mut j = i + 1;
    while j < chars.len() {
        let c = chars[j];
        if c == quote {
            return Ok((out, j + 1));
        }
        if c == '\\' {
            let Some(&e) = chars.get(j + 1) else {
                break;
            };
            match e {
                'n' => out.push('\n'),
                't' => out.push('\t'),
                'r' => out.push('\r'),
                'u' => {
                    let hex: String = chars.iter().skip(j + 2).take(4).collect();
                    match u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32) {
                        Some(u) if hex.len() == 4 => {
                            out.push(u);
                            j += 6;
                            continue;
                        }
                        _ => out.push('u'),
                    }
                }
                other => out.push(other),
            }
            j += 2;
            continue;
        }
        out.push(c);
        j += 1;
    }
    Err(ExprError {
        kind: ExprErrorKind::Unterminated,
        at: i,
    })
}

/// A regular expression literal from `i`: up to the next `/` that is not
/// escaped and not inside a `[…]` class, then its flags.
fn regex(chars: &[char], i: usize) -> Result<(String, String, usize), ExprError> {
    let mut j = i + 1;
    let mut class = false;
    let mut pattern = String::new();
    while j < chars.len() {
        let c = chars[j];
        if c == '\n' {
            break;
        }
        if c == '\\' {
            pattern.push(c);
            if let Some(&next) = chars.get(j + 1) {
                pattern.push(next);
            }
            j += 2;
            continue;
        }
        if c == '[' {
            class = true;
        } else if c == ']' {
            class = false;
        } else if c == '/' && !class {
            let mut k = j + 1;
            while k < chars.len() && chars[k].is_ascii_alphabetic() {
                k += 1;
            }
            return Ok((pattern, chars[j + 1..k].iter().collect(), k));
        }
        pattern.push(c);
        j += 1;
    }
    Err(ExprError {
        kind: ExprErrorKind::Unterminated,
        at: i,
    })
}

struct Parser {
    tokens: Vec<(Tok, usize)>,
    pos: usize,
    /// Calls of `expr` still open: what the stack holds while reading.
    nesting: usize,
}

/// Binding power of an infix operator, left and right: higher binds
/// tighter; left associative throughout.
fn infix(tok: &Tok) -> Option<(BinaryOp, u8, u8)> {
    let Tok::Op(op) = tok else {
        return None;
    };
    Some(match *op {
        "||" => (BinaryOp::Or, 1, 2),
        "&&" => (BinaryOp::And, 3, 4),
        "==" => (BinaryOp::Eq, 5, 6),
        "!=" => (BinaryOp::Ne, 5, 6),
        "<" => (BinaryOp::Lt, 7, 8),
        "<=" => (BinaryOp::Le, 7, 8),
        ">" => (BinaryOp::Gt, 7, 8),
        ">=" => (BinaryOp::Ge, 7, 8),
        "+" => (BinaryOp::Add, 9, 10),
        "-" => (BinaryOp::Sub, 9, 10),
        "*" => (BinaryOp::Mul, 11, 12),
        "/" => (BinaryOp::Div, 11, 12),
        "%" => (BinaryOp::Rem, 11, 12),
        _ => return None,
    })
}

/// Binding power of the operand of a prefix `!` or `-`: above every infix
/// operator, below the postfix ones (`.`, `[…]`, `(…)`).
const PREFIX_BP: u8 = 13;

impl Parser {
    fn peek(&self) -> &Tok {
        self.tokens.get(self.pos).map_or(&Tok::End, |(t, _)| t)
    }

    fn at(&self) -> usize {
        self.tokens.get(self.pos).map_or(0, |(_, at)| *at)
    }

    fn next(&mut self) -> Tok {
        let tok = self.peek().clone();
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
        tok
    }

    fn unexpected(&self, tok: Tok) -> ExprError {
        ExprError {
            kind: if tok == Tok::End {
                ExprErrorKind::UnexpectedEnd
            } else {
                ExprErrorKind::Unexpected(tok.text())
            },
            at: self.at(),
        }
    }

    fn expect(&mut self, c: char) -> Result<(), ExprError> {
        if self.peek() == &Tok::Punct(c) {
            self.pos += 1;
            Ok(())
        } else {
            Err(self.unexpected(self.peek().clone()))
        }
    }

    fn too_deep(&self) -> ExprError {
        ExprError {
            kind: ExprErrorKind::TooDeep,
            at: self.at(),
        }
    }

    /// One expression whose infix operators bind at least `min_bp`, with the
    /// depth of its tree.
    fn expr(&mut self, min_bp: u8) -> Result<(Expr, usize), ExprError> {
        self.nesting += 1;
        if self.nesting > MAX_DEPTH {
            return Err(self.too_deep());
        }
        let result = self.expr_inner(min_bp);
        self.nesting -= 1;
        result
    }

    fn expr_inner(&mut self, min_bp: u8) -> Result<(Expr, usize), ExprError> {
        let (mut lhs, mut depth) = self.prefix()?;
        loop {
            match self.peek().clone() {
                Tok::Punct('.') => {
                    self.pos += 1;
                    let name = match self.next() {
                        Tok::Ident(name) => name,
                        other => {
                            self.pos -= 1;
                            return Err(self.unexpected(other));
                        }
                    };
                    lhs = Expr::Member(Box::new(lhs), name);
                    depth += 1;
                }
                Tok::Punct('[') => {
                    self.pos += 1;
                    let (key, d) = self.expr(0)?;
                    self.expect(']')?;
                    lhs = Expr::Index(Box::new(lhs), Box::new(key));
                    depth = depth.max(d) + 1;
                }
                Tok::Punct('(') => {
                    self.pos += 1;
                    let (args, d) = self.items(')')?;
                    lhs = Expr::Call(Box::new(lhs), args);
                    depth = depth.max(d) + 1;
                }
                tok => {
                    let Some((op, lbp, rbp)) = infix(&tok) else {
                        break;
                    };
                    if lbp < min_bp {
                        break;
                    }
                    self.pos += 1;
                    let (rhs, d) = self.expr(rbp)?;
                    lhs = Expr::Binary(op, Box::new(lhs), Box::new(rhs));
                    depth = depth.max(d) + 1;
                }
            }
            if depth > MAX_DEPTH {
                return Err(self.too_deep());
            }
        }
        Ok((lhs, depth))
    }

    fn prefix(&mut self) -> Result<(Expr, usize), ExprError> {
        let at = self.pos;
        match self.next() {
            Tok::Num(n) => Ok((Expr::Number(n), 1)),
            Tok::Str(s) => Ok((Expr::Str(s), 1)),
            Tok::Regex(pattern, flags) => Ok((Expr::Regex { pattern, flags }, 1)),
            Tok::Ident(name) => Ok((
                match name.as_str() {
                    "true" => Expr::Bool(true),
                    "false" => Expr::Bool(false),
                    "null" => Expr::Null,
                    _ => Expr::Ident(name),
                },
                1,
            )),
            Tok::Op("!") => {
                let (e, d) = self.expr(PREFIX_BP)?;
                Ok((Expr::Unary(UnaryOp::Not, Box::new(e)), d + 1))
            }
            Tok::Op("-") => {
                let (e, d) = self.expr(PREFIX_BP)?;
                Ok((Expr::Unary(UnaryOp::Neg, Box::new(e)), d + 1))
            }
            Tok::Op("+") => self.expr(PREFIX_BP),
            Tok::Punct('(') => {
                let inner = self.expr(0)?;
                self.expect(')')?;
                Ok(inner)
            }
            Tok::Punct('[') => {
                let (items, d) = self.items(']')?;
                Ok((Expr::List(items), d + 1))
            }
            Tok::Punct('{') => self.object(),
            other => {
                self.pos = at;
                Err(self.unexpected(other))
            }
        }
    }

    /// Expressions separated by commas up to `close`, which is consumed; a
    /// trailing comma is allowed.
    fn items(&mut self, close: char) -> Result<(Vec<Expr>, usize), ExprError> {
        let mut items = Vec::new();
        let mut depth = 0;
        loop {
            if self.peek() == &Tok::Punct(close) {
                self.pos += 1;
                return Ok((items, depth));
            }
            let (e, d) = self.expr(0)?;
            items.push(e);
            depth = depth.max(d);
            match self.peek() {
                Tok::Punct(',') => self.pos += 1,
                Tok::Punct(c) if *c == close => {}
                other => return Err(self.unexpected(other.clone())),
            }
        }
    }

    /// `{ key: value, … }` after the `{`: keys are names or strings.
    fn object(&mut self) -> Result<(Expr, usize), ExprError> {
        let mut entries = Vec::new();
        let mut depth = 0;
        loop {
            if self.peek() == &Tok::Punct('}') {
                self.pos += 1;
                return Ok((Expr::Object(entries), depth + 1));
            }
            let key = match self.next() {
                Tok::Str(s) | Tok::Ident(s) => s,
                Tok::Num(n) => n.to_string(),
                other => {
                    self.pos -= 1;
                    return Err(self.unexpected(other));
                }
            };
            self.expect(':')?;
            let (value, d) = self.expr(0)?;
            entries.push((key, value));
            depth = depth.max(d);
            match self.peek() {
                Tok::Punct(',') => self.pos += 1,
                Tok::Punct('}') => {}
                other => return Err(self.unexpected(other.clone())),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> Expr {
        parse_expression(s).unwrap()
    }

    fn id(s: &str) -> Box<Expr> {
        Box::new(Expr::Ident(s.to_owned()))
    }

    #[test]
    fn the_documented_examples_parse() {
        for s in [
            r#"file.hasTag("tag")"#,
            r#"file.hasLink("Textbook")"#,
            r#"file.inFolder("Required Reading")"#,
            r#"'status != "done"'"#,
            "formula.ppu > 5",
            "price > 2.1",
            r#"if(price, price.toFixed(2) + " dollars")"#,
            "(price / age).toFixed(2)",
            "values.mean().round(3)",
            r#"now() + "1 day""#,
            r#"file.mtime > now() - "1 week""#,
            r#"date("2024-12-01") + "1M" + "4h" + "3m""#,
            "now() - file.ctime",
            r#"datetime.format("YYYY-MM-DD")"#,
            "[1,2,3].contains(2)",
            "[1,2,3].reduce(acc + value, 0)",
            r#"values.filter(value.isType("number")).reduce(if(acc == null || value > acc, value, acc), null)"#,
            r#""a:b:c:d".replace(/:/g, "-")"#,
            r#""John Smith".replace(/(\w+) (\w+)/, "$2, $1")"#,
            "/abc/.matches(\"abcde\")",
            "{}.isEmpty()",
            r#"note["price"]"#,
            "property[0]",
            "1.isTruthy()",
            "123.toString()",
            "(-5).abs()",
            "(2.1).ceil()",
            "file.hasLink(this.file)",
            "author == this",
            "authors.contains(this)",
            "duration('5h') * 2",
            r#"link("filename", icon("plus"))"#,
            "!file.hasTag(\"x\") && (a || b)",
        ] {
            assert!(
                parse_expression(s).is_ok(),
                "{s}: {:?}",
                parse_expression(s)
            );
        }
    }

    #[test]
    fn precedence_and_associativity() {
        assert_eq!(
            p("a + b * c"),
            Expr::Binary(
                BinaryOp::Add,
                id("a"),
                Box::new(Expr::Binary(BinaryOp::Mul, id("b"), id("c")))
            )
        );
        assert_eq!(
            p("a - b - c"),
            Expr::Binary(
                BinaryOp::Sub,
                Box::new(Expr::Binary(BinaryOp::Sub, id("a"), id("b"))),
                id("c")
            )
        );
        assert_eq!(
            p("a || b && c"),
            Expr::Binary(
                BinaryOp::Or,
                id("a"),
                Box::new(Expr::Binary(BinaryOp::And, id("b"), id("c")))
            )
        );
        assert_eq!(
            p("!a.b"),
            Expr::Unary(UnaryOp::Not, Box::new(Expr::Member(id("a"), "b".into())))
        );
        assert_eq!(
            p("-x < 3 == true"),
            Expr::Binary(
                BinaryOp::Eq,
                Box::new(Expr::Binary(
                    BinaryOp::Lt,
                    Box::new(Expr::Unary(UnaryOp::Neg, id("x"))),
                    Box::new(Expr::Number(3.0))
                )),
                Box::new(Expr::Bool(true))
            )
        );
    }

    #[test]
    fn a_slash_divides_after_a_value_and_opens_a_regex_elsewhere() {
        assert!(matches!(p("a / b"), Expr::Binary(BinaryOp::Div, ..)));
        assert!(matches!(p("(a) / 2"), Expr::Binary(BinaryOp::Div, ..)));
        assert!(matches!(
            p("x.split(/,/)"),
            Expr::Call(_, ref args) if matches!(args[0], Expr::Regex { .. })
        ));
        assert_eq!(
            p("/a[/]b/gi"),
            Expr::Regex {
                pattern: "a[/]b".into(),
                flags: "gi".into()
            }
        );
    }

    #[test]
    fn strings_and_numbers() {
        assert_eq!(p(r#""a\"b\n""#), Expr::Str("a\"b\n".into()));
        assert_eq!(p(r"'it\'s'"), Expr::Str("it's".into()));
        assert_eq!(p(r#""é""#), Expr::Str("é".into()));
        assert_eq!(p("2.5e2"), Expr::Number(250.0));
        assert_eq!(p(".5"), Expr::Number(0.5));
        assert!(matches!(
            p("1.isTruthy()"),
            Expr::Call(ref c, _) if matches!(**c, Expr::Member(ref n, ref m) if **n == Expr::Number(1.0) && m == "isTruthy")
        ));
        assert_eq!(p("nível"), Expr::Ident("nível".into()));
    }

    #[test]
    fn errors_say_what_and_where() {
        let e = parse_expression("a +").unwrap_err();
        assert_eq!(e.kind, ExprErrorKind::UnexpectedEnd);
        let e = parse_expression("a b").unwrap_err();
        assert_eq!(e.kind, ExprErrorKind::Unexpected("b".into()));
        assert_eq!(e.at, 2);
        assert_eq!(
            parse_expression("\"abc").unwrap_err().kind,
            ExprErrorKind::Unterminated
        );
        assert_eq!(
            parse_expression("a # b").unwrap_err().kind,
            ExprErrorKind::UnexpectedChar('#')
        );
        assert_eq!(parse_expression("").unwrap_err().kind, ExprErrorKind::Empty);
        assert_eq!(
            parse_expression("   ").unwrap_err().kind,
            ExprErrorKind::Empty
        );
        assert_eq!(
            parse_expression("1e999").unwrap_err().kind,
            ExprErrorKind::BadNumber
        );
        assert_eq!(
            parse_expression("f(a,,b)").unwrap_err().kind,
            ExprErrorKind::Unexpected(",".into())
        );
    }

    #[test]
    fn depth_and_length_are_bounded() {
        let deep = format!("{}1{}", "(".repeat(10_000), ")".repeat(10_000));
        assert_eq!(
            parse_expression(&deep).unwrap_err().kind,
            ExprErrorKind::TooLong
        );
        let deep = format!("{}1{}", "(".repeat(2_000), ")".repeat(2_000));
        assert_eq!(
            parse_expression(&deep).unwrap_err().kind,
            ExprErrorKind::TooDeep
        );
        let chain = vec!["1"; 4_000].join("+");
        assert_eq!(
            parse_expression(&chain).unwrap_err().kind,
            ExprErrorKind::TooDeep
        );
        let calls = "a".to_owned() + &".b()".repeat(1_000);
        assert_eq!(
            parse_expression(&calls).unwrap_err().kind,
            ExprErrorKind::TooDeep
        );
        let ok = vec!["1"; 100].join("+");
        assert!(parse_expression(&ok).is_ok());
        let negs = "-".repeat(1_000) + "1";
        assert_eq!(
            parse_expression(&negs).unwrap_err().kind,
            ExprErrorKind::TooDeep
        );
    }
}
