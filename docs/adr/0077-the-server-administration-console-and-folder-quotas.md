# ADR 0077 — The server's administration console, and quotas per folder

- Date: 2026-10-10
- Source: the maintainer, in session on 2026-10-10, after 0.7.0-beta.1
  shipped the administration as a section of Settings: *"a cota de espaço
  por pasta isso deveria ter mas o admin tem que evoluir, não ficou bom essa
  parte estar junto com as configurações, configuração do servidor imagino
  ser diferente do verso, especialmente pq pode escalar muito, com número de
  usuários e tal"*; and *"gosto dessa direção"* on the direction proposed in
  reply (the account stays in Settings, the administration becomes a
  console of its own). Written by Opus 5.5; to be read by Fable 5.1
  ([0032](0032-author-and-reviewer-roles.md)) before it is accepted.
- Related: [0074](0074-accounts-and-access-on-the-server.md) (accounts,
  roles, the audit log; items 4 to 6 and 9), [0075](0075-server-packaging-and-storage.md)
  (item 4, the space each folder takes, limits later — **revised** by
  item 5 below; item 6, configuration by environment),
  [0073](0073-self-hosted-server-first.md) (item 6, upload limits and
  quotas before the first user who is not the maintainer),
  [0035](0035-cross-cutting-requirements.md) (both languages,
  accessibility).
- Status in the briefing: not present; on acceptance.
- Revisions: 2026-10-11 (evening) — item 3, Accounts: an admin may **end
  another account's sessions and revoke its tokens** from the console,
  each with an entry in the audit log. The maintainer, answering a memo of
  recommendations (kept outside the repository; its §6 is the list):
  *"Sim para todos"* (yes to all).
  2026-11-04 — item 6: the console may turn the UniVerso's own Cloudflare
  link on and off, by [0117](0117-this-app-is-a-universo-server.md) D14 (c)
  (the maintainer, *"confirmo tudo"*); every other setting stays in the
  environment.

## Context

0.7.0-beta.1 shows the server's administration as a section of the
window's Settings, beside the person's account: the server, the folders,
the accounts, the invitations and the audit log, each as rows of the
settings. It read as Verso, which the maintainer had asked for, but two
things do not hold as a server grows:

- **Settings are the person's**; the server's administration is another
  job, done by another role, on another scale. A server of a family has
  five accounts; a server of a club or a school has hundreds, with
  thousands of folders and an audit log of tens of thousands of lines.
  Rows of settings, each list fetched whole, do not scale to that.
- **Space is shown and not limited.** 0075 item 4 shows what each folder
  takes and leaves limits for when members other than the owner upload
  files — which 0.7.0-beta.1 already allows (an editor uploads
  attachments). 0073 item 6 asks for quotas before the first user who is
  not the maintainer.

## Decision

Accepted (2026-10-10, Status).

1. **The account stays in Settings; the administration leaves.** Settings
   › Account keeps what is the person's: profile, password, passkeys,
   sessions, the folders and their members (for an owner), access tokens,
   signing out. The server's administration becomes a **console of its
   own** at `/admin`: a full page, not a section of the window's Settings.
   An admin reaches it from Settings › Account ("Administer this server")
   and from the address; the window's ribbon carries no button for it.
2. **The console is drawn with the window's own pieces**: its tokens,
   fonts, buttons, switches and dialogs, so that it reads as Verso
   (the maintainer's rule of 2026-10-09: nothing that does not look like
   the app). Its layout is the one of every admin console that scales: a
   side navigation with its sections, a page per section, a header with
   the server's name and version and the way back to the notes. On a phone
   the navigation folds into a menu.
