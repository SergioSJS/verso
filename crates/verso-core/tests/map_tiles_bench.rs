// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The cutting of a large map, measured (ADR 0090 item 4: "measured first
//! on the 1 GB host and a phone"). Ignored: it makes a PNG of `MAP_SIDE`
//! pixels a side (16,000 by default) a row at a time, opens a folder with
//! it, asks for its tiles and waits until they are cut, and prints the
//! time, the size of the file and of the tiles. Run in a container limited
//! to one CPU and 1 GB, and read the container's peak memory:
//!
//! `docker run --cpus 1 --memory 1g … map_tiles_bench --ignored --nocapture`

use std::io::{BufWriter, Write};
use std::time::{Duration, Instant};

use verso_core::Workspace;
use verso_core::maptiles::{MapState, pyramid};

/// A cheap, repeatable noise in 0..=7: a map's grain.
fn grain(x: u32, y: u32) -> u8 {
    let mut h = x.wrapping_mul(0x9E37_79B1) ^ y.wrapping_mul(0x85EB_CA6B);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    (h & 7) as u8
}

/// A terrain-like colour at a pixel: soft bands with a grain, as a painted
/// map compresses (a few bits of noise on a smooth picture).
fn colour(x: u32, y: u32) -> [u8; 3] {
    let land = ((x / 97 + y / 131) % 5) as u8;
    let g = grain(x, y);
    [
        60 + land * 25 + g,
        110 + ((x / 53) % 4) as u8 * 20 + g,
        70 + ((y / 71) % 3) as u8 * 30 + g,
    ]
}

#[test]
#[ignore = "a measurement: run it by name, in a container limited to 1 CPU and 1 GB"]
fn cut_a_large_map_and_say_what_it_cost() {
    let side: u32 = std::env::var("MAP_SIDE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(16_000);
    let vault = tempfile::tempdir().unwrap();
    let config = tempfile::tempdir().unwrap();
    let made = Instant::now();
    let file = tempfile::Builder::new()
        .prefix("Mapa")
        .suffix(".png")
        .rand_bytes(0)
        .tempfile_in(vault.path())
        .unwrap();
    let mut size = 0u64;
    {
        let out = BufWriter::new(file.reopen().unwrap());
        let mut encoder = png::Encoder::new(out, side, side);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fast);
        let mut writer = encoder.write_header().unwrap();
        let mut stream = writer.stream_writer().unwrap();
        let mut row = vec![0u8; side as usize * 3];
        for y in 0..side {
            for x in 0..side {
                let c = colour(x, y);
                row[x as usize * 3..x as usize * 3 + 3].copy_from_slice(&c);
            }
            stream.write_all(&row).unwrap();
        }
        stream.finish().unwrap();
        writer.finish().unwrap();
    }
    // The file's size, read back through the same handle's metadata.
    size += file.as_file().metadata().unwrap().len();
    println!(
        "picture: {side} x {side}, {:.1} MB as a PNG, made in {:.1} s",
        size as f64 / 1e6,
        made.elapsed().as_secs_f64()
    );
    let mut ws = Workspace::open(vault.path(), Some(config.path())).unwrap();
    ws.index().unwrap();
    let name = file
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let (levels, total) = pyramid(side, side);
    println!("pyramid: {levels} levels, {total} tiles of 256 pixels");
    let started = Instant::now();
    let mut info = ws.map_open(&name).unwrap();
    println!(
        "map_open answered in {:.0} ms: {:?}",
        started.elapsed().as_secs_f64() * 1000.0,
        info.state
    );
    let mut last = Instant::now();
    while info.state == MapState::Cutting {
        std::thread::sleep(Duration::from_millis(250));
        info = ws.map_open(&name).unwrap();
        if last.elapsed() > Duration::from_secs(10) {
            println!(
                "  {} of {} tiles after {:.0} s",
                info.done,
                info.total,
                started.elapsed().as_secs_f64()
            );
            last = Instant::now();
        }
    }
    let cut = started.elapsed();
    println!(
        "state: {:?} ({}) after {:.1} s; {} of {} tiles",
        info.state,
        info.message,
        cut.as_secs_f64(),
        info.done,
        info.total
    );
    assert_eq!(info.state, MapState::Ready, "{}", info.message);
    println!(
        "tile store: {}",
        ws.index_path().with_extension("tiles").display()
    );
    // What the tiles weigh, all of them, as the store keeps them.
    let mut bytes = 0u64;
    let mut side_now = side;
    for level in 0..levels {
        for y in 0..side_now.div_ceil(256) {
            for x in 0..side_now.div_ceil(256) {
                bytes += ws.map_tile(&name, level, x, y).unwrap().unwrap().len() as u64;
            }
        }
        side_now = side_now.div_ceil(2);
    }
    println!(
        "tiles: {:.0} MB of PNG in all, {} KB on average",
        bytes as f64 / 1e6,
        bytes / 1024 / total
    );
    // A tile at each end of the pyramid, as the window asks for them.
    let top = ws.map_tile(&name, levels - 1, 0, 0).unwrap().unwrap();
    let corner = ws.map_tile(&name, 0, 0, 0).unwrap().unwrap();
    println!(
        "tile sizes: top {} bytes, level 0 {} bytes",
        top.len(),
        corner.len()
    );
}
