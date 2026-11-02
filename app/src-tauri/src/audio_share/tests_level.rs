// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The level meter's feed (ADR 0116 item 21, S6): a measured source tells
//! its window the peak of each 100 ms, one number and no sound, and still
//! hands every block on.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::Listener;

use super::Metered;
use super::source::Source;
use super::tone::TestTone;

#[test]
fn a_measured_source_reports_a_peak_every_hundred_milliseconds_and_passes_the_sound_on() {
    let app = tauri::test::mock_app();
    let peaks = Arc::new(Mutex::new(Vec::<f32>::new()));
    let seen = Arc::clone(&peaks);
    app.listen_any("audio-share-level", move |e| {
        if let Ok(p) = serde_json::from_str::<f32>(e.payload()) {
            seen.lock().unwrap().push(p);
        }
    });
    let blocks = Arc::new(Mutex::new(0_usize));
    let counted = Arc::clone(&blocks);
    let source = Box::new(Metered {
        inner: Box::new(TestTone) as Box<dyn Source>,
        app: app.handle().clone(),
        label: "main".to_owned(),
    });
    let running = source
        .start(Box::new(move |_| *counted.lock().unwrap() += 1))
        .unwrap();
    std::thread::sleep(Duration::from_millis(550));
    drop(running);
    let got = peaks.lock().unwrap().clone();
    assert!(
        (3..=7).contains(&got.len()),
        "{} levels: {got:?}",
        got.len()
    );
    for p in &got {
        assert!((0.15..=0.3).contains(p), "the tone's peak: {p}");
    }
    assert!(*blocks.lock().unwrap() >= 20, "every block still goes on");
}
