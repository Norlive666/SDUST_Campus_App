/**
 * 山科大强智教务 HTML 解析器 (SDUST HTML Parser)
 */

export interface CourseItem {
  day: number; // 0: 周一, 1: 周二, ... 6: 周日
  section: number; // 0: 1-2节, 1: 3-4节, 2: 5-6节, 3: 7-8节, 4: 9-10节
  name: string; // 课程名
  teacher: string; // 任课教师
  classroom: string; // 教室 (如 J1-102, 1号楼 102)
  rawWeeks: string; // 原始周次字符 (如 "1-16周")
  weeks: number[]; // 适用的周次列表 [1, 2, ..., 16]
  color?: string; // 界面展示的背景色
}

export interface TimetableParseResult {
  courses: CourseItem[];
  currentTerm?: string;
  currentWeek?: number;
  studentInfo?: Partial<StudentInfo>;
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
 * 格式化拼接教学楼与教室，避免出现仅显示 "x号楼" 的问题
 * 例如:
 * building: "J1号教学楼", room: "102" -> "J1-102"
 * building: "J1号楼", room: "J1-102" -> "J1-102"
 * building: "1号楼", room: "102" -> "1号楼 102"
 * building: "", room: "J7-302" -> "J7-302"
 */
export function formatClassroom(building: string, room: string): string {
  building = (building || '').replace(/[()（）]/g, '').trim();
  room = (room || '').replace(/[()（）]/g, '').trim();

  if (!building && !room) return '教室未定';
  if (!building) return room;
  if (!room) return building;

  // 提取楼宇代号 (如 J1, J7, J14, S1, 1, 2)
  const bCodeMatch = building.match(/([A-Za-z]+\d+|\d+)/);
  const bCode = bCodeMatch ? bCodeMatch[1] : '';

  // 如果 room 已经包含完整楼宇名称或代号
  if (room.toLowerCase().includes(building.toLowerCase())) {
    return room;
  }
  if (bCode && room.toUpperCase().startsWith(bCode.toUpperCase())) {
    return room;
  }

  // 如果 room 只是纯数字房号（如 102, 201-1, 305）
  if (bCode) {
    if (/^[A-Za-z]/.test(bCode)) {
      // 字母开头楼号 (如 J1, J7, J14)：直接规范化为 J1-102
      return `${bCode.toUpperCase()}-${room.replace(/^[A-Za-z]+[-–_]?/, '')}`;
    } else {
      // 纯数字楼号 (如 1号楼 102)
      return `${building} ${room}`;
    }
  }

  // 默认使用空格合并 (如 体育馆 风雨操场, 综合楼 201)
  return `${building} ${room}`;
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
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. 从 input 表单元素中提取
    const nameInput = doc.querySelector('input[name="xm"], input[name="kkbs"]') as HTMLInputElement;
    if (nameInput && nameInput.value) info.name = nameInput.value.trim();

    const idInput = doc.querySelector('input[name="xh"]') as HTMLInputElement;
    if (idInput && idInput.value) info.account = idInput.value.trim();

    const yxInput = doc.querySelector('input[name="yxmc"]') as HTMLInputElement;
    if (yxInput && yxInput.value) info.college = yxInput.value.trim();

    const zyInput = doc.querySelector('input[name="zymc"]') as HTMLInputElement;
    if (zyInput && zyInput.value) info.major = zyInput.value.trim();

    const bjInput = doc.querySelector('input[name="bjmc"]') as HTMLInputElement;
    if (bjInput && bjInput.value) info.className = bjInput.value.trim();

    // 2. 从 table/td 文本节点中提取
    const tds = doc.querySelectorAll('td, th, div, span');
    tds.forEach((node) => {
      const text = node.textContent?.trim() || '';
      if (!text) return;

      if (!info.college) {
        const m = text.match(/(?:院系|学院|所在院系)[:：]\s*([^\s<&]+)/);
        if (m) info.college = m[1].trim();
      }
      if (!info.major) {
        const m = text.match(/(?:专业|专业名称)[:：]\s*([^\s<&]+)/);
        if (m) info.major = m[1].trim();
      }
      if (!info.className) {
        const m = text.match(/(?:班级|行政班级)[:：]\s*([^\s<&]+)/);
        if (m) info.className = m[1].trim();
      }
      if (!info.account) {
        const m = text.match(/(?:学号)[:：]\s*([0-9a-zA-Z]+)/);
        if (m) info.account = m[1].trim();
      }
      if (!info.name) {
        const m = text.match(/(?:姓名)[:：]\s*([^\s<&]+)/);
        if (m && m[1] !== '姓名') info.name = m[1].trim();
      }
    });

    // 3. 备用匹配: Top1_divLoginName 格式: 张三(2022010101) 或 欢迎您，张三
    const loginUserEl = doc.querySelector('#Top1_divLoginName, #Top1_divLoginUser, .divLoginName');
    if (loginUserEl) {
      const loginText = loginUserEl.textContent || '';
      const match = loginText.match(/([^<(]+)\(?([0-9a-zA-Z]*)\)?/);
      if (match) {
        if (!info.name && match[1]) info.name = match[1].replace(/欢迎您[，,：:\s]*/, '').trim();
        if (!info.account && match[2]) info.account = match[2].trim();
      }
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
  let studentInfo: Partial<StudentInfo> | undefined = undefined;

  if (!html) return { courses };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 1. 尝试从页面下拉框中提取教务当前选中的实际学期与教学周
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

    // 2. 尝试从课表页面头部提取学生学籍信息
    const headerInfo = parseStudentInfoHtml(html);
    if (headerInfo.name || headerInfo.college || headerInfo.account) {
      studentInfo = headerInfo;
    }

    // 3. 匹配课表主表格
    const table = doc.querySelector('#kbtable') || doc.querySelector('table');
    if (!table) return { courses, currentTerm, currentWeek, studentInfo };

    const rows = table.querySelectorAll('tbody tr, tr');
    let sectionIndex = 0;

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 7) return; // 节次行必须包含周一至周日 7 天

      // 强智标准：第一列若包含数字/节次名称，偏移 1
      const dayOffset = cells.length > 7 ? 1 : 0;

      for (let day = 0; day < 7; day++) {
        const cell = cells[day + dayOffset];
        if (!cell) continue;

        // 策略 A: 强智悬浮提示列表 <ul class="qz-toolitiplists"> <li>...</li> </ul>
        const tooltipLis = cell.querySelectorAll('.qz-toolitiplists li');
        if (tooltipLis.length > 0) {
          tooltipLis.forEach((li) => {
            const rawText = li.textContent || '';
            const nameEl = li.querySelector('div') || li;
            let name = nameEl.textContent?.trim() || '';
            name = name.replace(/老师[:：].*/s, '').trim();

            const teacherMatch = rawText.match(/(?:老师|教师)[:：]\s*([^\s;<\n]+)/);
            const teacher = teacherMatch ? teacherMatch[1].trim() : '';

            // 提取完整地点 (保留空格，例如 "J1号教学楼 J1-102" 或 "1号楼 102")
            const placeMatch = rawText.match(/地点[:：]\s*([^;<\n]+?)(?=\s*(?:时间|老师|教师|周次|节次|$|<))/);
            let classroom = '';
            if (placeMatch) {
              const fullPlace = placeMatch[1].trim();
              const parts = fullPlace.split(/\s+/);
              if (parts.length >= 2) {
                classroom = formatClassroom(parts[0], parts.slice(1).join(' '));
              } else {
                classroom = fullPlace;
              }
            }

            const weekMatch = rawText.match(/(?:时间|周次)[:：]\s*([^\s;<\n]+)/);
            const rawWeeks = weekMatch ? weekMatch[1].trim() : '1-16周';
            const weeks = parseWeekString(rawWeeks);

            // 解析节次
            let sec = sectionIndex;
            const secMatch = rawWeeks.match(/\[(\d+)-(\d+)节?\]/);
            if (secMatch) {
              sec = Math.floor((parseInt(secMatch[1], 10) - 1) / 2);
            }

            if (name) {
              courses.push({
                day,
                section: sec,
                name,
                teacher,
                classroom: classroom || '教室未定',
                rawWeeks,
                weeks,
              });
            }
          });
        } else {
          // 策略 B: 提取 .kbcontent / .kbcontent1
          const kbItems = cell.querySelectorAll('.kbcontent, .kbcontent1');
          kbItems.forEach((item) => {
            // 跳过隐藏或占位的简版
            const el = item as HTMLElement;
            if (el.style && el.style.display === 'none') return;
            if (el.classList.contains('sykb2')) return;

            const htmlContent = item.innerHTML.trim();
            if (!htmlContent || htmlContent === '&nbsp;' || htmlContent.length < 5) return;

            // 分割多门课的分隔线 (如 "---------------------")
            const blocks = htmlContent.split(/<br\s*\/?>\s*[-—]{5,}\s*<br\s*\/?>|[-—]{10,}/i);

            blocks.forEach((block) => {
              if (!block || block.replace(/&nbsp;|<br\/?>/g, '').trim().length < 2) return;

              const blockDiv = document.createElement('div');
              blockDiv.innerHTML = block;

              // 优先从带 title 的标签中精准提取
              const teacherEl = blockDiv.querySelector('font[title="老师"], font[title="教师"], span[title="老师"], span[title="教师"]');
              const teacher = teacherEl ? teacherEl.textContent?.trim() || '' : '';

              const weekEl = blockDiv.querySelector('font[title="周次(节次)"], font[title="时间"], span[title="周次(节次)"]');
              const weekRaw = weekEl ? weekEl.textContent?.trim() || '' : '';

              const buildingEl = blockDiv.querySelector('font[title="教学楼"], font[title="校区"], span[title="教学楼"]');
              const building = buildingEl ? buildingEl.textContent?.trim() || '' : '';

              const roomEl = blockDiv.querySelector('font[title="教室"], font[title="地点"], span[title="教室"]');
              const room = roomEl ? roomEl.textContent?.trim() || '' : '';

              let classroom = '';
              if (building || room) {
                classroom = formatClassroom(building, room);
              }

              // 提取课程名称 (第一行无 title 的文本)
              let name = '';
              const firstLine = block.split(/<br\s*\/?>/i)[0];
              const nameHolder = document.createElement('div');
              nameHolder.innerHTML = firstLine;
              name = nameHolder.textContent?.replace(/&nbsp;/g, '').replace(/[●★○]/g, '').trim() || '';

              // 如果标签未标记 title，进行按行兜底解析
              const lines = block
                .split(/<br\s*\/?>/i)
                .map((l) => l.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim())
                .filter(Boolean);

              if (!name && lines.length > 0) {
                name = lines[0];
              }

              let finalTeacher = teacher;
              if (!finalTeacher) {
                const foundT = lines.find((l) => l.includes('老师') || l.includes('教师') || (l.length >= 2 && l.length <= 4 && /^[\u4e00-\u9fa5]+$/.test(l) && l !== name));
                if (foundT) finalTeacher = foundT.replace(/(?:老师|教师)[:：]/, '').trim();
              }

              let finalWeekRaw = weekRaw;
              if (!finalWeekRaw) {
                const foundW = lines.find((l) => l.includes('周') || /\d+-\d+/.test(l));
                if (foundW) finalWeekRaw = foundW;
              }

              if (!classroom) {
                // 查找楼宇行与房号行
                const buildingLine = lines.find((l) => /[JjA-Za-z]?\d+号?楼|[教学机电实验综合理科]+楼/.test(l)) || '';
                const roomLine = lines.find((l) => /[JjA-Za-z]\d+[-–]\d+|\b\d{3,4}\b|[0-9]+教室|操场|机房|馆/.test(l)) || '';

                if (buildingLine && roomLine && buildingLine !== roomLine) {
                  classroom = formatClassroom(buildingLine, roomLine);
                } else if (buildingLine && !roomLine) {
                  // 只有楼宇行，检查后面是否有纯数字
                  classroom = buildingLine;
                } else if (roomLine) {
                  classroom = roomLine;
                }
              }

              // 计算适用周次与节次
              const rawWeeks = (finalWeekRaw || '1-16周').split('[')[0].trim();
              const weeks = parseWeekString(rawWeeks);

              let sec = sectionIndex;
              const secMatch = (finalWeekRaw || '').match(/\[(\d+)-(\d+)节?\]/);
              if (secMatch) {
                sec = Math.floor((parseInt(secMatch[1], 10) - 1) / 2);
              }

              if (name && !name.includes('节次') && name !== '-' && weeks.length > 0) {
                courses.push({
                  day,
                  section: sec,
                  name,
                  teacher: finalTeacher,
                  classroom: classroom || '教室未定',
                  rawWeeks: finalWeekRaw || '1-16周',
                  weeks,
                });
              }
            });
          });
        }
      }

      sectionIndex++;
    });
  } catch (e) {
    console.error('课表解析异常:', e);
  }

  return { courses, currentTerm, currentWeek, studentInfo };
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

      const name = tds[3]?.textContent?.trim() || tds[2]?.textContent?.trim() || '';
      if (!name || name.includes('课程名称') || name.includes('序号')) return;

      let time = '';
      let location = '';
      let seat = '-';

      for (let i = 1; i < tds.length; i++) {
        const txt = tds[i].textContent?.trim() || '';
        if (/\d{4}-\d{2}-\d{2}/.test(txt) || /\d{2}:\d{2}/.test(txt)) {
          time = txt;
        } else if (/[JjA-Za-z]\d+/.test(txt) || txt.includes('教学楼') || txt.includes('考场') || txt.includes('楼')) {
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

      if (name) {
        exams.push({
          name,
          time: time || '待教务排考',
          location: location || '暂未公布',
          seat,
          daysLeft,
        });
      }
    });
  } catch (e) {
    console.error('考试安排解析异常:', e);
  }

  return exams;
}
