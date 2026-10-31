//! A window whose web process died (Linux, WebKitGTK).
//!
//! When WebKitGTK's web process crashes — a driver without graphics
//! acceleration, a memory limit — the window stays white for good: nothing
//! reloads it. The webview's `web-process-terminated` signal is reached
//! through Tauri's `with_webview` (a safe API: `PlatformWebview::inner` is
//! a `webkit2gtk::WebView`; no `unsafe` here). The policy is: reload the
//! page once; if the process dies again within `WINDOW`, reloading would
//! loop, so say so in a native message instead. Every death is logged.

use std::time::{Duration, Instant};

/// A second death inside this long after the previous one is not reloaded.
pub(crate) const WINDOW: Duration = Duration::from_secs(30);

/// What to do about a death.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Action {
    Reload,
    GiveUp,
}

/// The reload-once policy of one webview.
#[derive(Default)]
pub(crate) struct Policy {
    last_death: Option<Instant>,
}

impl Policy {
    /// A death at `now`: reload, unless the previous one was less than
    /// `WINDOW` ago.
    pub(crate) fn on_death(&mut self, now: Instant) -> Action {
        let again = self
            .last_death
            .is_some_and(|before| now.saturating_duration_since(before) < WINDOW);
        self.last_death = Some(now);
        if again {
            Action::GiveUp
        } else {
            Action::Reload
        }
    }
}

/// The native message when the page keeps dying: `(title, body)`, in `lang`
/// ("en", or anything else for pt-BR, the product's own).
#[cfg(any(target_os = "linux", test))]
pub(crate) fn words(lang: &str) -> (&'static str, &'static str) {
    if lang == "en" {
        (
            "Verso",
            "The window's page stopped working twice in a row, probably because of the graphics driver. Close this window and open Verso again; if it repeats, turn 3D dice off in Settings.",
        )
    } else {
        (
            "Verso",
            "A página da janela parou de funcionar duas vezes seguidas, provavelmente por causa do driver de vídeo. Feche esta janela e abra o Verso de novo; se repetir, desligue os dados 3D nos Ajustes.",
        )
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::{Action, Policy, words};
    use std::collections::HashSet;
    use std::sync::{Mutex, PoisonError};
    use std::time::Instant;
    use tauri::Manager;
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    use webkit2gtk::WebViewExt;

    /// The labels of the webviews already watched, so a second page load
    /// does not stack a second handler.
    static HOOKED: Mutex<Option<HashSet<String>>> = Mutex::new(None);

    /// A window is gone: its label may be used again.
    pub(crate) fn forget(label: &str) {
        let mut hooked = HOOKED.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(set) = hooked.as_mut() {
            set.remove(label);
        }
    }

    /// Watch `webview`'s web process, once per webview.
    pub(crate) fn hook<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
        let label = webview.label().to_owned();
        {
            let mut hooked = HOOKED.lock().unwrap_or_else(PoisonError::into_inner);
            if !hooked
                .get_or_insert_with(HashSet::new)
                .insert(label.clone())
            {
                return;
            }
        }
        let app = webview.app_handle().clone();
        let result = webview.with_webview(move |platform| {
            let policy = Mutex::new(Policy::default());
            platform
                .inner()
                .connect_web_process_terminated(move |view, reason| {
                    let action = policy
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner)
                        .on_death(Instant::now());
                    crate::log::write(
                        "WARN",
                        "webview",
                        &format!(
                            "the web process of `{label}` ended ({reason:?}); {}",
                            match action {
                                Action::Reload => "reloading the page",
                                Action::GiveUp => "it died again within 30 s: not reloading",
                            }
                        ),
                    );
                    match action {
                        Action::Reload => view.reload(),
                        Action::GiveUp => {
                            let lang = app
                                .try_state::<crate::App>()
                                .map(|state| crate::lock(&state.menu_language).clone())
                                .unwrap_or_default();
                            let (title, body) = words(&lang);
                            app.dialog()
                                .message(body)
                                .title(title)
                                .kind(MessageDialogKind::Error)
                                .show(|_| {});
                        }
                    }
                });
        });
        if let Err(e) = result {
            crate::log::write(
                "WARN",
                "webview",
                &format!("could not watch the web process: {e}"),
            );
        }
    }
}

#[cfg(target_os = "linux")]
pub(crate) use linux::{forget, hook};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reloads_once_then_gives_up_inside_the_window() {
        let mut policy = Policy::default();
        let t0 = Instant::now();
        assert_eq!(policy.on_death(t0), Action::Reload);
        assert_eq!(policy.on_death(t0 + Duration::from_secs(5)), Action::GiveUp);
        // Still dying every few seconds: keeps giving up, never loops.
        assert_eq!(
            policy.on_death(t0 + Duration::from_secs(20)),
            Action::GiveUp
        );
    }

    #[test]
    fn reloads_again_after_a_calm_stretch() {
        let mut policy = Policy::default();
        let t0 = Instant::now();
        assert_eq!(policy.on_death(t0), Action::Reload);
        assert_eq!(
            policy.on_death(t0 + WINDOW + Duration::from_secs(1)),
            Action::Reload
        );
    }

    #[test]
    fn the_message_is_in_both_languages() {
        assert!(words("en").1.contains("graphics driver"));
        assert!(words("pt-BR").1.contains("driver de vídeo"));
    }
}
