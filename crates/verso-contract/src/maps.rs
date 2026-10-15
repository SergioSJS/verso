// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Maps on the board (ADR 0090 item 4): how the picture of a map stands
//! for the window, which draws a large one from tiles.

use serde::{Deserialize, Serialize};
use specta::Type;

/// How a map's picture stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum MapState {
    /// Small enough to be drawn whole, as any picture is.
    Whole,
    /// Being cut into tiles: ask again.
    Cutting,
    /// Cut: the tiles are there.
    Ready,
    /// Large, and in a format that cannot be cut (only a PNG can): drawn
    /// whole, with a warning.
    Unsupported,
    /// Could not be cut (`message` says why): drawn whole.
    Failed,
}

/// The tiles of a map's picture.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct MapInfo {
    pub state: MapState,
    /// The picture's size in pixels; 0 when it is not known.
    pub width: u32,
    pub height: u32,
    /// The side of a tile.
    pub tile: u32,
    /// The levels of the pyramid: level 0 is the picture at its own size,
    /// each one above half the one below, the last small enough for one
    /// tile.
    pub levels: u32,
    /// The tiles cut so far and in all (a count of `f64` for the
    /// TypeScript side, as sizes are).
    pub done: f64,
    pub total: f64,
    pub message: String,
}
