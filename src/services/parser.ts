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
  score: string; // 成绩 (如 88 或 优)
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
 * 智能解析山科大教务系统地点字符串为实际教室 (纯净教室名，杜绝附加的班级/编号等元数据)
 * 规则：
 * 1. "地点: J7教学楼(J7-203室)" -> "J7-203室"
 * 2. "地点: J7教学楼(J7-106室)" -> "J7-106室"
 * 3. "地点: Js1-105室" -> "Js1-105室"
 * 4. "地点: J1-124室" -> "J1-124室"
 * 5. "地点: JC区网球场(JC区网球场室)" -> "JC区网球场室"
 * 6. "地点: 风雨操场" -> "风雨操场"
 * 7. "地点: J14机电楼(205)" -> "J14-205"
 * 8. "地点: 1号楼(102)" -> "1号楼 102"
 */
export function cleanSdustClassroom(rawPlace: string): string {
  if (!rawPlace) return '教室未定';

  // 1. 去除 HTML 标签，并将中文冒号转为英文冒号
  let text = rawPlace.replace(/<[^>]*>/g, '').replace(/：/g, ':');

  // 如果传入了包含整个详情列表的长文本，先截取地点之后的内容
  const placeMatch = text.match(/(?:上课地点|地点):\s*([^;\n<]+)/i);
  if (placeMatch) {
    text = placeMatch[1].trim();
  } else {
    text = text.replace(/^[;,\s]*(?:上课地点|地点):\s*/i, '').trim();
  }

  // 杜绝任何可能混入的干扰字段
  text = text.replace(/(?:课程编号|教学班级|班级|总人数|考核方式|任课教师|老师|教师|时间|周次)[:：].*/s, '').trim();
  if (!text) return '教室未定';

  // 2. 优先提取括号内的具体房间号，例如 "J7教学楼(J7-203室)" -> "J7-203室"
  const m = /(.*?)[（(]([^）)]+)[）)]/.exec(text);
  if (m) {
    const building = m[1].trim();
    const inside = m[2].trim();
    if (/^[A-Za-z]/.test(inside) || inside.includes('室') || inside.includes('操场') || inside.includes('馆') || inside.includes('场')) {
      return inside;
    }
    const bCodeMatch = building.match(/([A-Za-z]+\d+|\d+)/);
    if (bCodeMatch) {
      const code = bCodeMatch[1];
      if (/^[A-Za-z]/.test(code)) {
        return `${code.toUpperCase()}-${inside}`;
      } else {
        return `${code}号楼 ${inside}`;
      }
    }
    return inside;
  }

  // 3. 处理无括号但包含 "J1-124室", "Js1-105" 等
  const codeMatch = text.match(/([A-Za-z]+\d+[-–]\d+[^\s,;]*)/);
  if (codeMatch) {
    return codeMatch[1].trim();
  }

  // 4. 去除多余的 "教学楼" 前缀
  text = text.replace(/^.*教学楼\s*/, '').replace(/^.*号楼\s*/, '');
  return text.trim() || '教室未定';
}

export const extractClassroomFromPlace = cleanSdustClassroom;

/**
 * 格式化拼接教学楼与教室
 */
