package com.dwijkansagara.karbs.portable

import android.app.Activity
import android.content.Context
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
import app.tauri.JSObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.Locale

@Keep @InvokeArg class KeyArgs { var value: String = "" }
@Keep @InvokeArg class SpeechArgs { var text: String = "" }
@Keep @InvokeArg class FileArgs { var path: String = "" }
@Keep @TauriPlugin
class KarbsPlatformPlugin(private val activity: Activity): Plugin(activity) {
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
