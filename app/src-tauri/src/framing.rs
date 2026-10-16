// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Whether a web page may be shown in a frame of the app (ADR 0056,
//! revised 2026-10-15): an embed is a real `<iframe>` when the site
//! allows being framed by the app's origin, and a child web view when it
//! does not. The decision is the site's own headers, read here with
//! the rules a browser applies; nothing of the page is fetched.

pub use verso_server::framing::*;
