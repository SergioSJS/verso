package com.versomd.app

import android.content.Context
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // The system's certificate check for every TLS connection of the app
    // (rustls-platform-verifier needs the context once; src/android.rs).
    initTls(applicationContext)
  }

  private external fun initTls(context: Context)

  companion object {
    init {
      System.loadLibrary("verso_app")
    }
  }
}
