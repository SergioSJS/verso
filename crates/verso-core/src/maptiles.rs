// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Tiles for a map's picture (ADR 0090 item 4, decided 2026-10-14): a
//! picture too large to be drawn whole — a continent at 16,000 pixels a
//! side is a gigabyte once decoded, and a phone or a 1 GB host cannot hold
//! it — is cut **once** into a pyramid of 256-pixel tiles, kept outside the
//! folder (`verso_index::tiles`), and the window draws the tiles in view at
//! the zoom shown. Level 0 is the picture at its own size; each level above
//! it is half the one below, until one tile holds it.
//!
//! The cutting never holds the picture decoded. A PNG is decoded one row at
//! a time (the `png` crate's streaming reader); every row goes into a strip
//! of 256 rows of its level and, two rows at a time, averaged into the strip
//! of the level above. A strip that is full is cut into tiles, encoded and
//! handed to the store, and its memory reused: what is held is the
//! compressed file and a few strips (about the picture's width times 256
//! rows times 4 bytes, and half that again for all the levels above), not
//! the picture. It runs on a thread of its own, so that no command waits
//! for it (the folder's lock is not held), and at most one picture is cut
//! at a time per process.
//!
//! Only PNG is cut. A JPEG or a WebP is decoded whole by every decoder in
//! the tree, so it cannot be cut within the memory this exists for: such a
//! picture is reported as it is — its size, when the header says it — and
//! the window draws it whole, with a warning when it is large.

use std::collections::HashSet;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use verso_index::tiles::{State, TileStore};

use crate::{CoreError, Workspace};

/// The side of a tile, in pixels.
pub const TILE: u32 = 256;

/// A picture with more pixels than this is cut; one with fewer is drawn
/// whole, as any picture on the board is (16 megapixels is 64 MB decoded).
pub const WHOLE_PIXELS: u64 = 16_000_000;

/// The widest and the tallest picture cut.
const SIDE_MOST: u32 = 65_536;

/// The most pixels a picture cut may have (a 32,768-pixel square).
const PIXELS_MOST: u64 = 1_100_000_000;

/// The largest file read to be cut.
pub const FILE_MOST: u64 = 384 * 1024 * 1024;

/// How a map's picture stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MapState {
    /// Small enough to be drawn whole.
    Whole,
    /// Being cut: tiles come in as it goes.
    Cutting,
    /// Cut: every tile is there.
    Ready,
    /// Not cut, and the window can only draw it whole — a format that is
    /// not PNG; large, which the window warns of.
    Unsupported,
    /// Could not be cut (see the message).
    Failed,
}

/// What the window learns of a map's picture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapInfo {
    pub state: MapState,
    /// The picture's size; 0 when it is not known (a format not read).
    pub width: u32,
    pub height: u32,
    pub tile: u32,
    /// How many levels the pyramid has (level 0 is the picture itself).
    pub levels: u32,
    /// The tiles cut so far and the tiles the pyramid has.
    pub done: u64,
    pub total: u64,
    pub message: String,
}

/// The number of levels a picture of this size has, and of tiles.
#[must_use]
pub fn pyramid(width: u32, height: u32) -> (u32, u64) {
    let (mut w, mut h) = (width.max(1), height.max(1));
    let mut levels = 1;
    let mut tiles = u64::from(w.div_ceil(TILE)) * u64::from(h.div_ceil(TILE));
    while w > TILE || h > TILE {
        w = w.div_ceil(2);
        h = h.div_ceil(2);
        levels += 1;
        tiles += u64::from(w.div_ceil(TILE)) * u64::from(h.div_ceil(TILE));
    }
    (levels, tiles)
}

