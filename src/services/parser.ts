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

export interface GradeItem {
  term: string; // 学期 如 2023-2024-1
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
  time: string; // 考试时间 (如 2024-06-20 09:00-11:00)
  location: string; // 考场教室 (如 J7-302)
  seat: string; // 座位号
  daysLeft?: number; // 距离考试剩余天数
}

/**
 * 解析周次格式: "1-16周", "1-15周(单)", "2-16周(双)", "5周", "1,3,5周"
 */
export function parseWeekString(weekStr: string): number[] {
  const weeks: number[] = [];
  if (!weekStr) return weeks;

  // 清洗括号与中英文字符
  const cleanStr = weekStr.replace(/周/g, '');
  const isOddOnly = cleanStr.includes('单');
  const isEvenOnly = cleanStr.includes('双');
  const segments = cleanStr.replace(/[()（）单双]/g, '').split(/[,，、]/);

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

  return Array.from(new Set(weeks)).sort((a, b) => a - b);
}

/**
 * 解析课表 HTML
 */
export function parseTimetableHtml(html: string): CourseItem[] {
  const courses: CourseItem[] = [];
  if (!html) return courses;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('#kbtable') || doc.querySelector('table');
    if (!table) return courses;

    const rows = table.querySelectorAll('tbody tr, tr');
    let sectionIndex = 0;

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 7) return; // 节次行通常包含7天或外加节次序号

      // 很多强智系统第一列是节次说明 (如 "第一大节 08:00-09:35")
      const dayOffset = cells.length > 7 ? 1 : 0;

      for (let day = 0; day < 7; day++) {
        const cell = cells[day + dayOffset];
        if (!cell) continue;

        // 强智标准格式: <ul class="qz-toolitiplists"><li>...</li></ul>
        const tooltipLis = cell.querySelectorAll('.qz-toolitiplists li');
        if (tooltipLis.length > 0) {
          tooltipLis.forEach((li) => {
            const text = li.textContent || '';
            const nameEl = li.querySelector('div') || li;
            let name = nameEl ? nameEl.textContent?.trim() || '' : '';
            // 剥离详细标签
            name = name.replace(/老师:.*/s, '').trim();

            const teacherMatch = text.match(/老师[:：]\s*([^\s;]+)/);
            const teacher = teacherMatch ? teacherMatch[1] : '';

            const placeMatch = text.match(/地点[:：]\s*([^\s;]+)/);
            const classroom = placeMatch ? placeMatch[1].replace(/[()（）]/g, '') : '';

            const weekMatch = text.match(/时间[:：]\s*([^\s;\[]+)/);
            const rawWeeks = weekMatch ? weekMatch[1] : '';
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
          // 备用文本解析：部分视图直接把课程信息用 <br> 或 div 分隔
          const content = cell.innerHTML.trim();
          if (content && content !== '&nbsp;' && content.length > 4) {
            const divElements = cell.querySelectorAll('.kbcontent, div');
            divElements.forEach((el) => {
              const fullTxt = el.textContent?.trim() || '';
              if (fullTxt) {
                const parts = fullTxt.split(/\n|\s{2,}/).map((s) => s.trim()).filter(Boolean);
                if (parts.length > 0) {
                  courses.push({
                    day,
                    section: sectionIndex,
                    name: parts[0] || '未知课程',
                    teacher: parts[1] || '',
                    classroom: parts[2] || '',
                    rawWeeks: parts[3] || '1-16周',
                    weeks: parseWeekString(parts[3] || '1-16周'),
                  });
                }
              }
            });
          }
        }
      }

      sectionIndex++;
    });
  } catch (e) {
    console.error('解析课表 HTML 失败:', e);
  }

  return courses;
}

/**
 * 解析成绩 HTML
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
      if (tds.length < 6) return;

      // 提取通用列，兼容表头跳过
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
    });
  } catch (e) {
    console.error('解析成绩 HTML 失败:', e);
  }

  return grades;
}

/**
 * 解析考试安排 HTML
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
      if (tds.length < 5) return;

      const name = tds[3]?.textContent?.trim() || tds[2]?.textContent?.trim() || '';
      if (!name || name.includes('课程名称')) return;

      const time = tds[4]?.textContent?.trim() || '';
      const location = tds[5]?.textContent?.trim() || tds[4]?.textContent?.trim() || '';
      const seat = tds[6]?.textContent?.trim() || tds[5]?.textContent?.trim() || '-';

      let daysLeft: number | undefined = undefined;
      const dateMatch = time.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const examDate = new Date(dateMatch[1]).getTime();
        daysLeft = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));
      }

      exams.push({
        name,
        time,
        location,
        seat,
        daysLeft,
      });
    });
  } catch (e) {
    console.error('解析考试安排 HTML 失败:', e);
  }

  return exams;
}
