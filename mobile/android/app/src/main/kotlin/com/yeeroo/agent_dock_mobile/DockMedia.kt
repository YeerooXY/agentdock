package com.yeeroo.agentdock.mobile

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.provider.MediaStore
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream

class DockMedia(private val activity: MainActivity, private val channel: MethodChannel) {
    private var pending: MethodChannel.Result? = null
    private var captureCallback: Activity.ScreenCaptureCallback? = null
    fun listen() {
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "pick" -> {
                    if (pending != null) { result.error("busy", "Finish choosing the current image.", null); return@setMethodCallHandler }
                    pending = result
                    try {
                        val intent = if (Build.VERSION.SDK_INT >= 33) Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
                            else Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE)
                        activity.startActivityForResult(intent, 7410)
                    } catch (_: Exception) { pending = null; result.error("picker", "No image picker is available.", null) }
                }
                else -> result.notImplemented()
            }
        }
    }
    fun start() {
        if (Build.VERSION.SDK_INT >= 34 && captureCallback == null) {
            captureCallback = Activity.ScreenCaptureCallback { channel.invokeMethod("screenshot", null) }
            activity.registerScreenCaptureCallback(activity.mainExecutor, captureCallback!!)
        }
    }
    fun stop() {
        if (Build.VERSION.SDK_INT >= 34) captureCallback?.let { activity.unregisterScreenCaptureCallback(it) }
        captureCallback = null
    }
    fun result(request: Int, code: Int, data: Intent?): Boolean {
        if (request != 7410) return false
        val reply = pending ?: return true
        pending = null
        val uri = data?.data
        if (code != Activity.RESULT_OK || uri == null) { reply.success(null); return true }
        Thread {
            try {
                val bytes = activity.contentResolver.openInputStream(uri)!!.use { input ->
                    val buffer = ByteArrayOutputStream()
                    val chunk = ByteArray(8192)
                    while (true) {
                        val count = input.read(chunk)
                        if (count < 0) break
                        if (buffer.size() + count > 16 * 1024 * 1024) error("large")
                        buffer.write(chunk, 0, count)
                    }
                    buffer.toByteArray()
                }
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth.toLong() * bounds.outHeight > 100_000_000) error("image")
                var sample = 1
                while (bounds.outWidth / sample > 2560 || bounds.outHeight / sample > 2560) sample *= 2
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: error("image")
                // Re-encode the user-selected image: no EXIF/location metadata,
                // executable formats or unbounded full-resolution allocation.
                val output = ByteArrayOutputStream()
                try { bitmap.compress(Bitmap.CompressFormat.PNG, 100, output) } finally { bitmap.recycle() }
                if (output.size() > 4 * 1024 * 1024) error("large")
                activity.runOnUiThread { reply.success(output.toByteArray()) }
            } catch (_: Exception) {
                activity.runOnUiThread { reply.error("image", "Choose a smaller image (up to 4 MB after resizing).", null) }
            }
        }.start()
        return true
    }
}
