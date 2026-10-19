package com.sdust.shst.widget;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.TimeZone;

/** Calendar calculations are independent of WebView/process lifetime. */
public final class WidgetSchedule {
    private WidgetSchedule() {}
    public static final String[] TIMES = {"08:00–09:50", "10:10–12:00", "14:00–15:50", "16:10–18:00", "19:00–20:50"};
    public static final int[] ENDS = {590, 720, 950, 1080, 1250};
    public static final int[] STARTS = {480, 610, 840, 970, 1140};
    public static final class Course {
        public final String name, room;
        public final int day, section;
        public final List<Integer> weeks;
        public Course(String name, String room, int day, int section, List<Integer> weeks) {
            this.name = name; this.room = room; this.day = day; this.section = section; this.weeks = weeks;
        }
    }
    private static long dayNumber(int year, int month, int day) {
        Calendar utc = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        utc.clear(); utc.setLenient(false); utc.set(year, month - 1, day);
        return utc.getTimeInMillis() / 86400000L;
    }
    public static int week(String monday, int anchorWeek, Calendar now) {
        if (anchorWeek < 1 || anchorWeek > 25 || monday == null || !monday.matches("\\d{4}-\\d{2}-\\d{2}")) return 0;
        try {
            String[] parts = monday.split("-");
            int y = Integer.parseInt(parts[0]), m = Integer.parseInt(parts[1]), d = Integer.parseInt(parts[2]);
            long anchor = dayNumber(y, m, d);
            Calendar check = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
            check.setTimeInMillis(anchor * 86400000L);
            if (check.get(Calendar.DAY_OF_WEEK) != Calendar.MONDAY) return 0;
            long today = dayNumber(now.get(Calendar.YEAR), now.get(Calendar.MONTH) + 1, now.get(Calendar.DAY_OF_MONTH));
            int weekday = (now.get(Calendar.DAY_OF_WEEK) + 5) % 7;
            long elapsed = (today - weekday - anchor) / 7L;
            return (int) Math.max(1, Math.min(25, anchorWeek + elapsed));
        } catch (RuntimeException e) { return 0; }
    }
    public static List<Course> today(List<Course> courses, int week, Calendar now) {
        int day = (now.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        List<Course> result = new ArrayList<>();
        for (Course course : courses) {
            if (course.day == day && course.section >= 0 && course.section < TIMES.length && course.weeks.contains(week)) result.add(course);
        }
        Collections.sort(result, new Comparator<Course>() {
            @Override public int compare(Course first, Course second) { return Integer.compare(first.section, second.section); }
        });
        return result;
    }
    public static int firstUpcoming(List<Course> courses, int minute) {
        for (int i = 0; i < courses.size(); i++) if (ENDS[courses.get(i).section] > minute) return i;
        return courses.size();
    }
}
