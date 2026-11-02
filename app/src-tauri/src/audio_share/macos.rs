// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! macOS: Core Audio process taps (ADR 0116 item 17), the one place of the
//! Share audio capture that needs `unsafe`.
//!
//! A *process tap* (macOS 14.2 and later; 14.4 is the floor this app asks
//! for, below) is Core Audio's own way to hear what some processes play,
//! or everything but some processes. The chain is: a `CATapDescription`
//! (who to hear), `AudioHardwareCreateProcessTap` (the tap), a private
//! aggregate device that holds the tap, and an IOProc block on that device
//! that receives the audio. The first tap asks the person for "System Audio
//! Recording" (`NSAudioCaptureUsageDescription` in the bundle's Info.plist).
//!
//! The second declared exception to the workspace's `forbid(unsafe_code)`
//! (ADR 0029 revision of 2026-10-15; ADR 0116, Q9 decided (a) on
//! 2026-10-31; `CLAUDE.md` §3; `scripts/check-unsafe.mjs`), with the first
//! (`web_clip/{macos,windows}.rs`): objc2 binds Core Audio, but every one of
//! its calls is an `unsafe fn` (raw pointers, out parameters, a block the
//! system calls from its own thread), and no safe Rust crate serves (the
//! evaluation is in ADR 0116, "As built (S7)"). So this file is kept to what
//! must touch those calls:
//! - the list of the processes the audio system knows;
//! - the process the system holds responsible for another;
//! - the default output device, played by a block of ours (the window's
//!   own sounds while a share runs, `macos_play.rs`);
//! - the tap chain, built and torn down in one place;
//! - the IOProc block, which only copies the system's buffers and hands
//!   them over a bounded channel: no encoder, no lock, no I/O runs on the
//!   system's audio thread.
//!
//! Each `unsafe` block does one thing and says why it is sound. Everything
//! else (which sources to list, the format conversion, the threads) is safe
//! code in `macos_source.rs`, `apps.rs` and `convert.rs`.

#![allow(unsafe_code)]

use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::SyncSender;

use block2::RcBlock;
use objc2::AnyThread;
use objc2::rc::Retained;
use objc2_core_audio::{
    AudioDeviceCreateIOProcIDWithBlock, AudioDeviceDestroyIOProcID, AudioDeviceIOProcID,
    AudioDeviceStart, AudioDeviceStop, AudioHardwareCreateAggregateDevice,
    AudioHardwareCreateProcessTap, AudioHardwareDestroyAggregateDevice,
    AudioHardwareDestroyProcessTap, AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize,
    AudioObjectID, AudioObjectPropertyAddress, CATapDescription, kAudioAggregateDeviceIsPrivateKey,
    kAudioAggregateDeviceIsStackedKey, kAudioAggregateDeviceNameKey,
    kAudioAggregateDeviceTapAutoStartKey, kAudioAggregateDeviceTapListKey,
    kAudioAggregateDeviceUIDKey, kAudioDevicePropertyNominalSampleRate,
    kAudioHardwarePropertyDefaultOutputDevice, kAudioHardwarePropertyProcessObjectList,
    kAudioObjectPropertyElementMain, kAudioObjectPropertyScopeGlobal, kAudioProcessPropertyPID,
    kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey, kAudioTapPropertyFormat,
};
use objc2_core_audio_types::{AudioBufferList, AudioStreamBasicDescription, AudioTimeStamp};
use objc2_foundation::{
    NSArray, NSDictionary, NSNumber, NSObject, NSOperatingSystemVersion, NSProcessInfo, NSString,
    NSUUID,
};

use objc2_core_foundation::CFDictionary;
use objc2_web_kit::{WKMediaPlaybackState, WKWebView};

use super::convert::join_buffers;
use super::macpages::AudioProc;

/// Core Audio's "no error".
const NO_ERR: i32 = 0;

/// `'nope'`, `kAudioHardwareIllegalOperationError`: what Core Audio answers
/// when the person has not allowed System Audio Recording.
const ILLEGAL_OPERATION: i32 = 0x6e6f_7065;

/// The oldest macOS this capture asks for (14.4: the process taps' first
/// full release; 14.2 has the calls and a known bug in the aggregate's tap
/// list). Below it the window says it needs a newer macOS.
pub const MIN_MAJOR: isize = 14;
pub const MIN_MINOR: isize = 4;

