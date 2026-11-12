// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! A folder of the phone's shared storage (ADR 0118 item 4.4, in v1 since
//! 2026-11-12): the storage other apps see too (`/storage/emulated/0`,
//! where Obsidian's vaults live), reached by POSIX paths through Android's
//! *All files access*, so `verso-fs` works on it as on a desktop's folder.
//! Not through the system's folder picker (a SAF tree is no path, item
//! 4.3): the window walks the storage's folders here, by paths relative to
//! the storage's top (ADR 0026 rule 4: nothing absolute crosses), and opens
//! the one chosen. The listing and the folder made are `verso-fs`'s
//! (`server::folders_under`, `server::make_folder`). On a desktop these
//! commands refuse: its own picker opens any folder.

use verso_contract::{ContractError, FolderInfo};

/// What the shared storage holds at a place.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
pub(crate) struct SharedStorage {
    /// Whether Verso may reach the shared storage (Android's *All files
    /// access*; the storage permission on Android 10): without it, no
    /// folder is listed and the window asks for it.
    pub(crate) access: bool,
    /// The folders directly at the place, by name, sorted; hidden ones are
    /// left out.
    pub(crate) folders: Vec<String>,
}

/// The folders of the shared storage at `path` (relative to its top, `/`
/// between names, `""` for the top).
#[tauri::command]
#[specta::specta]
pub(crate) async fn shared_storage(path: String) -> Result<SharedStorage, ContractError> {
    imp::list(path).await
}

/// Ask Android for the access: its own page for *All files access* (the
/// person turns it on there and comes back), or the storage permission's
/// prompt on Android 10.
#[tauri::command]
#[specta::specta]
pub(crate) async fn shared_storage_access() -> Result<(), ContractError> {
    imp::ask().await
}

/// Open the folder at `path` of the shared storage in this window, first
/// making the folder `make` inside it when one is named. The top itself is
/// not a folder of notes.
#[tauri::command]
#[specta::specta]
pub(crate) async fn open_shared_folder<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    path: String,
    make: Option<String>,
) -> Result<FolderInfo, ContractError> {
    crate::may_switch(&app, &window)?;
    let dir = imp::folder(path, make).await?;
    crate::install(&app, &window, move |config| {
        verso_core::Workspace::open(&dir, config)
    })
    .await
}

/// The place `path` names under `top`: each name one a folder may have
/// (`server::is_folder_name`: not hidden, no separator, nothing a system
/// refuses), so no `..` and nothing absolute; `None` otherwise.
#[cfg(any(target_os = "android", test))]
fn place(top: &std::path::Path, path: &str) -> Option<std::path::PathBuf> {
    let mut at = top.to_path_buf();
    for name in path.split('/').filter(|n| !n.is_empty()) {
        at = verso_fs::server::folder_path(&at, name)?;
    }
    Some(at)
}