3. **Sections**, recommended:
   - **Overview**: the server's version and update, storage (the data
     directory, the folders root, network file systems), mail, TLS mode,
     totals (accounts, folders, space) and warnings (a quota close to its
     limit, a folder on a network file system, an update).
   - **Accounts**: a table — name, e-mail, role, folders, space, last
     sign-in, created — with search, sort and pages; an account opens a
     page of its own (its folders, sessions, tokens, the link to set a new
     password, admin, may create folders, remove). On that page an admin
     **ends any of the account's sessions and revokes its tokens** — a
     lost phone cut off without changing the password — each an entry of
     the audit log ([0074](0074-accounts-and-access-on-the-server.md) item
     9) (decided 2026-10-11, *"Sim para todos"*, Revisions).
   - **Folders**: a table — name, owners, members, space and quota, last
     change — with search, sort and pages; a folder opens a page (members,
     quota, space detail, enter as admin, the audit of that folder);
     folders on disk with no owner, to register.
   - **Invitations**: pending, used, expired, ended; a new invitation.
   - **Audit log**: filtered by person, action, folder and dates, in pages;
     exported as CSV.
   - **Server**: the configuration in effect, read only — the variables
     of 0075 item 6 and their values, secrets shown as set or not set,
     never their value.
4. **Every list is searched, sorted and paged on the server.** The admin
   API takes `q`, `sort` and a page cursor and returns a page (50 rows by
   default) and a total; the console never fetches a whole list. The
   server's database gains the indexes those queries need.
5. **Quotas per folder, now** — revises 0075 item 4 ("limits later"):
   - the admin sets a folder's quota, or none; a server-wide default for
     new folders comes from `VERSO_FOLDER_QUOTA` (none when unset), shown
     and changed in the console per folder;
   - a write that would take a folder past its quota is refused with a
     `quota` error the window says in the person's words (the note or file
     is not written; nothing already there is touched); a write that does
     not grow the folder — an edit that shortens a note, a delete, a move —
     is always allowed, so a full folder can be made smaller;
   - at 90 % the folder's owners and editors see a warning in the window,
     and the console lists the folder under Overview;
   - the space is the one 0075 item 4 counts during the walk, kept up to
     date by each write and delete between walks;
   - `[OPEN]`: a quota per account (all the folders it owns) as well, or
     only per folder. Recommended: per folder now, per account when a
     server has members who create folders. *(Decided on 2026-10-10 as
     recommended — Status.)*
6. **No setting of the server is edited in the console** in this ADR:
   configuration stays in the environment (0075 item 6), shown read-only.
   Editing it from the console — mail, the default quota — is `[OPEN]`,
   for when an admin asks. *(Decided on 2026-10-10: read-only in the
   console, edited in the environment — Status.)* *(Revised 2026-11-04,
   Revisions: the UniVerso's own Cloudflare link is turned on and off from
   the console, per [0117](0117-this-app-is-a-universo-server.md) D14 (c);
   not built.)*
7. **Both languages, accessibility**: every page in pt-BR and English,
   tables with headers and captions, keyboard sorting and paging, and the
   console's own e2e tests in the server's suite (`e2e-server`), at
   desktop and phone widths.

## Consequences

- Settings loses its Administration section; Settings › Account gains the
  link to the console for an admin. The e2e tests that walk the
  administration move to the console.
- The admin API changes shape (pages, filters, totals); the console is its
  only client, so nothing outside the repository breaks.
- The write path of `verso-service` gains the quota check before the core
  writes: the folder's space is known to the service, which already counts
  it (0075 item 4). The desktop app's local folders have no quota.
- A new variable, `VERSO_FOLDER_QUOTA`, documented with the others in
  `docs/reference/server-install.md`.

## Discarded alternatives

- **The administration as a section of Settings** — built in 0.7.0-beta.1;
  rejected by the maintainer on 2026-10-10 (Source).
- **The administration as plain server pages outside the window's look** —
  built first on 2026-10-09 and rejected by the maintainer the same day as
  not looking like Verso; item 2 keeps the window's pieces.

## Status

**Accepted on 2026-10-10** by the maintainer, with every recommendation,
in session: *"com exceção do 6, pode seguir o recomendado, o 6 pode já implementar"*. Item 5: quotas per folder only; a quota per account
when a server has members who create folders. Item 6: the configuration
read-only in the console, edited in the environment. To be read by Fable
5.1 with the round's code *(history: read by Fable 5.1 on 2026-10-10/11, in
the sync campaign's session; its final report,
`verso-sync-campaign/relatorio-final.md`, is outside the repository)*.
