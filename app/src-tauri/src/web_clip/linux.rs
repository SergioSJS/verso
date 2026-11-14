// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Linux: GTK's own containers, through gtk-rs's safe API — no `unsafe`
//! here.
//!
//! Tauri packs a child web view into the window's box after the window's
//! own page, where GTK lays it out below the page instead of over it.
//! So, once per window, the window's page is moved into a `GtkOverlay`
//! (named `verso-web-stage`) at its place in the box; each page's
//! `WebKitWebView` then goes into a `GtkLayout` (named `verso-web-clip`)
//! laid over it at the visible part. A `GtkLayout` draws its children in
//! a window of its own, its size: the page, put at the slot's offset with
//! the slot's size, is drawn only inside it. GTK counts in logical pixels,
//! the window's page's own, from the top of that page.
//!
//! The picture of a page while an overlay is over it (`snapshot`, ADR 0056,
//! revision of 2026-11-12): WebKitGTK's `webkit_web_view_get_snapshot` of
//! the view's visible area, encoded as JPEG by GdkPixbuf.

use gtk::prelude::*;
use tauri::webview::PlatformWebview;

use super::geometry::Frames;
use super::{Done, Picture};

/// The containers are placed from the top of the window's page (the
/// overlay holds it), not from the window's frame.
pub(super) const FROM_WINDOW_TOP: bool = false;

/// GTK places widgets in whole logical pixels.
pub(super) fn device_scale(_scale: f64) -> f64 {
    1.0
}

const CLIP_NAME: &str = "verso-web-clip";
const STAGE_NAME: &str = "verso-web-stage";

/// The container `page` sits in, if it is one of ours.
fn clip_of(page: &gtk::Widget) -> Option<gtk::Layout> {
    page.parent()
        .and_then(|p| p.downcast::<gtk::Layout>().ok())
        .filter(|l| l.widget_name() == CLIP_NAME)
}

/// The overlay over the window's page, made the first time: the page
/// moved into it, at its place in the box and packed as it was.
fn stage(vbox: &gtk::Box, page: &gtk::Widget) -> Result<gtk::Overlay, String> {
    let children = vbox.children();
    if let Some(stage) = children
        .iter()
        .find(|c| c.widget_name() == STAGE_NAME)
        .and_then(|c| c.clone().downcast::<gtk::Overlay>().ok())
    {
        return Ok(stage);
    }
    // The window's own page: the first web view of the box that is not
    // this one (Tauri made it first).
    let (at, main) = children
        .iter()
        .enumerate()
        .find(|(_, c)| *c != page && c.type_().name() == "WebKitWebView")
        .ok_or("no window page in the window's box")?;
    let at = i32::try_from(at).map_err(|e| e.to_string())?;
    let (expand, fill, padding, pack) = vbox.query_child_packing(main);
    let stage = gtk::Overlay::new();
    stage.set_widget_name(STAGE_NAME);
    // `main` holds the page while it moves, as wry does.
    vbox.remove(main);
    stage.add(main);
    vbox.add(&stage);
    vbox.set_child_packing(&stage, expand, fill, padding, pack);
    vbox.reorder_child(&stage, at);
    stage.show();
    Ok(stage)
}

/// Make the container over the window's page and move the page's view
/// into it.
fn adopt(page: &gtk::Widget) -> Result<gtk::Layout, String> {
    let vbox = page
        .parent()
        .and_then(|p| p.downcast::<gtk::Box>().ok())
        .ok_or("the page is not in the window's box")?;
    let stage = stage(&vbox, page)?;
    let clip = gtk::Layout::new(None::<&gtk::Adjustment>, None::<&gtk::Adjustment>);
    clip.set_widget_name(CLIP_NAME);
    clip.set_halign(gtk::Align::Start);
    clip.set_valign(gtk::Align::Start);
    vbox.remove(page);
    clip.put(page, 0, 0);
    stage.add_overlay(&clip);
    clip.show();
    Ok(clip)
}

/// `f` is in logical pixels from the top of the window's page.
pub(super) fn place(pw: &PlatformWebview, f: Frames, _scale: f64) -> Result<(), String> {
    let page: gtk::Widget = pw.inner().upcast();
    let clip = match clip_of(&page) {
        Some(clip) => clip,
        None => adopt(&page)?,
    };
    clip.set_margin_start(f.clip.x.max(0));
    clip.set_margin_top(f.clip.y.max(0));
    clip.set_size_request(f.clip.w.max(0), f.clip.h.max(0));
    clip.set_size(
        u32::try_from(f.clip.w.max(1)).unwrap_or(1),
        u32::try_from(f.clip.h.max(1)).unwrap_or(1),
    );
    clip.move_(&page, f.page.x, f.page.y);
    page.set_size_request(f.page.w, f.page.h);
    Ok(())
}

pub(super) fn show(pw: &PlatformWebview, visible: bool) {
    let page: gtk::Widget = pw.inner().upcast();
    if let Some(clip) = clip_of(&page) {
        clip.set_visible(visible);
    }
}

pub(super) fn release(pw: &PlatformWebview) {
    let page: gtk::Widget = pw.inner().upcast();
    if let Some(clip) = clip_of(&page) {
        // The page leaves with no parent: wry destroys it next. The
        // overlay stays over the window's page for the window's life.
        clip.remove(&page);
        if let Some(stage) = clip
            .parent()
            .and_then(|p| p.downcast::<gtk::Container>().ok())
        {
            stage.remove(&clip);
        }
    }
}

/// A picture of the page's whole view, handed to `done` when WebKit has
/// drawn it (on the main loop, after this returns).
pub(super) fn snapshot(pw: &PlatformWebview, done: Done) {
    use webkit2gtk::{SnapshotOptions, SnapshotRegion, WebViewExt};
    pw.inner().snapshot(
        SnapshotRegion::Visible,
        SnapshotOptions::NONE,
        None::<&gtk::gio::Cancellable>,
        move |drawn| {
            let _ = done.send(drawn.map_err(|e| e.to_string()).and_then(|s| jpeg(&s)));
        },
    );
}

/// `surface` as a JPEG (a PNG where this GdkPixbuf has no JPEG writer).
fn jpeg(surface: &gtk::cairo::Surface) -> Result<Picture, String> {
    let image = gtk::cairo::ImageSurface::try_from(surface.clone())
        .map_err(|_| "the picture is not an image".to_owned())?;
    let pixbuf = gtk::gdk::pixbuf_get_from_surface(surface, 0, 0, image.width(), image.height())
        .ok_or("the picture could not be read")?;
    match pixbuf.save_to_bufferv("jpeg", &[("quality", "85")]) {
        Ok(bytes) => Ok(Picture {
            mime: "image/jpeg",
            bytes,
        }),
        Err(_) => pixbuf
            .save_to_bufferv("png", &[])
            .map(|bytes| Picture {
                mime: "image/png",
                bytes,
            })
            .map_err(|e| e.to_string()),
    }
}