/// Why a tap did not start.
#[derive(Debug, PartialEq, Eq)]
pub enum Failure {
    /// The person has not allowed System Audio Recording.
    Denied,
    /// Anything else, in words for the log.
    Other(String),
}

/// What the IOProc hands over: interleaved samples and their channel count.
pub struct Block {
    pub channels: usize,
    pub samples: Vec<f32>,
}

/// Whether this macOS has the process taps this app asks for.
#[must_use]
pub fn supported() -> bool {
    let need = NSOperatingSystemVersion {
        majorVersion: MIN_MAJOR,
        minorVersion: MIN_MINOR,
        patchVersion: 0,
    };
    NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(need)
}

fn address(selector: u32) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress {
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    }
}

/// A fixed-size property of `object`, read into `value`.
fn read_property<T>(object: AudioObjectID, selector: u32, value: &mut T) -> Result<(), i32> {
    let addr = address(selector);
    let mut size = u32::try_from(std::mem::size_of::<T>()).unwrap_or(u32::MAX);
    // SAFETY: `addr`, `size` and `value` are live locals/borrows for the
    // call; `value` is at least `size` bytes, and the callers use plain
    // old data (`u32`, `i32`, the stream description) or a pointer slot.
    let status = unsafe {
        AudioObjectGetPropertyData(
            object,
            NonNull::from(&addr),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
            NonNull::from(value).cast::<c_void>(),
        )
    };
    if status == NO_ERR {
        Ok(())
    } else {
        Err(status)
    }
}

/// The processes the audio system knows, with their pid and bundle
/// identifier (read-only: no tap is made, so no permission is asked).
///
/// # Errors
/// The audio system's answer, in words.
pub fn audio_processes() -> Result<Vec<AudioProc>, String> {
    let system: AudioObjectID = 1;
    let list = address(kAudioHardwarePropertyProcessObjectList);
    let mut bytes = 0_u32;
    // SAFETY: `list` and `bytes` are live locals; there is no qualifier.
    let status = unsafe {
        AudioObjectGetPropertyDataSize(
            system,
            NonNull::from(&list),
            0,
            std::ptr::null(),
            NonNull::from(&mut bytes),
        )
    };
    if status != NO_ERR {
        return Err(format!(
            "the audio system would not list its processes (OSStatus {status})"
        ));
    }
    let count = bytes as usize / std::mem::size_of::<AudioObjectID>();
    let mut objects = vec![0_u32; count];
    let mut size = bytes;
    // SAFETY: `objects` has room for `size` bytes (`count` ids), and the
    // other pointers are live locals.
    let status = unsafe {
        AudioObjectGetPropertyData(
            system,
            NonNull::from(&list),
            0,
            std::ptr::null(),
            NonNull::from(&mut size),
            NonNull::from(objects.as_mut_slice()).cast::<c_void>(),
        )
    };
    if status != NO_ERR {
        return Err(format!(
            "the audio system would not list its processes (OSStatus {status})"
        ));
    }
    objects.truncate(size as usize / std::mem::size_of::<AudioObjectID>());
    let mut out = Vec::new();
    for object in objects {
        let mut pid = 0_i32;
        if read_property(object, kAudioProcessPropertyPID, &mut pid).is_err() || pid <= 0 {
            // It went away between the two calls.
            continue;
        }
        out.push(AudioProc { object, pid });
    }
    Ok(out)
}

/// The process the system holds responsible for `pid` (the application a
/// helper such as the WebKit GPU process works for), if the system says.
/// `responsibility_get_pid_responsible_for_pid` is in libSystem but not in
/// its public headers, so it is looked up by name once; where it is not
/// there, nothing is known.
#[must_use]
pub fn responsible_of(pid: i32) -> Option<i32> {
    type Fun = unsafe extern "C" fn(libc::pid_t) -> libc::pid_t;
    static FUN: std::sync::OnceLock<Option<Fun>> = std::sync::OnceLock::new();
    let fun = (*FUN.get_or_init(|| {
        // SAFETY: `dlsym` with the default-search handle and a NUL-terminated
        // name; it returns null or the address of that function.
        let raw = unsafe {
            libc::dlsym(
                libc::RTLD_DEFAULT,
                c"responsibility_get_pid_responsible_for_pid".as_ptr(),
            )
        };
        // SAFETY: the symbol's signature is `pid_t f(pid_t)` (it is what
        // launchd and Activity Monitor call); a null pointer is excluded.
        (!raw.is_null()).then(|| unsafe { std::mem::transmute::<*mut c_void, Fun>(raw) })
    }))?;
    // SAFETY: a plain call with an integer; no pointer crosses.
    let r = unsafe { fun(pid) };
    (r > 0).then_some(r)
}

