// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The synthetic vault, generator version 1 (bench-decision §2.5): ~4 KB
//! per note in six paragraphs of accented pt-BR, YAML frontmatter with
//! `tags` and `aliases` on every note, one `#` heading and one `^id`
//! block per note, three wikilinks that resolve and one target that does
//! not, a flat fan-out of 37 folders, and one note in a hundred present
//! only as an iCloud placeholder (`.Name.md.icloud`, ADR 0043) so the
//! path ADR 0043 exists for is measured rather than assumed.
//!
//! Deterministic: the same seed gives the same bytes on any platform,
//! because the generator is ten lines of arithmetic with no dependency
//! (SplitMix64). Versioned: [`GENERATOR_VERSION`] is bumped by hand when
//! the shape changes, and a baseline is compared only with a run of the
//! same version (§2.3) — a change of shape must never read as a change
//! of speed.

use std::path::{Path, PathBuf};

/// Bump by hand whenever anything below changes the bytes written.
pub const GENERATOR_VERSION: u32 = 1;
/// The seed of the ladder's baselines, unless a run says otherwise.
pub const DEFAULT_SEED: u64 = 20_260_922;
/// The flat fan-out.
pub const FOLDERS: usize = 37;
const PARAGRAPHS: usize = 6;
const SENTENCES_PER_PARAGRAPH: usize = 9;
const LINKS_PER_NOTE: usize = 3;
/// Occurs in every note: the common word of `search`.
pub const COMMON_WORD: &str = "sessão";
/// Planted in exactly one note: the rare word of `search`.
pub const RARE_WORD: &str = "Zumbrídio";

/// What an iCloud placeholder holds; verso-fs looks at the name, not this.
const PLACEHOLDER: &str =
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<plist version=\"1.0\"><dict/></plist>\n";

/// Twelve sentences of the kind a campaign note holds, accents included,
/// so the tokenizer and the folding do the work they do on real notes.
const CORPUS: [&str; 12] = [
    "A sessão começou com a chegada da caravana ao vilarejo de São Brás, sob chuva fina.",
    "O ferreiro Joaquim não confiava em forasteiros, mas aceitou a moeda de prata sem reclamar.",
    "Na taverna, a canção falava de um dragão que dormia sob a montanha há três séculos.",
    "A maga consultou o grimório e encontrou a runa que faltava para abrir a passagem.",
    "Ninguém viu quando o ladrão trocou a chave verdadeira por uma cópia de latão.",
    "O capitão da guarda exigiu explicações e recebeu apenas silêncio e um mapa rasgado.",
    "Dizem que a floresta ao norte muda de lugar quando a lua está cheia e o vento vira.",
    "O anão contou as provisões duas vezes e concluiu que faltava pão para o terceiro dia.",
    "Uma carta selada com cera vermelha chegou de madrugada, endereçada à baronesa.",
    "O ritual exigia água de nascente, sal grosso e a paciência de quem espera o amanhecer.",
    "Ao fundo da cripta, a estátua tinha os olhos voltados para uma porta que não existia.",
    "A negociação terminou com um aperto de mãos e a promessa de esquecer a dívida antiga.",
];

/// SplitMix64: enough randomness for a shape, no dependency, the same
/// sequence everywhere.
pub struct Rng(u64);

impl Rng {
    #[must_use]
    pub fn new(seed: u64) -> Self {
        Self(seed)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A value below `n` (the bias of the modulo is far below what a
    /// shape can notice).
    pub fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next_u64() % (n as u64)).unwrap_or(0)
    }
}

/// What to generate.
pub struct Shape {
    pub notes: usize,
    pub seed: u64,
}

/// What the generator knows once it has written, and the benchmark asks.
#[derive(Debug)]
pub struct Vault {
    pub root: PathBuf,
    /// Notes with content; the placeholders are on top of these.
    pub notes: usize,
    pub placeholders: usize,
    /// The note with most links to it, relative path with `.md` (ties:
    /// the first by number). The worst case of `backlinks`.
    pub most_linked: String,
    /// The one note in a hundred the "changed" step rewrites.
    pub to_change: Vec<PathBuf>,
}

fn folder_of(i: usize) -> String {
    format!("pasta-{:02}", i % FOLDERS)
}

fn name_of(i: usize) -> String {
    format!("Sessão {i:05}")
}

fn note_text(i: usize, targets: &[usize; LINKS_PER_NOTE], rng: &mut Rng, rare: bool) -> String {
    let mut s = String::with_capacity(4400);
    s.push_str(&format!(
        "---\ntags: [campanha, {COMMON_WORD}, {}]\naliases: [s{i:05}]\n---\n# {}\n\n",
        folder_of(i),
        name_of(i)
    ));
    for p in 0..PARAGRAPHS {
        for _ in 0..SENTENCES_PER_PARAGRAPH {
            s.push_str(CORPUS[rng.below(CORPUS.len())]);
            s.push(' ');
        }
        if p == 1 {
            s.push_str(&format!(
                "Ver [[{}]], [[{}]] e [[{}]]; falta [[Inexistente {:05}]].",
                name_of(targets[0]),
                name_of(targets[1]),
                name_of(targets[2]),
                rng.below(100_000)
            ));
        }
        if p == 2 && rare {
            s.push_str(&format!(" Aqui mora o {RARE_WORD}."));
        }
        if p + 1 == PARAGRAPHS {
            // A block id at the end of the line of a paragraph (spec §5.7).
            s.push_str(&format!("^s{i:05}"));
        }
        s.push_str("\n\n");
    }
    s
}

/// Write the vault of `shape` under `root` (created if needed).
pub fn generate(root: &Path, shape: &Shape) -> std::io::Result<Vault> {
    let n = shape.notes;
    let mut rng = Rng::new(shape.seed);
    for f in 0..FOLDERS.min(n.max(1)) {
        std::fs::create_dir_all(root.join(format!("pasta-{f:02}")))?;
    }
    let mut inbound = vec![0u32; n];
    let mut to_change = Vec::new();
    let mut placeholders = 0;
    let rare_at = n / 2;
    for i in 0..n {
        let dir = root.join(folder_of(i));
        if i % 100 == 99 {
            std::fs::write(dir.join(format!(".{}.md.icloud", name_of(i))), PLACEHOLDER)?;
            placeholders += 1;
            continue;
        }
        let mut targets = [0usize; LINKS_PER_NOTE];
        for t in &mut targets {
            *t = rng.below(n);
            inbound[*t] += 1;
        }
        let path = dir.join(format!("{}.md", name_of(i)));
        std::fs::write(&path, note_text(i, &targets, &mut rng, i == rare_at))?;
        if i % 100 == 50 {
            to_change.push(path);
        }
    }
    let most = (0..n)
        .max_by_key(|&i| (inbound[i], std::cmp::Reverse(i)))
        .unwrap_or(0);
    Ok(Vault {
        root: root.to_path_buf(),
        notes: n - placeholders,
        placeholders,
        most_linked: format!("{}/{}.md", folder_of(most), name_of(most)),
        to_change,
    })
}

/// The everyday edit: one note in a hundred gains a paragraph. Returns
/// how many were rewritten.
pub fn change(vault: &Vault) -> std::io::Result<usize> {
    for path in &vault.to_change {
        let mut text = std::fs::read_to_string(path)?;
        text.push_str("Adendo: a sessão continuou madrugada adentro, e ninguém anotou o resto.\n");
        std::fs::write(path, text)?;
    }
    Ok(vault.to_change.len())
}
