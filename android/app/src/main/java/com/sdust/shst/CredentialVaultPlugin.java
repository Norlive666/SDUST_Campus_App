package com.sdust.shst;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "CredentialVault")
public class CredentialVaultPlugin extends Plugin {
    private static final String KEY_ALIAS = "sdust.login.v1";
    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("sdust_credentials", Context.MODE_PRIVATE);
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < 23) { call.reject("Secure credential storage requires Android 6 or later"); return; }
        try {
            String account = call.getString("account");
            String password = call.getString("password");
            if (account == null || password == null) { call.reject("Missing credentials"); return; }
            JSONObject value = new JSONObject().put("account", account).put("password", password);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String encrypted = Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            boolean saved = prefs().edit().putString("data", encrypted)
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).commit();
            if (!saved) { call.reject("Unable to save credentials"); return; }
            call.resolve();
        } catch (Exception e) { call.reject("Unable to save credentials"); }
    }
    @PluginMethod
    public void read(PluginCall call) {
        if (Build.VERSION.SDK_INT < 23) { call.resolve(new JSObject()); return; }
        String data = prefs().getString("data", null);
        String iv = prefs().getString("iv", null);
        if (data == null || iv == null) { call.resolve(new JSObject()); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            JSONObject value = new JSONObject(new String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), StandardCharsets.UTF_8));
            JSObject result = new JSObject();
            result.put("account", value.getString("account"));
            result.put("password", value.getString("password"));
            call.resolve(result);
        } catch (Exception e) {
            // Restored backups cannot decrypt with a different device's key.
            prefs().edit().clear().commit();
            call.resolve(new JSObject());
        }
    }
    @PluginMethod
    public void clear(PluginCall call) {
        if (prefs().edit().clear().commit()) call.resolve();
        else call.reject("Unable to clear credentials");
    }
    @PluginMethod
    public void openUrl(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || urlString.isEmpty()) {
            call.reject("Missing url");
            return;
        }
        try {
            Uri uri = Uri.parse(urlString);
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open url: " + e.getMessage());
        }
    }
}
