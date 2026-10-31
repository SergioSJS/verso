// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Just enough XML for what WebDAV (`PROPFIND`'s multistatus) and S3
//! (`ListObjectsV2`, errors, copies) answer: a flat stream of opening and
//! closing tags by their local names (a prefix, `d:` or `D:` or none, is
//! dropped), and the text between, entities decoded. Not a validating
//! parser and not a general one: attributes are ignored, a document that
//! is not well formed ends where it stops being so, and nothing here ever
//! allocates more than the text it was given.

/// One thing in the stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ev {
    Open(String),
    Close(String),
    Text(String),
}

/// The stream of `xml`.
#[must_use]
pub fn events(xml: &str) -> Vec<Ev> {
    let mut out = Vec::new();
    let mut rest = xml;
    while !rest.is_empty() {
        let Some(lt) = rest.find('<') else {
            push_text(&mut out, rest);
            break;
        };
        push_text(&mut out, &rest[..lt]);
        rest = &rest[lt..];
        if let Some(after) = rest.strip_prefix("<!--") {
            rest = after.find("-->").map_or("", |e| &after[e + 3..]);
        } else if let Some(after) = rest.strip_prefix("<![CDATA[") {
            let end = after.find("]]>").unwrap_or(after.len());
            if end > 0 {
                out.push(Ev::Text(after[..end].to_owned()));
            }
            rest = after.get(end + 3..).unwrap_or("");
        } else if rest.starts_with("<?") || rest.starts_with("<!") {
            rest = rest.find('>').map_or("", |e| &rest[e + 1..]);
        } else {
            let Some(gt) = rest.find('>') else { break };
            let tag = &rest[1..gt];
            rest = &rest[gt + 1..];
            if let Some(name) = tag.strip_prefix('/') {
                out.push(Ev::Close(local(name)));
            } else {
                let selfclosing = tag.ends_with('/');
                let name = local(tag.trim_end_matches('/'));
                out.push(Ev::Open(name.clone()));
                if selfclosing {
                    out.push(Ev::Close(name));
                }
            }
        }
    }
    out
}

fn local(tag: &str) -> String {
    let name = tag.split(|c: char| c.is_whitespace()).next().unwrap_or("");
    name.rsplit(':').next().unwrap_or(name).to_owned()
}

fn push_text(out: &mut Vec<Ev>, raw: &str) {
    if !raw.trim().is_empty() {
        out.push(Ev::Text(unescape(raw)));
    }
}

/// `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;` and numeric references.
#[must_use]
pub fn unescape(raw: &str) -> String {
    if !raw.contains('&') {
        return raw.to_owned();
    }
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let Some(semi) = rest.find(';').filter(|s| *s <= 10) else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let entity = &rest[1..semi];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => entity
                .strip_prefix("#x")
                .and_then(|h| u32::from_str_radix(h, 16).ok())
                .or_else(|| entity.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &rest[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// The text of the first element named `name` in `events`, if any.
#[must_use]
pub fn first_text(events: &[Ev], name: &str) -> Option<String> {
    let mut at = events
        .iter()
        .position(|e| matches!(e, Ev::Open(n) if n == name))?
        + 1;
    let mut text = String::new();
    while let Some(e) = events.get(at) {
        match e {
            Ev::Text(t) => text.push_str(t),
            Ev::Close(n) if n == name => break,
            _ => {}
        }
        at += 1;
    }
    Some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefixes_are_dropped_and_entities_decoded() {
        let ev = events(
            r#"<?xml version="1.0"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>/a%20b/c&amp;d.md</D:href><D:collection/></D:response></D:multistatus>"#,
        );
        assert_eq!(first_text(&ev, "href").as_deref(), Some("/a%20b/c&d.md"));
        assert!(ev.contains(&Ev::Open("collection".into())));
        assert!(ev.contains(&Ev::Close("collection".into())));
    }

    #[test]
    fn comments_and_cdata_and_numeric_references() {
        let ev = events("<a><!-- no --><b><![CDATA[x < y]]></b><c>&#233;&#x41;&nope;</c></a>");
        assert_eq!(first_text(&ev, "b").as_deref(), Some("x < y"));
        assert_eq!(first_text(&ev, "c").as_deref(), Some("éA&nope;"));
    }

    #[test]
    fn a_document_cut_short_ends_where_it_stops() {
        let ev = events("<a><b>text</b><c");
        assert_eq!(first_text(&ev, "b").as_deref(), Some("text"));
        assert!(events("<").is_empty());
        assert!(events("&").is_empty() || events("&") == vec![Ev::Text("&".into())]);
    }
}
