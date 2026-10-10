// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! E-mail, when the host has a mail server (`VERSO_SMTP_URL`, ADR 0074
//! items 2 to 5): a sign-in link (single use, fifteen minutes), a password
//! reset the person asks for, an invitation sent to its address, a reset
//! link the admin makes. Without one, nothing is sent and the links are
//! copied by hand, as before. The address is then proved by the link
//! that reached it.

use std::sync::Mutex;

use lettre::message::Mailbox;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

/// Where a message goes.
pub enum Mail {
    /// The host's mail server.
    /// Boxed: the transport is some 240 bytes on Linux, the test variant
    /// a few dozen (clippy's `large_enum_variant`).
    Smtp {
        transport: Box<AsyncSmtpTransport<Tokio1Executor>>,
        from: Mailbox,
    },
    /// Kept in memory, for the tests.
    Memory(Mutex<Vec<(String, String, String)>>),
}

/// The mail server of `VERSO_SMTP_URL` (`smtps://user:pass@host:465`,
/// or `smtp://user:pass@host:587?tls=required`) and the sender
/// `VERSO_MAIL_FROM` (`Verso <verso@example.org>`).
pub fn from_config(url: &str, from: &str) -> Result<Mail, String> {
    let transport = AsyncSmtpTransport::<Tokio1Executor>::from_url(url)
        .map_err(|e| format!("VERSO_SMTP_URL: {e}"))?
        .build();
    let from: Mailbox = from.parse().map_err(|e| format!("VERSO_MAIL_FROM: {e}"))?;
    Ok(Mail::Smtp {
        transport: Box::new(transport),
        from,
    })
}

impl Mail {
    /// Send `body` (plain text) to `to`; an error is said in the log, never
    /// to the person who asked (it would tell whether the address exists).
    pub async fn send(&self, to: &str, subject: &str, body: &str) {
        match self {
            Self::Memory(kept) => {
                verso_service::lock(kept).push((
                    to.to_owned(),
                    subject.to_owned(),
                    body.to_owned(),
                ));
            }
            Self::Smtp { transport, from } => {
                let message = to
                    .parse::<Mailbox>()
                    .map_err(|e| e.to_string())
                    .and_then(|to| {
                        Message::builder()
                            .from(from.clone())
                            .to(to)
                            .subject(subject)
                            .body(body.to_owned())
                            .map_err(|e| e.to_string())
                    });
                let sent = match message {
                    Ok(m) => transport
                        .send(m)
                        .await
                        .map(|_| ())
                        .map_err(|e| e.to_string()),
                    Err(e) => Err(e),
                };
                if let Err(e) = sent {
                    crate::log::warn(&format!("an e-mail was not sent: {e}"));
                }
            }
        }
    }
}

/// The words of each message, in the person's language.
pub fn words(lang: &str, what: &str, link: &str) -> (String, String) {
    let pt = lang != "en";
    match (what, pt) {
        ("signin", true) => (
            "Seu link para entrar no Verso".to_owned(),
            format!(
                "Para entrar no Verso, abra este link (vale 15 minutos, uma vez):\n\n{link}\n\nSe não foi você que pediu, ignore esta mensagem."
            ),
        ),
        ("signin", false) => (
            "Your link to sign in to Verso".to_owned(),
            format!(
                "To sign in to Verso, open this link (valid 15 minutes, once):\n\n{link}\n\nIf you did not ask for it, ignore this message."
            ),
        ),
        ("reset", true) => (
            "Senha nova no Verso".to_owned(),
            format!(
                "Para criar uma senha nova no Verso, abra este link (vale 24 horas, uma vez):\n\n{link}\n\nSe não foi você que pediu, ignore esta mensagem: a senha atual continua valendo."
            ),
        ),
        ("reset", false) => (
            "A new password for Verso".to_owned(),
            format!(
                "To set a new password for Verso, open this link (valid 24 hours, once):\n\n{link}\n\nIf you did not ask for it, ignore this message: your password stays as it is."
            ),
        ),
        (_, true) => (
            "Convite para o Verso".to_owned(),
            format!(
                "Você foi convidado para um servidor Verso. Para criar a sua conta, abra este link (vale 7 dias, uma vez):\n\n{link}"
            ),
        ),
        (_, false) => (
            "An invitation to Verso".to_owned(),
            format!(
                "You were invited to a Verso server. To create your account, open this link (valid 7 days, once):\n\n{link}"
            ),
        ),
    }
}
