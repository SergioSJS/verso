// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A window's Yjs update or state vector walked before `yrs` 0.28 reads it
//! (ADR 0083 item 14, the server's fuzzing): the counts only, never the
//! content. `yrs` reserves room for every element a count declares before
//! it reads the first — an update's clients, a client's runs, a run's
//! values, a value's entries, a state vector's entries — and reads nested
//! values by recursion, with no bound on the depth. A few bytes asked it
//! for gigabytes, and a 200 KB update of nested arrays overflowed the
//! thread's stack, which ends the whole server.
//!
//! The walk reads the v1 layout exactly as `yrs`'s `DecoderV1` does
//! (`Update::decode`, `decode_block`, `ItemContent::decode`,
//! `Any::decode`, `IdSet::decode`, `StateVector::decode`), each number as
//! its `read_var` reads it. A count past the bytes left at that point is
//! refused, since every element takes one byte at least; so is a value
//! nested deeper than [`DEPTH`]. Whatever the walk cannot read — an ending
//! cut short, a kind it does not know — is left to `yrs`, which refuses it
//! on its own: the walk only ever refuses what it read.

/// The deepest a value may nest: a window's values are the board's
/// elements as JSON strings, a map of the board's facts, a subdocument's
/// options; none nests more than a few levels.
pub const DEPTH: usize = 64;

/// Why a walk stopped.
#[derive(Debug, PartialEq, Eq)]
pub enum Stop {
    /// A count past the bytes left, or a value nested past [`DEPTH`]:
    /// refused.
    Bomb,
    /// Something `yrs` will refuse by itself.
    Unreadable,
}

