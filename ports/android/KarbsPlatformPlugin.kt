package com.dwijkansagara.karbs.portable

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import android.provider.Settings
import android.os.Handler
import android.os.Looper
import android.app.AlertDialog
import android.widget.EditText
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebView
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.speech.tts.TextToSpeech
import android.util.Base64
import android.net.Uri
import android.provider.OpenableColumns
import androidx.annotation.Keep
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.Locale
import org.json.JSONObject

@Keep @InvokeArg class KeyArgs { var value: String = "" }
@Keep @InvokeArg class SpeechArgs { var text: String = "" }
@Keep @InvokeArg class FileArgs { var path: String = "" }
@Keep @InvokeArg class OverlayArgs { var text: String = "Karbs · Ready"; var working: Boolean = false }
@Keep @InvokeArg class PhoneArgs { var action: String = ""; var args: String = "{}"; var active: Boolean = false }
@Keep @TauriPlugin
class KarbsPlatformPlugin(private val activity: Activity): Plugin(activity) {
    @Command fun displayFrame(invoke: Invoke) {
        activity.runOnUiThread {
            val decor = activity.window.decorView
            if (Build.VERSION.SDK_INT >= 30) activity.window.insetsController?.setSystemBarsAppearance(0, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS)
            else decor.systemUiVisibility = decor.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv() and (if (Build.VERSION.SDK_INT >= 26) View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv() else -1)
            fun find(view: View): WebView? { if (view is WebView) return view; if (view is ViewGroup) for (i in 0 until view.childCount) find(view.getChildAt(i))?.let { return it }; return null }
            val web = find(decor); val location = IntArray(2); web?.getLocationOnScreen(location)
            val insets = decor.rootWindowInsets
            val top = if (Build.VERSION.SDK_INT >= 30) insets?.getInsets(WindowInsets.Type.systemBars())?.top ?: 0 else insets?.systemWindowInsetTop ?: 0
            val bottom = if (Build.VERSION.SDK_INT >= 30) insets?.getInsets(WindowInsets.Type.systemBars())?.bottom ?: 0 else insets?.systemWindowInsetBottom ?: 0
            val bounds = if (Build.VERSION.SDK_INT >= 30) activity.windowManager.currentWindowMetrics.bounds else { val metrics = android.util.DisplayMetrics(); activity.windowManager.defaultDisplay.getRealMetrics(metrics); android.graphics.Rect(0,0,metrics.widthPixels,metrics.heightPixels) }
            val density = activity.resources.displayMetrics.density
            val result = JSObject();result.put("top", if(web == null) 0 else (bounds.top + top - location[1]).coerceAtLeast(0)/density);result.put("bottom", if(web == null) 0 else (location[1] + web.height - bounds.bottom + bottom).coerceAtLeast(0)/density);invoke.resolve(result)
        }
    }
    @Command fun phoneStatus(invoke: Invoke) { val result = JSObject(); result.put("enabled", KarbsAccessibilityService.instance != null); invoke.resolve(result) }
    @Command fun phonePermission(invoke: Invoke) { activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); invoke.resolve(JSObject()) }
    @Command fun testPhone(invoke: Invoke) {
        activity.runOnUiThread {
            val service = KarbsAccessibilityService.instance
            if (service == null || service.taskActive) { invoke.reject("Enable Phone Assist and wait for any active task to finish."); return@runOnUiThread }
            service.taskActive = true
            val input = EditText(activity).apply { hint = "Phone Assist test field" }
            var clicked = false
            val dialog = AlertDialog.Builder(activity, android.R.style.Theme_Material_Dialog_Alert).setTitle("Karbs Phone Assist test").setMessage("Testing this dialog only. No content is sent to Gemini.").setView(input).setPositiveButton("Finish test") { _, _ -> clicked = true }.setCancelable(false).create()
            fun finish(error: String?) {
                service.taskActive = false; dialog.dismiss()
                try { activity.packageManager.getLaunchIntentForPackage(activity.packageName)?.let { activity.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)) } } catch (_: Exception) {}
                if (error == null) { val result = JSObject(); result.put("ok", true); invoke.resolve(result) } else invoke.reject(error)
            }
            dialog.show();dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
            Handler(Looper.getMainLooper()).postDelayed({ try {
                val nodes = service.inspect().getJSONArray("nodes")
                val items = (0 until nodes.length()).map { nodes.getJSONObject(it) }
                val field = items.firstOrNull { it.optBoolean("editable") } ?: error("The test text field is not accessible.")
                check(service.nodeAction(field.getInt("id"), "Karbs test") && input.text.toString() == "Karbs test") { "Android did not allow text entry." }
                val button = items.firstOrNull { it.optString("text").equals("Finish test", true) } ?: error("The test button is not accessible.")
                check(service.nodeAction(button.getInt("id"), null)) { "Android did not allow the test click." }
                // AlertDialog dispatches its button listener through a Handler.
                // Let that callback run before checking its observable result.
                Handler(Looper.getMainLooper()).postDelayed({ try {
                    check(clicked) { "Android did not deliver the test click." }
                    check(service.navigate("home")) { "Android did not allow Home navigation." }
                    Handler(Looper.getMainLooper()).postDelayed({ try {
                        val screen = service.inspect();check(screen.getJSONArray("nodes").length() > 0 && screen.optString("package") != activity.packageName) { "The home screen is unavailable to Phone Assist." };finish(null)
                    } catch(e: Exception) { finish(e.message ?: "Phone Assist home inspection failed.") } }, 700)
                } catch(e: Exception) { finish(e.message ?: "Phone Assist click verification failed.") } }, 250)
            } catch(e: Exception) { finish(e.message ?: "Phone Assist test failed.") } }, 700)
        }
    }
    @Command fun phoneTask(invoke: Invoke) {
        val active = invoke.parseArgs(PhoneArgs::class.java).active
        activity.runOnUiThread { val service = KarbsAccessibilityService.instance; if (active && service == null) invoke.reject("Enable Karbs Phone Assist in Android Accessibility settings first.") else { service?.taskActive = active; invoke.resolve(JSObject()) } }
    }
    @Command fun phoneAction(invoke: Invoke) {
        val request = invoke.parseArgs(PhoneArgs::class.java)
        activity.runOnUiThread { try {
            val service = KarbsAccessibilityService.instance ?: error("Phone Assist is not enabled.")
            check(service.taskActive) { "Phone control is not enabled for an active task." }
            val args = JSONObject(request.args)
            fun finish(ok: Boolean) { val result = JSObject(); result.put("ok", ok); invoke.resolve(result) }
            when(request.action) {
                "inspect_screen" -> { val result = JSObject(); result.put("screen", service.inspect()); invoke.resolve(result) }
                "click_node" -> finish(service.nodeAction(args.getInt("id"), null))
                "type_text" -> finish(service.nodeAction(args.getInt("id"), args.getString("text")))
                "navigate" -> finish(service.navigate(args.getString("direction")))
                "swipe" -> service.swipe(args.getString("direction")) { finish(it) }
                "open_url" -> { val uri = Uri.parse(args.getString("url")); require(uri.scheme in listOf("https","http") && !uri.host.isNullOrEmpty()); activity.startActivity(Intent(Intent.ACTION_VIEW, uri)); finish(true) }
                "list_apps" -> { val apps = org.json.JSONArray(); val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER); activity.packageManager.queryIntentActivities(intent, 0).take(150).forEach { apps.put(JSONObject().put("name", it.loadLabel(activity.packageManager).toString()).put("package", it.activityInfo.packageName)) }; val result = JSObject(); result.put("apps", apps); invoke.resolve(result) }
                "open_app" -> { val launch = activity.packageManager.getLaunchIntentForPackage(args.getString("package")) ?: error("This app has no launchable activity."); activity.startActivity(launch); finish(true) }
                else -> error("Unknown phone action.")
            }
        } catch (e: Exception) { invoke.reject(e.message ?: "Phone action failed.") } }
    }
    @Command fun overlayStatus(invoke: Invoke) { val result = JSObject(); result.put("allowed", Settings.canDrawOverlays(activity)); result.put("running", KarbsOverlayService.instance != null); invoke.resolve(result) }
    @Command fun overlayPermission(invoke: Invoke) { activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + activity.packageName))); invoke.resolve(JSObject()) }
    @Command fun showOverlay(invoke: Invoke) {
        if (!Settings.canDrawOverlays(activity)) { invoke.reject("Allow Display over other apps in Android settings first."); return }
        activity.runOnUiThread { try {
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7300)
            val intent = Intent(activity, KarbsOverlayService::class.java); if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent); invoke.resolve(JSObject())
        } catch (_: Exception) { invoke.reject("Android could not start the floating bar. Reopen Karbs and try again.") } }
    }
    @Command fun hideOverlay(invoke: Invoke) { activity.stopService(Intent(activity, KarbsOverlayService::class.java)); invoke.resolve(JSObject()) }
    @Command fun updateOverlay(invoke: Invoke) { val args = invoke.parseArgs(OverlayArgs::class.java); activity.runOnUiThread { KarbsOverlayService.instance?.updateStatus(args.text, args.working); invoke.resolve(JSObject()) } }
    private val preferences = activity.getSharedPreferences("karbs-secure", Context.MODE_PRIVATE)
    private val alias = "karbs-gemini-key"
    private var ready = false
    private var tts: TextToSpeech? = null
    init { tts = TextToSpeech(activity) { status -> ready = status == TextToSpeech.SUCCESS; if (ready) tts?.language = Locale.getDefault() } }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        }.generateKey()
    }
    @Command fun saveKey(invoke: Invoke) {
        try { val value = invoke.parseArgs(KeyArgs::class.java).value
            require(value.length in 1..4096)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            val data = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
            if (!preferences.edit().putString("key", data).commit()) throw IllegalStateException()
            invoke.resolve(JSObject())
        } catch (_: Exception) { invoke.reject("Cannot save the encrypted key on this device.") }
    }
    @Command fun readKey(invoke: Invoke) {
        try { val data = preferences.getString("key", null)
            val value = if (data == null) "" else { val parts = data.split(":", limit = 2); require(parts.size == 2); val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))) }; String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8) }
            val result = JSObject(); result.put("value", value); invoke.resolve(result)
        } catch (_: Exception) { invoke.reject("Cannot decrypt the saved key. Remove it and reconnect.") }
    }
    @Command fun clearKey(invoke: Invoke) {
        if (preferences.edit().remove("key").commit()) invoke.resolve(JSObject()) else invoke.reject("Cannot remove the saved key.")
    }
    @Command fun speak(invoke: Invoke) {
        val text = invoke.parseArgs(SpeechArgs::class.java).text
        if (!ready || text.length > 20000) { invoke.reject("System speech is unavailable or is still starting."); return }
        if (tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "karbs-reply") == TextToSpeech.ERROR) invoke.reject("The device speech engine could not play this reply.") else invoke.resolve(JSObject())
    }
    @Command fun stopSpeech(invoke: Invoke) { tts?.stop(); invoke.resolve(JSObject()) }
    @Command fun fileName(invoke: Invoke) {
        try { val uri = Uri.parse(invoke.parseArgs(FileArgs::class.java).path)
            var name: String? = null
            if (uri.scheme == "content") activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) name = cursor.getString(0) }
            if (name == null) name = uri.lastPathSegment
            val result = JSObject(); result.put("name", name ?: "attachment"); invoke.resolve(result)
        } catch (_: Exception) { invoke.reject("Cannot read the selected filename.") }
    }
}
