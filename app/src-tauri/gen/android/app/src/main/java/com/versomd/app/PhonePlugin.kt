package com.versomd.app

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import androidx.activity.result.ActivityResult
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import app.tauri.annotation.ActivityCallback
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

@InvokeArg
class ServeArgs {
  var on: Boolean = false
  var title: String = ""
  var text: String = ""
  var channel: String = ""
  var awake: Boolean = true
}

@InvokeArg
class LockArgs {
  var name: String = ""
  var on: Boolean = false
}

@InvokeArg
class CaptureArgs {
  var title: String = ""
  var text: String = ""
}

@InvokeArg
class ApkArgs {
  var path: String = ""
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
    @Suppress("DEPRECATION")
    answer.put("sharedStorage", Environment.getExternalStorageDirectory().absolutePath)
    invoke.resolve(answer)
  }

  // What other apps handed to Verso since the window last asked (Shared.kt).
  @Command
  fun takeShared(invoke: Invoke) {
    val answer = JSObject()
    answer.put("items", Shared.take())
    invoke.resolve(answer)
  }

  // Whether Verso may reach the phone's shared storage (ADR 0118 item 4.4),
  // and where its top is: All files access on Android 11+, the storage
  // permission on Android 10 (with the legacy view the manifest asks for).
  @Command
  fun storageAccess(invoke: Invoke) {
    val context = activity.applicationContext
    val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Environment.isExternalStorageManager()
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }
    val answer = JSObject()
    answer.put("granted", granted)
    @Suppress("DEPRECATION")
    answer.put("top", Environment.getExternalStorageDirectory().absolutePath)
    invoke.resolve(answer)
  }

  // Ask for that access: Android's own page for Verso's All files access
  // (the person turns it on and comes back; the window asks again when it
  // is shown), or the permission's prompt on Android 10.
  @Command
  fun askStorageAccess(invoke: Invoke) {
    val context = activity.applicationContext
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val own = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + context.packageName))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          activity.startActivity(own)
        } catch (e: Exception) {
          // A system without the page for one app: the list of all of them.
          activity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
      } else {
        activity.requestPermissions(
          arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE),
          7341,
        )
      }
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: "the page for the access did not open")
    }
  }

  // The sound of the phone's other apps (Capture.kt): the microphone's
  // permission first (Android asks it of AudioPlaybackCapture), then
  // Android's screen-capture prompt, then the service that holds the
  // capture. Resolves once the person allowed it; the samples follow.
  private var captureWords = CaptureArgs()

  @Command
  fun captureStart(invoke: Invoke) {
    captureWords = invoke.parseArgs(CaptureArgs::class.java)
    val context = activity.applicationContext
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 7343)
      invoke.reject("Verso is not allowed to record audio")
      return
    }
    val manager = context.getSystemService(MediaProjectionManager::class.java)
    if (manager == null) {
      invoke.reject("no screen capture on this phone")
      return
    }
    // The whole screen, not one app (Android 14+ offers both): the sound of
    // every app is what the table hears.
    val ask = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
    } else {
      manager.createScreenCaptureIntent()
    }
    startActivityForResult(invoke, ask, "captureAllowed")
  }

  @ActivityCallback
  fun captureAllowed(invoke: Invoke, result: ActivityResult) {
    val data = result.data
    if (result.resultCode != Activity.RESULT_OK || data == null) {
      invoke.reject("the screen capture was not allowed")
      return
    }
    val context = activity.applicationContext
    val service = Intent(context, CaptureService::class.java)
      .putExtra(CaptureService.TITLE, captureWords.title)
      .putExtra(CaptureService.TEXT, captureWords.text)
      .putExtra(CaptureService.CODE, result.resultCode)
      .putExtra(CaptureService.DATA, data)
    try {
      ContextCompat.startForegroundService(context, service)
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: "the capture did not start")
    }
  }

  @Command
  fun captureStop(invoke: Invoke) {
    val context = activity.applicationContext
    context.stopService(Intent(context, CaptureService::class.java))
    invoke.resolve()
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

  // The foreground service of serving (ServeService.kt): started with its
  // words, updated by starting it again, stopped when serving stops. The
  // notification's permission is asked the first time (Android 13+); the
  // service runs without it, its notice then only in the task manager.
  @Command
  fun serve(invoke: Invoke) {
    val args = invoke.parseArgs(ServeArgs::class.java)
    val context = activity.applicationContext
    val service = Intent(context, ServeService::class.java)
    try {
      if (args.on) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
          ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
          activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7340)
        }
        service.putExtra(ServeService.TITLE, args.title)
          .putExtra(ServeService.TEXT, args.text)
          .putExtra(ServeService.CHANNEL_NAME, args.channel)
          .putExtra(ServeService.AWAKE, args.awake)
        ContextCompat.startForegroundService(context, service)
      } else {
        context.stopService(service)
      }
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: "the service did not start")
    }
  }

  private val locks = HashMap<String, WifiManager.MulticastLock>()

  // Multicast (mDNS) reaches the app only while a lock is held: while a
  // device pairs, while the app looks for servers (ADR 0118 item 3.1).
  @Command
  fun multicast(invoke: Invoke) {
    val args = invoke.parseArgs(LockArgs::class.java)
    synchronized(locks) {
      val held = locks[args.name]
      if (args.on && held == null) {
        val wifi = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        wifi?.createMulticastLock("verso:" + args.name)?.apply {
          setReferenceCounted(false)
          acquire()
          locks[args.name] = this
        }
      } else if (!args.on && held != null) {
        if (held.isHeld) held.release()
        locks.remove(args.name)
      }
      Unit
    }
    invoke.resolve()
  }

  // Whether Android lets Verso install a package, asked before an update
  // downloads anything (src/update.rs): when not, Android's page to allow
  // installs from Verso opens, and the person presses the update again
  // from it — the download has not started.
  @Command
  fun canInstall(invoke: Invoke) {
    val context = activity.applicationContext
    val answer = JSObject()
    try {
      val allowed = context.packageManager.canRequestPackageInstalls()
      if (!allowed) {
        activity.startActivity(
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
      }
      answer.put("allowed", allowed)
      invoke.resolve(answer)
    } catch (e: Exception) {
      invoke.reject(e.message ?: "Android did not say whether Verso may install")
    }
  }

  // A checked update (src/update.rs) handed to Android's own install
  // prompt (ADR 0118 item 5): the person confirms there. The first time,
  // Android's page to allow installs from Verso opens instead, and the
  // person tries again from it.
  @Command
  fun installApk(invoke: Invoke) {
    val args = invoke.parseArgs(ApkArgs::class.java)
    val context = activity.applicationContext
    try {
      if (!context.packageManager.canRequestPackageInstalls()) {
        activity.startActivity(
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        invoke.reject("allow installs from Verso, then install again")
        return
      }
      val apk = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", File(args.path))
      activity.startActivity(
        Intent(Intent.ACTION_VIEW)
          .setDataAndType(apk, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      )
      invoke.resolve()
    } catch (e: Exception) {
      invoke.reject(e.message ?: "the install prompt did not open")
    }
  }
}