/// The size of a JPEG, read from its header without decoding it.
fn jpeg_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.get(..2)? != [0xff, 0xd8] {
        return None;
    }
    let mut i = 2;
    while i + 4 <= bytes.len() {
        if bytes[i] != 0xff {
            i += 1;
            continue;
        }
        let marker = bytes[i + 1];
        if marker == 0xff {
            i += 1;
            continue;
        }
        if (0xd0..=0xd9).contains(&marker) || marker == 0x01 || marker == 0 {
            i += 2;
            continue;
        }
        let len = usize::from(u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]));
        // Start of frame: baseline, extended, progressive, lossless.
        if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
            let frame = bytes.get(i + 5..i + 9)?;
            let h = u32::from(u16::from_be_bytes([frame[0], frame[1]]));
            let w = u32::from(u16::from_be_bytes([frame[2], frame[3]]));
            return Some((w, h));
        }
        i += 2 + len;
    }
    None
}

/// One level of the pyramid being cut: the strip of rows it is filling.
struct Level {
    width: u32,
    height: u32,
    /// RGBA rows of the current strip.
    strip: Vec<u8>,
    rows: u32,
    /// The strip's index, counted in strips of [`TILE`] rows.
    index: u32,
    seen: u32,
    /// An odd row waiting for the one that pairs with it.
    pending: Option<Vec<u8>>,
}

/// Cuts a picture into tiles as its rows come.
struct Cutter<'a> {
    levels: Vec<Level>,
    alpha: bool,
    path: &'a str,
    store: &'a mut TileStore,
}

/// The average of two rows of RGBA, halved in width (a last odd column
/// pairs with itself).
fn halve(a: &[u8], b: &[u8], out_width: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(out_width as usize * 4);
    let px = |row: &[u8], x: usize| -> [u32; 4] {
        let at = x.min(row.len() / 4 - 1) * 4;
        [
            u32::from(row[at]),
            u32::from(row[at + 1]),
            u32::from(row[at + 2]),
            u32::from(row[at + 3]),
        ]
    };
    for x in 0..out_width as usize {
        let (p, q, r, s) = (
            px(a, 2 * x),
            px(a, 2 * x + 1),
            px(b, 2 * x),
            px(b, 2 * x + 1),
        );
        for c in 0..4 {
            out.push(u8::try_from((p[c] + q[c] + r[c] + s[c] + 2) / 4).unwrap_or(255));
        }
    }
    out
}

impl Cutter<'_> {
    fn new<'a>(
        width: u32,
        height: u32,
        alpha: bool,
        path: &'a str,
        store: &'a mut TileStore,
    ) -> Cutter<'a> {
        let (count, _) = pyramid(width, height);
        let (mut w, mut h) = (width, height);
        let mut levels = Vec::new();
        for _ in 0..count {
            levels.push(Level {
                width: w,
                height: h,
                strip: Vec::new(),
                rows: 0,
                index: 0,
                seen: 0,
                pending: None,
            });
            w = w.div_ceil(2);
            h = h.div_ceil(2);
        }
        Cutter {
            levels,
            alpha,
            path,
            store,
        }
    }

    /// A row of RGBA pixels of level `at`.
    fn push(&mut self, at: usize, row: Vec<u8>) -> Result<(), String> {
        let last = at + 1 == self.levels.len();
        let level = &mut self.levels[at];
        level.strip.extend_from_slice(&row);
        level.rows += 1;
        level.seen += 1;
        let finished = level.seen == level.height;
        if level.rows == TILE || finished {
            self.flush(at)?;
        }
        if last {
            return Ok(());
        }
        let level = &mut self.levels[at];
        match level.pending.take() {
            None if finished => {
                // An odd last row pairs with itself.
                let up = halve(&row, &row, self.levels[at + 1].width);
                self.push(at + 1, up)?;
            }
            None => level.pending = Some(row),
            Some(first) => {
                let up = halve(&first, &row, self.levels[at + 1].width);
                self.push(at + 1, up)?;
            }
        }
        Ok(())
    }

    /// The strip of level `at` is full (or the picture ends): cut into
    /// tiles, encoded, kept.
    fn flush(&mut self, at: usize) -> Result<(), String> {
        let level = &mut self.levels[at];
        let (width, rows) = (level.width as usize, level.rows as usize);
        let strip = std::mem::take(&mut level.strip);
        let (tile_row, number) = (level.index, at as u32);
        level.index += 1;
        level.rows = 0;
        let mut made = Vec::new();
        for tx in 0..level.width.div_ceil(TILE) {
            let x0 = tx as usize * TILE as usize;
            let w = (width - x0).min(TILE as usize);
            let mut pixels = Vec::with_capacity(w * rows * if self.alpha { 4 } else { 3 });
            for r in 0..rows {
                let from = (r * width + x0) * 4;
                let line = &strip[from..from + w * 4];
                if self.alpha {
                    pixels.extend_from_slice(line);
                } else {
                    for px in line.as_chunks::<4>().0 {
                        pixels.extend_from_slice(&px[..3]);
                    }
                }
            }
            let png = encode(&pixels, w as u32, rows as u32, self.alpha)?;
            made.push((number, tx, tile_row, png));
        }
        self.store.put(self.path, &made).map_err(|e| e.to_string())
    }
}

