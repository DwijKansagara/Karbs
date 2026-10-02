package com.dwijkansagara.karbs.portable

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/** Screen information is read only on an explicit task call, never from events. */
class KarbsAccessibilityService : AccessibilityService() {
    companion object { var instance: KarbsAccessibilityService? = null; private set }
    private val nodes = mutableMapOf<Int, AccessibilityNodeInfo>()
    private var sequence = 0
    var taskActive = false
    override fun onServiceConnected() { instance = this }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() { taskActive = false; clearNodes() }
    override fun onDestroy() { taskActive = false; clearNodes(); instance = null; super.onDestroy() }
    private fun clearNodes() { nodes.values.forEach { it.recycle() }; nodes.clear() }
    fun inspect(): JSONObject {
        check(taskActive) { "Phone control is not enabled for an active task." }; clearNodes()
        val root = rootInActiveWindow ?: error("This app does not expose an accessible screen.")
        val items = JSONArray(); var visited = 0
        val windowBounds = Rect(); root.getBoundsInScreen(windowBounds)
        fun visit(node: AccessibilityNodeInfo, depth: Int, clip: Rect) {
            if (++visited > 250 || depth > 25 || !node.isVisibleToUser || node.isPassword) return
            val bounds = Rect(); node.getBoundsInScreen(bounds); if (bounds.isEmpty || !bounds.intersect(clip)) return
            val id = ++sequence
            nodes[id] = AccessibilityNodeInfo.obtain(node)
            items.put(JSONObject().put("id", id).put("text", node.text?.toString()?.take(300) ?: "").put("label", node.contentDescription?.toString()?.take(300) ?: "")
                .put("clickable", node.isClickable).put("editable", node.isEditable).put("bounds", JSONArray(listOf(bounds.left,bounds.top,bounds.right,bounds.bottom))))
            val childClip = if (node.isScrollable) bounds else clip
            for (i in 0 until node.childCount) node.getChild(i)?.let { child -> try { visit(child, depth + 1, childClip) } finally { child.recycle() } }
        }
        try { visit(root, 0, windowBounds); return JSONObject().put("package", root.packageName?.toString()).put("nodes", items) } finally { root.recycle() }
    }
    fun nodeAction(id: Int, text: String?): Boolean {
        check(taskActive) { "Phone task stopped." }
        val node = nodes[id] ?: error("Inspect the screen again before using this node.")
        check(node.refresh() && node.isVisibleToUser && !node.isPassword) { "Screen changed or this field is protected. Inspect again." }
        val bounds = Rect();node.getBoundsInScreen(bounds);check(!bounds.isEmpty) { "This control is off screen. Scroll and inspect again." }
        return if (text == null) node.performAction(AccessibilityNodeInfo.ACTION_CLICK) else {
            require(text.length <= 4000 && node.isEditable) { "Choose an editable field and text under 4000 characters." }
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) })
        }
    }
    fun navigate(action: String): Boolean {
        check(taskActive) { "Phone task stopped." }
        return performGlobalAction(when(action) { "back" -> GLOBAL_ACTION_BACK; "home" -> GLOBAL_ACTION_HOME; "recents" -> GLOBAL_ACTION_RECENTS; else -> error("Unknown navigation action.") })
    }
    fun swipe(direction: String, complete: (Boolean) -> Unit) {
        check(taskActive) { "Phone task stopped." }
        val w = resources.displayMetrics.widthPixels.toFloat(); val h = resources.displayMetrics.heightPixels.toFloat()
        val path = Path(); when(direction) {
            "up" -> { path.moveTo(w*.5f,h*.75f);path.lineTo(w*.5f,h*.3f) }; "down" -> { path.moveTo(w*.5f,h*.3f);path.lineTo(w*.5f,h*.75f) }
            "left" -> { path.moveTo(w*.8f,h*.5f);path.lineTo(w*.2f,h*.5f) }; "right" -> { path.moveTo(w*.2f,h*.5f);path.lineTo(w*.8f,h*.5f) }
            else -> error("Unknown swipe direction.")
        }
        if (!dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path,0,350)).build(), object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) { complete(true) }
            override fun onCancelled(gestureDescription: GestureDescription?) { complete(false) }
        }, null)) complete(false)
    }
}
