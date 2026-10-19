package com.sdust.shst.notification;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.sdust.shst.MainActivity;
import com.sdust.shst.R;
import com.sdust.shst.widget.WidgetSchedule;
import com.sdust.shst.widget.WidgetSnapshot;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/** Local cached schedule only. Never requests school credentials or network access. */
public final class TimetableNotification {
    public static final String CHANNEL = "daily_timetable";
    private static final int ID = 1601;
    public static boolean enabled(Context context) {
        return WidgetSnapshot.prefs(context).getBoolean("notification_enabled", true);
    }
    public static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "锁屏今日课表", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("显示今日课程、上课时间和教室，静默更新");
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
    public static boolean allowed(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = context.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL);
            return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        return true;
    }
    /** Returns whether future date/course-boundary refreshes are needed, even without a desktop widget. */
    public static boolean refresh(Context context) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        WidgetSnapshot snapshot = WidgetSnapshot.read(context);
        Calendar now = Calendar.getInstance();
        int week = WidgetSchedule.week(snapshot.monday, snapshot.anchorWeek, now);
        if (!enabled(context) || !snapshot.loggedIn || !snapshot.hasCache || week == 0 || !allowed(context)) {
            manager.cancel(ID);
            return false;
        }
        createChannel(context);
        List<WidgetSchedule.Course> courses = WidgetSchedule.today(snapshot.courses, week, now);
        int minute = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        NotificationContent content = new NotificationContent(courses, minute);
        String date = new SimpleDateFormat("M月d日 EEEE", Locale.SIMPLIFIED_CHINESE).format(now.getTime());
        Intent launch = new Intent(context, MainActivity.class).setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER).putExtra("open_timetable", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent open = PendingIntent.getActivity(context, 1601, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification_timetable).setColor(0xFF7965AF)
            .setContentTitle(content.title).setContentText(content.subtitle).setSubText("今日课表")
            .setStyle(new NotificationCompat.BigTextStyle().setBigContentTitle("今日 " + courses.size() + " 节课")
                .bigText(content.expanded).setSummaryText(date + " · 第" + week + "周"))
            .setContentIntent(open).setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_STATUS).setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setSilent(true).setOnlyAlertOnce(true).setShowWhen(false).setOngoing(true).setAutoCancel(false)
            .build();
        try { manager.notify(ID, notification); return true; }
        catch (SecurityException denied) { manager.cancel(ID); return false; }
    }
}
