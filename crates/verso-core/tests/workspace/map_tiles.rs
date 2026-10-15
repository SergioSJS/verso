// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A map's picture and its tiles (ADR 0090 item 4), through the workspace:
//! a small picture is drawn whole, a large PNG is cut once on a thread of
//! its own and its tiles asked for one at a time, a large JPEG is said to be
//! unsupported from its header alone, and the cache lives beside the index,
//! never in the folder.

use std::io::Cursor;
use std::time::{Duration, Instant};

use super::*;
use verso_core::maptiles::{MapInfo, MapState, pyramid};

/// A PNG of one colour, `w` x `h`.
#[cfg(test)]
fn flat_png(w: u32, h: u32, rgb: [u8; 3]) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, w, h);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        let mut stream = writer.stream_writer().unwrap();
        let row: Vec<u8> = (0..w).flat_map(|_| rgb).collect();
        for _ in 0..h {
            std::io::Write::write_all(&mut stream, &row).unwrap();
        }
        stream.finish().unwrap();
        writer.finish().unwrap();
    }
    out
}

#[cfg(test)]
fn until_cut(ws: &mut Workspace, path: &str) -> MapInfo {
    let end = Instant::now() + Duration::from_secs(180);
    loop {
        let info = ws.map_open(path).unwrap();
        if info.state != MapState::Cutting || Instant::now() > end {
            return info;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(test)]
fn folder_with(name: &str, content: &[u8]) -> (TempDir, TempDir, Kept, Workspace) {
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let kept = bytes(vault.path(), name, content);
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    (vault, config, kept, ws)
}

#[test]
fn a_small_picture_is_drawn_whole_and_a_large_jpeg_is_never_cut() {
    let (_v, _c, _k, mut ws) = folder_with("Pequeno.png", &flat_png(300, 200, [1, 2, 3]));
    let info = ws.map_open("Pequeno.png").unwrap();
    assert_eq!(info.state, MapState::Whole);
    assert_eq!((info.width, info.height), (300, 200));
    assert!(ws.map_tile("Pequeno.png", 0, 0, 0).unwrap().is_none());
    // A JPEG whose header says 20,000 x 20,000: said so, from the header alone.
    let mut jpeg = vec![0xff, 0xd8, 0xff, 0xc0, 0, 17, 8];
    jpeg.extend_from_slice(&20_000u16.to_be_bytes());
    jpeg.extend_from_slice(&20_000u16.to_be_bytes());
    jpeg.extend_from_slice(&[3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    let (_v2, _c2, _k2, mut ws2) = folder_with("Grande.jpg", &jpeg);
    let info = ws2.map_open("Grande.jpg").unwrap();
    assert_eq!(info.state, MapState::Unsupported);
    assert_eq!((info.width, info.height), (20_000, 20_000));
    assert!(info.message.contains("PNG"));
    // Asked again: the same, from what was kept.
    assert_eq!(
        ws2.map_open("Grande.jpg").unwrap().state,
        MapState::Unsupported
    );
}

#[test]
fn a_large_png_is_cut_once_into_tiles_outside_the_folder() {
    // 4,200 x 4,000 is past 16 megapixels: cut, 17 x 16 tiles at level 0.
    let (vault, config, _k, mut ws) =
        folder_with("Mapa.png", &flat_png(4200, 4000, [200, 100, 50]));
    let first = ws.map_open("Mapa.png").unwrap();
    assert!(matches!(first.state, MapState::Cutting | MapState::Ready));
    assert_eq!((first.width, first.height), (4200, 4000));
    let (levels, total) = pyramid(4200, 4000);
    assert_eq!((first.levels, first.total), (levels, total));
    let done = until_cut(&mut ws, "Mapa.png");
    assert_eq!(done.state, MapState::Ready, "{}", done.message);
    assert_eq!(done.done, total);
    // A tile at the top, the whole picture in one; one at level 0, a corner.
    let top = ws.map_tile("Mapa.png", levels - 1, 0, 0).unwrap().unwrap();
    let mut reader = png::Decoder::new(Cursor::new(&top)).read_info().unwrap();
    let mut buf = vec![0; reader.output_buffer_size().unwrap()];
    let frame = reader.next_frame(&mut buf).unwrap();
    assert!(frame.width <= 256 && frame.height <= 256);
    assert_eq!(&buf[..3], &[200, 100, 50]);
    let corner = ws.map_tile("Mapa.png", 0, 16, 15).unwrap().unwrap();
    let reader = png::Decoder::new(Cursor::new(&corner)).read_info().unwrap();
    assert_eq!(
        (reader.info().width, reader.info().height),
        (4200 - 16 * 256, 4000 - 15 * 256)
    );
    // Outside the pyramid: none.
    assert!(ws.map_tile("Mapa.png", 0, 17, 0).unwrap().is_none());
    assert!(ws.map_tile("Mapa.png", levels, 0, 0).unwrap().is_none());
    // Asked again: ready at once, nothing cut again.
    assert_eq!(ws.map_open("Mapa.png").unwrap().state, MapState::Ready);
    // The cache is beside the index, under the configuration directory; the
    // folder holds the picture and no tile.
    assert!(
        ws.index_path()
            .with_extension("tiles")
            .starts_with(config.path())
    );
    assert!(on_disk(vault.path(), "Mapa.png").len() > 100);
    assert!(
        ws.files().iter().all(|f| !f.ends_with(".tiles")),
        "no tile in the folder"
    );
}

#[test]
fn a_picture_that_is_not_a_png_at_all_fails_and_says_why() {
    let (_v, _c, _k, mut ws) = folder_with("Falso.png", b"not a picture at all");
    let info = ws.map_open("Falso.png").unwrap();
    assert_eq!(info.state, MapState::Failed);
    assert!(!info.message.is_empty());
    // Asked again: the same answer, from what was kept.
    let again = ws.map_open("Falso.png").unwrap();
    assert_eq!(
        (again.state, again.message),
        (MapState::Failed, info.message)
    );
}