fn encode(pixels: &[u8], w: u32, h: u32, alpha: bool) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, w, h);
    encoder.set_color(if alpha {
        png::ColorType::Rgba
    } else {
        png::ColorType::Rgb
    });
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(pixels).map_err(|e| e.to_string())?;
    writer.finish().map_err(|e| e.to_string())?;
    Ok(out)
}

/// What the header of a PNG says: its size, whether it has an alpha
/// channel, whether it is interlaced.
fn png_header(bytes: &[u8]) -> Result<(u32, u32, bool, bool), String> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let reader = decoder.read_info().map_err(|e| e.to_string())?;
    let (color, _) = reader.output_color_type();
    let info = reader.info();
    let alpha = matches!(color, png::ColorType::Rgba | png::ColorType::GrayscaleAlpha);
    Ok((info.width, info.height, alpha, info.interlaced))
}

/// Cut the PNG `bytes` into the store for `path`. Rows are decoded one at
/// a time; nothing of the picture is held but the strips (module docs).
fn cut(bytes: &[u8], path: &str, store: &mut TileStore) -> Result<(), String> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    let (color, _) = reader.output_color_type();
    let (width, height) = (reader.info().width, reader.info().height);
    let alpha = matches!(color, png::ColorType::Rgba | png::ColorType::GrayscaleAlpha);
    let mut cutter = Cutter::new(width, height, alpha, path, store);
    for _ in 0..height {
        let row = reader
            .next_row()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "the picture ends early".to_owned())?;
        let rgba = match color {
            png::ColorType::Rgba => row.data().to_vec(),
            png::ColorType::Rgb => row
                .data()
                .as_chunks::<3>()
                .0
                .iter()
                .flat_map(|p| [p[0], p[1], p[2], 255])
                .collect(),
            png::ColorType::GrayscaleAlpha => row
                .data()
                .as_chunks::<2>()
                .0
                .iter()
                .flat_map(|p| [p[0], p[0], p[0], p[1]])
                .collect(),
            png::ColorType::Grayscale => {
                row.data().iter().flat_map(|g| [*g, *g, *g, 255]).collect()
            }
            png::ColorType::Indexed => return Err("a palette was not expanded".to_owned()),
        };
        cutter.push(0, rgba)?;
    }
    Ok(())
}

/// The pictures being cut, by store and path: one thread each, one at a
/// time per process.
static CUTTING: Mutex<Option<HashSet<(PathBuf, String)>>> = Mutex::new(None);

fn claim(file: &Path, path: &str) -> bool {
    let Ok(mut set) = CUTTING.lock() else {
        return false;
    };
    let set = set.get_or_insert_with(HashSet::new);
    if !set.is_empty() {
        return false;
    }
    set.insert((file.to_path_buf(), path.to_owned()));
    true
}

/// Whether some picture is being cut now.
fn busy() -> bool {
    CUTTING
        .lock()
        .is_ok_and(|set| set.as_ref().is_some_and(|s| !s.is_empty()))
}

fn release(file: &Path, path: &str) {
    if let Ok(mut set) = CUTTING.lock()
        && let Some(set) = set.as_mut()
    {
        set.remove(&(file.to_path_buf(), path.to_owned()));
    }
}

fn running(file: &Path, path: &str) -> bool {
    CUTTING.lock().is_ok_and(|set| {
        set.as_ref()
            .is_some_and(|s| s.contains(&(file.to_path_buf(), path.to_owned())))
    })
}

