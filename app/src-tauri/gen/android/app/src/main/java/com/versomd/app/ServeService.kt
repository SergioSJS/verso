package com.versomd.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

// The phone as a server (ADR 0118 item 3.2): while Verso serves — on the
// network or by its internet link — this foreground service keeps the
// process, the CPU and the Wi-Fi awake with the screen off, and says so in
// a notification that never leaves while it runs. It keeps the server alive
// and nothing else (item 6: sync runs while the app is open). The words come
// from Rust in the window's language (src/phone.rs `follow`).
class ServeService : Service() {
  private var wake: PowerManager.WakeLock? = null
  private var wifi: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(TITLE) ?: "Verso"
    val text = intent?.getStringExtra(TEXT) ?: ""
    val channel = intent?.getStringExtra(CHANNEL_NAME) ?: "Verso"
    val manager = getSystemService(NotificationManager::class.java)
    manager?.createNotificationChannel(
      NotificationChannel(CHANNEL, channel, NotificationManager.IMPORTANCE_LOW)
    )
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notice = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.mipmap.ic_launcher_monochrome)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(open)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTICE, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTICE, notice)
    }
    hold()
    return START_NOT_STICKY
  }

  private fun hold() {
    if (wake == null) {
      wake = getSystemService(PowerManager::class.java)
        ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "verso:serving")
        ?.apply { setReferenceCounted(false); acquire() }
    }
    if (wifi == null) {
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        WifiManager.WIFI_MODE_FULL_LOW_LATENCY
      } else {
        @Suppress("DEPRECATION") WifiManager.WIFI_MODE_FULL_HIGH_PERF
      }
      wifi = (applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager)
        ?.createWifiLock(mode, "verso:serving")
        ?.apply { setReferenceCounted(false); acquire() }
    }
  }

  override fun onDestroy() {
    wake?.takeIf { it.isHeld }?.release()
    wifi?.takeIf { it.isHeld }?.release()
    wake = null
    wifi = null
    super.onDestroy()
  }

  companion object {
    const val TITLE = "title"
    const val TEXT = "text"
    const val CHANNEL_NAME = "channel"
    private const val CHANNEL = "serving"
    private const val NOTICE = 7340
  }
}
