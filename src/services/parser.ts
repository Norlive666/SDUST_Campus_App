import { mondayOf } from "./teaching-week";
import { examTiming, type ExamTiming } from "./exam-time";
import { resolveGrade, valueText, type GradeStatus } from "./grade-result";
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
  score: string; // 成绩 (如 88 或 优 或 缓考)
  credit: number; // 学分
  gpa: number; // 绩点
  type: string; // 课程属性 (必修/选修)
  examType: string; // 考核方式 (考试/考查)
  isPass: boolean; // 是否通过
  examNature?: string; // 考试性质 (如 正常考试/补考/缓考/重修)
  makeupScore?: string; // 补考/缓考成绩
  remark?: string; // 成绩备注 (如 缓考/旷考/免修)
  status?: GradeStatus;
  originalScore?: string;
}

export interface ExamItem {
  phase?: ExamTiming["phase"];
  startsAt?: number;
  endsAt?: number;
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
export function calculateCurrentTermAndWeek(date = new Date()): { term: string; week: number; startMonday: string } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  let term = '';
  let termStartDate: Date;

  if (month >= 8) {
    // 秋季学期 (如 2026年9月~2027年1月 -> 2026-2027-1)
    term = `${year}-${year + 1}-1`;
    const sept1 = new Date(year, 8, 1);
    const dayOfWeek = (sept1.getDay() + 6) % 7; // 0=Mon
    termStartDate = new Date(sept1);
    termStartDate.setDate(sept1.getDate() - dayOfWeek);
  } else if (month <= 2) {
    // 跨年后的秋季学期末 (如 2027年1月仍属于 2026-2027-1)
    term = `${year - 1}-${year}-1`;
    const sept1 = new Date(year - 1, 8, 1);
    const dayOfWeek = (sept1.getDay() + 6) % 7;
    termStartDate = new Date(sept1);
    termStartDate.setDate(sept1.getDate() - dayOfWeek);
  } else {
    // 春季学期 (如 2026-2027-2，通常2月下旬/3月初开学)
    term = `${year - 1}-${year}-2`;
    const march1 = new Date(year, 2, 1);
    const dayOfWeek = (march1.getDay() + 6) % 7;
    termStartDate = new Date(march1);
    termStartDate.setDate(march1.getDate() - dayOfWeek);
  }

  const calendarDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  const diffDays = calendarDay(date) - calendarDay(termStartDate);
  const week = diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 1;
  return { term, week: Math.min(Math.max(week, 1), 25), startMonday: mondayOf(termStartDate) };
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
 * 解析 SDUST 成绩 JSON 数据结构
 */
export function dataRows(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  for (const key of ["rows", "items", "data", "list", "records"]) {
    const value = json[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const nested of ["rows", "items", "list", "records"]) if (Array.isArray(value[nested])) return value[nested];
    }
  }
  return [];
}

export function parseGradesJson(json: any): GradeItem[] {
  const list = dataRows(json);

  const grades: GradeItem[] = [];
  for (const item of list) {
    if (!item) continue;
    const name = valueText(item.kc_mc || item.kcmc || item.name);
    if (!name || name === '无' || name.includes('暂无成绩') || name.includes('暂无数据')) continue;

    const rawScore = String(item.zcj ?? item.cj ?? item.score ?? '').trim();
    const makeupScore = String(item.bkcj ?? item.cx_cj ?? item.cxcj ?? '').trim();
    const effectiveScore = String(item.zscj ?? item.yxcj ?? '').trim();
    const remark = valueText(item.cjbzmc || item.cjbz || item.bz || item.tsyy || item.cjkc_bz);
    const examNature = valueText(item.ksxzmc || item.ksxz || item.cjxz || item.kslb);
    let credit = parseFloat(item.xf ?? item.credit ?? '0') || 0;
    let gpa = parseFloat(item.jd ?? item.gpa ?? '0') || 0;
    const code = valueText(item.kch || item.code);
    const type = valueText(item.kcsx || item.kcxz || item.type || '必修');
    const examType = valueText(item.khfs || '考试');
    const term = valueText(item.xnxq01id || item.kksj || item.xnxqid || item.term);

    const result = resolveGrade({ raw: rawScore, makeup: makeupScore, effective: effectiveScore, remark, nature: examNature, gpa: item.jd ?? item.gpa });
    const isDeferred = /缓考/.test(examNature + remark + rawScore);
    const isMakeup = /补考/.test(examNature + remark) || (!!makeupScore && makeupScore !== '0');

    grades.push({
      term: term || '当前学期',
      code,
      name,
      ...result,
      credit: Number.isFinite(credit) && credit >= 0 ? credit : 0,
      type,
      examType,
      examNature: examNature || (isDeferred ? '缓考' : isMakeup ? '补考' : undefined),
      makeupScore: makeupScore || undefined,
      remark: remark || undefined,
    });
  }
  return grades;
}

