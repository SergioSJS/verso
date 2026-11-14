package com.versomd.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

// What another app handed to Verso (ADR 0118 item 5, in v1 since
// 2026-11-12): a text shared to it (ACTION_SEND), a Markdown or text file
// shared or opened with it (ACTION_SEND's stream, ACTION_SEND_MULTIPLE,
// ACTION_VIEW). Read here, off the main thread, and kept until the window
// takes it (PhonePlugin.takeShared → src/shared.rs → app/ui
// src/screen/shared.ts), which makes each one a new note of the open
// folder. The other app's file is only read, never written: the note is a
// copy, written by the core as any note (invariant 9).
object Shared {
  // A note is text: past this, the share is refused in words.
  private const val MOST = 8 * 1024 * 1024

  private val waiting = ArrayList<JSObject>()

  // Whether `intent` hands something to Verso; when it does, it is read on
  // a thread of its own and `then` runs once it is kept.
  fun receive(context: Context, intent: Intent?, then: () -> Unit): Boolean {
    val action = intent?.action ?: return false
    val streams = ArrayList<Uri>()
    var text: String? = null
    when (action) {
      Intent.ACTION_SEND -> {
        stream(intent)?.let { streams.add(it) }
        if (streams.isEmpty()) text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
      }
      Intent.ACTION_SEND_MULTIPLE -> streams.addAll(streamList(intent))
      Intent.ACTION_VIEW -> intent.data?.let { streams.add(it) }
      else -> return false
    }
    if (streams.isEmpty() && text == null) return false
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: intent.getStringExtra(Intent.EXTRA_TITLE)
    val app = context.applicationContext
    Thread {
      val items = ArrayList<JSObject>()
      text?.let { items.add(item(subject ?: "", it, null)) }
      for (uri in streams) items.add(read(app, uri))
      synchronized(waiting) { waiting.addAll(items) }
      then()
    }.start()
    return true
  }

  // Everything kept so far, handed over once.
  fun take(): JSArray {
    val out = JSArray()
    synchronized(waiting) {
      waiting.forEach { out.put(it) }
      waiting.clear()
    }
    return out
  }

  private fun item(name: String, text: String?, problem: String?): JSObject {
    val one = JSObject()
    one.put("name", name)
    one.put("text", text)
    one.put("problem", problem)
    return one
  }

  @Suppress("DEPRECATION")
  private fun stream(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }

  @Suppress("DEPRECATION")
  private fun streamList(intent: Intent): List<Uri> =
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
    }) ?: emptyList()

  // The file's name as its app names it, and its bytes as UTF-8 text; a
  // file too big, not text, or not readable comes back with its problem.
  private fun read(context: Context, uri: Uri): JSObject {
    val name = nameOf(context, uri)
    return try {
      val bytes = ByteArrayOutputStream()
      val input = context.contentResolver.openInputStream(uri)
        ?: return item(name, null, "unreadable")
      input.use {
        val buffer = ByteArray(1 shl 16)
        while (true) {
          val n = it.read(buffer)
          if (n < 0) break
          if (bytes.size() + n > MOST) return item(name, null, "too_big")
          bytes.write(buffer, 0, n)
        }
      }
      val decoder = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
      item(name, decoder.decode(ByteBuffer.wrap(bytes.toByteArray())).toString(), null)
    } catch (e: CharacterCodingException) {
      item(name, null, "not_text")
    } catch (e: Exception) {
      item(name, null, "unreadable")
    }
  }

  private fun nameOf(context: Context, uri: Uri): String {
    if (uri.scheme == "content") {
      try {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
          if (it.moveToFirst()) it.getString(0)?.let { name -> return name }
        }
      } catch (e: Exception) {
        // No name from its app: the last segment of its address.
      }
    }
    return uri.lastPathSegment?.substringAfterLast('/') ?: ""
  }
}