/// Where a folder of the phone sits, for the folder switcher (in place of
/// a desktop's `~/…/Documents`, which says nothing on a phone): *inside
/// the app* for the app's own storage, `Celular/Documents` for the shared
/// storage, in the window's language; else the desktop's label.
#[cfg(any(target_os = "android", test))]
pub(crate) fn phone_place(
    folder: &std::path::Path,
    top: &std::path::Path,
    data: &std::path::Path,
    lang: &str,
) -> String {
    let en = lang == "en";
    let Some(parent) = folder.parent() else {
        return String::new();
    };
    if parent.starts_with(data) {
        return if en {
            "inside the app"
        } else {
            "dentro do app"
        }
        .to_owned();
    }
    let Ok(inside) = parent.strip_prefix(top) else {
        return crate::shares::place_of(folder, None);
    };
    let parts: Vec<String> = inside
        .components()
        .filter_map(|c| match c {
            std::path::Component::Normal(n) => Some(n.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    let phone = if en { "Phone" } else { "Celular" };
    match parts.len() {
        0 => phone.to_owned(),
        1 | 2 => format!("{phone}/{}", parts.join("/")),
        n => format!("{phone}/…/{}", parts[n - 2..].join("/")),
    }
}

/// [`phone_place`] for this phone, once its facts are known.
#[cfg(target_os = "android")]
pub(crate) fn place_here<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    folder: &std::path::Path,
) -> Option<String> {
    use tauri::Manager;
    let facts = crate::phone::facts_kept()?;
    let data = app.path().app_data_dir().ok()?;
    let lang = verso_service::lock(&app.state::<crate::App>().menu_language).clone();
    Some(phone_place(
        folder,
        std::path::Path::new(&facts.shared_storage),
        &data,
        &lang,
    ))
}

#[cfg(target_os = "android")]
mod imp {
    use std::path::PathBuf;

    use verso_contract::ContractError;

    use super::SharedStorage;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Access {
        granted: bool,
        top: String,
    }

    /// Whether the access is there, and the storage's top, asked of Android
    /// each time (the person may turn the access on or off meanwhile).
    async fn access() -> Result<Access, ContractError> {
        tauri::async_runtime::spawn_blocking(|| crate::phone::call::<Access>("storageAccess", ()))
            .await
            .map_err(|e| crate::failed(e.to_string()))?
            .map_err(crate::failed)
    }

    pub(super) async fn list(path: String) -> Result<SharedStorage, ContractError> {
        let access = access().await?;
        if !access.granted {
            return Ok(SharedStorage {
                access: false,
                folders: Vec::new(),
            });
        }
        let at = super::place(&PathBuf::from(&access.top), &path)
            .ok_or_else(|| verso_service::refused("not a folder of the shared storage"))?;
        let folders =
            tauri::async_runtime::spawn_blocking(move || verso_fs::server::folders_under(&at))
                .await
                .map_err(|e| crate::failed(e.to_string()))?
                .map_err(|e| crate::failed(e.to_string()))?;
        Ok(SharedStorage {
            access: true,
            folders,
        })
    }

    pub(super) async fn ask() -> Result<(), ContractError> {
        tauri::async_runtime::spawn_blocking(|| {
            crate::phone::call::<serde_json::Value>("askStorageAccess", ())
        })
        .await
        .map_err(|e| crate::failed(e.to_string()))?
        .map(|_| ())
        .map_err(crate::failed)
    }

    pub(super) async fn folder(
        path: String,
        make: Option<String>,
    ) -> Result<PathBuf, ContractError> {
        let access = access().await?;
        if !access.granted {
            return Err(verso_service::refused(
                "Verso has no access to the phone's shared storage",
            ));
        }
        let at = super::place(&PathBuf::from(&access.top), &path)
            .ok_or_else(|| verso_service::refused("not a folder of the shared storage"))?;
        let dir = match make {
            Some(name) => match verso_fs::server::make_folder(&at, &name) {
                Ok(made) => made,
                Err(e) if e.kind() == std::io::ErrorKind::InvalidInput => {
                    return Err(verso_service::refused("not a name a folder can have"));
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => at.join(&name),
                Err(e) => return Err(crate::failed(e.to_string())),
            },
            None => at,
        };
        if dir.as_path() == std::path::Path::new(&access.top) {
            return Err(verso_service::refused(
                "the whole shared storage is not a folder of notes: choose a folder in it",
            ));
        }
        Ok(dir)
    }
}

#[cfg(not(target_os = "android"))]
mod imp {
    use std::path::PathBuf;

    use verso_contract::ContractError;

    use super::SharedStorage;

    fn desktop() -> ContractError {
        verso_service::refused("the shared storage is a phone's; this computer opens any folder")
    }

    pub(super) async fn list(_path: String) -> Result<SharedStorage, ContractError> {
        Err(desktop())
    }

    pub(super) async fn ask() -> Result<(), ContractError> {
        Err(desktop())
    }

    pub(super) async fn folder(
        _path: String,
        _make: Option<String>,
    ) -> Result<PathBuf, ContractError> {
        Err(desktop())
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::place;

    #[test]
    fn a_place_is_folder_names_under_the_top_and_nothing_else() {
        let top = Path::new("/storage/emulated/0");
        assert_eq!(place(top, ""), Some(top.to_path_buf()));
        assert_eq!(
            place(top, "Documents/Notas"),
            Some(top.join("Documents").join("Notas"))
        );
        assert_eq!(
            place(top, "/Documents//Notas/"),
            Some(top.join("Documents/Notas"))
        );
        assert_eq!(place(top, "Documents/../.."), None);
        assert_eq!(place(top, ".."), None);
        assert_eq!(place(top, "Android/.hidden"), None);
        assert_eq!(place(top, "a\\b"), None);
    }

    #[test]
    fn a_phone_folder_says_where_it_sits_in_words() {
        let top = Path::new("/storage/emulated/0");
        let data = Path::new("/data/user/0/com.versomd.app");
        let at = |f: &str, lang| super::phone_place(Path::new(f), top, data, lang);
        assert_eq!(
            at("/data/user/0/com.versomd.app/Verso", "pt-BR"),
            "dentro do app"
        );
        assert_eq!(
            at("/data/user/0/com.versomd.app/Verso", "en"),
            "inside the app"
        );
        assert_eq!(at("/storage/emulated/0/Notas", "pt-BR"), "Celular");
        assert_eq!(
            at("/storage/emulated/0/Documents/Notas", "en"),
            "Phone/Documents"
        );
        assert_eq!(
            at("/storage/emulated/0/Documents/a/b/Notas", "pt-BR"),
            "Celular/…/a/b"
        );
        assert_eq!(
            at("/storage/1234-ABCD/Notas", "pt-BR"),
            "…/storage/1234-ABCD"
        );
    }
}
