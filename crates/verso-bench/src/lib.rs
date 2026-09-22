// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Feature 5 of Phase 1 (`docs/reference/bench-decision.md`, decided
//! 2026-09-22): a synthetic vault with a fixed, versioned shape, and a
//! benchmark that measures the product over it — seven operations, wall
//! time, peak resident memory and index size — and compares the medians
//! with a recorded baseline. Not part of the product (ADR 0028): a dev
//! tool, with its own `clippy.toml` saying why it may write files.
//!
//! [`generate`] is the vault; [`baseline`] is the file the numbers are
//! compared with. The binary in `main.rs` drives both.

pub mod baseline;
pub mod generate;
