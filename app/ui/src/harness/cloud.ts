// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The harness's clouds (ADR 0104): a WebDAV folder or an S3 prefix the
// folder can sync with, checked and then started. The harness has no
// service, so it answers as the host does by what the form says: a wrong
// password ("errada"), plain HTTP, a service that cannot keep an edit safe
// (an address with "inseguro"), or accepted. The real checks are the
// host's, run against fakes of both services in Rust.

import type { CloudCheck, CloudSettings, CloudStatus, ContractError, SyncStatus } from "../bindings";

function refuse(kind: "refused", message: string): never {
  const error: ContractError = { kind, message };
  throw error;
}

export class Clouds {
  /** A cloud just checked and not started. */
  pending: CloudStatus | null = null;

  constructor(
    private readonly core: { sync: SyncStatus },
    private readonly off: () => SyncStatus,
  ) {}

  private refused(problem: string, message: string): CloudCheck {
    return { accepted: false, problem, message, label: "", deletions: "unknown", notes: [], free: null, remote_files: 0, remote_bytes: 0 };
  }

  check(s: CloudSettings, secret: string): CloudCheck {
    const http = /^http:\/\//i.test(s.endpoint);
    const local = /^http:\/\/(localhost|127\.|192\.168\.|10\.|[a-z0-9-]+\.local)/i.test(s.endpoint);
    if (http && !local) return this.refused("plain_http_refused", "a password does not go over plain HTTP outside the local network");
    if (http && !s.plain_http) return this.refused("plain_http_unconfirmed", "plain HTTP on the local network needs the person's confirmation");
    if (s.provider === "webdav" ? !s.endpoint : !s.bucket) return this.refused("invalid", "name where");
    if (secret === "errada") return this.refused("auth", "cloud sign-in refused");
    if (s.endpoint.includes("inseguro")) return this.refused("service_refused", "the service does not honour If-Match: it would overwrite a version it was told not to");
    const label = s.provider === "s3" ? `s3://${s.bucket}${s.prefix ? `/${s.prefix}` : ""}` : s.endpoint.replace(/^https?:\/\//, "");
    const versioned = s.bucket === "versionado";
    this.pending = { provider: s.provider, label, deletions: versioned ? "kept" : "final", notes: versioned ? ["the bucket keeps earlier versions"] : [] };
    return { accepted: true, problem: null, message: null, label, deletions: this.pending.deletions, notes: this.pending.notes, free: s.provider === "webdav" ? 5_000_000_000 : null, remote_files: 3, remote_bytes: 2048 };
  }

  handlers(): Record<string, (a: Record<string, unknown>) => unknown> {
    return {
      folder_sync_cloud_check: (a) => this.check(a["settings"] as CloudSettings, a["secret"] as string),
      folder_sync_cloud_start: (): SyncStatus => {
        const cloud = this.pending;
        if (!cloud) return refuse("refused", "check the cloud first");
        this.pending = null;
        this.core.sync = { ...this.off(), on: true, server: cloud.label, folder: cloud.label, role: "owner", state: "synced", last: "2026-10-21T12:00:00Z", cloud };
        return this.core.sync;
      },
      folder_sync_cloud_cancel: () => {
        this.pending = null;
        return null;
      },
    };
  }
}
