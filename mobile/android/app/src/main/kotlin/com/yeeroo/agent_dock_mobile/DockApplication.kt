package com.yeeroo.agentdock.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.dart.DartExecutor

class DockApplication : Application() {
    // Activity replacement/rotation must not replace the connection's engine.
    val dockEngine: FlutterEngine by lazy {
        FlutterEngine(this).also {
            BackgroundConnection.configure(this, it)
            it.dartExecutor.executeDartEntrypoint(DartExecutor.DartEntrypoint.createDefault())
        }
    }
    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel("agent_dock_ready", "Agent activity", NotificationManager.IMPORTANCE_HIGH)
            channel.description = "When a console is ready or needs attention"
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        // Public client identifiers only. Private service-account keys never reach Android.
        try { initializePush(this) } catch (_: Exception) { }
    }
    companion object {
        fun initializePush(context: Context) {
            val prefs = context.getSharedPreferences("push_public_config", MODE_PRIVATE)
            val project = prefs.getString("projectId", null) ?: return
            val existing = FirebaseApp.getApps(context).find { it.name == FirebaseApp.DEFAULT_APP_NAME }
            if (existing?.options?.projectId == project) return
            existing?.delete()
            val options = FirebaseOptions.Builder()
                .setProjectId(project)
                .setApplicationId(prefs.getString("appId", "")!!)
                .setApiKey(prefs.getString("apiKey", "")!!)
                .setGcmSenderId(prefs.getString("messagingSenderId", "")!!)
                .build()
            FirebaseApp.initializeApp(context, options)
        }
    }
}