struct Walk<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Walk<'a> {
    fn left(&self) -> usize {
        self.bytes.len().saturating_sub(self.at)
    }

    fn u8(&mut self) -> Result<u8, Stop> {
        let b = *self.bytes.get(self.at).ok_or(Stop::Unreadable)?;
        self.at += 1;
        Ok(b)
    }

    fn skip(&mut self, n: usize) -> Result<(), Stop> {
        if n > self.left() {
            return Err(Stop::Unreadable);
        }
        self.at += n;
        Ok(())
    }

    /// `read_var_u32`: seven bits a byte, the shift wrapping at 32, at
    /// most eleven bytes.
    fn var_u32(&mut self) -> Result<u32, Stop> {
        let mut n: u32 = 0;
        let mut shift: u32 = 0;
        loop {
            let b = self.u8()?;
            n |= u32::from(b & 0x7f).wrapping_shl(shift);
            shift += 7;
            if b < 0x80 {
                return Ok(n);
            }
            if shift > 70 {
                return Err(Stop::Unreadable);
            }
        }
    }

    /// `read_var_u64`, the same at 64 bits.
    fn var_u64(&mut self) -> Result<u64, Stop> {
        let mut n: u64 = 0;
        let mut shift: u32 = 0;
        loop {
            let b = self.u8()?;
            n |= u64::from(b & 0x7f).wrapping_shl(shift);
            shift += 7;
            if b < 0x80 {
                return Ok(n);
            }
            if shift > 70 {
                return Err(Stop::Unreadable);
            }
        }
    }

    /// `read_var_i64`: six bits and a sign first, then seven a byte.
    fn var_i64(&mut self) -> Result<(), Stop> {
        let mut b = self.u8()?;
        let mut shift = 6;
        while b >= 0x80 {
            b = self.u8()?;
            shift += 7;
            if b >= 0x80 && shift > 70 {
                return Err(Stop::Unreadable);
            }
        }
        Ok(())
    }

    /// A count `yrs` reserves room for: refused past the bytes left.
    fn count(&mut self, n: u64) -> Result<u64, Stop> {
        if n > u64::try_from(self.left()).unwrap_or(u64::MAX) {
            return Err(Stop::Bomb);
        }
        Ok(n)
    }

    /// `read_buf` and `read_string`: a length, then that many bytes.
    fn buf(&mut self) -> Result<(), Stop> {
        let len = self.var_u32()?;
        self.skip(usize::try_from(len).map_err(|_| Stop::Unreadable)?)
    }

    /// `read_id`: a client and a clock.
    fn id(&mut self) -> Result<(), Stop> {
        self.var_u64()?;
        self.var_u32()?;
        Ok(())
    }

    /// `Any::decode`, without recursion: each level is the values (and,
    /// for a map, the keys) still to read.
    fn any(&mut self) -> Result<(), Stop> {
        let mut levels: Vec<(u64, bool)> = vec![(1, false)];
        while let Some(level) = levels.last_mut() {
            if level.0 == 0 {
                levels.pop();
                continue;
            }
            level.0 -= 1;
            if level.1 {
                self.buf()?;
            }
            match self.u8()? {
                127 | 126 | 121 | 120 => {}
                125 => self.var_i64()?,
                124 => self.skip(4)?,
                123 | 122 => self.skip(8)?,
                119 | 116 => self.buf()?,
                tag @ (118 | 117) => {
                    let n = self.var_u64()?;
                    let n = self.count(n)?;
                    if levels.len() >= DEPTH {
                        return Err(Stop::Bomb);
                    }
                    levels.push((n, tag == 118));
                }
                _ => return Err(Stop::Unreadable),
            }
        }
        Ok(())
    }

    /// `ItemContent::decode`.
    fn content(&mut self, kind: u8) -> Result<(), Stop> {
        match kind & 0x0f {
            // Deleted: a length.
            1 => {
                self.var_u32()?;
            }
            // JSON: a count, then one string more than it says.
            2 => {
                let n = self.var_u32()?;
                let n = self.count(u64::from(n))?;
                for _ in 0..=n {
                    self.buf()?;
                }
            }
            // Binary, String, Embed (JSON as a string).
            3..=5 => self.buf()?,
            // Format: a key and JSON as a string.
            6 => {
                self.buf()?;
                self.buf()?;
            }
            // A type: its kind, and an XML element's name.
            7 => {
                let type_ref = self.u8()?;
                match type_ref {
                    3 => self.buf()?,
                    0..=2 | 4..=6 | 9 | 15 => {}
                    _ => return Err(Stop::Unreadable),
                }
            }
            // Any: a count, then the values.
            8 => {
                let n = self.var_u32()?;
                let n = self.count(u64::from(n))?;
                for _ in 0..n {
                    self.any()?;
                }
            }
            // A subdocument: its guid and its options.
            9 => {
                self.buf()?;
                self.any()?;
            }
            _ => return Err(Stop::Unreadable),
        }
        Ok(())
    }

    /// `decode_block`.
    fn block(&mut self) -> Result<(), Stop> {
        let info = self.u8()?;
        match info {
            // Skip and GC: a length.
            10 | 0 => {
                self.var_u32()?;
            }
            info => {
                let has_origin = info & 0x80 != 0;
                let has_right = info & 0x40 != 0;
                if has_origin {
                    self.id()?;
                }
                if has_right {
                    self.id()?;
                }
                if !has_origin && !has_right {
                    // The parent: a root type's name, or an item's id.
                    if self.var_u32()? == 1 {
                        self.buf()?;
                    } else {
                        self.id()?;
                    }
                    if info & 0x20 != 0 {
                        self.buf()?;
                    }
                }
                self.content(info)?;
            }
        }
        Ok(())
    }

    /// `IdSet::decode`: clients, each with its ranges of clocks.
    fn delete_set(&mut self) -> Result<(), Stop> {
        let clients = self.var_u32()?;
        let clients = self.count(u64::from(clients))?;
        for _ in 0..clients {
            self.var_u64()?;
            let ranges = self.var_u32()?;
            let ranges = self.count(u64::from(ranges))?;
            for _ in 0..ranges {
                self.var_u32()?;
                self.var_u32()?;
            }
        }
        Ok(())
    }

    /// `Update::decode`: clients, each with its runs; then the deletions.
    fn update(&mut self) -> Result<(), Stop> {
        let clients = self.var_u32()?;
        let clients = self.count(u64::from(clients))?;
        for _ in 0..clients {
            let runs = self.var_u32()?;
            let runs = self.count(u64::from(runs))?;
            self.var_u64()?;
            self.var_u32()?;
            for _ in 0..runs {
                self.block()?;
            }
        }
        self.delete_set()
    }

    /// `StateVector::decode`: entries of a client and a clock.
    fn state_vector(&mut self) -> Result<(), Stop> {
        let entries = self.var_u32()?;
        let entries = self.count(u64::from(entries))?;
        for _ in 0..entries {
            self.var_u64()?;
            self.var_u32()?;
        }
        Ok(())
    }
}

/// The walk of an update: the bytes it read, or why it stopped.
pub fn update(bytes: &[u8]) -> Result<usize, Stop> {
    let mut walk = Walk { bytes, at: 0 };
    walk.update()?;
    Ok(walk.at)
}

/// The walk of a state vector.
pub fn state_vector(bytes: &[u8]) -> Result<usize, Stop> {
    let mut walk = Walk { bytes, at: 0 };
    walk.state_vector()?;
    Ok(walk.at)
}
