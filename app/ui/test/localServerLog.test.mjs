// *Transformar em servidor › O que aconteceu* (src/dialogs/
// localServerStrings.ts): every event reads as a sentence in the window's
// language — the walk of 2026-11-06 on the Windows app showed
// `access_set`, `invitation_used`, `campaign_make`, `seat_opened`,
// `link_on` as codes and "1 address(es), port 49955" in English in a
// Portuguese window. An event this app does not know is a sentence too,
// never its code.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";

const root = { lang: "pt-BR" };
globalThis.document = { documentElement: root };

await esbuild.build({
  entryPoints: ["src/dialogs/localServerStrings.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "test/.bundles/localServerLog.test-bundle.mjs",
  logLevel: "error",
});
const S = await import("./.bundles/localServerLog.test-bundle.mjs");

/** What this computer's server writes in its log (crates/verso-server:
 *  local/, campaign_cmds.rs, access_cmds.rs, invite_join.rs, the accounts). */
const codes = [
  "local_on", "local_off", "link_on", "link_off", "seat_opened", "device_ended",
  "pair_open", "pair_asked", "pair_refused_attempt", "pair_refused", "phone_first_connection",
  "phone_connection_refused", "phone_revoked", "phones_forgotten", "identity_replaced",
  "campaign_make", "campaign_unmake", "campaign_settings", "campaign_release", "campaign_release_all",
  "campaign_audience", "campaign_access", "campaign_secret_name", "campaign_grant", "campaign_invite",
  "access_set", "table_rights_set", "invitation_created", "invitation_ended", "invitation_used",
  "account_created", "account_deleted", "account_sessions_ended", "reset_link", "password_reset",
  "sign_in", "sign_out", "token_revoked", "read_link_made", "read_links_on", "read_links_off",
];

for (const lang of ["pt-BR", "en"]) {
  test(`every event of this computer's server in words (${lang})`, () => {
    root.lang = lang;
    for (const code of codes) {
      const said = S.eventWords(code);
      assert.notEqual(said, code, code);
      assert.doesNotMatch(said, /_/, code);
      assert.notEqual(said, S.localStrings().logOther, `${code} has no words of its own`);
    }
  });
}

test("an event this app does not know is a sentence, never its code", () => {
  root.lang = "pt-BR";
  assert.equal(S.eventWords("something_newer"), "Outra ação no servidor");
  root.lang = "en";
  assert.equal(S.eventWords("something_newer"), "Another action on the server");
});

test("the turn-on's addresses and port in the window's language", () => {
  root.lang = "pt-BR";
  assert.equal(S.eventSubject("1 address(es), port 49955"), "1 endereço, porta 49955");
  assert.equal(S.eventSubject("2 address(es), port 49955"), "2 endereços, porta 49955");
  root.lang = "en";
  assert.equal(S.eventSubject("1 address(es), port 49955"), "1 address, port 49955");
  assert.equal(S.eventSubject("3 address(es), port 51234"), "3 addresses, port 51234");
  // Anything else as it is: a phone's or a person's name.
  assert.equal(S.eventSubject("Pixel de Ana"), "Pixel de Ana");
});

test("the two languages have the same events", () => {
  root.lang = "pt-BR";
  const pt = Object.keys(S.localStrings().actions).sort();
  root.lang = "en";
  assert.deepEqual(Object.keys(S.localStrings().actions).sort(), pt);
});
