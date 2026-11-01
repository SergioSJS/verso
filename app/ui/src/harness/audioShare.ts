// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Share audio (ADR 0116 section B), contract step: the harness answers the
// host's three commands and the server's two as the app does before any
// capture is built — no source to list, a start that refuses, a stop that
// finds nothing to stop. Nothing is drawn from them yet.

import type { ContractError } from "../bindings";
import type { Core } from "./core";

function refuse(message: string): never {
  const e: ContractError = { kind: "refused", message };
  throw e;
}

export function installAudioShare(core: Core): void {
  const h = core.handlers;
  h["audio_sources_list"] = () => [];
  h["audio_share_start"] = (a) => {
    void a["id"];
    void a["bitrateKbps"];
    void a["frames"];
    return refuse("sharing audio is not built yet");
  };
  h["audio_share_stop"] = () => null;
  h["table_share_start"] = (a) => {
    void a["share"];
    void a["table"];
    return refuse("sharing audio is not built yet");
  };
  h["table_share_stop"] = (a) => {
    void a["table"];
    return refuse("sharing audio is not built yet");
  };
}