export function formatClassroom(building: string, room: string): string {
  building = (building || '').trim();
  room = (room || '').trim();

  if (!building && !room) return '教室未定';
  if (!building) return cleanSdustClassroom(room);
  if (!room) return cleanSdustClassroom(building);

  return cleanSdustClassroom(`${building}(${room})`);
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
            const rawHtml = li.innerHTML || '';
            const normalized = rawHtml.replace(/：/g, ':').replace(/<\/?span[^>]*>/gi, '');

            // 1. 提取课程名
            let name = li.querySelector('.qz-tooltipContent-title')?.textContent?.trim() || '';
            if (!name) {
              const titleMatch = normalized.match(/<div class="qz-tooltipContent-title">(.*?)<\/div>/i) ||
                                 normalized.match(/<div[^>]*>(.*?)<\/div>/i);
              if (titleMatch) {
                name = titleMatch[1].replace(/<[^>]+>/g, '').trim();
              }
            }
            // 剥离可能误匹配的教务字段头部
            name = name.replace(/(?:课程编号|教学班级|班级|总人数|考核方式|任课教师|老师|教师|时间|周次|地点)[:：].*/s, '').trim();

            // 2. 提取教师
            let teacher = '';
            const teacherMatch = normalized.match(/(?:任课教师|老师|教师):([^<;\n]+)/i);
            if (teacherMatch) {
              teacher = teacherMatch[1].replace(/<[^>]+>/g, '').trim();
            }

            // 3. 提取纯净教室
            let classroom = '教室未定';
            const placeMatch = normalized.match(/(?:上课地点|地点):([^<;\n]+)/i);
            if (placeMatch) {
              classroom = cleanSdustClassroom(placeMatch[1].trim());
            }

            // 4. 提取周次与节次
            let rawWeeks = '1-16周';
            let sec = sectionIndex;
            const timeMatch = normalized.match(/(?:上课时间|时间|周次):([^<;\n]+)/i);
            if (timeMatch) {
              const fullTime = timeMatch[1].replace(/<[^>]+>/g, '').trim();
              const secMatch = fullTime.match(/\[(\d+)-(\d+)节?\]/);
              if (secMatch) {
                sec = Math.floor((parseInt(secMatch[1], 10) - 1) / 2);
              }
              rawWeeks = fullTime.split('[')[0].trim().replace(/[()（）]/g, '');
            }

            const weeks = parseWeekString(rawWeeks);
            if (name && weeks.length > 0) {
              courses.push({
                day,
                section: sec,
                name,
                teacher,
                classroom,
                rawWeeks,
                weeks,
              });
            }
          });
        } else {
          // 策略 B: 提取 .kbcontent / .kbcontent1
          const kbItems = cell.querySelectorAll('.kbcontent, .kbcontent1');
          kbItems.forEach((item) => {
            const el = item as HTMLElement;
            if (el.style && el.style.display === 'none') return;
            if (el.classList.contains('sykb2')) return;

            const htmlContent = item.innerHTML.trim();
            if (!htmlContent || htmlContent === '&nbsp;' || htmlContent.length < 5) return;

            // 分割同时间段不同周次的多门课 (分隔线如 "---------------------")
            const blocks = htmlContent.split(/<br\s*\/?>\s*[-—]{5,}\s*<br\s*\/?>|[-—]{10,}/i);

            blocks.forEach((block) => {
              if (!block || block.replace(/&nbsp;|<br\/?>/g, '').trim().length < 2) return;

              const blockDiv = document.createElement('div');
              blockDiv.innerHTML = block;

              // 优先查找带 title 的 font 标签
              const teacherEl = blockDiv.querySelector('font[title="老师"], font[title="教师"], span[title="老师"]');
              const teacher = teacherEl ? teacherEl.textContent?.trim() || '' : '';

              const weekEl = blockDiv.querySelector('font[title="周次(节次)"], font[title="时间"]');
              const weekRaw = weekEl ? weekEl.textContent?.trim() || '' : '';

              const roomEl = blockDiv.querySelector('font[title="教室"], font[title="地点"]');
              const buildingEl = blockDiv.querySelector('font[title="教学楼"], font[title="校区"]');

              let classroom = '';
              if (roomEl || buildingEl) {
                const bText = buildingEl?.textContent?.trim() || '';
                const rText = roomEl?.textContent?.trim() || '';
                classroom = formatClassroom(bText, rText);
              }

              // 按 <br> 分割各行信息
              const lines = block
                .split(/<br\s*\/?>/i)
                .map((l) => l.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim())
                .filter(Boolean);

              let name = '';
              const firstLine = lines[0] || '';
              if (firstLine && !firstLine.includes('节次') && !firstLine.includes('周')) {
                name = firstLine;
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
                // 查找包含地点的行
                const placeLine = lines.find((l) => l.includes('地点') || l.includes('楼') || l.includes('教室') || /[JjA-Za-z]\d+[-–]\d+/.test(l));
                if (placeLine) {
                  classroom = cleanSdustClassroom(placeLine);
                }
              }

              const cleanWeeks = (finalWeekRaw || '1-16周').split('[')[0].trim().replace(/[()（）]/g, '');
              const weeks = parseWeekString(cleanWeeks);

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
                  rawWeeks: cleanWeeks || '1-16周',
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
 * 成绩 HTML 解析 (动态列探测，杜绝全 0 与空白)
 */
export function parseGradesHtml(html: string): GradeItem[] {
  const grades: GradeItem[] = [];
  if (!html) return grades;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('#dataList') || doc.querySelector('table');
    if (!table) return grades;

    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 2) return grades;

    // 1. 动态探测表头各列索引，杜绝硬编码错位
    let headerRowIndex = 0;
    const colMap: Record<string, number> = {
      term: -1,
      code: -1,
      name: -1,
      score: -1,
      credit: -1,
      gpa: -1,
      type: -1,
      examType: -1,
    };

    for (let r = 0; r < Math.min(rows.length, 3); r++) {
      const ths = rows[r].querySelectorAll('th, td');
      let foundHeader = false;
      ths.forEach((th, idx) => {
        const text = th.textContent?.trim() || '';
        if (text.includes('学期')) { colMap.term = idx; foundHeader = true; }
        else if (text.includes('课程编号') || text.includes('课程序号')) { colMap.code = idx; foundHeader = true; }
        else if (text.includes('课程名称') || text.includes('课程名')) { colMap.name = idx; foundHeader = true; }
        else if (text.includes('成绩') || text.includes('分数') || text.includes('总评')) {
          if (!text.includes('标识') && !text.includes('性质') && !text.includes('方式')) {
            colMap.score = idx;
            foundHeader = true;
          }
        } else if (text.includes('学分') && !text.includes('绩点')) {
          colMap.credit = idx;
          foundHeader = true;
        } else if (text.includes('绩点')) {
          colMap.gpa = idx;
          foundHeader = true;
        } else if (text.includes('属性') || text.includes('性质')) {
          colMap.type = idx;
          foundHeader = true;
        } else if (text.includes('方式')) {
          colMap.examType = idx;
          foundHeader = true;
        }
      });
      if (foundHeader && (colMap.name !== -1 || colMap.score !== -1)) {
        headerRowIndex = r;
        break;
      }
    }

    // 2. 遍历数据行
    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const tds = rows[r].querySelectorAll('td');
      if (tds.length < 4) continue;

      const rowText = rows[r].textContent || '';
      if (rowText.includes('所修总学分') || rowText.includes('平均学分绩点') || rowText.includes('选课学分')) {
        continue;
      }

      const getColText = (colKey: string, fallbackIdx: number): string => {
        const idx = colMap[colKey] !== -1 ? colMap[colKey] : fallbackIdx;
        return tds[idx]?.textContent?.trim() || '';
      };

      const term = getColText('term', 1);
      const code = getColText('code', 2);
      const name = getColText('name', 3);
      const score = getColText('score', 4);
      let credit = parseFloat(getColText('credit', 6)) || 0;
      let gpa = parseFloat(getColText('gpa', 8)) || 0;
      const type = getColText('type', 10) || '必修';
      const examType = getColText('examType', 9) || '考试';

      if (!name || name.includes('课程名称') || name.includes('序号') || name === '无') continue;

      // 如果未识别到学分，尝试在所有列中寻找合理的学分数值 (0.5 ~ 10.0)
      if (credit === 0) {
        for (let i = 4; i < tds.length; i++) {
          const val = parseFloat(tds[i].textContent?.trim() || '0');
          if (!isNaN(val) && val >= 0.5 && val <= 10.0 && val !== parseFloat(score)) {
            credit = val;
            break;
          }
        }
      }

      // 自动绩点换算（如教务系统未返回独立绩点列，按山科大标准 5 分制推算）
      const numScore = parseFloat(score);
      if (gpa === 0 && !isNaN(numScore)) {
        if (numScore >= 60) {
          gpa = parseFloat(((numScore - 60) / 10 + 1).toFixed(1));
        } else {
          gpa = 0.0;
        }
      } else if (gpa === 0) {
        if (score === '优') gpa = 4.5;
        else if (score === '良') gpa = 3.5;
        else if (score === '中') gpa = 2.5;
        else if (score === '及格') gpa = 1.5;
        else if (score === '不及格') gpa = 0.0;
      }

      let isPass = true;
      if (!isNaN(numScore)) {
        isPass = numScore >= 60;
      } else if (score === '不及格' || score === '不合格') {
        isPass = false;
      }

      grades.push({
        term: term || '当前学期',
        code,
        name,
        score: score || '0',
        credit: credit || 1.0,
        gpa,
        type,
        examType,
        isPass,
      });
    }
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
          location = extractClassroomFromPlace(txt);
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
