package com.versomd.app

import android.app.Activity
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class BarsArgs {
  var dark: Boolean = false
}

// The status bar's and the navigation bar's icons follow the window's theme:
// light icons over a dark page, dark ones over a light page (src/mobile.rs
// `set_bars_dark`, which the window calls when its theme changes).
@TauriPlugin
class StatusBarPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun setDark(invoke: Invoke) {
    val args = invoke.parseArgs(BarsArgs::class.java)
    activity.runOnUiThread {
      val bars = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
      bars.isAppearanceLightStatusBars = !args.dark
      bars.isAppearanceLightNavigationBars = !args.dark
      invoke.resolve()
    }
  }
}
