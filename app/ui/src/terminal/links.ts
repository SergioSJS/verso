// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** A link printed in a terminal goes to the app's own `openUrl` path and
 *  nowhere else (ADR 0115 item 21): xterm's default for an OSC 8 hyperlink
 *  is `confirm()` and `window.open()` from the app's web view, which is not
 *  ours to rely on. Only http(s) is followed; anything else does nothing. */
export function httpUrl(uri: string): string | null {
  try {
    const u = new URL(uri);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** xterm's `linkHandler` option (OSC 8), and the web-links addon's handler. */
export function linkHandler(openLink: (url: string) => void): {
  activate: (event: MouseEvent, uri: string) => void;
  allowNonHttpProtocols: false;
} {
  return {
    activate: (event, uri) => {
      event.preventDefault();
      const url = httpUrl(uri);
      if (url) openLink(url);
    },
    allowNonHttpProtocols: false,
  };
}
