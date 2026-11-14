package com.versomd.app

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

// The sound other apps play on the phone, shared at the table (ADR 0116's
// audio share; ADR 0118 item 5, in v1 since 2026-11-12): Android's
// AudioPlaybackCapture (Android 10+), after the person allows Android's
// screen-capture prompt each time. The samples — interleaved stereo float
// at 48 kHz — go to the Rust host as they come (src/audio_share/android.rs),
// which encodes and sends them as on the desktop. Apps that forbid capture
// (and calls) are not heard: Android leaves them out.
object Capture {
  const val RATE = 48_000
  // 20 ms of stereo: the encoder's frame.
  private const val BLOCK = RATE / 50 * 2

  @JvmStatic external fun pcm(block: FloatArray, length: Int)

  @JvmStatic external fun ended(why: String)

  @Volatile private var record: AudioRecord? = null
  @Volatile private var projection: MediaProjection? = null
  private var reader: Thread? = null

  // Called by CaptureService once it is in the foreground (Android 14 wants
  // the service of type mediaProjection before the projection is taken).
  @Synchronized
  fun begin(context: Context, code: Int, data: Intent): String? {
    stop()
    val manager = context.getSystemService(MediaProjectionManager::class.java)
      ?: return "no screen capture on this phone"
    val taken = manager.getMediaProjection(code, data) ?: return "the screen capture was not allowed"
    taken.registerCallback(object : MediaProjection.Callback() {
      override fun onStop() {
        ended("the capture was stopped by Android")
      }
    }, Handler(Looper.getMainLooper()))
    val config = AudioPlaybackCaptureConfiguration.Builder(taken)
      .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
      .addMatchingUsage(AudioAttributes.USAGE_GAME)
      .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
      .build()
    val format = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
      .setSampleRate(RATE)
      .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
      .build()
    val made = try {
      AudioRecord.Builder()
        .setAudioFormat(format)
        .setBufferSizeInBytes(BLOCK * 4 * 8)
        .setAudioPlaybackCaptureConfig(config)
        .build()
    } catch (e: SecurityException) {
      taken.stop()
      return "Verso is not allowed to record audio"
    } catch (e: Exception) {
      taken.stop()
      return e.message ?: "the capture did not start"
    }
    projection = taken
    record = made
    made.startRecording()
    reader = Thread {
      val block = FloatArray(BLOCK)
      while (record === made) {
        val n = made.read(block, 0, block.size, AudioRecord.READ_BLOCKING)
        if (n > 0) pcm(block, n) else if (n < 0) break
      }
    }.apply {
      name = "verso-capture"
      start()
    }
    return null
  }

  @Synchronized
  fun stop() {
    val was = record
    record = null
    was?.let {
      try {
        it.stop()
      } catch (e: Exception) {
        // Already stopped.
      }
      it.release()
    }
    reader?.join(500)
    reader = null
    projection?.stop()
    projection = null
  }
}

// The foreground service Android requires while the screen-capture
// permission is used (type mediaProjection), with its notification; it
// holds the capture and nothing else.
class CaptureService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(TITLE) ?: "Verso"
    val manager = getSystemService(NotificationManager::class.java)
    manager?.createNotificationChannel(NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_LOW))
    val notice = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.mipmap.ic_launcher_monochrome)
      .setContentTitle(title)
      .setContentText(intent?.getStringExtra(TEXT) ?: "")
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTICE, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTICE, notice)
    }
    val code = intent?.getIntExtra(CODE, Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
    @Suppress("DEPRECATION")
    val data: Intent? = intent?.getParcelableExtra(DATA)
    val failed = if (data == null) "the screen capture was not allowed" else Capture.begin(this, code, data)
    if (failed != null) {
      Capture.ended(failed)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    Capture.stop()
    super.onDestroy()
  }

  companion object {
    const val TITLE = "title"
    const val TEXT = "text"
    const val CODE = "code"
    const val DATA = "data"
    private const val CHANNEL = "capture"
    private const val NOTICE = 7342
  }
}
