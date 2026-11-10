package com.versomd.app

import android.app.Activity
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class PageArgs {
  var url: String = ""
}

// What the Rust host asks of Android itself (src/phone.rs, ADR 0118 item 7):
// the facts a phone answers through its API and not through a file or a
// command — its name, its DNS servers, where its native libraries are — and
// a page opened in the person's browser.
@TauriPlugin
class PhonePlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun facts(invoke: Invoke) {
    val context = activity.applicationContext
    val answer = JSObject()
    // The name the person gave the phone (Settings › About), else its model.
    val named = Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
    answer.put("deviceName", if (named.isNullOrBlank()) Build.MODEL else named)
    val dns = JSArray()
    try {
      val connectivity = context.getSystemService(ConnectivityManager::class.java)
      connectivity?.getLinkProperties(connectivity.activeNetwork)?.dnsServers?.forEach {
        it.hostAddress?.let { address -> dns.put(address.substringBefore('%')) }
      }
    } catch (e: SecurityException) {
      // No network state to read: the system's resolver alone, as before.
    }
    answer.put("dnsServers", dns)
    answer.put("nativeLibraryDir", context.applicationInfo.nativeLibraryDir)
    answer.put("sdk", Build.VERSION.SDK_INT)
    invoke.resolve(answer)
  }

  // A server's sign-in page, opened in the browser the person uses.
  @Command
  fun openUrl(invoke: Invoke) {
    val args = invoke.parseArgs(PageArgs::class.java)
    val page = Uri.parse(args.url)
    if (page.scheme != "https" && page.scheme != "http") {
      invoke.reject("not a web page")
      return
    }
    try {
      activity.startActivity(Intent(Intent.ACTION_VIEW, page).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: "no browser")
    }
  }
}
