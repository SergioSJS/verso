// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Places where a test runs something of its own in the middle of a step,
//! by name and folder: what another person asks at that moment, made to
//! happen there every time instead of now and then.

use std::sync::Mutex;

use verso_service::lock;

type Hook = Box<dyn FnOnce() + Send>;

static HOOKS: Mutex<Vec<(&'static str, String, Hook)>> = Mutex::new(Vec::new());

/// `hook` runs, once, the next time the step reaches `point` in `folder`.
pub(crate) fn set(point: &'static str, folder: &str, hook: impl FnOnce() + Send + 'static) {
    lock(&HOOKS).push((point, folder.to_owned(), Box::new(hook)));
}

/// The step reached `point` in `folder`: the hook set for it, if any, runs.
pub(crate) fn at(point: &'static str, folder: &str) {
    let hook = {
        let mut all = lock(&HOOKS);
        all.iter()
            .position(|(p, f, _)| *p == point && f == folder)
            .map(|i| all.remove(i).2)
    };
    if let Some(h) = hook {
        h();
    }
}

/// A hook that stops the step at its point until the test says go: the
/// first receiver hears the step arrive, the sender lets it go on.
pub(crate) fn hold(
    point: &'static str,
    folder: &str,
) -> (std::sync::mpsc::Receiver<()>, std::sync::mpsc::Sender<()>) {
    let (arrived, heard) = std::sync::mpsc::channel();
    let (go, wait) = std::sync::mpsc::channel::<()>();
    set(point, folder, move || {
        let _ = arrived.send(());
        let _ = wait.recv_timeout(std::time::Duration::from_secs(30));
    });
    (heard, go)
}

/// Wait, off the runtime's threads, until a held step arrives.
pub(crate) async fn arrived(heard: std::sync::mpsc::Receiver<()>) {
    tokio::task::spawn_blocking(move || heard.recv_timeout(std::time::Duration::from_secs(30)))
        .await
        .expect("the wait ran")
        .expect("the step reached its point");
}
