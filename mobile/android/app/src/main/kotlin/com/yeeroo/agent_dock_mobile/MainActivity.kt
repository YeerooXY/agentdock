package com.yeeroo.agentdock.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var media: DockMedia? = null
    private var notificationPermission: MethodChannel.Result? = null
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == 7411) {
            notificationPermission?.success(grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED)
            notificationPermission = null
        } else super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }
    override fun onStart() { super.onStart(); media?.start() }
    override fun onStop() { media?.stop(); super.onStop() }
    @Deprecated("Android activity result compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        if (media?.result(requestCode, resultCode, data) != true) super.onActivityResult(requestCode, resultCode, data)
    }
    override fun provideFlutterEngine(context: android.content.Context): FlutterEngine =
        (application as DockApplication).dockEngine
    override fun shouldDestroyEngineWithHost(): Boolean = false
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        media = DockMedia(this, MethodChannel(engine.dartExecutor.binaryMessenger, "agentdock/media")).also { it.listen() }
        MethodChannel(engine.dartExecutor.binaryMessenger, "agentdock/permissions").setMethodCallHandler { call, result ->
            if (call.method != "notifications") result.notImplemented()
            else if (android.os.Build.VERSION.SDK_INT < 33 || checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) result.success(true)
            else if (notificationPermission != null) result.error("pending", "Finish the notification permission request.", null)
            else {
                notificationPermission = result
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 7411)
            }
        }
        MethodChannel(engine.dartExecutor.binaryMessenger, "agentdock/updates").setMethodCallHandler { call, result ->
            if (call.method == "installed") {
                val info = packageManager.getPackageInfo(packageName, 0)
                result.success(mapOf("version" to info.versionName, "abis" to android.os.Build.SUPPORTED_ABIS.toList()))
            } else result.notImplemented()
        }
        MethodChannel(engine.dartExecutor.binaryMessenger, "agentdock/push").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "configure" -> {
                        val values = call.arguments as? Map<*, *> ?: error("Missing Firebase configuration")
                        val fields = listOf("projectId", "appId", "apiKey", "messagingSenderId")
                        if (fields.any { (values[it] as? String).isNullOrBlank() }) error("Incomplete Firebase configuration")
                        val prefs = getSharedPreferences("push_public_config", MODE_PRIVATE)
                        val edit = prefs.edit()
                        for (field in fields) edit.putString(field, values[field] as String)
                        edit.commit()
                        DockApplication.initializePush(this)
                        result.success(null)
                    }
                    "clear" -> { getSharedPreferences("push_public_config", MODE_PRIVATE).edit().clear().commit(); result.success(null) }
                    else -> result.notImplemented()
                }
            } catch (_: Exception) { result.error("firebase_setup", "Firebase setup could not be loaded. Check the project files on your PC.", null) }
        }
    }
}
