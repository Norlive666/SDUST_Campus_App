package com.sdust.shst;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.sdust.shst.notification.TimetableNotification;
import com.sdust.shst.widget.TimetableWidgetProvider;
import com.sdust.shst.widget.WidgetSnapshot;

@CapacitorPlugin(name = "TimetableNotification", permissions = {
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class TimetableNotificationPlugin extends Plugin {
    private boolean requesting;
    private JSObject state() {
        JSObject result = new JSObject();
        result.put("enabled", TimetableNotification.enabled(getContext()));
        result.put("allowed", TimetableNotification.allowed(getContext()));
        return result;
    }
    @PluginMethod public void status(PluginCall call) { call.resolve(state()); }
    @PluginMethod public void configure(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Missing enabled flag"); return; }
        if (!WidgetSnapshot.prefs(getContext()).edit().putBoolean("notification_enabled", enabled).commit()) {
            call.reject("Unable to save preference"); return;
        }
        if (enabled) initialize(call); else finish(call);
    }
    @PluginMethod public void initialize(PluginCall call) {
        WidgetSnapshot snapshot = WidgetSnapshot.read(getContext());
        boolean asked = WidgetSnapshot.prefs(getContext()).getBoolean("notification_permission_asked", false);
        // A manual enable can retry; automatic startup asks only once after course sync.
        boolean manual = Boolean.TRUE.equals(call.getBoolean("enabled"));
        if (TimetableNotification.enabled(getContext()) && snapshot.loggedIn && (snapshot.hasCache || manual)) {
            TimetableNotification.createChannel(getContext());
            if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED
                    && (!asked || manual) && !requesting) {
                WidgetSnapshot.prefs(getContext()).edit().putBoolean("notification_permission_asked", true).apply();
                requesting = true;
                requestPermissionForAlias("notifications", call, "notificationPermissionResult");
                return;
            }
        }
        finish(call);
    }
    @PermissionCallback private void notificationPermissionResult(PluginCall call) {
        requesting = false;
        finish(call);
    }
    private void finish(PluginCall call) {
        TimetableWidgetProvider.refreshAll(getContext());
        call.resolve(state());
    }
    @PluginMethod public void openSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 26) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, TimetableNotification.CHANNEL);
            TimetableNotification.createChannel(getContext());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        }
        try { getActivity().startActivity(intent); call.resolve(); }
        catch (Exception error) { call.reject("Unable to open notification settings"); }
    }
    @PluginMethod public void consumeOpen(PluginCall call) {
        Intent intent = getActivity().getIntent();
        boolean open = intent != null && intent.getBooleanExtra("open_timetable", false);
        if (open) intent.removeExtra("open_timetable");
        JSObject result = new JSObject(); result.put("open", open); call.resolve(result);
    }
}
