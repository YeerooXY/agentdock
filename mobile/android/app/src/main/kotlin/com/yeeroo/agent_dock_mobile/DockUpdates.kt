package com.yeeroo.agentdock.mobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

/** In-app updates: Dart downloads and verifies the APK into [folder]; this hands it
 *  to Android's installer, which always asks the person to confirm. */
class DockUpdates(private val activity: Activity) {
    private val folder: File get() = File(activity.cacheDir, "updates").apply { mkdirs() }

    fun handle(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "installed" -> {
                val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
                result.success(mapOf("version" to info.versionName, "abis" to Build.SUPPORTED_ABIS.toList()))
            }
            "updateDir" -> result.success(folder.absolutePath)
            "canInstall" -> result.success(Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls())
            "allowInstalls" -> {
                if (Build.VERSION.SDK_INT >= 26) {
                    activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
                }
                result.success(null)
            }
            "install" -> {
                val file = File(call.argument<String>("path") ?: "").canonicalFile
                // Only APKs this app downloaded into its own update folder.
                if (file.parentFile != folder.canonicalFile || !file.name.endsWith(".apk") || !file.isFile) {
                    result.error("invalid", "The update file is missing. Download it again.", null)
                    return
                }
                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", file)
                activity.startActivity(
                    Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                )
                result.success(true)
            }
            else -> result.notImplemented()
        }
    }
}
