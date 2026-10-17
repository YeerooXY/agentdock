package com.yeeroo.agentdock.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
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
