package com.sdust.shst;

import android.os.Bundle;
import android.content.Intent;
import com.sdust.shst.widget.TimetableWidgetProvider;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CredentialVaultPlugin.class);
        registerPlugin(TimetableWidgetPlugin.class);
        registerPlugin(TimetableNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
    @Override public void onResume() {
        super.onResume();
        TimetableWidgetProvider.refreshAll(this);
    }
    @Override protected void onNewIntent(Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
        if (intent.getBooleanExtra("open_timetable", false) && getBridge() != null) {
            getBridge().triggerWindowJSEvent("timetable-notification-open");
        }
    }
}
