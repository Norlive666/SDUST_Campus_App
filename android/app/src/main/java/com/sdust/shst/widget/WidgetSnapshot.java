package com.sdust.shst.widget;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public final class WidgetSnapshot {
    private static final String PREFS = "sdust_widget";
    public boolean loggedIn, hasCache;
    public String monday = "";
    public int anchorWeek;
    public final List<WidgetSchedule.Course> courses = new ArrayList<>();
    public static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    public static WidgetSnapshot read(Context context) { return parse(prefs(context).getString("snapshot", "{}")); }
    public static WidgetSnapshot parse(String source) {
        WidgetSnapshot result = new WidgetSnapshot();
        try {
            JSONObject data = new JSONObject(source);
            result.loggedIn = data.optBoolean("loggedIn", false);
            result.hasCache = result.loggedIn && data.optBoolean("hasCache", false);
            JSONObject anchor = data.optJSONObject("weekAnchor");
            if (anchor != null) { result.monday = anchor.optString("monday", ""); result.anchorWeek = anchor.optInt("week", 0); }
            JSONArray rows = data.optJSONArray("courses");
            if (rows != null && result.hasCache) for (int i = 0; i < Math.min(rows.length(), 500); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                int day = row.optInt("day", -1), section = row.optInt("section", -1);
                if (day < 0 || day > 6 || section < 0 || section > 4) continue;
                JSONArray rawWeeks = row.optJSONArray("weeks");
                List<Integer> weeks = new ArrayList<>();
                if (rawWeeks != null) for (int n = 0; n < Math.min(rawWeeks.length(), 25); n++) {
                    int week = rawWeeks.optInt(n, 0); if (week >= 1 && week <= 25) weeks.add(week);
                }
                String name = trim(row.optString("name", ""), 80);
                if (!name.isEmpty()) result.courses.add(new WidgetSchedule.Course(name, trim(row.optString("room", ""), 60), day, section, weeks));
            }
        } catch (Exception ignored) { result.hasCache = false; }
        return result;
    }
    private static String trim(String value, int max) { return value.length() > max ? value.substring(0, max) : value; }
}
