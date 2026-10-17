// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! macOS: the page's `WKWebView` inside a layer-backed `NSView` that
//! clips to its bounds, added to the window's content view just above
//! where wry put the page (above the window's own page).
//!
//! One of the two files of the workspace allowed `unsafe` (ADR 0029,
//! revision of 2026-10-15; `scripts/check-unsafe.mjs`). Two operations
//! need it, each in a block of its own with its reason: taking the
//! `WKWebView` from the raw pointer wry hands out, and asking a view for
//! its superview. Everything else is objc2's safe API.

#![allow(unsafe_code)]

use objc2::rc::Retained;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSUserInterfaceItemIdentification, NSView, NSWindowOrderingMode,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use tauri::webview::PlatformWebview;

use super::geometry::{Frames, appkit_y};

/// Containers are placed from the window's frame, as Tauri places a
/// child view (the content view starts at the window's top: no title bar
/// since ADR 0072).
pub(super) const FROM_WINDOW_TOP: bool = true;

/// Frames are computed in the screen's pixels, then given to AppKit in
/// points: every edge falls on a whole pixel.
pub(super) fn device_scale(scale: f64) -> f64 {
    scale
}

/// The container's identifier, which is how a later call knows it.
const CLIP_ID: &str = "verso-web-clip";

/// The page's `WKWebView`, held for this call only.
fn page_view(pw: &PlatformWebview) -> Option<Retained<NSView>> {
    let page = pw.inner().cast::<NSView>();
    // SAFETY: `inner()` is wry's `WKWebView` for this web view — an
    // `NSView` subclass, so the cast keeps its type — and wry keeps it
    // alive while the web view exists. `with_webview` runs this on the
    // main thread, the only one that may touch it, while the web view
    // exists. `retain` adds a strong reference of our own (or answers
    // `None` for a null pointer); the `Retained` is dropped before the
    // call returns and never stored.
    unsafe { Retained::retain(page) }
}

/// The view `view` sits in, held for this call only.
fn superview(view: &NSView) -> Option<Retained<NSView>> {
    // SAFETY: objc2 marks `superview` unsafe because the hierarchy can
    // change under a caller that keeps the answer. This runs on the main
    // thread, the only one that changes the hierarchy, and the answer is
    // a strong reference (`Retained`) dropped before the call returns.
    unsafe { view.superview() }
}

fn is_clip(view: &NSView) -> bool {
    view.identifier()
        .is_some_and(|id| id.to_string() == CLIP_ID)
}

/// Build the container in `parent`, at the page's place in the order of
/// views, and move the page into it.
fn adopt(mtm: MainThreadMarker, page: &NSView, parent: &NSView) -> Retained<NSView> {
    let clip = NSView::initWithFrame(NSView::alloc(mtm), page.frame());
    clip.setIdentifier(Some(&NSString::from_str(CLIP_ID)));
    // Layer-backed, and its layer masks to its bounds: nothing of the
    // page is drawn outside the container. The layer's `masksToBounds`
    // is used, not `NSView.clipsToBounds`, which is public only from
    // macOS 14 (the app supports macOS 11 and up).
    clip.setWantsLayer(true);
    if let Some(layer) = clip.layer() {
        layer.setMasksToBounds(true);
    }
    // The page is placed by hand on every call, never resized by AppKit.
    clip.setAutoresizesSubviews(false);
    // Between two calls (a window resized), keep the distance to the
    // window's top, as wry does for a child view.
    clip.setAutoresizingMask(if parent.isFlipped() {
        NSAutoresizingMaskOptions::empty()
    } else {
        NSAutoresizingMaskOptions::ViewMinYMargin
    });
    parent.addSubview_positioned_relativeTo(&clip, NSWindowOrderingMode::Above, Some(page));
    // AppKit takes the page out of `parent` first; wry and `page` hold it
    // meanwhile.
    clip.addSubview(page);
    clip
}

/// `f` is in device pixels at `scale` per point.
pub(super) fn place(pw: &PlatformWebview, f: Frames, scale: f64) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("not on the main thread")?;
    let page = page_view(pw).ok_or("no WKWebView")?;
    let parent = superview(&page).ok_or("the page's view is in no view")?;
    let clip = if is_clip(&parent) {
        parent
    } else {
        adopt(mtm, &page, &parent)
    };
    let host = superview(&clip).ok_or("the container is in no view")?;
    let pt = |v: i32| f64::from(v) / scale;
    let hb = host.bounds();
    let (cw, ch) = (pt(f.clip.w), pt(f.clip.h));
    clip.setFrame(NSRect::new(
        NSPoint::new(
            hb.origin.x + pt(f.clip.x),
            hb.origin.y + appkit_y(pt(f.clip.y), ch, hb.size.height, host.isFlipped()),
        ),
        NSSize::new(cw, ch),
    ));
    let ph = pt(f.page.h);
    page.setFrame(NSRect::new(
        NSPoint::new(
            pt(f.page.x),
            appkit_y(pt(f.page.y), ph, ch, clip.isFlipped()),
        ),
        NSSize::new(pt(f.page.w), ph),
    ));
    Ok(())
}

pub(super) fn show(pw: &PlatformWebview, visible: bool) {
    if let Some(page) = page_view(pw)
        && let Some(clip) = superview(&page).filter(|v| is_clip(v))
    {
        clip.setHidden(!visible);
    }
}

pub(super) fn release(pw: &PlatformWebview) {
    let Some(page) = page_view(pw) else { return };
    let Some(clip) = superview(&page).filter(|v| is_clip(v)) else {
        return;
    };
    // Back where wry put it, so that wry finds it where it left it.
    if let Some(host) = superview(&clip) {
        host.addSubview_positioned_relativeTo(&page, NSWindowOrderingMode::Above, Some(&clip));
    }
    clip.removeFromSuperview();
}

#[cfg(test)]
mod tests {
    /// `NSView.clipsToBounds` is public only from macOS 14; the app
    /// supports macOS 11 and up, so the container clips with its layer's
    /// `masksToBounds` (ADR 0029, revision of 2026-10-15).
    #[test]
    fn the_container_clips_through_its_layer_not_a_macos_14_api() {
        let source = include_str!("macos.rs");
        assert!(!source.contains(concat!("set", "ClipsToBounds")));
        assert!(source.contains(concat!("set", "MasksToBounds(true)")));
    }
}
