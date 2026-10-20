package com.sdust.shst.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import com.sdust.shst.MainActivity;
import com.sdust.shst.R;
import com.sdust.shst.notification.TimetableNotification;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

public class TimetableWidgetProvider extends AppWidgetProvider {
    private static final String REFRESH = "com.sdust.shst.widget.REFRESH";
    private static PendingIntent refreshIntent(Context context) {
        Intent intent = new Intent(context, TimetableWidgetProvider.class).setAction(REFRESH);
        return PendingIntent.getBroadcast(context, 40, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TimetableWidgetProvider.class));
        for (int id : ids) render(context, manager, id);
        boolean notificationActive = TimetableNotification.refresh(context);
        schedule(context, ids.length > 0 || notificationActive);
    }
    private static void schedule(Context context, boolean enabled) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent intent = refreshIntent(context);
        if (!enabled) { alarms.cancel(intent); return; }
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_MONTH, 1); next.set(Calendar.HOUR_OF_DAY, 0); next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 5); next.set(Calendar.MILLISECOND, 0);
        long target = next.getTimeInMillis();
        Calendar now = Calendar.getInstance();
        for (int minute : WidgetSchedule.STARTS) target = nextBoundary(now, minute, target);
        for (int minute : WidgetSchedule.ENDS) target = nextBoundary(now, minute, target);
        // Inexact alarm, no exact-alarm or background location permission required.
        alarms.set(AlarmManager.RTC, target, intent);
    }
    private static long nextBoundary(Calendar now, int minute, long current) {
        Calendar boundary = (Calendar) now.clone();
        boundary.set(Calendar.HOUR_OF_DAY, minute / 60); boundary.set(Calendar.MINUTE, minute % 60);
        boundary.set(Calendar.SECOND, 5); boundary.set(Calendar.MILLISECOND, 0);
        long value = boundary.getTimeInMillis();
        return value > now.getTimeInMillis() ? Math.min(value, current) : current;
    }
    private static void render(Context context, AppWidgetManager manager, int id) {
        WidgetSnapshot snapshot = WidgetSnapshot.read(context);
        Calendar now = Calendar.getInstance();
        snapshot.hasCache = snapshot.hasCache && WidgetSchedule.cacheCurrent(snapshot.validFrom, snapshot.validUntil, now);
        int week = WidgetSchedule.week(snapshot.monday, snapshot.anchorWeek, now);
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.widget_timetable);
        String date = new SimpleDateFormat("M月d日 EEEE", Locale.SIMPLIFIED_CHINESE).format(now.getTime());
        view.setTextViewText(R.id.widget_date, date + (week > 0 ? " · 第" + week + "周" : ""));
        Intent launch = new Intent(context, MainActivity.class).setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent open = PendingIntent.getActivity(context, 41, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        view.setOnClickPendingIntent(R.id.widget_root, open);
        view.setOnClickPendingIntent(R.id.widget_refresh, refreshIntent(context));
        view.removeAllViews(R.id.widget_courses);
        String empty = !snapshot.loggedIn ? "点击打开应用，登录后同步课表" : !snapshot.hasCache ? "点击打开应用，同步课表后即可显示" : week == 0 ? "请打开应用，校准当前教学周" : "今天没有课程，享受自己的时间";
        List<WidgetSchedule.Course> courses = WidgetSchedule.today(snapshot.courses, week, now);
        boolean show = snapshot.loggedIn && snapshot.hasCache && week > 0 && !courses.isEmpty();
        view.setViewVisibility(R.id.widget_empty, show ? View.GONE : View.VISIBLE);
        view.setViewVisibility(R.id.widget_courses, show ? View.VISIBLE : View.GONE);
        view.setTextViewText(R.id.widget_empty, empty);
        String footer = "点击打开山科小站";
        if (show) {
            Bundle options = manager.getAppWidgetOptions(id);
            int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 250);
            int count = Math.max(1, Math.min(5, (height - 92) / 48));
            int minute = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
            int first = WidgetSchedule.firstUpcoming(courses, minute);
            boolean finished = first == courses.size();
            int start = finished ? Math.max(0, courses.size() - count) : first;
            int end = Math.min(courses.size(), start + count);
            for (int i = start; i < end; i++) {
                WidgetSchedule.Course course = courses.get(i);
                RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_course_row);
                row.setTextViewText(R.id.widget_course_name, course.name);
                row.setTextViewText(R.id.widget_course_time, WidgetSchedule.TIMES[course.section]);
                row.setTextViewText(R.id.widget_course_room, course.room.isEmpty() ? "教室待定" : course.room);
                view.addView(R.id.widget_courses, row);
            }
            footer = finished ? "今日课程已结束 · 点击查看" : end < courses.size() ? "还有" + (courses.size() - end) + "节 · 点击查看全部" : "今天共" + courses.size() + "节 · 使用已同步课表";
        }
        view.setTextViewText(R.id.widget_footer, footer);
        manager.updateAppWidget(id, view);
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { refreshAll(context); }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) { render(context, manager, id); }
    @Override public void onEnabled(Context context) { refreshAll(context); }
    @Override public void onDisabled(Context context) { refreshAll(context); }
    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (REFRESH.equals(action) || Intent.ACTION_DATE_CHANGED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action)
            || Intent.ACTION_TIMEZONE_CHANGED.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) refreshAll(context);
    }
}
