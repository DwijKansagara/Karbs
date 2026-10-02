package com.dwijkansagara.karbs.portable

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.os.*
import android.provider.Settings
import android.view.*
import android.widget.*
import kotlin.math.abs

/** User-started floating assistant. Never starts on boot or captures the screen. */
class KarbsOverlayService : Service() {
    companion object { var instance: KarbsOverlayService? = null; private set }
    private lateinit var manager: WindowManager
    private lateinit var bar: LinearLayout
    private lateinit var face: Face
    private lateinit var panel: LinearLayout
    private lateinit var label: TextView
    private lateinit var params: WindowManager.LayoutParams
    private var attached = false
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
    override fun onBind(intent: Intent?) = null
    override fun onCreate() {
        super.onCreate()
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return }
        val notifications = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(NotificationChannel("karbs-floating", "Floating Karbs", NotificationManager.IMPORTANCE_LOW))
        val launch = packageManager.getLaunchIntentForPackage(packageName)!!
        val open = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val hide = PendingIntent.getService(this, 1, Intent(this, javaClass).setAction("hide"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "karbs-floating") else Notification.Builder(this)
        val notification = builder.setSmallIcon(applicationInfo.icon).setContentTitle("Karbs is floating")
            .setContentText("Tap the face for controls. Hide stops the floating bar.").setContentIntent(open).setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Hide", hide).build()).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(73, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(73, notification)
        manager = getSystemService(WINDOW_SERVICE) as WindowManager
        params = WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.START; x = dp(16); y = dp(120) }
        bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
            background = GradientDrawable().apply { setColor(Color.rgb(18, 28, 22)); cornerRadius = dp(10).toFloat(); setStroke(dp(1), Color.rgb(76, 112, 89)) }
            elevation = dp(8).toFloat(); setPadding(dp(4), dp(4), dp(8), dp(4))
        }
        face = Face().apply { contentDescription = "Floating Karbs"; isClickable = true }; bar.addView(face, LinearLayout.LayoutParams(dp(58), dp(58)))
        panel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        label = TextView(this).apply { text = "Karbs · Ready"; setTextColor(Color.rgb(222, 241, 228)); textSize = 12f; maxWidth = dp(190); maxLines = 3 }
        panel.addView(label)
        val buttons = LinearLayout(this)
        fun button(title: String, click: () -> Unit) = Button(this).apply { text = title; textSize = 11f; minimumHeight = 0; minHeight = 0; setOnClickListener { click() } }
        buttons.addView(button("Open Karbs") { startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)) })
        buttons.addView(button("Hide") { stopSelf() }); panel.addView(buttons); bar.addView(panel)
        panel.addView(button("Stop phone actions") { KarbsAccessibilityService.instance?.taskActive = false; updateStatus("Phone actions stopped", false) })
        var rawX = 0f; var rawY = 0f; var startX = 0; var startY = 0; var dragged = false
        face.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> { rawX = event.rawX; rawY = event.rawY; startX = params.x; startY = params.y; dragged = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - rawX; val dy = event.rawY - rawY
                    if (abs(dx) + abs(dy) > dp(8)) dragged = true
                    if (dragged) { params.x = (startX + dx.toInt()).coerceIn(0, (resources.displayMetrics.widthPixels - bar.width).coerceAtLeast(0)); params.y = (startY + dy.toInt()).coerceIn(0, (resources.displayMetrics.heightPixels - bar.height).coerceAtLeast(0)); manager.updateViewLayout(bar, params) }; true
                }
                MotionEvent.ACTION_UP -> { if (!dragged) { face.performClick(); panel.visibility = if (panel.visibility == View.GONE) View.VISIBLE else View.GONE; params.x = params.x.coerceAtMost((resources.displayMetrics.widthPixels - dp(310)).coerceAtLeast(0)); manager.updateViewLayout(bar, params) }; true }
                else -> false
            }
        }
        try { manager.addView(bar, params); attached = true; instance = this } catch (_: Exception) { stopSelf() }
    }
    fun updateStatus(text: String, working: Boolean) { label.text = text.take(180); face.working = working; face.invalidate() }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int { if (intent?.action == "hide") stopSelf(); return START_NOT_STICKY }
    override fun onDestroy() { instance = null; if (attached) manager.removeView(bar); attached = false; super.onDestroy() }
    private inner class Face : View(this@KarbsOverlayService) {
        var working = false
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun performClick(): Boolean { super.performClick(); return true }
        override fun onDraw(canvas: Canvas) {
            val scale = width / 58f; canvas.save(); canvas.scale(scale, scale)
            paint.color = Color.rgb(79, 213, 157); canvas.drawRoundRect(7f, 13f, 51f, 48f, 12f, 12f, paint)
            paint.color = Color.rgb(14, 37, 26); canvas.drawCircle(22f, 29f, 2.7f, paint); canvas.drawCircle(36f, 29f, 2.7f, paint)
            paint.strokeWidth = 2f; canvas.drawLine(25f, 38f, 33f, 38f, paint)
            paint.color = if (working) Color.rgb(238, 202, 117) else Color.rgb(159, 241, 195)
            canvas.drawCircle(29f, 7f, if (working) 3f + ((SystemClock.uptimeMillis() % 1000) / 1000f) else 3f, paint)
            paint.strokeWidth = 1.5f; canvas.drawLine(29f, 9f, 29f, 13f, paint); canvas.restore()
            if (working) postInvalidateDelayed(80)
        }
    }
}
