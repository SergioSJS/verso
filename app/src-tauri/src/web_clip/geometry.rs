// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The arithmetic of a clipped page, with no platform in it: from the
//! slot and the visible part the window measured, the container's frame
//! and the page's frame inside it, in device pixels.

/// A rectangle in the window's logical pixels (CSS pixels of the app's
/// page), from the top-left of the window's page.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Rect {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) w: f64,
    pub(crate) h: f64,
}

impl Rect {
    /// The same rectangle `dy` lower.
    pub(crate) fn lower(self, dy: f64) -> Self {
        Self {
            y: self.y + dy,
            ..self
        }
    }
}

/// A rectangle in whole device pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Px {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) w: i32,
    pub(crate) h: i32,
}

/// Where the two native views go.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Frames {
    /// The container: the visible part of the slot, from the window's
    /// top-left. Nothing of the page is drawn outside it.
    pub(crate) clip: Px,
    /// The page's view, from the container's top-left: the slot's whole
    /// size, at the slot's offset from the container — negative when the
    /// slot is cut at the top or the left.
    pub(crate) page: Px,
}

/// Farther than any window reaches, in logical pixels: a number past it
/// is not a place on a screen.
const FAR: f64 = 1_000_000.0;

/// Whether `r` can be a place: finite, not negative in size, and on a
/// screen.
pub(crate) fn sane(r: Rect) -> bool {
    [r.x, r.y, r.w, r.h]
        .iter()
        .all(|v| v.is_finite() && v.abs() <= FAR)
        && r.w >= 0.0
        && r.h >= 0.0
}

/// The edges of `r` in device pixels, each rounded on its own and half
/// up, whatever its sign: two rectangles that share an edge in logical
/// pixels share it on the screen, with no seam and no overlap at a
/// fractional scale, and a rectangle moved by whole pixels keeps its size.
fn edges(r: Rect, scale: f64) -> Option<[i32; 4]> {
    let px = |v: f64| {
        let v = (v * scale + 0.5).floor();
        // In range by `sane` and the scale's bound: the cast is exact.
        (v.abs() <= f64::from(i32::MAX)).then_some(v as i32)
    };
    Some([px(r.x)?, px(r.y)?, px(r.x + r.w)?, px(r.y + r.h)?])
}

/// The frames for a page whose box is `slot` and whose visible part is
/// `visible`, at `scale` device pixels per logical pixel. The visible part
/// is cut to the slot (it is never larger than what is there to show);
/// the page is never smaller than one pixel each way. `None` when a
/// rectangle or the scale is not a place.
pub(crate) fn frames(slot: Rect, visible: Rect, scale: f64) -> Option<Frames> {
    if !(sane(slot) && sane(visible) && scale.is_finite() && scale > 0.0 && scale <= 16.0) {
        return None;
    }
    let [sl, st, sr, sb] = edges(slot, scale)?;
    let [vl, vt, vr, vb] = edges(visible, scale)?;
    let (left, top) = (vl.max(sl), vt.max(st));
    let (right, bottom) = (vr.min(sr).max(left), vb.min(sb).max(top));
    Some(Frames {
        clip: Px {
            x: left,
            y: top,
            w: right - left,
            h: bottom - top,
        },
        page: Px {
            x: sl - left,
            y: st - top,
            w: (sr - sl).max(1),
            h: (sb - st).max(1),
        },
    })
}

