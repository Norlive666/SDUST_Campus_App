/**
 * 山科大强智教务 HTML 解析器 (SDUST HTML Parser)
 */

export interface CourseItem {
  day: number; // 0: 周一, 1: 周二, ... 6: 周日
  section: number; // 0: 1-2节, 1: 3-4节, 2: 5-6节, 3: 7-8节, 4: 9-10节
  name: string; // 课程名
  teacher: string; // 任课教师
  classroom: string; // 教室 (如 J1-102)
  rawWeeks: string; // 原始周次字符 (如 "1-16周")
  weeks: number[]; // 适用的周次列表 [1, 2, ..., 16]
  color?: string; // 界面展示的背景色
}

export interface TimetableParseResult {
  courses: CourseItem[];
  currentTerm?: string;
  currentWeek?: number;
}

export interface StudentInfo {
  name: string;
  account: string;
  college: string;
  major: string;
  className: string;
}

export interface GradeItem {
  term: string; // 学期 如 2026-2027-1
  code: string; // 课程编号
  name: string; // 课程名称
  score: string; // 成绩 (如 92 或 优)
  credit: number; // 学分
  gpa: number; // 绩点
  type: string; // 课程属性 (必修/选修)
  examType: string; // 考核方式 (考试/考查)
  isPass: boolean; // 是否通过
}

export interface ExamItem {
  name: string; // 考试科目
  time: string; // 考试时间
  location: string; // 考场教室 (如 J7-302)
  seat: string; // 座位号
  daysLeft?: number; // 距离考试剩余天数
}

/**
 * 动态计算当天的自然教学学期与教学周（基于山科大学年校历推算）
 */
export function calculateCurrentTermAndWeek(date = new Date()): { term: string; week: number } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  let term = '';
  let termStartDate: Date;

  if (month >= 8) {
    // 秋季学期 (如 2026年9月~2027年1月 -> 2026-2027-1)
    term = `${year}-${year + 1}-1`;
    // 8月最后一周或9月第一周的周一为开学第一周
    const sept1 = new Date(year, 8, 1);
    const dayOfWeek = (sept1.getDay() + 6) % 7; // 0=Mon
    termStartDate = new Date(sept1.getTime() - dayOfWeek * 86400000);
  } else if (month <= 2) {
    // 跨年后的秋季学期末 (如 2027年1月仍属于 2026-2027-1)
    term = `${year - 1}-${year}-1`;
    const sept1 = new Date(year - 1, 8, 1);
    const dayOfWeek = (sept1.getDay() + 6) % 7;
    termStartDate = new Date(sept1.getTime() - dayOfWeek * 86400000);
  } else {
    // 春季学期 (如 2026-2027-2，通常2月下旬/3月初开学)
    term = `${year - 1}-${year}-2`;
    const march1 = new Date(year, 2, 1);
    const dayOfWeek = (march1.getDay() + 6) % 7;
    termStartDate = new Date(march1.getTime() - dayOfWeek * 86400000);
  }

  const diffTime = date.getTime() - termStartDate.getTime();
  const diffDays = Math.floor(diffTime / 86400000);
  const week = diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 1;

  return {
    term,
    week: Math.min(Math.max(week, 1), 22),
  };
}

/**
 * 解析周次格式: "1-16周", "1-15周(单)", "2-16周(双)", "5周", "1,3,5周"
 */
export function parseWeekString(weekStr: string): number[] {
  const weeks: number[] = [];
  if (!weekStr) {
    // 如果没有注明周次，默认铺满常规教学周 1-16 周
    return Array.from({ length: 16 }, (_, i) => i + 1);
  }

  const cleanStr = weekStr.replace(/周/g, '');
  const isOddOnly = cleanStr.includes('单');
  const isEvenOnly = cleanStr.includes('双');
  const segments = cleanStr.replace(/[()（）单双\[\]]/g, '').split(/[,，、]/);

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let w = start; w <= end; w++) {
          if (isOddOnly && w % 2 === 0) continue;
          if (isEvenOnly && w % 2 !== 0) continue;
          weeks.push(w);
        }
      }
    } else {
      const single = Number(trimmed);
      if (!isNaN(single) && single > 0) {
        weeks.push(single);
      }
    }
  }

  return weeks.length > 0 ? Array.from(new Set(weeks)).sort((a, b) => a - b) : Array.from({ length: 16 }, (_, i) => i + 1);
}

/**
 * 解析学生个人信息 (grxx/xsxx 或 xsMainV.htmlx)
 */
