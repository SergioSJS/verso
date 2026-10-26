// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A source and a sink over memory, for the tests of the adapters and of
//! the host's passes against the fakes.

use verso_core::sync::remote::{RemoteError, RemoteErrorKind, Result, Sink, Source};

/// Bytes handed out in pieces of `piece`.
pub struct Bytes {
    data: Vec<u8>,
    piece: usize,
    at: usize,
    /// Fail with a local error once this many bytes were handed out.
    pub fail_after: Option<usize>,
}

impl Bytes {
    #[must_use]
    pub fn new(data: &[u8], piece: usize) -> Self {
        Self {
            data: data.to_vec(),
            piece: piece.max(1),
            at: 0,
            fail_after: None,
        }
    }
}

impl Source for Bytes {
    fn next(&mut self) -> Result<Option<Vec<u8>>> {
        if self.fail_after.is_some_and(|n| self.at >= n) {
            return Err(RemoteError::new(RemoteErrorKind::Local, "the disk failed"));
        }
        if self.at >= self.data.len() {
            return Ok(None);
        }
        let end = (self.at + self.piece).min(self.data.len());
        let piece = self.data[self.at..end].to_vec();
        self.at = end;
        Ok(Some(piece))
    }

    fn rewind(&mut self) -> Result<()> {
        self.at = 0;
        Ok(())
    }
}

/// A sink that keeps everything.
#[derive(Default)]
pub struct Collect(pub Vec<u8>);

impl Sink for Collect {
    fn put(&mut self, piece: &[u8]) -> Result<()> {
        self.0.extend_from_slice(piece);
        Ok(())
    }
}

/// The SHA-256 of `bytes`, in hex.
#[must_use]
pub fn sha(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    crate::hex(&Sha256::digest(bytes))
}

/// The `Meta` for `bytes`.
#[must_use]
pub fn meta(bytes: &[u8]) -> verso_core::sync::remote::Meta {
    verso_core::sync::remote::Meta {
        size: bytes.len() as u64,
        hash: sha(bytes),
    }
}
