package com.sdust.shst;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.sdust.shst.widget.TimetableWidgetProvider;
import com.sdust.shst.widget.WidgetSnapshot;

@CapacitorPlugin(name = "TimetableWidget")
public class TimetableWidgetPlugin extends Plugin {
    @PluginMethod public void update(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null || snapshot.toString().length() > 400000) { call.reject("Invalid widget data"); return; }
        boolean saved = WidgetSnapshot.prefs(getContext()).edit().putString("snapshot", snapshot.toString()).commit();
        if (!saved) { call.reject("Unable to save widget data"); return; }
        TimetableWidgetProvider.refreshAll(getContext());
        call.resolve();
    }
    @PluginMethod public void pin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            try {
                AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
                boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.isRequestPinAppWidgetSupported();
                result.put("supported", supported);
                result.put("requested", supported && manager.requestPinAppWidget(new ComponentName(getContext(), TimetableWidgetProvider.class), null, null));
                call.resolve(result);
            } catch (Exception e) { call.reject("Unable to request widget"); }
        });
    }
}