fn is_png(path: &str) -> bool {
    path.to_lowercase().ends_with(".png")
}

fn is_jpeg(path: &str) -> bool {
    let l = path.to_lowercase();
    l.ends_with(".jpg") || l.ends_with(".jpeg")
}

/// A picture that is not cut: drawn whole, but a large one that is no PNG
/// is flagged.
fn whole_or_not(key: &str, (w, h): (u32, u32)) -> MapInfo {
    if !is_png(key) && u64::from(w) * u64::from(h) > WHOLE_PIXELS {
        return info(MapState::Unsupported, (w, h), 0, UNSUPPORTED);
    }
    info(MapState::Whole, (w, h), 0, "")
}

const UNSUPPORTED: &str = "only a PNG picture can be cut into tiles";

fn info(state: MapState, (width, height): (u32, u32), done: u64, message: &str) -> MapInfo {
    let (levels, total) = if width > 0 && height > 0 {
        pyramid(width, height)
    } else {
        (0, 0)
    };
    MapInfo {
        state,
        width,
        height,
        tile: TILE,
        levels,
        done,
        total,
        message: message.to_owned(),
    }
}

impl Workspace {
    /// Where the tiles of this folder are kept: beside its index, outside
    /// the folder (ADR 0090 item 4, ADR 0011).
    fn tiles_file(&self) -> PathBuf {
        self.index_path().with_extension("tiles")
    }

    /// What `stamp` of the picture at `key` the tiles are cut from: its
    /// length and time as the last walk saw them.
    fn picture_stamp(&self, key: &str) -> Option<String> {
        self.entries
            .iter()
            .find(|e| e.path == key)
            .map(|e| format!("{}:{}", e.len, e.modified))
    }

    /// The state of the tiles of the picture at `relative`, starting to
    /// cut it when it is large, a PNG, and not cut yet (or cut from
    /// another picture). Never waits for the cutting: ask again.
    pub fn map_open(&mut self, relative: &str) -> Result<MapInfo, CoreError> {
        let key = self.entry_key(relative)?;
        let stamp = match self.picture_stamp(&key) {
            Some(stamp) => stamp,
            // Not walked yet (just made): read it.
            None => format!("{}:0", self.read_file(&key)?.len()),
        };
        let file = self.tiles_file();
        let store = TileStore::open(&file).map_err(CoreError::Index)?;
        if let Some(row) = store.map(&key).map_err(CoreError::Index)?
            && row.stamp == stamp
        {
            let done = store.count(&key).map_err(CoreError::Index)?;
            let size = (row.width, row.height);
            return Ok(match row.state {
                State::Ready if row.levels == 0 => whole_or_not(&key, size),
                State::Ready => info(MapState::Ready, size, done, ""),
                State::Failed => info(MapState::Failed, size, done, &row.message),
                State::Cutting if running(&file, &key) => info(MapState::Cutting, size, done, ""),
                // A cutting that no thread of this process is doing
                // (the app was closed in the middle): begun again.
                State::Cutting => return self.cut_again(&key, &stamp, &file, store),
            });
        }
        self.cut_again(&key, &stamp, &file, store)
    }