/// AppKit's `y` for a frame whose top is `top` below its superview's top
/// and `h` tall, in a superview `parent_h` tall: a superview that is not
/// flipped counts from its bottom edge up.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn appkit_y(top: f64, h: f64, parent_h: f64, flipped: bool) -> f64 {
    if flipped { top } else { parent_h - top - h }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }
    fn px(x: i32, y: i32, w: i32, h: i32) -> Px {
        Px { x, y, w, h }
    }

    #[test]
    fn a_slot_wholly_in_view_is_its_own_container_and_the_page_fills_it() {
        let f = frames(
            r(100.0, 200.0, 800.0, 300.0),
            r(100.0, 200.0, 800.0, 300.0),
            1.0,
        );
        assert_eq!(
            f,
            Some(Frames {
                clip: px(100, 200, 800, 300),
                page: px(0, 0, 800, 300),
            })
        );
    }

    #[test]
    fn a_slot_half_above_the_pane_keeps_its_whole_size_and_rises_out_of_the_container() {
        // 300 tall, its top at -60; the pane starts at 40: 100 cut off.
        let f = frames(
            r(100.0, -60.0, 800.0, 300.0),
            r(100.0, 40.0, 800.0, 200.0),
            1.0,
        );
        assert_eq!(
            f,
            Some(Frames {
                clip: px(100, 40, 800, 200),
                page: px(0, -100, 800, 300),
            })
        );
    }

    #[test]
    fn a_slot_half_below_the_pane_starts_at_the_containers_top() {
        let f = frames(
            r(0.0, 600.0, 500.0, 400.0),
            r(0.0, 600.0, 500.0, 170.0),
            1.0,
        );
        assert_eq!(
            f,
            Some(Frames {
                clip: px(0, 600, 500, 170),
                page: px(0, 0, 500, 400),
            })
        );
    }

    #[test]
    fn a_slot_cut_on_every_side_shows_its_middle() {
        let f = frames(
            r(-50.0, -100.0, 1100.0, 2000.0),
            r(0.0, 40.0, 1000.0, 730.0),
            1.0,
        );
        assert_eq!(
            f,
            Some(Frames {
                clip: px(0, 40, 1000, 730),
                page: px(-50, -140, 1100, 2000),
            })
        );
    }

    #[test]
    fn device_pixels_at_a_retina_scale() {
        let f = frames(
            r(10.5, -20.25, 300.0, 200.0),
            r(10.5, 0.0, 300.0, 179.75),
            2.0,
        );
        assert_eq!(
            f,
            Some(Frames {
                clip: px(21, 0, 600, 360),
                page: px(0, -40, 600, 400),
            })
        );
    }

    #[test]
    fn at_a_fractional_scale_edges_are_rounded_so_the_page_ends_where_the_slot_ends() {
        // 1.25: the slot's bottom at (10.3 + 99.9) × 1.25 = 137.75 → 138;
        // its top at 12.875 → 13; the page is 125 px tall, not 99.9 × 1.25
        // rounded on its own (125) from a rounded top — the edges agree.
        let f = frames(r(0.0, 10.3, 100.0, 99.9), r(0.0, 20.0, 100.0, 90.2), 1.25)
            .unwrap_or_else(|| panic!("a place"));
        assert_eq!(f.clip.y, 25);
        assert_eq!(f.clip.y + f.clip.h, 138);
        assert_eq!(f.clip.y + f.page.y, 13);
        assert_eq!(f.clip.y + f.page.y + f.page.h, 138);
    }

    #[test]
    fn a_visible_part_larger_than_the_slot_is_cut_to_it() {
        let f = frames(
            r(100.0, 100.0, 200.0, 100.0),
            r(0.0, 0.0, 1000.0, 800.0),
            1.0,
        );
        assert_eq!(
            f,
            Some(Frames {
                clip: px(100, 100, 200, 100),
                page: px(0, 0, 200, 100),
            })
        );
    }

    #[test]
    fn nothing_visible_is_an_empty_container_and_the_page_keeps_a_pixel() {
        let f = frames(r(0.0, -500.0, 0.0, 0.0), r(0.0, 40.0, 0.0, 0.0), 1.0)
            .unwrap_or_else(|| panic!("a place"));
        assert_eq!((f.clip.w, f.clip.h), (0, 0));
        assert_eq!((f.page.w, f.page.h), (1, 1));
    }

    #[test]
    fn what_is_not_a_place_is_refused() {
        let ok = r(0.0, 0.0, 10.0, 10.0);
        for bad in [
            r(f64::NAN, 0.0, 10.0, 10.0),
            r(0.0, f64::INFINITY, 10.0, 10.0),
            r(0.0, 0.0, -1.0, 10.0),
            r(0.0, 0.0, 10.0, 2e6),
        ] {
            assert_eq!(frames(bad, ok, 1.0), None, "{bad:?} as the slot");
            assert_eq!(frames(ok, bad, 1.0), None, "{bad:?} as the visible part");
        }
        for scale in [0.0, -1.0, f64::NAN, 100.0] {
            assert_eq!(frames(ok, ok, scale), None, "scale {scale}");
        }
    }

    #[test]
    fn appkit_counts_from_the_bottom_unless_flipped() {
        // A container 300 pt tall in a window 800 pt tall, 40 pt from the top.
        assert_eq!(appkit_y(40.0, 300.0, 800.0, false), 460.0);
        assert_eq!(appkit_y(40.0, 300.0, 800.0, true), 40.0);
        // The page inside a 200 pt container, 100 pt above its top and 300
        // pt tall: its bottom edge sits on the container's bottom edge.
        assert_eq!(appkit_y(-100.0, 300.0, 200.0, false), 0.0);
        // Half below: its top on the container's top, the rest under it.
        assert_eq!(appkit_y(0.0, 400.0, 170.0, false), -230.0);
    }

    #[test]
    fn lower_moves_only_the_top() {
        assert_eq!(r(1.0, 2.0, 3.0, 4.0).lower(28.0), r(1.0, 30.0, 3.0, 4.0));
    }
}