/// Asks a page whether it plays sound now, for naming the source only: the
/// answer arrives later on `tx` (WebKit calls back on the main thread). On
/// any failure nothing is sent, which the caller reads as "not playing".
/// Runs on the main thread, inside `with_webview`.
pub fn ask_playing(pw: &tauri::webview::PlatformWebview, tx: std::sync::mpsc::Sender<bool>) {
    let page = pw.inner().cast::<WKWebView>();
    // SAFETY: `inner()` is wry's `WKWebView` for this web view, alive while
    // the web view exists; `with_webview` runs this on the main thread, the
    // only one that may touch it. `retain` adds a strong reference of our
    // own (or answers `None` for a null pointer), held until this call
    // returns; WebKit keeps the view itself while the request is pending.
    let Some(view) = (unsafe { Retained::retain(page) }) else {
        return;
    };
    let reply = RcBlock::new(move |state: WKMediaPlaybackState| {
        let _ = tx.send(state == WKMediaPlaybackState::Playing);
    });
    // SAFETY: a public method (macOS 12 and up; this runs only after
    // `supported()`, which needs 14.2) taking a block that the call copies;
    // the block owns only a channel sender.
    unsafe { view.requestMediaPlaybackStateWithCompletionHandler(&reply) };
}

/// Silence a page's view for good, before it closes: WebKit pauses every
/// media element and AudioContext of the page and refuses to start any
/// again, so a view that outlives its tab never plays on unseen (the
/// maintainer's test, 2026-11-02: YouTube kept playing after its tab
/// closed). Nothing below macOS 12, which has neither call.
pub fn suspend_media(pw: &tauri::webview::PlatformWebview) {
    let twelve = NSOperatingSystemVersion {
        majorVersion: 12,
        minorVersion: 0,
        patchVersion: 0,
    };
    if !NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(twelve) {
        return;
    }
    let page = pw.inner().cast::<WKWebView>();
    // SAFETY: as in `ask_playing`: wry's `WKWebView` for this web view,
    // alive while it exists, touched only on the main thread
    // (`with_webview`); `retain` holds our own reference for this call.
    let Some(view) = (unsafe { Retained::retain(page) }) else {
        return;
    };
    // SAFETY: a public method of macOS 12 and up (checked above), with no
    // completion block.
    unsafe { view.setAllMediaPlaybackSuspended_completionHandler(true, None) };
    // SAFETY: the same: public from macOS 12, no completion block.
    unsafe { view.closeAllMediaPresentationsWithCompletionHandler(None) };
    // SAFETY: a public method with no argument, on the main thread.
    unsafe { view.stopLoading() };
}

/// Whom the tap listens to.
pub enum Who {
    /// Only these audio objects, mixed down to stereo.
    Only(Vec<AudioObjectID>),
}

/// The IOProc block's shape: Core Audio's five arguments.
type IoFn = dyn Fn(
    NonNull<AudioTimeStamp>,
    NonNull<AudioBufferList>,
    NonNull<AudioTimeStamp>,
    NonNull<AudioBufferList>,
    NonNull<AudioTimeStamp>,
);

/// A tap at work. Dropping it stops the audio and destroys the tap and its
/// aggregate device, in the reverse order they were made.
pub struct Chain {
    aggregate: AudioObjectID,
    io_proc: AudioDeviceIOProcID,
    tap: AudioObjectID,
    /// Set before the stop: a callback that is already running does
    /// nothing.
    stopped: Arc<AtomicBool>,
    /// The tap's sample rate (its channels come with each block).
    pub rate: u32,
    // Kept alive until the IOProc is destroyed (field order is drop order).
    _block: RcBlock<IoFn>,
    _desc: Retained<CATapDescription>,
}