    fn cut_again(
        &mut self,
        key: &str,
        stamp: &str,
        file: &Path,
        mut store: TileStore,
    ) -> Result<MapInfo, CoreError> {
        let long = self
            .entries
            .iter()
            .find(|e| e.path == key)
            .map_or(0, |e| e.len);
        if long > FILE_MOST {
            return Ok(info(
                MapState::Failed,
                (0, 0),
                0,
                "the picture is too large to be cut",
            ));
        }
        // Another picture is being cut: this one waits, without reading
        // its file at every ask.
        if is_png(key) && long > 2 * 1024 * 1024 && busy() && !running(file, key) {
            store
                .begin(key, stamp, (0, 0, TILE, 0))
                .map_err(CoreError::Index)?;
            return Ok(info(MapState::Cutting, (0, 0), 0, ""));
        }
        let bytes = self.read_file(key)?;
        if !is_png(key) {
            let size = if is_jpeg(key) {
                jpeg_size(&bytes)
            } else {
                None
            };
            let (w, h) = size.unwrap_or((0, 0));
            // Remembered as it is: not asked again until it changes.
            store
                .begin(key, stamp, (w, h, TILE, 0))
                .map_err(CoreError::Index)?;
            store.finish(key, Ok(())).map_err(CoreError::Index)?;
            return Ok(whole_or_not(key, (w, h)));
        }
        let (w, h, _, interlaced) = match png_header(&bytes) {
            Ok(h) => h,
            Err(why) => {
                store
                    .begin(key, stamp, (0, 0, TILE, 0))
                    .map_err(CoreError::Index)?;
                store.finish(key, Err(&why)).map_err(CoreError::Index)?;
                return Ok(info(MapState::Failed, (0, 0), 0, &why));
            }
        };
        let pixels = u64::from(w) * u64::from(h);
        if pixels <= WHOLE_PIXELS {
            store
                .begin(key, stamp, (w, h, TILE, 0))
                .map_err(CoreError::Index)?;
            store.finish(key, Ok(())).map_err(CoreError::Index)?;
            return Ok(info(MapState::Whole, (w, h), 0, ""));
        }
        let refuse = if w > SIDE_MOST || h > SIDE_MOST || pixels > PIXELS_MOST {
            Some("the picture is too large to be cut")
        } else if interlaced {
            Some("an interlaced PNG is decoded whole: save it again without interlacing")
        } else {
            None
        };
        if let Some(why) = refuse {
            store
                .begin(key, stamp, (w, h, TILE, 0))
                .map_err(CoreError::Index)?;
            store.finish(key, Err(why)).map_err(CoreError::Index)?;
            return Ok(info(MapState::Failed, (w, h), 0, why));
        }
        let (levels, _) = pyramid(w, h);
        store
            .begin(key, stamp, (w, h, TILE, levels))
            .map_err(CoreError::Index)?;
        if !claim(file, key) {
            // Another picture is being cut: this one waits for the next
            // ask (the store says it is cutting; no thread does it yet).
            return Ok(info(MapState::Cutting, (w, h), 0, ""));
        }
        let (file_owned, key_owned) = (file.to_path_buf(), key.to_owned());
        let spawned = std::thread::Builder::new()
            .name("map-tiles".to_owned())
            .spawn(move || {
                let outcome = TileStore::open(&file_owned)
                    .map_err(|e| e.to_string())
                    .and_then(|mut s| {
                        let done = cut(&bytes, &key_owned, &mut s);
                        let _ = s.finish(
                            &key_owned,
                            done.as_ref().map(|_| ()).map_err(|e| e.as_str()),
                        );
                        done
                    });
                // The store says how it went (`finish`); a store that
                // could not even be opened leaves the picture "cutting",
                // which the next ask begins again.
                drop(outcome);
                release(&file_owned, &key_owned);
            });
        if let Err(e) = spawned {
            release(file, key);
            let why = e.to_string();
            store.finish(key, Err(&why)).map_err(CoreError::Index)?;
            return Ok(info(MapState::Failed, (w, h), 0, &why));
        }
        Ok(info(MapState::Cutting, (w, h), 0, ""))
    }

