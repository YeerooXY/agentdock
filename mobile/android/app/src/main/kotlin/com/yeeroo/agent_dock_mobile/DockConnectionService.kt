package com.yeeroo.agentdock.mobile

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/** Keeps the same Dart connection alive; never opens a second authenticated
 * socket or copies pairing credentials into native preferences. */
class DockConnectionService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "stop") {
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = BackgroundConnection.ongoing(this)
        if (Build.VERSION.SDK_INT >= 29)
            startForeground(7100, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        else startForeground(7100, notification)
        BackgroundConnection.running = true
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        BackgroundConnection.running = false
        BackgroundConnection.channel?.invokeMethod("stopped", null)
        super.onDestroy()
    }
}

object BackgroundConnection {
    var running = false
    var label = "Dock connection"
    var channel: MethodChannel? = null
    fun configure(context: Context, engine: FlutterEngine) {
        channel = MethodChannel(engine.dartExecutor.binaryMessenger, "agentdock/background").also { bridge ->
            bridge.setMethodCallHandler { call, result ->
                try {
                    when (call.method) {
                        "start" -> {
                            val manager = context.getSystemService(NotificationManager::class.java)
                            if (!manager.areNotificationsEnabled() ||
                                Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                                result.error("permission", "Allow Agent Dock notifications in Android settings, then try again.", null)
                            } else {
                                label = (call.argument<String>("name") ?: "Dock connection").take(100)
                                val intent = Intent(context, DockConnectionService::class.java)
                                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
                                result.success(true)
                            }
                        }
                        "stop" -> { context.stopService(Intent(context, DockConnectionService::class.java)); result.success(null) }
                        "status" -> {
                            label = (call.argument<String>("name") ?: "Dock connection").take(100)
                            if (running) context.getSystemService(NotificationManager::class.java).notify(7100, ongoing(context))
                            result.success(null)
                        }
                        "notify" -> {
                            if (running) {
                                val key = call.argument<String>("key") ?: ""
                                val title = (call.argument<String>("title") ?: "Agent Dock").take(140)
                                val open = launch(context)
                                val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, "agent_dock_ready") else Notification.Builder(context)
                                val notification = builder.setSmallIcon(R.drawable.ic_notification)
                                    .setContentTitle(title).setContentText("Open Agent Dock to review.")
                                    .setContentIntent(open).setAutoCancel(true)
                                    .setVisibility(Notification.VISIBILITY_PRIVATE).build()
                                context.getSystemService(NotificationManager::class.java).notify("dock-ready", key.hashCode(), notification)
                            }
                            result.success(null)
                        }
                        "settings" -> {
                            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                android.net.Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            result.success(null)
                        }
                        else -> result.notImplemented()
                    }
                } catch (_: Exception) {
                    result.error("background", "Android could not start the connection. Check notification and battery settings.", null)
                }
            }
        }
    }
    private fun launch(context: Context) = PendingIntent.getActivity(context, 7101,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun ongoing(context: Context): Notification {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26)
            manager.createNotificationChannel(NotificationChannel("dock_connection", "PC connection", NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(context, 7102,
            Intent(context, DockConnectionService::class.java).setAction("stop"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, "dock_connection") else Notification.Builder(context)
        return builder.setSmallIcon(R.drawable.ic_notification).setContentTitle("Agent Dock")
            .setContentText(label).setOngoing(true).setContentIntent(launch(context))
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .addAction(Notification.Action.Builder(null, "Stop alerts", stop).build()).build()
    }
}
