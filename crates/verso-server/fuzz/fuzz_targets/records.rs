// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The inputs of the targets that feed a room several things at once: the
//! fuzzer's bytes cut into records, each a length in two bytes
//! (little-endian) and that many bytes; the last one is what is left when
//! fewer remain. `examples/seeds.rs` writes them the same way.

pub fn records(mut data: &[u8]) -> Vec<&[u8]> {
    let mut out = Vec::new();
    while let Some((len, rest)) = data.split_first_chunk::<2>() {
        let len = usize::from(u16::from_le_bytes(*len)).min(rest.len());
        let (record, after) = rest.split_at(len);
        out.push(record);
        data = after;
    }
    out
}

/// Record `i`, empty when there is none.
pub fn record<'a>(records: &[&'a [u8]], i: usize) -> &'a [u8] {
    records.get(i).copied().unwrap_or_default()
}
