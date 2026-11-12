package com.versomd.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.BatteryManager

// What background sync waits for (ADR 0118 item 6.3, in v1 since
// 2026-11-12): whether the phone is on Wi-Fi, whether it is charging, and
// whether Verso is on screen — told to the Rust host as they change
// (src/background.rs), which holds a folder's sync while Verso is not on
// screen and the person's conditions are not met.
object Conditions {
  @Volatile private var watching = false
  @Volatile private var wifi = true
  @Volatile private var charging = true

  @JvmStatic external fun told(wifi: Boolean, charging: Boolean)

  @JvmStatic external fun shown(on: Boolean)

  // Watched once for the process, on the app's context.
  fun watch(context: Context) {
    if (watching) return
    watching = true
    val app = context.applicationContext
    val connectivity = app.getSystemService(ConnectivityManager::class.java)
    connectivity?.activeNetwork?.let { network ->
      wifi = connectivity.getNetworkCapabilities(network)?.let(::onWifi) ?: false
    }
    connectivity?.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
        update(onWifi(capabilities), charging)
      }

      override fun onLost(network: Network) {
        update(false, charging)
      }
    })
    val battery = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        update(wifi, plugged != 0)
      }
    }
    // A sticky broadcast: its last value comes at once.
    app.registerReceiver(battery, IntentFilter(Intent.ACTION_BATTERY_CHANGED))?.let {
      charging = it.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
    }
    told(wifi, charging)
  }

  // Wi-Fi or a cable: a network that is not the carrier's.
  private fun onWifi(capabilities: NetworkCapabilities): Boolean =
    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)

  @Synchronized
  private fun update(onWifi: Boolean, plugged: Boolean) {
    if (onWifi == wifi && plugged == charging) return
    wifi = onWifi
    charging = plugged
    told(wifi, charging)
  }
}
