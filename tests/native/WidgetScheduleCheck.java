import com.sdust.shst.widget.WidgetSchedule;
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
        System.out.println("Widget schedule: " + checks + " checks passed");
    }
}
