package com.versomd.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import io.crates.keyring.Keyring

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // The secrets' store needs the app's context before the core starts.
    Keyring.initializeNdkContext(applicationContext)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // The system's certificate check for every TLS connection of the app
    // (rustls-platform-verifier needs the context once; src/android.rs).
    initTls(applicationContext)
    // Wi-Fi and charging, for background sync (src/background.rs).
    Conditions.watch(applicationContext)
    // Started by a share or an "Open with" (ADR 0118 item 5): kept until
    // the window, once up, takes it.
    if (Shared.receive(this, intent) { tellPage() }) intent = Intent()
  }

  // A share or an "Open with" while Verso runs (one activity: singleTask).
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    Shared.receive(this, intent) { tellPage() }
  }

  private var page: WebView? = null

  // On screen or not: background sync's conditions count only when not.
  override fun onStart() {
    super.onStart()
    Conditions.shown(true)
  }

  override fun onStop() {
    Conditions.shown(false)
    super.onStop()
  }

  // The window takes what was handed (app/ui src/screen/shared.ts); before
  // it is up, it takes it when its folder opens.
  private fun tellPage() {
    runOnUiThread { page?.evaluateJavascript("window.versoShared && window.versoShared()", null) }
  }

  // Back closes what is on top in the page — a menu, a dialog, a sheet, a
  // drawer — and leaves the app only when nothing is open
  // (app/ui/src/screen/back.ts answers `true` when it closed something).
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    page = webView
    watchGestureBands(webView)
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

  // How wide the system's Back gesture band is on each side, in CSS pixels:
  // the page's sideways swipe (app/ui/src/screen/swipe.ts) starts only past
  // it. It follows the navigation mode (0 with three buttons) and the Back
  // sensitivity, so it is read again each time the insets change. The
  // window's own handling of the insets goes on unchanged.
  @Volatile private var gestureLeft = -1f
  @Volatile private var gestureRight = -1f

  private fun watchGestureBands(webView: WebView) {
    webView.addJavascriptInterface(object {
      @JavascriptInterface
      fun edges(): String =
        if (gestureLeft < 0f) "null" else "{\"left\":$gestureLeft,\"right\":$gestureRight}"
    }, "VersoGestures")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bands = insets.getInsets(WindowInsetsCompat.Type.systemGestures())
      val density = view.resources.displayMetrics.density
      gestureLeft = bands.left / density
      gestureRight = bands.right / density
      ViewCompat.onApplyWindowInsets(view, insets)
    }
    ViewCompat.requestApplyInsets(webView)
  }

  private external fun initTls(context: Context)

  companion object {
    init {
      System.loadLibrary("verso_app")
    }
  }
}