export function parseStudentInfoHtml(html: string): Partial<StudentInfo> {
  const info: Partial<StudentInfo> = {};
  if (!html) return info;

  try {
    // 1. 匹配 <input name="kkbs" value="...">
    const nameMatch = html.match(/<input[^>]*name=["']?kkbs["']?[^>]*value=["']?([^"']*)["']?/i);
    if (nameMatch && nameMatch[1]) {
      info.name = nameMatch[1].trim();
    }

    // 2. 匹配详情块: <div class="HeaderContentDetailtext">...</div>
    const detailDiv = html.match(/<div[^>]*class=["']?HeaderContentDetailtext["']?[^>]*>([\s\S]*?)<\/div>/i);
    const textContent = detailDiv ? detailDiv[1] : html;

    const academyMatch = textContent.match(/院系[:：]\s*([^\s<&]+)/);
    if (academyMatch) info.college = academyMatch[1].trim();

    const collegeMatch = textContent.match(/学院[:：]\s*([^\s<&]+)/);
    if (!info.college && collegeMatch) info.college = collegeMatch[1].trim();

    const majorMatch = textContent.match(/专业[:：]\s*([^\s<&]+)/);
    if (majorMatch) info.major = majorMatch[1].trim();

    const classMatch = textContent.match(/班级[:：]\s*([^\s<&]+)/);
    if (classMatch) info.className = classMatch[1].trim();

    const accountMatch = textContent.match(/学号[:：]\s*([0-9a-zA-Z]+)/);
    if (accountMatch) info.account = accountMatch[1].trim();

    // 备用匹配: Top1_divLoginName 格式: 张三(2022010101)
    const loginUserMatch = html.match(/id=["']?Top1_divLoginName["']?[^>]*>([^<(]+)\(?([0-9a-zA-Z]*)\)?/i);
    if (loginUserMatch) {
      if (!info.name && loginUserMatch[1]) info.name = loginUserMatch[1].trim();
      if (!info.account && loginUserMatch[2]) info.account = loginUserMatch[2].trim();
    }
  } catch (e) {
    console.warn('解析学生信息异常:', e);
  }

  return info;
}

/**
 * 课表 HTML 结构化解析
 */
export function parseTimetableHtml(html: string): TimetableParseResult {
  const courses: CourseItem[] = [];
  let currentTerm: string | undefined = undefined;
  let currentWeek: number | undefined = undefined;

  if (!html) return { courses };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. 尝试从页面中的 <select> 下拉框中解析当前选中的学期与周次
    const termSelect = doc.querySelector('select[name="xnxq01id"]') as HTMLSelectElement;
    if (termSelect) {
      const selectedOpt = termSelect.querySelector('option[selected]') as HTMLOptionElement;
      if (selectedOpt && selectedOpt.value) {
        currentTerm = selectedOpt.value;
      }
    }

    const weekSelect = doc.querySelector('select[name="zc"]') as HTMLSelectElement;
    if (weekSelect) {
      const selectedOpt = weekSelect.querySelector('option[selected]') as HTMLOptionElement;
      if (selectedOpt && selectedOpt.value) {
        const parsedW = parseInt(selectedOpt.value, 10);
        if (!isNaN(parsedW)) currentWeek = parsedW;
      }
    }

    // 2. 匹配课表主表格
    const table = doc.querySelector('#kbtable') || doc.querySelector('table');
    if (!table) return { courses, currentTerm, currentWeek };

    const rows = table.querySelectorAll('tbody tr, tr');
    let sectionIndex = 0;

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 7) return; // 节次行必须包含 7 天

      // 强智标准：第一列若包含数字/节次名称，偏移 1
      const dayOffset = cells.length > 7 ? 1 : 0;

      for (let day = 0; day < 7; day++) {
        const cell = cells[day + dayOffset];
        if (!cell) continue;

        // 策略 A: 提取强智悬浮提示列表 <ul class="qz-toolitiplists"> <li>...</li> </ul>
        const tooltipLis = cell.querySelectorAll('.qz-toolitiplists li');
        if (tooltipLis.length > 0) {
          tooltipLis.forEach((li) => {
            const rawText = li.textContent || '';
            const nameEl = li.querySelector('div') || li;
            let name = nameEl.textContent?.trim() || '';
            name = name.replace(/老师[:：].*/s, '').trim();

            const teacherMatch = rawText.match(/老师[:：]\s*([^\s;<\n]+)/);
            const teacher = teacherMatch ? teacherMatch[1].trim() : '';

            const placeMatch = rawText.match(/地点[:：]\s*([^\s;<(\n]+)/);
            let classroom = placeMatch ? placeMatch[1].replace(/[()（）]/g, '').trim() : '';

            const weekMatch = rawText.match(/时间[:：]\s*([^\s;\[<\n]+)/);
            const rawWeeks = weekMatch ? weekMatch[1].trim() : '1-16周';
            const weeks = parseWeekString(rawWeeks);

            if (name) {
              courses.push({
                day,
                section: sectionIndex,
                name,
                teacher,
                classroom,
                rawWeeks,
                weeks,
              });
            }
          });
        } else {
          // 策略 B: 提取 .kbcontent / .kbcontent1 或常规 div
          const kbItems = cell.querySelectorAll('.kbcontent, .kbcontent1, div');
          if (kbItems.length > 0) {
            kbItems.forEach((item) => {
              const text = item.innerHTML;
              if (!text || text.length < 5 || text.includes('&nbsp;')) return;

              // 按 <br> 分隔课程信息
              const lines = text
                .split(/<br\s*\/?>/i)
                .map((l) => l.replace(/<[^>]*>/g, '').trim())
                .filter(Boolean);

              if (lines.length > 0 && lines[0] && !lines[0].includes('节次')) {
                const name = lines[0];
                const teacher = lines.find((l) => l.includes('老师') || l.length <= 4 && !/\d/.test(l)) || '';
                const classroom = lines.find((l) => /[JjA-Za-z]\d+/.test(l) || l.includes('楼') || l.includes('教室') || l.includes('操场')) || '';
                const weekLine = lines.find((l) => l.includes('周') || /\d+-\d+/.test(l)) || '1-16周';

                courses.push({
                  day,
                  section: sectionIndex,
                  name,
                  teacher: teacher.replace(/老师[:：]/, ''),
                  classroom: classroom.replace(/地点[:：]/, '').replace(/[()（）]/g, ''),
                  rawWeeks: weekLine,
                  weeks: parseWeekString(weekLine),
                });
              }
            });
          }
        }
      }

      sectionIndex++;
    });
  } catch (e) {
    console.error('课表解析异常:', e);
  }

  return { courses, currentTerm, currentWeek };
}

/**
 * 成绩 HTML 解析
 */
export function parseGradesHtml(html: string): GradeItem[] {
  const grades: GradeItem[] = [];
  if (!html) return grades;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('#dataList') || doc.querySelector('table');
    if (!table) return grades;

    const rows = table.querySelectorAll('tbody tr, tr');
    rows.forEach((row) => {
      const tds = row.querySelectorAll('td');
      if (tds.length < 5) return;

      const term = tds[1]?.textContent?.trim() || '';
      if (!term || term.includes('学期') || term.includes('开课')) return;

      const code = tds[2]?.textContent?.trim() || '';
      const name = tds[3]?.textContent?.trim() || '';
      const score = tds[4]?.textContent?.trim() || '';
      const credit = parseFloat(tds[5]?.textContent?.trim() || '0') || 0;
      const gpa = parseFloat(tds[7]?.textContent?.trim() || tds[6]?.textContent?.trim() || '0') || 0;
      const type = tds[8]?.textContent?.trim() || tds[7]?.textContent?.trim() || '必修';
      const examType = tds[9]?.textContent?.trim() || '考试';

      let isPass = true;
      const numScore = parseFloat(score);
      if (!isNaN(numScore)) {
        isPass = numScore >= 60;
      } else if (score === '不及格' || score === '不合格') {
        isPass = false;
      }

      if (name) {
        grades.push({
          term,
          code,
          name,
          score,
          credit,
          gpa,
          type,
          examType,
          isPass,
        });
      }
    });
  } catch (e) {
    console.error('成绩解析异常:', e);
  }

  return grades;
}

/**
 * 考试安排 HTML 解析
 */
export function parseExamsHtml(html: string): ExamItem[] {
  const exams: ExamItem[] = [];
  if (!html) return exams;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('#dataList') || doc.querySelector('table');
    if (!table) return exams;

    const rows = table.querySelectorAll('tbody tr, tr');
    const now = new Date().getTime();

    rows.forEach((row) => {
      const tds = row.querySelectorAll('td');
      if (tds.length < 4) return;

      // 提取课程名称 (通常在第3或第4列)
      const name = tds[3]?.textContent?.trim() || tds[2]?.textContent?.trim() || '';
      if (!name || name.includes('课程名称') || name.includes('序号')) return;

      // 查找时间字段（包含冒号或日期的字段）
      let time = '';
      let location = '';
      let seat = '-';

      for (let i = 1; i < tds.length; i++) {
        const txt = tds[i].textContent?.trim() || '';
        if (/\d{4}-\d{2}-\d{2}/.test(txt) || /\d{2}:\d{2}/.test(txt)) {
          time = txt;
        } else if (/[JjA-Za-z]\d+/.test(txt) || txt.includes('教学楼') || txt.includes('考场')) {
          location = txt;
        } else if (/^\d+$/.test(txt) && parseInt(txt, 10) > 0 && parseInt(txt, 10) < 150) {
          seat = txt;
        }
      }

      let daysLeft: number | undefined = undefined;
      const dateMatch = time.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const examDate = new Date(dateMatch[1]).getTime();
        daysLeft = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
      }

      exams.push({
        name,
        time: time || '待教务排考',
        location: location || '暂未公布',
        seat,
        daysLeft,
      });
    });
  } catch (e) {
    console.error('考试安排解析异常:', e);
  }

  return exams;
}
