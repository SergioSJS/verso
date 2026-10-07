//! Focuses (ADR 0062) through the contract.

use super::*;

fn to_contract_focus(f: verso_core::Focus) -> Focus {
    Focus {
        name: f.name,
        paths: f.paths,
        sticker: f.sticker,
    }
}

fn to_core_focus(f: Focus) -> verso_core::Focus {
    verso_core::Focus {
        name: f.name,
        paths: f.paths,
        sticker: f.sticker,
    }
}

fn to_contract_read_only_code(
    code: Option<verso_core::ReadOnlyReasonCode>,
) -> Option<verso_contract::ReadOnlyReasonCode> {
    code.map(|c| match c {
        verso_core::ReadOnlyReasonCode::CloudPlaceholder => {
            verso_contract::ReadOnlyReasonCode::CloudPlaceholder
        }
        verso_core::ReadOnlyReasonCode::InvalidJson => {
            verso_contract::ReadOnlyReasonCode::InvalidJson
        }
        verso_core::ReadOnlyReasonCode::UnknownFormat => {
            verso_contract::ReadOnlyReasonCode::UnknownFormat
        }
    })
}

fn to_contract_focuses_summary(s: verso_core::FocusesSummary) -> FocusesSummary {
    FocusesSummary {
        focuses: s.focuses.into_iter().map(to_contract_focus).collect(),
        has_file: s.has_file,
        format_known: s.format_known,
        read_only_reason: s.read_only_reason,
        read_only_code: to_contract_read_only_code(s.read_only_code),
        stamp: s.stamp,
    }
}

/// Read focuses from `.space/waypoints.json` in the open folder (ADR 0062).
#[tauri::command]
#[specta::specta]
pub(crate) fn get_focuses<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<FocusesSummary, ContractError> {
    let summary = with(&state, &window, |ws| ws.get_focuses())?;
    Ok(to_contract_focuses_summary(summary))
}

/// Write focuses to `.space/waypoints.json` in the open folder (ADR 0062).
#[tauri::command]
#[specta::specta]
pub(crate) fn set_focuses<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    focuses: Vec<Focus>,
    stamp: Option<String>,
    base_focuses: Option<Vec<Focus>>,
) -> Result<FocusesSummary, ContractError> {
    let core_focuses = focuses.into_iter().map(to_core_focus).collect();
    let core_base = base_focuses.map(|bf| bf.into_iter().map(to_core_focus).collect());
    let summary = with(&state, &window, |ws| {
        ws.set_focuses(core_focuses, stamp.as_deref(), core_base)
    })?;
    Ok(to_contract_focuses_summary(summary))
}

/// Whether focuses can be synced to `.space/waypoints.json` (ADR 0062).
#[tauri::command]
#[specta::specta]
pub(crate) fn can_sync_focuses<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
) -> Result<bool, ContractError> {
    with(&state, &window, |ws| ws.can_sync_focuses())
}

/// Set whether focuses sync to `.space/waypoints.json` is enabled (ADR 0062 D5, D9).
#[tauri::command]
#[specta::specta]
pub(crate) fn set_sync_focuses<R: tauri::Runtime>(
    window: tauri::Window<R>,
    state: State<'_, App>,
    enabled: bool,
) -> Result<(), ContractError> {
    with(&state, &window, |ws| {
        ws.set_sync_focuses(enabled);
        Ok(())
    })
}