impl Drop for Chain {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        if self.io_proc.is_some() {
            // SAFETY: `aggregate` and `io_proc` are the ones made in
            // `start`, destroyed once here; the status is only for the log.
            let _ = unsafe { AudioDeviceStop(self.aggregate, self.io_proc) };
            // SAFETY: as above; the block is still alive (a field).
            let _ = unsafe { AudioDeviceDestroyIOProcID(self.aggregate, self.io_proc) };
        }
        // SAFETY: the aggregate device made in `start`, destroyed once.
        let _ = unsafe { AudioHardwareDestroyAggregateDevice(self.aggregate) };
        // SAFETY: the tap made in `start`, destroyed once.
        let _ = unsafe { AudioHardwareDestroyProcessTap(self.tap) };
    }
}

fn failure(call: &str, status: i32) -> Failure {
    if status == ILLEGAL_OPERATION {
        return Failure::Denied;
    }
    let be = (status as u32).to_be_bytes();
    let code = if be.iter().all(|b| (0x20..=0x7e).contains(b)) {
        format!("'{}' ({status})", String::from_utf8_lossy(&be))
    } else {
        status.to_string()
    };
    Failure::Other(format!("{call} failed (OSStatus {code})"))
}

fn numbers(ids: &[AudioObjectID]) -> Retained<NSArray<NSNumber>> {
    let all: Vec<Retained<NSNumber>> = ids
        .iter()
        .map(|id| NSNumber::numberWithUnsignedInt(*id))
        .collect();
    NSArray::from_retained_slice(&all)
}

fn key(k: &std::ffi::CStr) -> Retained<NSString> {
    NSString::from_str(k.to_str().unwrap_or_default())
}

/// A private aggregate device holding the tap `tap_uuid`.
fn make_aggregate(name: &str, tap_uuid: &NSString) -> Result<AudioObjectID, Failure> {
    let yes = NSNumber::numberWithBool(true);
    let no = NSNumber::numberWithBool(false);
    let sub: Retained<NSDictionary<NSString, NSObject>> = NSDictionary::from_slices::<NSString>(
        &[
            &key(kAudioSubTapUIDKey),
            &key(kAudioSubTapDriftCompensationKey),
        ],
        &[tap_uuid.as_ref(), yes.as_ref()],
    );
    let taps: Retained<NSArray<NSObject>> =
        NSArray::from_retained_slice(&[Retained::into_super(sub)]);
    let own_uid = NSUUID::new().UUIDString();
    let title = NSString::from_str(name);
    let keys = [
        key(kAudioAggregateDeviceNameKey),
        key(kAudioAggregateDeviceUIDKey),
        key(kAudioAggregateDeviceIsPrivateKey),
        key(kAudioAggregateDeviceIsStackedKey),
        key(kAudioAggregateDeviceTapAutoStartKey),
        key(kAudioAggregateDeviceTapListKey),
    ];
    let key_refs: Vec<&NSString> = keys.iter().map(|k| &**k).collect();
    let values: [&NSObject; 6] = [
        title.as_ref(),
        own_uid.as_ref(),
        yes.as_ref(),
        no.as_ref(),
        yes.as_ref(),
        taps.as_ref(),
    ];
    let dict: Retained<NSDictionary<NSString, NSObject>> =
        NSDictionary::from_slices::<NSString>(&key_refs, &values);
    // SAFETY: an `NSDictionary` and a `CFDictionary` are the same object
    // (toll-free bridged); `dict` outlives the reference, which does not
    // escape this function.
    let cf: &CFDictionary = unsafe { &*Retained::as_ptr(&dict).cast::<CFDictionary>() };
    let mut id: AudioObjectID = 0;
    // SAFETY: `cf` is a valid dictionary and `id` a live local.
    let status = unsafe { AudioHardwareCreateAggregateDevice(cf, NonNull::from(&mut id)) };
    if status != NO_ERR || id == 0 {
        return Err(failure("creating the aggregate device", status));
    }
    Ok(id)
}

