// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Windows: the few Win32 calls Share audio makes itself (ADR 0116 item 17),
//! the third place of the repository allowed `unsafe` (ADR 0029 revision of
//! 2026-10-15; ADR 0116, Q9 decided (a) on 2026-10-31; `CLAUDE.md` §3;
//! `scripts/check-unsafe.mjs`).
//!
//! The capture itself needs none: the `wasapi` crate is a safe API over
//! WASAPI, process loopback and the audio sessions included (the evaluation
//! is in ADR 0116, "As built (S8)"). What no safe crate in the tree serves
//! is, in this file:
//! - the build number of Windows, which decides whether process loopback
//!   exists (`RtlGetVersion`, which does not lie about the version the way
//!   `GetVersionEx` does for a program without a manifest);
//! - the table of processes with their parents and program names, which
//!   decides which application a sound belongs to and whose tree to
//!   capture (a toolhelp snapshot);
//! - a program's file description ("Google Chrome" for `chrome.exe`), the
//!   name a person knows an application by (version resource of its file).
//!
//! Each `unsafe` block does one thing and says why it is sound. Which
//! sources to list and the capture are safe code in `windows_source.rs`,
//! `winapps.rs` and `convert.rs`.

#![allow(unsafe_code)]

use std::ffi::c_void;
use std::mem::size_of;

use windows_audio::Wdk::System::SystemServices::RtlGetVersion;
use windows_audio::Win32::Foundation::{CloseHandle, HANDLE};
use windows_audio::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use windows_audio::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows_audio::Win32::System::SystemInformation::OSVERSIONINFOW;
use windows_audio::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows_audio::core::{PCWSTR, PWSTR};

use super::winapps::Proc;

/// A handle closed when it goes out of scope.
struct Owned(HANDLE);

impl Drop for Owned {
    fn drop(&mut self) {
        // SAFETY: the handle was returned by a successful call that hands
        // its ownership over and is closed only here, once.
        let _ = unsafe { CloseHandle(self.0) };
    }
}

/// The build number of Windows (19045 for Windows 10 22H2, 22631 for
/// Windows 11 23H2), or 0 if the system does not say.
#[must_use]
pub fn os_build() -> u32 {
    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    // SAFETY: `info` is a live, writable OSVERSIONINFOW whose size field is
    // set, which is all `RtlGetVersion` reads and writes; it keeps no pointer.
    let status = unsafe { RtlGetVersion(&mut info) };
    if status.is_ok() { info.dwBuildNumber } else { 0 }
}

/// The processes now running, with their parent's pid and program file name.
/// Empty if the system will not give the table.
#[must_use]
pub fn processes() -> Vec<Proc> {
    // SAFETY: a snapshot of the process table takes no pointer; the handle
    // it returns is owned by `Owned` from here.
    let Ok(snapshot) = (unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }) else {
        return Vec::new();
    };
    let snapshot = Owned(snapshot);
    let mut entry = PROCESSENTRY32W {
        dwSize: size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut out = Vec::new();
    // SAFETY: `snapshot` is a live snapshot handle and `entry` a writable
    // PROCESSENTRY32W with its size set, as the call requires.
    let mut more = unsafe { Process32FirstW(snapshot.0, &mut entry) }.is_ok();
    while more {
        let end = entry
            .szExeFile
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(entry.szExeFile.len());
        out.push(Proc {
            pid: entry.th32ProcessID,
            parent: entry.th32ParentProcessID,
            exe: String::from_utf16_lossy(&entry.szExeFile[..end]),
        });
        // SAFETY: the same live handle and entry as the first call.
        more = unsafe { Process32NextW(snapshot.0, &mut entry) }.is_ok();
    }
    out
}

