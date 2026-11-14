// The release page (ADR 0051, revised 2026-10-14): what GitHub shows above
// a release's files, built by `node scripts/release.mjs notes <version>`
// and published by the release workflow's `publish` job.
//
// The maintainer, on 2026-10-14: the page was the raw changelog above 28
// files, with nothing saying which one to download. It now opens with a
// guide for someone who is not technical — what Verso is, which file is
// theirs, how to install it, that the checksums list and the `.sig` files
// can be ignored — in
// English, then in pt-BR (English is the source, ADR 0008), and each
// language ends with a short "what's new" and the full changelog folded.
// Each "what's new" is marked (`<!-- verso:news:en -->` …
// `<!-- verso:news:end -->`, and `pt-BR`) for the app's update panel.
//
// The files the guide names come from `releaseFiles`, the one list of what
// .github/workflows/release.yml builds and uploads; scripts/release-page.test.mjs
// reads the workflow and fails when the two disagree.
//
// Pure: no IO. Dependency-free; Node 18 or later.

export const REPO = "SergioSJS/verso";
const GITHUB = `https://github.com/${REPO}`;
const IMAGE = "ghcr.io/sergiosjs/universo";
const INSTALLER = "https://versomd.com/universo.sh";

/** GitHub refuses a release body over 125 000 characters; past this the
 *  full changelogs are linked instead of folded into the page. */
export const PAGE_LIMIT = 120_000;

export const isBeta = (v) => /-beta\.\d+$/.test(v);

/** The signatures of a release (ADR 0055, revised 2026-10-14, the
 *  maintainer: "Sim, já na 0.8.3"). A release carries one signed list,
 *  `verso-<version>-SHA256SUMS` and its `.sig`, the sha256 of each of its
 *  files signed once with the release key, in place of a `.sig` beside
 *  every file. 0.8.3 is the bridge: it publishes both, so the apps up to
 *  0.8.2, which read only a file's own `.sig`, still update to it, and from
 *  0.8.3 on the app reads the list. **The version cut after the bridge sets
 *  this to `false`** — that line is the whole switch: the release
 *  workflow's per-file signing steps (`release.mjs per-file-signatures`),
 *  the publish job's list of files (`release.mjs assets`) and this page
 *  follow it. An app older than the bridge that skipped it then updates by
 *  hand, once. */
export const PER_FILE_SIGNATURES = true;

/** The signed checksums list of release `v`, as the release workflow's
 *  `checksums` job names it; its signature is `<list>.sig`. */
export const checksumsList = (v) => `verso-${v}-SHA256SUMS`;

/** The files of release `v`, by what each is for, named exactly as the
 *  release workflow names them (`slug` is "Verso-Beta" for a test
 *  release). The checksums list holds each one's sha256. */
export function releaseFiles(v) {
  const app = isBeta(v) ? "Verso-Beta" : "Verso";
  return {
    mac: `${app}-${v}-macos-arm64.zip`,
    windows: `${app}-${v}-windows-x64-setup.exe`,
    deb: `${app}-${v}-linux-amd64.deb`,
    rpm: `${app}-${v}-linux-x86_64.rpm`,
    appImage: `${app}-${v}-linux-x86_64.AppImage`,
    android: `${app}-${v}-android-arm64.apk`,
    // The iPad and iPhone app (ADR 0119): unsigned, for AltStore Classic to
    // sign with the person's own Apple ID.
    ios: `${app}-${v}-ios.ipa`,
    cliMac: `verso-cli-${v}-macos-arm64.tar.gz`,
    cliWindows: `verso-cli-${v}-windows-x64.zip`,
    cliLinux: `verso-cli-${v}-linux-x86_64.tar.gz`,
    serverDebX64: `universo-${v}-amd64.deb`,
    serverDebArm: `universo-${v}-arm64.deb`,
    serverRpmX64: `universo-${v}-x86_64.rpm`,
    serverRpmArm: `universo-${v}-aarch64.rpm`,
    serverTarX64: `universo-${v}-x86_64.tar.gz`,
    serverTarArm: `universo-${v}-aarch64.tar.gz`,
  };
}

/** Every file the release publishes: each of `releaseFiles`, the signed
 *  checksums list and its `.sig`, and, while `perFile` (the bridge), each
 *  file's own `.sig`. */