/// The tap's sample rate, if its format makes sense.
fn tap_format(tap: AudioObjectID) -> Result<u32, Failure> {
    // SAFETY: the stream description is a plain C struct of numbers:
    // all-zero is a valid value, and the call fills it.
    let mut asbd: AudioStreamBasicDescription = unsafe { std::mem::zeroed() };
    read_property(tap, kAudioTapPropertyFormat, &mut asbd)
        .map_err(|s| failure("reading the tap's format", s))?;
    let rate = asbd.mSampleRate;
    if !rate.is_finite() || rate < 1.0 || rate > f64::from(u32::MAX) || asbd.mChannelsPerFrame == 0
    {
        return Err(Failure::Other(
            "the tap reported a format that makes no sense".into(),
        ));
    }
    // The buffers say their own layout and channels in each callback.
    Ok(rate as u32)
}

/// Start listening to `who`, handing the audio over `tx` (a full channel
/// drops the block: the audio thread never waits).
///
/// # Errors
/// [`Failure::Denied`] when System Audio Recording is not allowed; the
/// rest as [`Failure::Other`]. Whatever was made before a failure is
/// destroyed.
pub fn start(who: &Who, name: &str, tx: SyncSender<Block>) -> Result<Chain, Failure> {
    let desc: Retained<CATapDescription> = match who {
        Who::Only(ids) => {
            let list = numbers(ids);
            // SAFETY: `list` is an `NSArray<NSNumber>`, the argument the
            // initialiser documents.
            unsafe {
                CATapDescription::initStereoMixdownOfProcesses(CATapDescription::alloc(), &list)
            }
        }
    };
    let title = NSString::from_str(name);
    // SAFETY: plain setters on an object we own, with an `NSString`.
    unsafe { desc.setName(&title) };
    // SAFETY: as above; a private tap is not listed to other processes.
    unsafe { desc.setPrivate(true) };
    // SAFETY: a getter on an object we own.
    let uuid = unsafe { desc.UUID() }.UUIDString();

    let mut tap: AudioObjectID = 0;
    // SAFETY: `desc` is a valid description and `tap` a live local.
    let status = unsafe { AudioHardwareCreateProcessTap(Some(&desc), &raw mut tap) };
    if status != NO_ERR || tap == 0 {
        return Err(failure("creating the tap", status));
    }
    let undo_tap = |tap: AudioObjectID| {
        // SAFETY: the tap just made, destroyed once on this failure path.
        let _ = unsafe { AudioHardwareDestroyProcessTap(tap) };
    };
    let rate = match tap_format(tap) {
        Ok(f) => f,
        Err(e) => {
            undo_tap(tap);
            return Err(e);
        }
    };
    let aggregate = match make_aggregate(name, &uuid) {
        Ok(id) => id,
        Err(e) => {
            undo_tap(tap);
            return Err(e);
        }
    };
    let undo_both = |aggregate: AudioObjectID, tap: AudioObjectID| {
        // SAFETY: the aggregate just made, destroyed once on this path.
        let _ = unsafe { AudioHardwareDestroyAggregateDevice(aggregate) };
        undo_tap(tap);
    };

    let stopped = Arc::new(AtomicBool::new(false));
    let gate = Arc::clone(&stopped);
    let block = RcBlock::new(
        move |_now: NonNull<AudioTimeStamp>,
              input: NonNull<AudioBufferList>,
              _input_time: NonNull<AudioTimeStamp>,
              _output: NonNull<AudioBufferList>,
              _output_time: NonNull<AudioTimeStamp>| {
            if gate.load(Ordering::Acquire) {
                return;
            }
            if let Some(block) = read_input(input) {
                // Full or closed: the block is dropped, never waited for.
                let _ = tx.try_send(block);
            }
        },
    );
    let mut io_proc: AudioDeviceIOProcID = None;
    // SAFETY: `io_proc` is a live local, `aggregate` a device we made, and
    // the block pointer is valid for the call (the system copies the
    // block); `block` is kept in the returned chain until the IOProc is
    // destroyed.
    let status = unsafe {
        AudioDeviceCreateIOProcIDWithBlock(
            NonNull::from(&mut io_proc),
            aggregate,
            None,
            RcBlock::as_ptr(&block),
        )
    };
    if status != NO_ERR || io_proc.is_none() {
        undo_both(aggregate, tap);
        return Err(failure("registering the audio callback", status));
    }
    // SAFETY: the device and IOProc just made.
    let status = unsafe { AudioDeviceStart(aggregate, io_proc) };
    if status != NO_ERR {
        stopped.store(true, Ordering::Release);
        // SAFETY: the IOProc just made on this device, destroyed once.
        let _ = unsafe { AudioDeviceDestroyIOProcID(aggregate, io_proc) };
        undo_both(aggregate, tap);
        return Err(failure("starting the capture", status));
    }
    Ok(Chain {
        aggregate,
        io_proc,
        tap,
        stopped,
        rate,
        _block: block,
        _desc: desc,
    })
}

