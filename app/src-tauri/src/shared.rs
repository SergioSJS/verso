// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! What another app handed to Verso on a phone (ADR 0118 item 5, in v1
//! since 2026-11-12): a text shared to it, a Markdown or text file shared
//! or opened with it. Android's side reads it (gen/android …/Shared.kt);
//! the window takes it here and makes each one a new note of its folder
//! through the contract (app/ui src/screen/shared.ts). The other app's
//! file is only read: the note is a copy the core writes as any note.

/// One thing handed to Verso.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub(crate) struct Shared {
    /// Its name as the other app gave it (a file's name, a share's
    /// subject); empty when it gave none.
    pub(crate) name: String,
    /// Its text; absent when it could not be taken (`problem`).
    pub(crate) text: Option<String>,
    /// Why it could not be taken: `too_big`, `not_text` or `unreadable`.
    pub(crate) problem: Option<String>,
}

/// What other apps handed to Verso since the window last asked, handed
/// over once; nothing on a desktop (its files come by `open_initial`).
#[tauri::command]
#[specta::specta]
pub(crate) async fn take_shared() -> Result<Vec<Shared>, verso_contract::ContractError> {
    taken().await
}

#[cfg(target_os = "android")]
async fn taken() -> Result<Vec<Shared>, verso_contract::ContractError> {
    #[derive(serde::Deserialize)]
    struct Taken {
        items: Vec<Shared>,
    }
    // The plugin answers on Android's main thread: not from the runtime's
    // own threads.
    tauri::async_runtime::spawn_blocking(|| crate::phone::call::<Taken>("takeShared", ()))
        .await
        .map_err(|e| crate::failed(e.to_string()))?
        .map(|taken| taken.items)
        .map_err(crate::failed)
}

#[cfg(not(target_os = "android"))]
async fn taken() -> Result<Vec<Shared>, verso_contract::ContractError> {
    Ok(Vec::new())
}