export function releaseAssets(v, perFile = PER_FILE_SIGNATURES) {
  const files = Object.values(releaseFiles(v));
  const list = checksumsList(v);
  return [...files, ...(perFile ? files.map((f) => `${f}.sig`) : []), list, `${list}.sig`];
}

/** A changelog's relative links made absolute, at the release's tag: the
 *  release page is not in the repository, where they resolved. `dir` is
 *  the changelog's folder in the repository ("" or "docs/pt-BR/"). */
export function absoluteLinks(text, tag, dir) {
  const base = `${GITHUB}/blob/${tag}/${dir}`;
  return text.replace(/\]\(([^)\s]+)\)/g, (whole, target) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return whole;
    return `](${new URL(target, base).href})`;
  });
}

/** An item's lead: its bold first words, or else its first sentence;
 *  links kept as their text. */
function lead(item) {
  const bold = /^\*\*(.+?)\*\*/.exec(item);
  const text = bold ? bold[1] : (/^(.+?[.:])(\s|$)/.exec(item)?.[1] ?? item);
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[.:]$/, "").trim();
}

/** "What's new": a changelog's sections (Added, Changed, Fixed — merged
 *  across the test releases a production version carries) with each
 *  item's lead, at most `limit` items in all, taken in turn from each
 *  section; and how many were left out. */