/// The system's buffers, copied into one interleaved block. Allocates a
/// vector (about 10 ms of audio) a call; the capture's thread is the
/// system's, and nothing else runs on it.
fn read_input(input: NonNull<AudioBufferList>) -> Option<Block> {
    // SAFETY: the system passes a valid buffer list for the duration of
    // the callback.
    let list = unsafe { input.as_ref() };
    let count = list.mNumberBuffers as usize;
    if count == 0 {
        return None;
    }
    // SAFETY: `mBuffers` is the first of `mNumberBuffers` buffers laid out
    // one after another (the C flexible array member).
    let buffers = unsafe { std::slice::from_raw_parts(list.mBuffers.as_ptr(), count) };
    let mut slices: Vec<(usize, &[f32])> = Vec::with_capacity(count);
    for b in buffers {
        let channels = b.mNumberChannels as usize;
        let data = b.mData.cast::<f32>();
        let len = b.mDataByteSize as usize / std::mem::size_of::<f32>();
        if channels == 0 || data.is_null() || !data.is_aligned() {
            return None;
        }
        // SAFETY: the buffer's data holds `mDataByteSize` readable bytes,
        // aligned for `f32` (checked), for the duration of the callback.
        slices.push((channels, unsafe { std::slice::from_raw_parts(data, len) }));
    }
    let (channels, samples) = join_buffers(&slices);
    (!samples.is_empty()).then_some(Block { channels, samples })
}

/// The default output device and its sample rate, in Hz.
fn default_output() -> Result<(AudioObjectID, u32), Failure> {
    let mut device: AudioObjectID = 0;
    read_property(1, kAudioHardwarePropertyDefaultOutputDevice, &mut device)
        .map_err(|s| failure("finding the default output device", s))?;
    if device == 0 {
        return Err(Failure::Other("this Mac has no output device".into()));
    }
    let mut rate = 0.0_f64;
    read_property(device, kAudioDevicePropertyNominalSampleRate, &mut rate)
        .map_err(|s| failure("reading the output device's rate", s))?;
    if !rate.is_finite() || !(8_000.0..=384_000.0).contains(&rate) {
        return Err(Failure::Other(
            "the output device reported a rate that makes no sense".into(),
        ));
    }
    Ok((device, rate as u32))
}

/// The default output device's sample rate, in Hz.
///
/// # Errors
/// Why there is none, in words for the log.
pub fn output_rate() -> Result<u32, String> {
    match default_output() {
        Ok((_, rate)) => Ok(rate),
        Err(Failure::Denied) => Err("the output device refused".into()),
        Err(Failure::Other(why)) => Err(why),
    }
}

/// The default output device at work, played by a block of ours. Dropping it
/// stops the device and destroys the IOProc.
pub struct Output {
    device: AudioObjectID,
    io_proc: AudioDeviceIOProcID,
    stopped: Arc<AtomicBool>,
    _block: RcBlock<IoFn>,
}

impl Drop for Output {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Release);
        if self.io_proc.is_some() {
            // SAFETY: the device and IOProc made in `start_output`, stopped
            // and destroyed once here.
            let _ = unsafe { AudioDeviceStop(self.device, self.io_proc) };
            // SAFETY: as above; the block is still alive (a field).
            let _ = unsafe { AudioDeviceDestroyIOProcID(self.device, self.io_proc) };
        }
    }
}

