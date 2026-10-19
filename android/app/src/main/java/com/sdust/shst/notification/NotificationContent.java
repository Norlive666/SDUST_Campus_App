package com.sdust.shst.notification;

import com.sdust.shst.widget.WidgetSchedule;
import java.util.List;

/** Plain Java presentation model, shared by native rendering and schedule checks. */
public final class NotificationContent {
    public final String title, subtitle, expanded;
    public NotificationContent(List<WidgetSchedule.Course> courses, int minute) {
        int first = WidgetSchedule.firstUpcoming(courses, minute);
        title = courses.isEmpty() ? "今天没有课程" : first == courses.size() ? "今日课程已结束" : courses.get(first).name;
        subtitle = first < courses.size() ? detail(courses.get(first)) : "点击查看课表";
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < Math.min(courses.size(), 12); i++) {
            if (i > 0) text.append("\n\n");
            text.append(courses.get(i).name).append("\n").append(detail(courses.get(i)));
        }
        if (courses.size() > 12) text.append("\n还有更多课程，点击查看全部");
        if (courses.isEmpty()) text.append("今天没有课程，安排自己的节奏吧");
        expanded = text.toString();
    }
    private static String detail(WidgetSchedule.Course course) {
        return WidgetSchedule.TIMES[course.section] + " · " + (course.room.isEmpty() ? "教室待定" : course.room);
    }
}