/**
 * 成绩解析 (自适应 JSON 接口与 HTML 表格双协议解析，杜绝全 0 与空白)
 */
export function parseGradesHtml(html: any): GradeItem[] {
  if (!html) return [];

  // 1. 优先尝试解析 JSON 数据结构
  if (typeof html === 'object') {
    return parseGradesJson(html);
  }
  const trimmed = typeof html === 'string' ? html.trim() : '';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      return parseGradesJson(json);
    } catch (_) {
      // 容错回退到 HTML 表格解析
    }
  }

  const grades: GradeItem[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/html');
    const table = doc.querySelector('#dataList') || Array.from(doc.querySelectorAll('table')).reverse().find(t => /课程名/.test(t.textContent || '') && /(?:成绩|分数|总评)/.test(t.textContent || ''));
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
      makeupScore: -1,
      effectiveScore: -1,
      credit: -1,
      gpa: -1,
      type: -1,
      examType: -1,
      examNature: -1,
      remark: -1,
      marker: -1,
    };

    for (let r = 0; r < Math.min(rows.length, 3); r++) {
      const ths = rows[r].querySelectorAll('th, td');
      let foundHeader = false;
      ths.forEach((th, idx) => {
        const text = th.textContent?.trim() || '';
        if (text.includes('学期')) { colMap.term = idx; foundHeader = true; }
        else if (text.includes('课程编号') || text.includes('课程序号') || text.includes('课程代码')) { colMap.code = idx; foundHeader = true; }
        else if (text.includes('课程名称') || text.includes('课程名')) { colMap.name = idx; foundHeader = true; }
        else if (text.includes('成绩标识') || text.includes('成绩标志')) { colMap.marker = idx; foundHeader = true; }
        else if (text.includes('备注') || text.includes('原因')) { colMap.remark = idx; foundHeader = true; }
        else if (/补考.*成绩|缓考.*成绩|重修.*成绩/.test(text)) { colMap.makeupScore = idx; foundHeader = true; }
        else if (text.includes('有效成绩') || text.includes('最终成绩')) { colMap.effectiveScore = idx; foundHeader = true; }
        else if (text.includes('考试性质') || text.includes('成绩性质') || text.includes('修读性质')) { colMap.examNature = idx; foundHeader = true; }
        else if (/总评|总成绩/.test(text) && !/绩点|学分/.test(text)) { colMap.score = idx; foundHeader = true; }
        else if (/^(?:成绩|分数)$/.test(text) || (colMap.score === -1 && text.includes('成绩') && !/平时|期中|实验|标识|性质|方式/.test(text))) {
          if (!text.includes('标识') && !text.includes('性质') && !text.includes('方式') && colMap.score === -1) {
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
        } else if (text.includes('备注') || text.includes('原因')) {
          colMap.remark = idx;
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
        const idx = colMap[colKey] !== -1 ? colMap[colKey] : colMap.name !== -1 ? -1 : fallbackIdx;
        return tds[idx]?.textContent?.trim() || '';
      };

      const term = getColText('term', 1);
      const code = getColText('code', 2);
      const name = getColText('name', 3);
      const rawScore = getColText('score', 4);
      const makeupScore = getColText('makeupScore', -1);
      const effectiveScore = getColText('effectiveScore', -1);
      const examNature = getColText('examNature', -1);
      const remark = [getColText('marker', -1), getColText('remark', -1)].filter(Boolean).join(' · ');
      let credit = parseFloat(getColText('credit', 6)) || 0;
      let gpa = parseFloat(getColText('gpa', 8)) || 0;
      const type = getColText('type', 10) || '必修';
      const examType = getColText('examType', 9) || '考试';

      if (!name || name.includes('课程名称') || name.includes('序号') || name === '无') continue;

      const result = resolveGrade({ raw: rawScore, makeup: makeupScore, effective: effectiveScore, remark, nature: examNature,
        gpa: getColText('gpa', 8) });
      const isDeferred = /缓考/.test(examNature + remark + rawScore);
      const isMakeup = /补考/.test(examNature + remark) || (!!makeupScore && makeupScore !== '0');

      grades.push({
        term: term || '当前学期',
        code,
        name,
        ...result,
        credit: Number.isFinite(credit) && credit >= 0 ? credit : 0,
        type,
        examType,
        examNature: examNature || (isDeferred ? '缓考' : isMakeup ? '补考' : undefined),
        makeupScore: makeupScore || undefined,
        remark: remark || undefined,
      });
    }
  } catch (e) {
    console.error('成绩解析异常:', e);
  }

  return grades;
}

/**
 * 解析 SDUST 考试日程 JSON 数据结构
 */
export function parseExamsJson(json: any): ExamItem[] {
  const list = dataRows(json);

  const exams: ExamItem[] = [];
  const now = new Date().getTime();

  for (const item of list) {
    if (!item) continue;
    const name = valueText(item.kskcmc || item.kcmc || item.name);
    if (!name || name === '无' || name.includes('暂无考试') || name.includes('暂无数据')) continue;

    const rawLocation = item.js_mc || item.classroom || item.location || '';
    const location = rawLocation ? cleanSdustClassroom(rawLocation) : '暂未公布';
    const seat = String(item.zwh ?? item.seat ?? '-').trim() || '-';
    const start = valueText(item.kssj || item.time || '待排考');
    const end = valueText(item.jssj || item.kssj_js);
    const time = end && !start.includes(end) ? `${start}–${end.match(/\d{1,2}:[0-5]\d/)?.[0] || end}` : start;

    exams.push({
      name,
      time,
      location,
      seat,
      ...examTiming(time),
    });
  }
  return exams;
}

/**
 * 考试安排解析 (自适应 JSON 接口与 HTML 表格双协议解析)
 */
export function parseExamsHtml(html: any): ExamItem[] {
  if (!html) return [];

  // 1. 优先尝试解析 JSON 数据结构
  if (typeof html === 'object') {
    return parseExamsJson(html);
  }
  const trimmed = typeof html === 'string' ? html.trim() : '';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      return parseExamsJson(json);
    } catch (_) {
      // 容错回退到 HTML 表格解析
    }
  }

  const exams: ExamItem[] = [];
  const doc = new DOMParser().parseFromString(trimmed, 'text/html');
  const table = doc.querySelector('#dataList') || Array.from(doc.querySelectorAll('table')).find(t => /课程名/.test(t.textContent || '') && /考试时间|考试日期/.test(t.textContent || ''));
  if (!table) return exams;
  const rows = Array.from(table.querySelectorAll('tr'));
  let header = -1;
  const columns: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    const cells = Array.from(rows[i].querySelectorAll('th,td'));
    cells.forEach((cell, index) => {
      const text = cell.textContent?.replace(/\s/g, '') || '';
      if (/课程名|考试科目/.test(text)) columns.name = index;
      else if (/结束时间/.test(text)) columns.end = index;
      else if (/考试时间|开始时间|考试日期/.test(text)) columns.time = index;
      else if (/考场|教室|地点/.test(text)) columns.location = index;
      else if (/座位/.test(text)) columns.seat = index;
    });
    if (columns.name !== undefined) { header = i; break; }
  }
  if (header < 0) return exams;
  for (const row of rows.slice(header + 1)) {
    const cells = row.querySelectorAll('td');
    const get = (key: string) => columns[key] === undefined ? '' : cells[columns[key]]?.textContent?.trim() || '';
    const name = get('name');
    if (!name || /暂无|无考试|未查询到|没有找到/.test(name)) continue;
    const start = get('time');
    const end = get('end');
    const time = end ? `${start}–${end.match(/\d{1,2}:[0-5]\d/)?.[0] || end}` : start || '待教务排考';
    exams.push({ name, time, location: get('location') ? cleanSdustClassroom(get('location')) : '暂未公布', seat: get('seat') || '-', ...examTiming(time) });
  }
  return exams;
}