/// Play on the default output device: each time the device wants audio,
/// `fill` gets interleaved stereo `f32` frames to fill, at the rate of
/// [`output_rate`]; any other channels the device has get silence. `fill`
/// runs on the system's audio thread, so it must not wait.
///
/// # Errors
/// Why the device did not start, in words for the log.
pub fn start_output(fill: impl FnMut(&mut [f32]) + Send + 'static) -> Result<Output, Failure> {
    let (device, _) = default_output()?;
    let stopped = Arc::new(AtomicBool::new(false));
    let gate = Arc::clone(&stopped);
    let state = std::sync::Mutex::new((fill, Vec::<f32>::new()));
    let block = RcBlock::new(
        move |_now: NonNull<AudioTimeStamp>,
              _input: NonNull<AudioBufferList>,
              _input_time: NonNull<AudioTimeStamp>,
              output: NonNull<AudioBufferList>,
              _output_time: NonNull<AudioTimeStamp>| {
            // A call that cannot have the lock, or after the stop, plays silence.
            match state.try_lock() {
                Ok(mut guard) if !gate.load(Ordering::Acquire) => {
                    let (fill, scratch) = &mut *guard;
                    write_frames(output, scratch, fill);
                }
                _ => write_frames(output, &mut Vec::new(), &mut |s: &mut [f32]| s.fill(0.0)),
            }
        },
    );
    let mut io_proc: AudioDeviceIOProcID = None;
    // SAFETY: `io_proc` is a live local, `device` the default output, and
    // the block pointer is valid for the call (the system copies the block);
    // `block` is kept in the returned value until the IOProc is destroyed.
    let status = unsafe {
        AudioDeviceCreateIOProcIDWithBlock(
            NonNull::from(&mut io_proc),
            device,
            None,
            RcBlock::as_ptr(&block),
        )
    };
    if status != NO_ERR || io_proc.is_none() {
        return Err(failure("registering the output callback", status));
    }
    // SAFETY: the device and IOProc just made.
    let status = unsafe { AudioDeviceStart(device, io_proc) };
    if status != NO_ERR {
        stopped.store(true, Ordering::Release);
        // SAFETY: the IOProc just made on this device, destroyed once.
        let _ = unsafe { AudioDeviceDestroyIOProcID(device, io_proc) };
        return Err(failure("starting the output", status));
    }
    Ok(Output {
        device,
        io_proc,
        stopped,
        _block: block,
    })
}

/// Fill `output`'s buffers from `fill`'s interleaved stereo frames. A buffer
/// of one channel is a plane (the left, the right, silence for the rest); a
/// buffer of more is interleaved (the first two channels, silence for the
/// rest).
fn write_frames(
    output: NonNull<AudioBufferList>,
    scratch: &mut Vec<f32>,
    fill: &mut dyn FnMut(&mut [f32]),
) {
    let list = output.as_ptr();
    // SAFETY: the system passes a valid buffer list for the duration of the
    // callback.
    let count = unsafe { (*list).mNumberBuffers } as usize;
    if count == 0 {
        return;
    }
    // SAFETY: only the address of the `mBuffers` field is taken.
    let first = unsafe { &raw mut (*list).mBuffers };
    // SAFETY: `mBuffers` is the first of `mNumberBuffers` buffers laid out
    // one after another (the C flexible array member); the list is ours to
    // write for the callback.
    let buffers = unsafe {
        std::slice::from_raw_parts_mut(first.cast::<objc2_core_audio_types::AudioBuffer>(), count)
    };
    let frames = buffers
        .iter()
        .map(|b| b.mDataByteSize as usize / (4 * (b.mNumberChannels as usize).max(1)))
        .min()
        .unwrap_or(0);
    scratch.clear();
    scratch.resize(frames * 2, 0.0);
    fill(scratch);
    for (index, b) in buffers.iter().enumerate() {
        let channels = (b.mNumberChannels as usize).max(1);
        let data = b.mData.cast::<f32>();
        let len = b.mDataByteSize as usize / 4;
        if data.is_null() || !data.is_aligned() {
            continue;
        }
        // SAFETY: the buffer holds `mDataByteSize` writable bytes, aligned
        // for `f32` (checked), for the duration of the callback.
        let out = unsafe { std::slice::from_raw_parts_mut(data, len) };
        out.fill(0.0);
        for f in 0..frames {
            if channels == 1 {
                if index < 2 {
                    out[f] = scratch[f * 2 + index];
                }
            } else if index == 0 {
                out[f * channels] = scratch[f * 2];
                out[f * channels + 1] = scratch[f * 2 + 1];
            }
        }
    }
}