export function highlights(body, limit = 12) {
  const groups = [];
  let current = null;
  for (const line of body.split("\n")) {
    const heading = /^#{3,4} (.+)$/.exec(line);
    if (heading) {
      const name = heading[1].trim();
      // A test release's own heading (`### 0.8.1-beta.1 — date`) is not a section.
      if (/^\d+\.\d+\.\d+/.test(name)) {
        current = null;
        continue;
      }
      current = groups.find((g) => g.name === name);
      if (!current) groups.push((current = { name, items: [], shown: 0 }));
    } else if (current && line.startsWith("- ")) {
      current.items.push(lead(line.slice(2)));
    }
  }
  let budget = limit;
  while (budget > 0 && groups.some((g) => g.shown < g.items.length)) {
    for (const g of groups) {
      if (budget > 0 && g.shown < g.items.length) {
        g.shown++;
        budget--;
      }
    }
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const shown = groups.reduce((n, g) => n + g.shown, 0);
  return { groups: groups.filter((g) => g.shown > 0).map((g) => ({ name: g.name, items: g.items.slice(0, g.shown) })), more: total - shown };
}

const WORDS = {
  en: {
    about: "is a notes app for plain Markdown files, for Mac, Windows, Linux, Android, iPad and iPhone: you point it at a folder of notes, and an Obsidian vault opens as it is.",
    beta: (name) => `**This is a test version (beta).** It installs as "${name}", beside any other Verso, and may still have bugs.`,
    production: (v) => `This is version ${v}.`,
    which: "Which file do I download?",
    oneFile: "You need **one** file, the one for your computer:",
    yourComputer: "Your computer",
    download: "Download this",
    macRow: "**Mac** with an Apple chip (M1, M2, M3, M4…)",
    windowsRow: "**Windows** 10 or 11",
    debRow: "**Linux**: Ubuntu (22.04 or later), Linux Mint, Debian (12 or later), Pop!_OS",
    rpmRow: "**Linux**: Fedora (36 or later)",
    appImageRow: "**Linux**: any other (Arch, openSUSE, …)",
    androidRow: "**Android** phone or tablet, Android 10 or newer",
    iosRow: "**iPad** or **iPhone**, iOS 16 or newer, through AltStore",
    whichMac: '**Which Mac do I have?** Open the Apple menu (the apple at the top left of the screen) › **About This Mac**. "Chip: Apple M1" (or M2, M3…) is an Apple chip: the file above is yours. "Processor: … Intel" is a Mac with an Intel processor, which Verso does not run on.',
    notAvailable: "**Not available:** Macs with an Intel processor, and Windows on ARM. Linux on ARM computers (a Raspberry Pi, for example) comes later.",
    cliTitle: "The command line: almost nobody needs it",
    cliText: "The app already brings the `verso` command (on a Mac: Settings › Terminal and agents › Install). These files are only for a computer **without** the app, such as a machine where an AI agent searches your notes.",
    computer: "Computer",
    cliMac: "Mac (Apple chip)",
    cliWindows: "Windows",
    cliLinux: "Linux (x64)",
    serverTitle: "UniVerso, the server: to host your notes yourself",
    serverText: "UniVerso keeps your notes on a machine of yours, at home or in the cloud, and opens them in a browser on a computer, a phone or a tablet; it also shares folders between people and syncs them with the app. **To use Verso on your own computer you do not need it.**",
    serverEasy: "The easy way is its installer. On the server (Linux, as your ordinary user), run:",
    serverEasyAfter: (guide) => `It picks the right file for the machine, checks its signature, installs and starts UniVerso, and says what comes next. Step by step, also with Docker or beside another app: **[UniVerso, hands on](${guide})**.`,
    serverByHand: "By hand, the file depends on the server's processor. Run `uname -m` on it: `x86_64` is **x64** (most cloud servers and PCs); `aarch64` is **ARM64** (Oracle Cloud's free Ampere servers, a Raspberry Pi 4 or 5 with a 64-bit system).",
    serverSystem: "Server's system",
    serverDeb: "Ubuntu, Debian",
    serverRpm: "Fedora, RHEL, Oracle Linux",
    serverTar: "any other Linux (an archive)",
    docker: (image) => `With Docker: the image \`${image}\`, for x64 and ARM64.`,
    installTitle: "How to install",
    mac: "Mac",
    macSteps: (name) => [
      `Open the \`.zip\` you downloaded (Safari may have opened it already): it becomes **${name}**.`,
      `Drag **${name}** into the **Applications** folder, and open it from there.`,
      `The first time, macOS says it could not verify the app: Verso is signed ad hoc, not by a registered Apple developer. Close the message, open **System Settings › Privacy & Security**, scroll down, click **Open Anyway** beside "${name}" and confirm. On macOS 14 or earlier, right-click the app › **Open** does the same. This happens only once.`,
    ],
    windows: "Windows",
    windowsSteps: [
      "Open the `-setup.exe` you downloaded.",
      'If Windows says **"Windows protected your PC"**, click **More info**, then **Run anyway**: Verso is not yet signed with a code-signing certificate.',
      "The installer installs Verso for your user, without asking for an administrator.",
    ],
    linux: "Linux",
    linuxSteps: (f) => [
      `\`.deb\`: in a terminal, in the folder you downloaded it to, \`sudo apt install ./${f.deb}\``,
      `\`.rpm\`: in a terminal, in the folder you downloaded it to, \`sudo dnf install ./${f.rpm}\``,
      `\`.AppImage\`: right-click it › **Properties** › **Permissions**, allow it to run as a program (or \`chmod +x ${f.appImage}\` in a terminal), then double-click it.`,
    ],
    android: "Android",
    androidSteps: (f) => [
      `On the phone, open this page and tap \`${f.android}\`; the browser downloads it.`,
      "Open the downloaded file. The first time, Android asks to allow installs from the browser (**Settings › Install unknown apps**): allow it, go back, and tap **Install**.",
      "Afterwards Verso finds its own updates: **Settings › General › Check for updates**.",
    ],
    ios: "iPad and iPhone",
    iosSteps: (f) => [
      "Install **AltStore Classic** (altstore.io) with AltServer on your computer: it signs apps with your own Apple ID, free, for 7 days at a time, and renews them.",
      `On the iPad or iPhone, download \`${f.ios}\` from this page, open it with AltStore and tap **Install**. The notes live in the app's folder, which the **Files** app shows under *On My iPad › Verso*.`,
      "Through AltStore PAL (no computer needed) Verso comes later, in Brazil only for now. The internet link and the terminal are not in the iOS app.",
    ],
    serverInstall: "**UniVerso**: the installer above does everything; by hand, follow the guide linked there.",
    sig: (list, perFile) =>
      `**You can ignore \`${list}\` and the \`.sig\` ${perFile ? "files" : "file"}.** The list holds every file's checksum, signed with Verso's key: with it the app's updater and UniVerso's installer check that each file is genuine.`,
    news: (v) => `What's new in ${v}`,
    more: (n) => `…and ${n} more changes, in the full list below.`,
    full: (v) => `Every change in ${v}`,
    fullLinked: (url) => `Every change in this version: [CHANGELOG.md](${url}).`,
  },
  pt: {
    about: "é um app de notas em arquivos Markdown comuns, para Mac, Windows, Linux, Android, iPad e iPhone: você aponta uma pasta de notas, e um cofre do Obsidian abre como está.",
    beta: (name) => `**Esta é uma versão de teste (beta).** Ela instala como "${name}", ao lado de qualquer outro Verso, e ainda pode ter erros.`,
    production: (v) => `Esta é a versão ${v}.`,
    which: "Qual arquivo baixar?",
    oneFile: "Você precisa de **um** arquivo, o do seu computador:",
    yourComputer: "Seu computador",
    download: "Baixe este",
    macRow: "**Mac** com chip Apple (M1, M2, M3, M4…)",
    windowsRow: "**Windows** 10 ou 11",
    debRow: "**Linux**: Ubuntu (22.04 ou mais novo), Linux Mint, Debian (12 ou mais novo), Pop!_OS",
    rpmRow: "**Linux**: Fedora (36 ou mais novo)",
    appImageRow: "**Linux**: qualquer outro (Arch, openSUSE, …)",
    androidRow: "**Android**, celular ou tablet, Android 10 ou mais novo",
    iosRow: "**iPad** ou **iPhone**, iOS 16 ou mais novo, pela AltStore",
    whichMac: '**Qual é o meu Mac?** Abra o menu Apple (a maçã no canto de cima, à esquerda) › **Sobre Este Mac**. "Chip: Apple M1" (ou M2, M3…) é chip Apple: o arquivo acima é o seu. "Processador: … Intel" é um Mac com processador Intel, em que o Verso não roda.',
    notAvailable: "**Não disponível:** Macs com processador Intel e Windows em ARM. O Linux em computadores ARM (um Raspberry Pi, por exemplo) vem depois.",
    cliTitle: "A linha de comando: quase ninguém precisa",
    cliText: "O app já traz o comando `verso` (no Mac: Ajustes › Terminal e agentes › Instalar). Estes arquivos são só para um computador **sem** o app, como uma máquina em que um agente de IA busca nas suas notas.",
    computer: "Computador",
    cliMac: "Mac (chip Apple)",
    cliWindows: "Windows",
    cliLinux: "Linux (x64)",
    serverTitle: "UniVerso, o servidor: para hospedar suas notas você mesmo",
    serverText: "O UniVerso guarda suas notas numa máquina sua, em casa ou na nuvem, e as abre no navegador de um computador, de um celular ou de um tablet; ele também compartilha pastas entre pessoas e as sincroniza com o app. **Para usar o Verso no seu computador você não precisa dele.**",
    serverEasy: "O jeito fácil é o instalador dele. No servidor (Linux, com o seu usuário de sempre), rode:",
    serverEasyAfter: (guide) => `Ele escolhe o arquivo certo para a máquina, confere a assinatura, instala e inicia o UniVerso, e diz o que vem depois. Passo a passo, também com Docker ou ao lado de outro app: **[UniVerso, mão na massa](${guide})**.`,
    serverByHand: "À mão, o arquivo depende do processador do servidor. Rode `uname -m` nele: `x86_64` é **x64** (a maioria dos servidores na nuvem e dos PCs); `aarch64` é **ARM64** (os servidores Ampere gratuitos da Oracle Cloud, um Raspberry Pi 4 ou 5 com sistema de 64 bits).",
    serverSystem: "Sistema do servidor",
    serverDeb: "Ubuntu, Debian",
    serverRpm: "Fedora, RHEL, Oracle Linux",
    serverTar: "qualquer outro Linux (um arquivo compactado)",
    docker: (image) => `Com Docker: a imagem \`${image}\`, para x64 e ARM64.`,
    installTitle: "Como instalar",
    mac: "Mac",
    macSteps: (name) => [
      `Abra o \`.zip\` que você baixou (o Safari pode já tê-lo aberto): ele vira o **${name}**.`,
      `Arraste o **${name}** para a pasta **Aplicativos** e abra-o de lá.`,
      `Na primeira vez, o macOS diz que não pôde verificar o app: o Verso é assinado ad hoc, não por um desenvolvedor registrado na Apple. Feche a mensagem, abra **Ajustes do Sistema › Privacidade e Segurança**, role até o fim, clique em **Abrir Mesmo Assim** ao lado de "${name}" e confirme. No macOS 14 ou anterior, clicar no app com o botão direito › **Abrir** faz o mesmo. Isso acontece uma vez só.`,
    ],
    windows: "Windows",
    windowsSteps: [
      "Abra o `-setup.exe` que você baixou.",
      'Se o Windows disser **"O Windows protegeu o computador"**, clique em **Mais informações** e depois em **Executar assim mesmo**: o Verso ainda não é assinado com um certificado de código.',
      "O instalador instala o Verso para o seu usuário, sem pedir administrador.",
    ],
    linux: "Linux",
    linuxSteps: (f) => [
      `\`.deb\`: num terminal, na pasta em que você o baixou, \`sudo apt install ./${f.deb}\``,
      `\`.rpm\`: num terminal, na pasta em que você o baixou, \`sudo dnf install ./${f.rpm}\``,
      `\`.AppImage\`: clique nele com o botão direito › **Propriedades** › **Permissões**, permita executá-lo como programa (ou \`chmod +x ${f.appImage}\` num terminal) e dê dois cliques nele.`,
    ],
    android: "Android",
    androidSteps: (f) => [
      `No celular, abra esta página e toque em \`${f.android}\`; o navegador o baixa.`,
      "Abra o arquivo baixado. Na primeira vez, o Android pede para permitir instalar apps pelo navegador (**Configurações › Instalar apps desconhecidos**): permita, volte e toque em **Instalar**.",
      "Depois o Verso acha as próprias atualizações: **Ajustes › Geral › Verificar atualizações**.",
    ],
    ios: "iPad e iPhone",
    iosSteps: (f) => [
      "Instale a **AltStore Classic** (altstore.io) com o AltServer no seu computador: ela assina os apps com o seu próprio Apple ID, de graça, por 7 dias de cada vez, e os renova.",
      `No iPad ou no iPhone, baixe \`${f.ios}\` desta página, abra com a AltStore e toque em **Instalar**. As notas ficam na pasta do app, que o app **Arquivos** mostra em *No meu iPad › Verso*.`,
      "Pela AltStore PAL (sem computador) o Verso vem depois, por enquanto só no Brasil. O link pela internet e o terminal não estão no app do iOS.",
    ],
    serverInstall: "**UniVerso**: o instalador acima faz tudo; à mão, siga o guia indicado lá.",
    sig: (list, perFile) =>
      `**Pode ignorar o \`${list}\` e ${perFile ? "os arquivos" : "o arquivo"} \`.sig\`.** A lista traz o checksum de cada arquivo, assinada com a chave do Verso: com ela o atualizador do app e o instalador do UniVerso conferem que cada arquivo é o verdadeiro.`,
    news: (v) => `Novidades da ${v}`,
    more: (n) => `…e mais ${n} mudanças, na lista completa abaixo.`,
    full: (v) => `Todas as mudanças da ${v}`,
    fullLinked: (url) => `Todas as mudanças desta versão: [CHANGELOG.md](${url}).`,
  },
};

const row = (...cells) => `| ${cells.join(" | ")} |`;

/** One language's part of the page: the guide, then what is new, then the
 *  changelog folded (or linked, when `linkOnly`). */
function guide(lang, { version, changelog, linkOnly, perFile }) {
  const w = WORDS[lang];
  const tag = `v${version}`;
  const name = isBeta(version) ? "Verso Beta" : "Verso";
  const f = releaseFiles(version);
  const link = (file) => `[${file}](${GITHUB}/releases/download/${tag}/${file})`;
  const handsOn = `${GITHUB}/blob/main/docs/reference/server-hands-on.md`;
  const news = highlights(changelog);
  const out = [
    // An explicit anchor for the header's link: GitHub's Markdown API
    // renders this heading with no id (`gh api markdown`, 2026-10-14),
    // and keeps the anchor as `user-content-qual-arquivo-baixar`, which a
    // `#qual-arquivo-baixar` link reaches as in a README.
    ...(lang === "pt" ? ['<a id="qual-arquivo-baixar"></a>', ""] : []),
    `## ${w.which}`,
    "",
    w.oneFile,
    "",
    row(w.yourComputer, w.download),
    row("---", "---"),
    row(w.macRow, link(f.mac)),
    row(w.windowsRow, link(f.windows)),
    row(w.debRow, link(f.deb)),
    row(w.rpmRow, link(f.rpm)),
    row(w.appImageRow, link(f.appImage)),
    row(w.androidRow, link(f.android)),
    row(w.iosRow, link(f.ios)),
    "",
    w.whichMac,
    "",
    w.notAvailable,
    "",
    `### ${w.cliTitle}`,
    "",
    w.cliText,
    "",
    row(w.computer, w.download),
    row("---", "---"),
    row(w.cliMac, link(f.cliMac)),
    row(w.cliWindows, link(f.cliWindows)),
    row(w.cliLinux, link(f.cliLinux)),
    "",
    `### ${w.serverTitle}`,
    "",
    w.serverText,
    "",
    w.serverEasy,
    "",
    "```sh",
    `curl -fsSLO ${INSTALLER}`,
    `sh universo.sh install --version ${version}`,
    "```",
    "",
    w.serverEasyAfter(handsOn),
    "",
    w.serverByHand,
    "",
    row(w.serverSystem, "x64 (`x86_64`)", "ARM64 (`aarch64`)"),
    row("---", "---", "---"),
    row(w.serverDeb, link(f.serverDebX64), link(f.serverDebArm)),
    row(w.serverRpm, link(f.serverRpmX64), link(f.serverRpmArm)),
    row(w.serverTar, link(f.serverTarX64), link(f.serverTarArm)),
    "",
    w.docker(`${IMAGE}:${version}`),
    "",
    `## ${w.installTitle}`,
    "",
    `**${w.mac}**`,
    "",
    ...w.macSteps(name).map((s, i) => `${i + 1}. ${s}`),
    "",
    `**${w.windows}**`,
    "",
    ...w.windowsSteps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `**${w.linux}**`,
    "",
    ...w.linuxSteps(f).map((s) => `- ${s}`),
    "",
    `**${w.android}**`,
    "",
    ...w.androidSteps(f).map((s, i) => `${i + 1}. ${s}`),
    "",
    `**${w.ios}**`,
    "",
    ...w.iosSteps(f).map((s, i) => `${i + 1}. ${s}`),
    "",
    w.serverInstall,
    "",
    w.sig(checksumsList(version), perFile),
    "",
    `## ${w.news(version)}`,
    "",
  ];
  // The app's update panel shows this part alone, in the window's
  // language (app/ui/src/updateNews.ts): it is marked, and what follows
  // it ("…and N more", the folded changelog) is outside the mark.
  out.push(`<!-- verso:news:${lang === "en" ? "en" : "pt-BR"} -->`, "");
  for (const g of news.groups) out.push(`### ${g.name}`, "", ...g.items.map((item) => `- ${item}`), "");
  out.push("<!-- verso:news:end -->", "");
  if (news.more > 0) out.push(`*${w.more(news.more)}*`, "");
  const changelogFile = lang === "en" ? "CHANGELOG.md" : "docs/pt-BR/CHANGELOG.md";
  if (linkOnly) {
    out.push(w.fullLinked(`${GITHUB}/blob/${tag}/${changelogFile}`), "");
  } else {
    out.push("<details>", `<summary><b>${w.full(version)}</b></summary>`, "", absoluteLinks(changelog, tag, lang === "en" ? "" : "docs/pt-BR/"), "", "</details>", "");
  }
  return out.join("\n");
}

/** The release page of `version`, from its changelog in English (`en`)
 *  and in pt-BR (`pt`), each the body under the version's heading;
 *  `perFileSignatures` as the release publishes them. */
export function releasePage({ version, en, pt, perFileSignatures = PER_FILE_SIGNATURES }) {
  const name = isBeta(version) ? "Verso Beta" : "Verso";
  const header = (lang) => {
    const w = WORDS[lang];
    return `**Verso** ${w.about} ${isBeta(version) ? w.beta(name) : w.production(version)}`;
  };
  const build = (linkOnly) =>
    [
      header("en"),
      "",
      `${header("pt")} **[Em português: qual arquivo baixar ↓](#qual-arquivo-baixar)**`,
      "",
      guide("en", { version, changelog: en, linkOnly, perFile: perFileSignatures }),
      "---",
      "",
      guide("pt", { version, changelog: pt, linkOnly, perFile: perFileSignatures }),
    ].join("\n").trimEnd() + "\n";
  const page = build(false);
  return page.length <= PAGE_LIMIT ? page : build(true);
}
