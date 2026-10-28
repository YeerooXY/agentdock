package com.yeeroo.agentdock.mobile

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Size
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.provider.MediaStore
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream

class DockMedia(private val activity: MainActivity, private val channel: MethodChannel) {
    private var pending: MethodChannel.Result? = null
    private var permission: MethodChannel.Result? = null
    private val readPermissions = when {
        Build.VERSION.SDK_INT >= 34 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
        Build.VERSION.SDK_INT >= 33 -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
        else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }
    // Full or user-selected photo access both allow reading recent screenshots.
    private fun canRead() = readPermissions.any { activity.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
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
                "recent" -> {
                    if (!canRead()) { result.success(mapOf("permission" to false)); return@setMethodCallHandler }
                    val seconds = (call.argument<Int>("seconds") ?: 300).coerceIn(10, 3600)
                    Thread {
                        val found = try { recentScreenshot(seconds) } catch (_: Exception) { null }
                        activity.runOnUiThread { result.success(found ?: mapOf("permission" to true)) }
                    }.start()
                }
                "recentImage" -> {
                    val id = call.argument<Number>("id")?.toLong()
                    if (id == null || !canRead()) { result.error("image", "The screenshot is no longer available.", null); return@setMethodCallHandler }
                    deliver(ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id), result)
                }
                "allowRecent" -> {
                    if (canRead()) { result.success(true); return@setMethodCallHandler }
                    if (permission != null) { result.error("pending", "Finish the photo permission request.", null); return@setMethodCallHandler }
                    permission = result
                    activity.requestPermissions(readPermissions, 7412)
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
        deliver(uri, reply)
        return true
    }
    fun permissionResult(request: Int): Boolean {
        if (request != 7412) return false
        permission?.success(canRead())
        permission = null
        return true
    }
    // Newest image in a Screenshots folder added within the last [seconds].
    private fun recentScreenshot(seconds: Int): Map<String, Any>? {
        val since = System.currentTimeMillis() / 1000 - seconds
        val columns = mutableListOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.DISPLAY_NAME)
        if (Build.VERSION.SDK_INT >= 29) columns.add(MediaStore.Images.Media.RELATIVE_PATH)
        activity.contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, columns.toTypedArray(),
            "${MediaStore.Images.Media.DATE_ADDED} >= ?", arrayOf(since.toString()),
            "${MediaStore.Images.Media.DATE_ADDED} DESC",
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                val place = (if (Build.VERSION.SDK_INT >= 29) cursor.getString(3) ?: "" else "") + "/" + (cursor.getString(2) ?: "")
                if (!place.contains("screenshot", ignoreCase = true)) continue
                val id = cursor.getLong(0)
                val found = mutableMapOf<String, Any>("permission" to true, "id" to id, "at" to cursor.getLong(1) * 1000)
                if (Build.VERSION.SDK_INT >= 29) try {
                    val thumb = activity.contentResolver.loadThumbnail(ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id), Size(160, 160), null)
                    val output = ByteArrayOutputStream()
                    try { thumb.compress(Bitmap.CompressFormat.PNG, 100, output) } finally { thumb.recycle() }
                    found["thumbnail"] = output.toByteArray()
                } catch (_: Exception) { /* Show the chip without a preview. */ }
                return found
            }
        }
        return null
    }
    private fun deliver(uri: Uri, reply: MethodChannel.Result) {
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
    }
}
