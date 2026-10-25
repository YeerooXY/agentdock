package com.yeeroo.agentdock.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
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
        // Firebase alerts were removed; drop the public sender settings older builds saved.
        getSharedPreferences("push_public_config", MODE_PRIVATE).edit().clear().apply()
    }
}
