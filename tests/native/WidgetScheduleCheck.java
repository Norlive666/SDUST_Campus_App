import com.sdust.shst.widget.WidgetSchedule;
import com.sdust.shst.notification.NotificationContent;
import java.util.Arrays;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.TimeZone;

public class WidgetScheduleCheck {
    private static int checks;
    static Calendar date(String zone, int year, int month, int day) {
        Calendar calendar = new GregorianCalendar(TimeZone.getTimeZone(zone));
        calendar.clear(); calendar.set(year, month - 1, day, 12, 0, 0); return calendar;
    }
    static void equal(Object actual, Object expected) {
        checks++; if (!actual.equals(expected)) throw new AssertionError("Expected " + expected + ", got " + actual);
    }
    public static void main(String[] args) {
        equal(WidgetSchedule.week("2026-10-12", 7, date("Asia/Shanghai", 2026, 10, 18)), 7);
        equal(WidgetSchedule.week("2026-10-12", 7, date("Asia/Shanghai", 2026, 10, 19)), 8);
        equal(WidgetSchedule.week("2026-10-12", 7, date("Asia/Shanghai", 2026, 10, 26)), 9);
        equal(WidgetSchedule.week("2026-12-28", 7, date("Asia/Shanghai", 2027, 1, 4)), 8);
        equal(WidgetSchedule.week("2026-03-02", 3, date("America/New_York", 2026, 3, 9)), 4);
        equal(WidgetSchedule.week("2026-10-12", 25, date("Asia/Shanghai", 2026, 10, 19)), 25);
        equal(WidgetSchedule.week("2026-10-12", 1, date("Asia/Shanghai", 2026, 10, 5)), 1);
        equal(WidgetSchedule.week("2026-02-30", 7, date("Asia/Shanghai", 2026, 10, 19)), 0);
        equal(WidgetSchedule.week("2026-10-18", 7, date("Asia/Shanghai", 2026, 10, 19)), 0);
        equal(WidgetSchedule.week("", 7, date("Asia/Shanghai", 2026, 10, 19)), 0);
        equal(WidgetSchedule.week("2026-10-12", 26, date("Asia/Shanghai", 2026, 10, 19)), 0);
        WidgetSchedule.Course afternoon = new WidgetSchedule.Course("下午", "J1", 0, 3, Arrays.asList(8));
        WidgetSchedule.Course morning = new WidgetSchedule.Course("上午", "J2", 0, 0, Arrays.asList(8));
        WidgetSchedule.Course oldWeek = new WidgetSchedule.Course("非本周", "J3", 0, 1, Arrays.asList(7));
        WidgetSchedule.Course tuesday = new WidgetSchedule.Course("周二", "J4", 1, 1, Arrays.asList(8));
        List<WidgetSchedule.Course> today = WidgetSchedule.today(Arrays.asList(afternoon, tuesday, oldWeek, morning), 8, date("Asia/Shanghai", 2026, 10, 19));
        equal(today.size(), 2); equal(today.get(0).name, "上午"); equal(today.get(1).name, "下午");
        equal(WidgetSchedule.firstUpcoming(today, 480), 0);
        equal(WidgetSchedule.firstUpcoming(today, 590), 1);
        equal(WidgetSchedule.firstUpcoming(today, 1100), 2);
        equal(WidgetSchedule.today(Arrays.asList(morning), 8, date("Asia/Shanghai", 2026, 10, 20)).size(), 0);
        equal(new NotificationContent(today, 420).title, "上午");
        equal(new NotificationContent(today, 500).title, "上午");
        equal(new NotificationContent(today, 590).title, "下午");
        equal(new NotificationContent(today, 1400).title, "今日课程已结束");
        equal(new NotificationContent(java.util.Collections.emptyList(), 480).title, "今天没有课程");
        equal(new NotificationContent(today, 1400).expanded.contains("上午"), true);
        equal(new NotificationContent(today, 420).subtitle, WidgetSchedule.TIMES[0] + " · J2");
        WidgetSchedule.Course noRoom = new WidgetSchedule.Course("未排教室", "", 0, 0, Arrays.asList(8));
        equal(new NotificationContent(Arrays.asList(noRoom), 420).subtitle.endsWith("教室待定"), true);
        equal(new NotificationContent(java.util.Collections.nCopies(15, morning), 420).expanded.contains("还有更多课程"), true);
        equal(WidgetSchedule.cacheCurrent("2027-03-01", date("Asia/Shanghai", 2027, 2, 28)), true);
        equal(WidgetSchedule.cacheCurrent("2027-03-01", date("Asia/Shanghai", 2027, 3, 1)), false);
        equal(WidgetSchedule.cacheCurrent("2027-08-01", date("Asia/Shanghai", 2028, 1, 1)), false);
        equal(WidgetSchedule.cacheCurrent("2027-02-30", date("Asia/Shanghai", 2027, 2, 28)), false);
        equal(WidgetSchedule.cacheCurrent("2026-08-31", "2027-02-22", date("Asia/Shanghai", 2026, 8, 1)), false);
        equal(WidgetSchedule.cacheCurrent("2026-08-31", "2027-02-22", date("Asia/Shanghai", 2026, 12, 31)), true);
        equal(WidgetSchedule.cacheCurrent("2026-08-31", "2027-02-22", date("Asia/Shanghai", 2027, 2, 22)), false);
        System.out.println("Widget schedule: " + checks + " checks passed");
    }
}