    /// One tile (a PNG) of the picture at `relative`: `None` when it is not
    /// there (not cut yet, outside the pyramid, or cut from another
    /// picture).
    pub fn map_tile(
        &mut self,
        relative: &str,
        level: u32,
        x: u32,
        y: u32,
    ) -> Result<Option<Vec<u8>>, CoreError> {
        let key = self.entry_key(relative)?;
        let Some(stamp) = self.picture_stamp(&key) else {
            return Ok(None);
        };
        let store = TileStore::open(&self.tiles_file()).map_err(CoreError::Index)?;
        store
            .tile(&key, &stamp, (level, x, y))
            .map_err(CoreError::Index)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_of(width: u32, height: u32, rgb: impl Fn(u32, u32) -> [u8; 3]) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut out, width, height);
            encoder.set_color(png::ColorType::Rgb);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().unwrap();
            let mut data = Vec::new();
            for y in 0..height {
                for x in 0..width {
                    data.extend_from_slice(&rgb(x, y));
                }
            }
            writer.write_image_data(&data).unwrap();
        }
        out
    }

    fn decoded(png: &[u8]) -> (u32, u32, Vec<u8>) {
        let mut reader = png::Decoder::new(Cursor::new(png)).read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut buf).unwrap();
        (info.width, info.height, buf)
    }

    #[test]
    fn the_pyramid_halves_until_one_tile_holds_it() {
        assert_eq!(pyramid(256, 256), (1, 1));
        assert_eq!(pyramid(257, 10), (2, 2 + 1));
        assert_eq!(pyramid(16_000, 16_000).0, 7);
        assert_eq!(
            pyramid(16_000, 16_000).1,
            63 * 63 + 32 * 32 + 16 * 16 + 8 * 8 + 4 * 4 + 2 * 2 + 1
        );
    }

    #[test]
    fn a_picture_is_cut_into_tiles_that_put_it_back_together() {
        // 600 x 300: three tile columns, two rows at level 0.
        let source = png_of(600, 300, |x, y| {
            [(x % 251) as u8, (y % 241) as u8, ((x + y) % 239) as u8]
        });
        let mut store = TileStore::memory().unwrap();
        store.begin("m.png", "s", (600, 300, TILE, 3)).unwrap();
        cut(&source, "m.png", &mut store).unwrap();
        store.finish("m.png", Ok(())).unwrap();
        assert_eq!(store.count("m.png").unwrap(), pyramid(600, 300).1);
        // Level 0: every pixel is where it was.
        for (tx, ty) in [(0, 0), (2, 0), (1, 1), (2, 1)] {
            let png = store.tile("m.png", "s", (0, tx, ty)).unwrap().unwrap();
            let (w, h, px) = decoded(&png);
            assert_eq!(w, (600 - tx * TILE).min(TILE));
            assert_eq!(h, (300 - ty * TILE).min(TILE));
            for (x, y) in [(0u32, 0u32), (w - 1, h - 1)] {
                let (sx, sy) = (tx * TILE + x, ty * TILE + y);
                let at = ((y * w + x) * 3) as usize;
                assert_eq!(
                    &px[at..at + 3],
                    &[(sx % 251) as u8, (sy % 241) as u8, ((sx + sy) % 239) as u8]
                );
            }
        }
        // Level 1 is half the size, level 2 fits in one tile.
        let one = store.tile("m.png", "s", (1, 0, 0)).unwrap().unwrap();
        assert_eq!((decoded(&one).0, decoded(&one).1), (256, 150));
        let top = store.tile("m.png", "s", (2, 0, 0)).unwrap().unwrap();
        assert_eq!((decoded(&top).0, decoded(&top).1), (150, 75));
        assert!(store.tile("m.png", "s", (3, 0, 0)).unwrap().is_none());
    }

    #[test]
    fn a_flat_colour_stays_that_colour_at_every_level() {
        let source = png_of(513, 515, |_, _| [10, 200, 30]);
        let mut store = TileStore::memory().unwrap();
        let (levels, _) = pyramid(513, 515);
        assert_eq!(levels, 3);
        store.begin("f.png", "s", (513, 515, TILE, levels)).unwrap();
        cut(&source, "f.png", &mut store).unwrap();
        for level in 0..levels {
            let png = store.tile("f.png", "s", (level, 0, 0)).unwrap().unwrap();
            let (_, _, px) = decoded(&png);
            assert!(
                px.as_chunks::<3>().0.iter().all(|p| *p == [10, 200, 30]),
                "level {level}"
            );
        }
    }

    #[test]
    fn a_jpeg_s_size_is_read_from_its_header() {
        let mut jpeg = vec![0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0];
        jpeg.extend_from_slice(&[0xff, 0xc0, 0, 11, 8, 0x12, 0x34, 0x56, 0x78, 3]);
        assert_eq!(jpeg_size(&jpeg), Some((0x5678, 0x1234)));
        assert_eq!(jpeg_size(b"not a jpeg"), None);
    }
}
