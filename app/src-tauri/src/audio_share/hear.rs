// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A live share heard in a desktop window (ADR 0116 items 18 and 19), the
//! receive half of the host's part: the server sends a listening window's
//! audio frames as binary messages on the connection the host holds for it
//! — a server's folder (`remote.rs`), or a folder of this computer synced
//! with one (`sync/live.rs`) — and the host hands each, as it came, to the
//! window over a channel of bytes the window gave (`audio_share_hear`), as
//! the terminal's output goes (ADR 0115 item 5). The host reads nothing of a
//! frame past the first byte that tells it from a piece of a file, decodes
//! nothing and keeps nothing: a window that gave no channel, or whose
//! channel is gone, simply gets none.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use tauri::ipc::{Channel, InvokeResponseBody, IpcResponse};
use verso_contract::ContractError;
use verso_service::lock;

/// One audio frame for the window: its bytes, raw over the IPC (an
/// `ArrayBuffer` in the window, never a JSON array of numbers).
pub struct ShareFrame(pub Vec<u8>);

impl IpcResponse for ShareFrame {
    fn body(self) -> tauri::Result<InvokeResponseBody> {
        Ok(InvokeResponseBody::Raw(self.0))
    }
}

impl specta::Type for ShareFrame {
    fn definition(_: &mut specta::Types) -> specta::datatype::DataType {
        specta::datatype::DataType::Reference(specta_typescript::define("ArrayBuffer"))
    }
}

/// Where a window's frames go: true while the window is there to take them.
pub(crate) type Sink = Box<dyn Fn(Vec<u8>) -> bool + Send + Sync>;

/// The windows that gave a channel, by label.
static HEARERS: LazyLock<Mutex<HashMap<String, Sink>>> = LazyLock::new(Mutex::default);

/// Window `label` takes its frames on `sink` (replacing the one it gave
/// before, as after a reload).
pub(crate) fn hear(label: &str, sink: Sink) {
    lock(&HEARERS).insert(label.to_owned(), sink);
}

/// Window `label` is gone.
pub(crate) fn forget(label: &str) {
    lock(&HEARERS).remove(label);
}

/// Hand `frame` to each of `windows` that gave a channel; one whose channel
/// is gone is forgotten. How many took it.
pub(crate) fn deliver(windows: &[String], frame: &[u8]) -> usize {
    let mut hearers = lock(&HEARERS);
    let mut took = 0;
    for w in windows {
        let Some(sink) = hearers.get(w) else {
            continue;
        };
        if sink(frame.to_vec()) {
            took += 1;
        } else {
            hearers.remove(w);
        }
    }
    took
}

/// Whether a binary message the server sent is an audio frame for the
/// window rather than a piece of a file (`verso_contract::is_audio_frame`:
/// its first byte's top bit).
pub(crate) fn is_frame(bytes: &[u8]) -> bool {
    verso_contract::is_audio_frame(bytes)
}

/// This window's live-share frames come on `frames`, as the server sends
/// them, once it listens (`table_share_listen`). Any window may hear: no
/// capability is needed to listen (item 27).
#[tauri::command]
#[specta::specta]
pub fn audio_share_hear<R: tauri::Runtime>(
    window: tauri::Window<R>,
    frames: Channel<ShareFrame>,
) -> Result<(), ContractError> {
    hear(
        window.label(),
        Box::new(move |bytes| frames.send(ShareFrame(bytes)).is_ok()),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn counting(n: &Arc<AtomicUsize>, alive: bool) -> Sink {
        let n = Arc::clone(n);
        Box::new(move |bytes| {
            assert_eq!(bytes, [0x80, 0, 0, 1, 9]);
            n.fetch_add(1, Ordering::Relaxed);
            alive
        })
    }

    #[test]
    fn a_frame_goes_to_the_windows_that_gave_a_channel_and_a_gone_one_is_forgotten() {
        let (a, b) = (Arc::new(AtomicUsize::new(0)), Arc::new(AtomicUsize::new(0)));
        hear("hear-test-a", counting(&a, true));
        hear("hear-test-b", counting(&b, false));
        let to = ["hear-test-a", "hear-test-b", "hear-test-none"].map(str::to_owned);
        let frame = [0x80, 0, 0, 1, 9];
        assert_eq!(deliver(&to, &frame), 1);
        assert_eq!(deliver(&to, &frame), 1);
        assert_eq!(a.load(Ordering::Relaxed), 2);
        // The window whose channel failed was tried once, then forgotten.
        assert_eq!(b.load(Ordering::Relaxed), 1);
        forget("hear-test-a");
        assert_eq!(deliver(&to, &frame), 0);
    }

    #[test]
    fn an_audio_frame_is_told_from_a_piece_of_a_file() {
        assert!(is_frame(&[0x80, 0, 0, 0, 1]));
        // A piece (sync 2): its header's length first, the top bit clear.
        let piece = verso_core::sync::frame(b"{}", b"abc");
        assert!(!is_frame(&piece));
        assert!(!is_frame(&[]));
    }
}
