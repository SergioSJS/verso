//! Windows does not serve yet (see the module above): every command says
//! so, and the status says `supported: false` so Settings offers nothing.

use super::*;

fn unsupported() -> ContractError {
    refused("serving to a phone is not in the Windows app yet: it works on macOS and Linux first")
}

pub(super) async fn status<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    Ok(LocalServerStatus::default())
}

pub(super) async fn folders<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<Vec<LocalFolder>, ContractError> {
    Ok(Vec::new())
}

pub(super) async fn tick<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
    _: String,
    _: bool,
) -> Result<Vec<LocalFolder>, ContractError> {
    Err(unsupported())
}

pub(super) async fn settings<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
    _: bool,
    _: Option<String>,
    _: Option<String>,
    _: Option<String>,
) -> Result<LocalServerStatus, ContractError> {
    Err(unsupported())
}

pub(super) async fn start<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    Err(unsupported())
}

pub(super) async fn stop<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    Ok(LocalServerStatus::default())
}

pub(super) async fn pair_open<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<LocalPairing, ContractError> {
    Err(unsupported())
}

pub(super) async fn pair_close<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<(), ContractError> {
    Ok(())
}

pub(super) async fn pair_state<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<LocalPairState, ContractError> {
    Ok(LocalPairState {
        open: false,
        remaining: 0,
        asked: None,
    })
}

pub(super) async fn answer<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
    _: bool,
    _: bool,
) -> Result<(), ContractError> {
    Err(unsupported())
}

pub(super) async fn phones<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<Vec<LocalPhone>, ContractError> {
    Ok(Vec::new())
}

pub(super) async fn revoke<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
    _: String,
) -> Result<(), ContractError> {
    Err(unsupported())
}

pub(super) async fn forget<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<u32, ContractError> {
    Ok(0)
}

pub(super) async fn replace_identity<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<LocalServerStatus, ContractError> {
    Err(unsupported())
}

pub(super) async fn audit<R: tauri::Runtime>(
    _: tauri::AppHandle<R>,
) -> Result<Vec<LocalAudit>, ContractError> {
    Ok(Vec::new())
}

pub(super) fn auto_start<R: tauri::Runtime>(_: &tauri::AppHandle<R>) {}

pub(super) fn stop_on_exit<R: tauri::Runtime>(_: &tauri::AppHandle<R>) {}
