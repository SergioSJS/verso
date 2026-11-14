package io.crates.keyring

import android.content.Context

// android-native-keyring-store's handle on the app's context (src/android.rs
// `keep_secrets`): its JNI function lives in the app's own library.
class Keyring {
  companion object {
    init {
      System.loadLibrary("verso_app")
    }

    external fun initializeNdkContext(context: Context)
  }
}
