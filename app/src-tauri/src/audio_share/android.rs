// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The phone's source (ADR 0118 item 5, in v1 since 2026-11-12; ADR 0116
//! section B): the sound the phone's other apps play, through Android's
//! `AudioPlaybackCapture` (Android 10+), held by the app's Kotlin side
//! (gen/android …/Capture.kt) after the person allows Android's
//! screen-capture prompt. The samples come back through `Capture.pcm`, a
//! JNI function named with `jni_mangle` (no `unsafe`), already in the
//! shape every source gives: interleaved stereo `f32` at 48 kHz.

use std::sync::Mutex;

use verso_contract::{AudioSource, AudioSourceKind};

use super::source::{PcmSink, Running, Source};
use crate::log;

/// The one source a phone lists.
pub(crate) const ID: &str = "phone";

/// The person did not allow Android's screen-capture prompt.
pub(crate) const NOT_ALLOWED: &str = "the screen capture was not allowed";

/// The microphone's permission, which Android asks of the capture, is off.
pub(crate) const NO_MIC: &str = "Verso is not allowed to record audio";

/// Where the samples go while a share runs; none otherwise.
static SINK: Mutex<Option<PcmSink>> = Mutex::new(None);

/// The notification Android shows while the capture runs, in the window's
/// language.
pub(crate) struct PhoneApps {
    pub(crate) en: bool,
}

/// What a phone can capture.
pub(crate) fn list() -> Vec<AudioSource> {
    vec![PhoneApps { en: true }.describe()]
}

/// The source `id` names, in the window's language `lang`.
pub(crate) fn open(id: &str, lang: &str) -> Option<Box<dyn Source>> {
    (id == ID).then(|| Box::new(PhoneApps { en: lang == "en" }) as Box<dyn Source>)
}

impl Source for PhoneApps {
    fn describe(&self) -> AudioSource {
        AudioSource {
            id: ID.to_owned(),
            name: "Sound of the phone's apps".to_owned(),
            kind: AudioSourceKind::System,
        }
    }

    fn start(self: Box<Self>, sink: PcmSink) -> Result<Running, String> {
        #[derive(serde::Serialize)]
        struct Words {
            title: &'static str,
            text: &'static str,
        }
        let words = if self.en {
            Words {
                title: "Verso shares the phone's sound",
                text: "What the other apps play goes to the table. Stop it in the table's share.",
            }
        } else {
            Words {
                title: "O Verso compartilha o som do celular",
                text: "O que os outros apps tocam vai para a mesa. Pare no compartilhar da mesa.",
            }
        };
        *verso_service::lock(&SINK) = Some(sink);
        if let Err(why) = crate::phone::call::<serde_json::Value>("captureStart", words) {
            *verso_service::lock(&SINK) = None;
            return Err(why);
        }
        Ok(Running::new(|| {
            *verso_service::lock(&SINK) = None;
            if let Err(e) = crate::phone::call::<serde_json::Value>("captureStop", ()) {
                log::write(
                    "WARN",
                    "audio",
                    &format!("Android: the capture's stop: {e}"),
                );
            }
        }))
    }
}

/// `Capture.pcm(block, length)`: `length` samples of the capture.
#[jni::jni_mangle("com.versomd.app.Capture")]
pub fn pcm<'local>(
    mut env: jni::EnvUnowned<'local>,
    _class: jni::objects::JClass<'local>,
    block: jni::objects::JFloatArray<'local>,
    length: jni::sys::jint,
) {
    let n = usize::try_from(length).unwrap_or(0);
    let read = env
        .with_env(|env| -> Result<Vec<f32>, jni::errors::Error> {
            let mut samples = vec![0.0_f32; n];
            block.get_region(env, 0, &mut samples)?;
            Ok(samples)
        })
        .into_outcome();
    if let jni::Outcome::Ok(samples) = read
        && let Some(sink) = verso_service::lock(&SINK).as_mut()
    {
        sink(&samples);
    }
}

/// `Capture.ended(why)`: Android stopped the capture, or it could not
/// begin after the prompt.
#[jni::jni_mangle("com.versomd.app.Capture")]
pub fn ended<'local>(
    mut env: jni::EnvUnowned<'local>,
    _class: jni::objects::JClass<'local>,
    why: jni::objects::JString<'local>,
) {
    let said = env
        .with_env(|env| -> Result<String, jni::errors::Error> { why.try_to_string(env) })
        .into_outcome();
    let why = match said {
        jni::Outcome::Ok(s) => s,
        _ => "unknown".to_owned(),
    };
    log::write(
        "WARN",
        "audio",
        &format!("Android: the capture ended: {why}"),
    );
}