/// The path of the program a process runs, if the system lets this program
/// look (it does for the person's own applications).
fn image_path(pid: u32) -> Option<Vec<u16>> {
    // SAFETY: opening a process by id for a limited query takes no pointer;
    // the handle is owned by `Owned` from here.
    let process = Owned(unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?);
    let mut buf = vec![0_u16; 1024];
    let mut len = u32::try_from(buf.len()).ok()?;
    // SAFETY: `buf` is writable for `len` UTF-16 units and `len` says so; the
    // call writes at most that and sets `len` to what it wrote.
    unsafe {
        QueryFullProcessImageNameW(process.0, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len)
    }
    .ok()?;
    buf.truncate(len as usize);
    buf.push(0);
    Some(buf)
}

/// The file description in the version resource of a process's program
/// (what Task Manager's *Name* column shows for an application), or `None`.
#[must_use]
pub fn description_of(pid: u32) -> Option<String> {
    let path = image_path(pid)?;
    let file = PCWSTR(path.as_ptr());
    // SAFETY: `file` points at the NUL-terminated path `path` holds, alive
    // for the call.
    let size = unsafe { GetFileVersionInfoSizeW(file, None) };
    if size == 0 {
        return None;
    }
    let mut block = vec![0_u8; size as usize];
    // SAFETY: `file` is as above and `block` is writable for `size` bytes,
    // the size the previous call asked for.
    unsafe { GetFileVersionInfoW(file, Some(0), size, block.as_mut_ptr().cast::<c_void>()) }.ok()?;
    // The first language and code page of the resource, as the shell does.
    let (lang, page) = translation(&block).unwrap_or((0x0409, 0x04B0));
    let sub: Vec<u16> = format!("\\StringFileInfo\\{lang:04x}{page:04x}\\FileDescription\0")
        .encode_utf16()
        .collect();
    query_string(&block, &sub)
}

/// The first (language, code page) pair of the resource.
fn translation(block: &[u8]) -> Option<(u16, u16)> {
    let sub: Vec<u16> = "\\VarFileInfo\\Translation\0".encode_utf16().collect();
    let mut at: *mut c_void = std::ptr::null_mut();
    let mut len = 0_u32;
    // SAFETY: `block` is a version resource that stays alive and unchanged
    // through the call, `sub` is NUL-terminated, and both out pointers are
    // live; `at` is then a pointer into `block`.
    let found = unsafe {
        VerQueryValueW(block.as_ptr().cast::<c_void>(), PCWSTR(sub.as_ptr()), &mut at, &mut len)
    };
    if !found.as_bool() || at.is_null() || len < 4 {
        return None;
    }
    // SAFETY: the call said `at` points at `len` >= 4 readable bytes inside
    // `block`: two little-endian u16 (language, code page), possibly
    // unaligned, so read as bytes.
    let pair = unsafe { std::slice::from_raw_parts(at.cast::<u8>(), 4) };
    Some((
        u16::from_le_bytes([pair[0], pair[1]]),
        u16::from_le_bytes([pair[2], pair[3]]),
    ))
}

/// The string at `sub` in the version resource, trimmed, if it is not empty.
fn query_string(block: &[u8], sub: &[u16]) -> Option<String> {
    let mut at: *mut c_void = std::ptr::null_mut();
    let mut len = 0_u32;
    // SAFETY: as in `translation`: `block` is alive and unchanged, `sub` is
    // NUL-terminated, the out pointers are live.
    let found = unsafe {
        VerQueryValueW(block.as_ptr().cast::<c_void>(), PCWSTR(sub.as_ptr()), &mut at, &mut len)
    };
    if !found.as_bool() || at.is_null() || len == 0 {
        return None;
    }
    // SAFETY: the call said `at` points at `len` UTF-16 units (a
    // NUL-terminated string) inside `block`; read as the units they are, by
    // value, so alignment is not assumed.
    let units = unsafe { std::slice::from_raw_parts(at.cast::<u8>(), len as usize * 2) };
    let wide: Vec<u16> = units
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .take_while(|&u| u != 0)
        .collect();
    let text = String::from_utf16_lossy(&wide).trim().to_owned();
    (!text.is_empty()).then_some(text)
}
