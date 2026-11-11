package com.yeeroo.agentdock.mobile

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import io.flutter.plugin.common.MethodChannel

/** The installed speech activity owns microphone access and audio processing. */
class DockDictation(private val activity: MainActivity, channel: MethodChannel) {
    private var pending: MethodChannel.Result? = null

    init {
        channel.setMethodCallHandler { call, reply ->
            if (call.method != "start") { reply.notImplemented(); return@setMethodCallHandler }
            if (pending != null) { reply.error("busy", "Finish voice typing first.", null); return@setMethodCallHandler }
            pending = reply
            try {
                activity.startActivityForResult(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    putExtra(RecognizerIntent.EXTRA_PROMPT, "Message")
                }, 7413)
            } catch (_: ActivityNotFoundException) {
                pending = null
                reply.error("unavailable", "Voice typing is unavailable on this phone.", null)
            } catch (_: SecurityException) {
                pending = null
                reply.error("permission", "Allow microphone access in your phone's speech service.", null)
            }
        }
    }

    fun result(request: Int, code: Int, data: Intent?): Boolean {
        if (request != 7413) return false
        val reply = pending
        pending = null
        reply?.success(if (code == Activity.RESULT_OK) data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull() else null)
        return true
    }

    fun cancel() {
        pending?.success(null)
        pending = null
    }
}
