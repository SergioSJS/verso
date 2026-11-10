package com.versomd.app

import android.content.Context
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // The system's certificate check for every TLS connection of the app
    // (rustls-platform-verifier needs the context once; src/android.rs).
    initTls(applicationContext)
  }

  // Back closes what is on top in the page — a menu, a dialog, a sheet, a
  // drawer — and leaves the app only when nothing is open
  // (app/ui/src/screen/back.ts answers `true` when it closed something).
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        webView.evaluateJavascript("(window.versoBack ? window.versoBack() : false) === true") { closed ->
          if (closed != "true") {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      }
    })
  }

  private external fun initTls(context: Context)

  companion object {
    init {
      System.loadLibrary("verso_app")
    }
  }
}
