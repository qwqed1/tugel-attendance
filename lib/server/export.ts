/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, timingSafeEqual } from 'node:crypto';
import ExcelJS from 'exceljs';
import { all, get, isDate, STATUSES } from './db';
import { BOT_TOKEN } from './auth';
import { dict, type Lang } from '../dict';

// ───────── Қол қойылған сілтеме ─────────
// Telegram ішінде файл тек сілтеме арқылы жүктеледі (тақырып жіберуге болмайды),
// сондықтан сілтемеге 10 минутқа жарамды қолтаңба қосылады.

export type ExportJob = { u: number; g: number | null; from: string; to: string; lang: Lang; exp: number };

const secret = () => createHmac('sha256', 'export').update(process.env.EXPORT_SECRET || BOT_TOKEN || process.env.DATABASE_URL || '').digest();
const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url');

export function exportToken(job: Omit<ExportJob, 'exp'>) {
  const data = Buffer.from(JSON.stringify({ ...job, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function readToken(token: string | null): ExportJob | null {
  const [data, mac] = (token || '').split('.');
  if (!data || !mac) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(data));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const job = JSON.parse(Buffer.from(data, 'base64url').toString()) as ExportJob;
    if (job.exp < Date.now() / 1000 || !isDate(job.from) || !isDate(job.to)) return null;
    return job;
  } catch {
    return null;
  }
}

// ───────── Мәтіндер ─────────

const L = {
  kk: {
    summary: 'Жиынтық', journal: 'Журнал', absences: 'Келмегендер', students: 'Студенттер',
    reportGroup: '{g} тобының сабаққа қатысуы', reportAll: 'Топтар бойынша сабаққа қатысу',
    period: 'Кезең: {from} — {to}',
    no: '№', name: 'Аты-жөні', group: 'Топ', specialty: 'Мамандығы', course: 'Курс', count: 'Студент саны',
    lessons: 'Белгі саны', rate: 'Қатысу, %', date: 'Күні', pair: 'Жұп', subject: 'Пән', status: 'Күйі', note: 'Ескертпе',
    legend: 'Белгілер', noLessons: 'Бұл кезеңде жоқтама жасалған сабақ жоқ',
    codes: { present: '+', absent: 'ж', late: 'к', sick: 'а', excused: 'с', exempt: 'б' },
  },
  ru: {
    summary: 'Сводка', journal: 'Журнал', absences: 'Пропуски', students: 'Студенты',
    reportGroup: 'Посещаемость группы {g}', reportAll: 'Посещаемость по группам',
    period: 'Период: {from} — {to}',
    no: '№', name: 'ФИО', group: 'Группа', specialty: 'Специальность', course: 'Курс', count: 'Студентов',
    lessons: 'Отметок', rate: 'Посещаемость, %', date: 'Дата', pair: 'Пара', subject: 'Дисциплина', status: 'Статус', note: 'Примечание',
    legend: 'Обозначения', noLessons: 'За этот период нет занятий с перекличкой',
    codes: { present: '+', absent: 'н', late: 'оп', sick: 'б', excused: 'у', exempt: 'осв' },
  },
} as const;

const FILL: Record<string, string> = {
  absent: 'FFF8C9C4', late: 'FFFCE8B2', sick: 'FFCFE2F3', excused: 'FFE6E6E6', exempt: 'FFE6E6E6',
};
const HEAD_FILL = 'FF111111';
const LOW_FILL = 'FFF8C9C4';

const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const collator = new Intl.Collator('kk');

/** Босатылған сабақтар есепке кірмейді — қолданбадағы формуламен бірдей */
function tally(statuses: string[]) {
  const c: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const s of statuses) c[s]++;
  const base = statuses.length - c.exempt;
  return { total: statuses.length, ...c, rate: base > 0 ? Math.round(((c.present + c.late) / base) * 100) : null };
}

// ───────── Кітап құрастыру көмекшілері ─────────

function titleBlock(ws: ExcelJS.Worksheet, lines: string[], width: number) {
  lines.forEach((text, i) => {
    const row = ws.addRow([text]);
    row.font = i === 0 ? { bold: true, size: 14 } : { color: { argb: 'FF666666' } };
    if (width > 1) ws.mergeCells(row.number, 1, row.number, width);
  });
  ws.addRow([]);
}

function headerRow(ws: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = ws.addRow(values);
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  return row;
}

function border(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
  });
}

function rateCell(row: ExcelJS.Row, col: number, rate: number | null) {
  const c = row.getCell(col);
  c.value = rate;
  c.alignment = { horizontal: 'center' };
  if (rate != null && rate < 75) {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOW_FILL } };
    c.font = { bold: true };
  }
}

/** Студенттер бойынша жиынтық кесте (статустар + пайыз) */
function statsSheet(ws: ExcelJS.Worksheet, lang: Lang, rows: { name: string; group?: string; statuses: string[] }[], withGroup: boolean) {
  const t = L[lang];
  const d = dict[lang];
  const head = [t.no, t.name, ...(withGroup ? [t.group] : []), t.lessons, ...STATUSES.map((s) => d[s] as string), t.rate];
  headerRow(ws, head).height = 32;
  rows.forEach((r, i) => {
    const s = tally(r.statuses);
    const row = ws.addRow([i + 1, r.name, ...(withGroup ? [r.group] : []), s.total, ...STATUSES.map((k) => s[k as keyof typeof s] || null)]);
    rateCell(row, head.length, s.rate);
    border(row);
  });
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 34;
  if (withGroup) ws.getColumn(3).width = 12;
  for (let c = withGroup ? 4 : 3; c <= head.length; c++) {
    ws.getColumn(c).width = 12;
    ws.getColumn(c).alignment = { horizontal: 'center' };
  }
  ws.getColumn(2).alignment = { horizontal: 'left' };
}

function absencesSheet(ws: ExcelJS.Worksheet, lang: Lang, rows: any[], withGroup: boolean) {
  const t = L[lang];
  const d = dict[lang];
  headerRow(ws, [t.date, t.pair, ...(withGroup ? [t.group] : []), t.name, t.subject, t.status, t.note]);
  for (const r of rows) {
    const row = ws.addRow([dmy(r.date), r.pair, ...(withGroup ? [r.group_name] : []), r.student_name, r.subject_name, d[r.status] as string, r.note]);
    row.getCell(withGroup ? 6 : 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[r.status] } };
    border(row);
  }
  const widths = [12, 6, ...(withGroup ? [12] : []), 32, 30, 14, 30];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

const absenceRows = (where: string, ...p: unknown[]) =>
  all(
    `SELECT date, pair, group_name, student_name, subject_name, status, note FROM v_attendance
     WHERE status <> 'present' AND ${where} ORDER BY date, pair, group_name, student_name`,
    ...p
  );

// ───────── Есептер ─────────

async function groupReport(wb: ExcelJS.Workbook, job: ExportJob) {
  const t = L[job.lang];
  const d = dict[job.lang];
  const group = await get('SELECT id, name, course, specialty FROM groups WHERE id = ?', job.g);
  if (!group) return null;
  const [students, lessons, marks, absences] = await Promise.all([
    all('SELECT id, full_name FROM students WHERE group_id = ? AND active', group.id),
    all(
      `SELECT l.id, l.date, l.pair, sub.name AS subject FROM lessons l JOIN subjects sub ON sub.id = l.subject_id
       WHERE l.group_id = ? AND l.date BETWEEN ? AND ?
         AND EXISTS (SELECT 1 FROM attendance a WHERE a.lesson_id = l.id)
       ORDER BY l.date, l.pair`,
      group.id, job.from, job.to
    ),
    all(
      `SELECT a.lesson_id, a.student_id, a.status FROM attendance a JOIN lessons l ON l.id = a.lesson_id
       WHERE l.group_id = ? AND l.date BETWEEN ? AND ?`,
      group.id, job.from, job.to
    ),
    absenceRows('group_id = ? AND date BETWEEN ? AND ?', group.id, job.from, job.to),
  ]);
  students.sort((a, b) => collator.compare(a.full_name, b.full_name));
  const mark = new Map(marks.map((m) => [`${m.lesson_id}:${m.student_id}`, m.status as string]));
  const title = [
    fmt(t.reportGroup, { g: group.name }),
    `${group.specialty}, ${fmt(d.course as string, { n: group.course })}`,
    fmt(t.period, { from: dmy(job.from), to: dmy(job.to) }),
  ];

  // 1. Жиынтық
  const ws = wb.addWorksheet(t.summary);
  titleBlock(ws, title, 4);
  const top = ws.rowCount;
  statsSheet(ws, job.lang, students.map((s) => ({
    name: s.full_name,
    statuses: lessons.map((l) => mark.get(`${l.id}:${s.id}`)).filter(Boolean) as string[],
  })), false);
  ws.views = [{ state: 'frozen', ySplit: top + 1 }];

  // 2. Журнал: студент × сабақ
  const wj = wb.addWorksheet(t.journal);
  if (!lessons.length) wj.addRow([t.noLessons]);
  else {
    headerRow(wj, [t.no, t.name, ...lessons.map((l) => dmy(l.date).slice(0, 5))]);
    headerRow(wj, ['', '', ...lessons.map((l) => `${l.pair}`)]);
    const h3 = headerRow(wj, ['', '', ...lessons.map((l) => l.subject)]);
    h3.height = 90;
    h3.eachCell((c, col) => { if (col > 2) c.alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center', wrapText: true }; });
    wj.mergeCells(1, 1, 3, 1);
    wj.mergeCells(1, 2, 3, 2);
    students.forEach((s, i) => {
      const row = wj.addRow([i + 1, s.full_name, ...lessons.map((l) => {
        const st = mark.get(`${l.id}:${s.id}`);
        return st ? t.codes[st as keyof typeof t.codes] : '';
      })]);
      lessons.forEach((l, j) => {
        const st = mark.get(`${l.id}:${s.id}`);
        const c = row.getCell(j + 3);
        c.alignment = { horizontal: 'center' };
        if (st && FILL[st]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[st] } };
      });
      border(row);
    });
    wj.getColumn(1).width = 5;
    wj.getColumn(2).width = 32;
    for (let c = 3; c <= lessons.length + 2; c++) wj.getColumn(c).width = 6;
    wj.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];
    wj.addRow([]);
    wj.addRow(['', t.legend]).font = { bold: true };
    for (const s of STATUSES) {
      const row = wj.addRow(['', d[s] as string, t.codes[s]]);
      row.getCell(3).alignment = { horizontal: 'center' };
      if (FILL[s]) row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[s] } };
    }
  }

  // 3. Келмегендер тізімі
  absencesSheet(wb.addWorksheet(t.absences), job.lang, absences, false);
  return group.name as string;
}

async function allGroupsReport(wb: ExcelJS.Workbook, job: ExportJob) {
  const t = L[job.lang];
  const d = dict[job.lang];
  const [groups, students, absences] = await Promise.all([
    all('SELECT id, name, course, specialty FROM groups ORDER BY name'),
    all(
      `SELECT s.id, s.full_name, g.name AS group_name,
              COALESCE(array_agg(a.status) FILTER (WHERE a.status IS NOT NULL), '{}') AS statuses
       FROM students s
       JOIN groups g ON g.id = s.group_id
       LEFT JOIN attendance a ON a.student_id = s.id
         AND a.lesson_id IN (SELECT id FROM lessons WHERE date BETWEEN ? AND ?)
       WHERE s.active
       GROUP BY s.id, g.name`,
      job.from, job.to
    ),
    absenceRows('date BETWEEN ? AND ?', job.from, job.to),
  ]);
  students.sort((a, b) => collator.compare(a.group_name, b.group_name) || collator.compare(a.full_name, b.full_name));

  // 1. Топтар
  const ws = wb.addWorksheet(t.summary);
  titleBlock(ws, [t.reportAll, fmt(t.period, { from: dmy(job.from), to: dmy(job.to) })], 5);
  const top = ws.rowCount;
  const head = [t.group, t.specialty, t.course, t.count, t.lessons, ...STATUSES.map((s) => d[s] as string), t.rate];
  headerRow(ws, head).height = 32;
  for (const g of groups) {
    const list = students.filter((s) => s.group_name === g.name);
    const s = tally(list.flatMap((x) => x.statuses));
    const row = ws.addRow([g.name, g.specialty, g.course, list.length, s.total, ...STATUSES.map((k) => s[k as keyof typeof s] || null)]);
    rateCell(row, head.length, s.rate);
    border(row);
  }
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 34;
  for (let c = 3; c <= head.length; c++) {
    ws.getColumn(c).width = 12;
    ws.getColumn(c).alignment = { horizontal: 'center' };
  }
  ws.views = [{ state: 'frozen', ySplit: top + 1 }];

  // 2. Барлық студенттер
  const wst = wb.addWorksheet(t.students);
  statsSheet(wst, job.lang, students.map((s) => ({ name: s.full_name, group: s.group_name, statuses: s.statuses })), true);
  wst.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 + STATUSES.length } };
  wst.views = [{ state: 'frozen', ySplit: 1 }];

  // 3. Келмегендер
  absencesSheet(wb.addWorksheet(t.absences), job.lang, absences, true);
}

export const exportName = (lang: Lang, group: string | null, from: string, to: string) =>
  [lang === 'ru' ? 'Посещаемость' : 'Қатысу', group, from, to].filter(Boolean).join('_').replace(/[\\/:*?"<>|\s]+/g, '_') + '.xlsx';

/** Excel файлын жасайды. Қолтаңба дұрыс болса да, қолданушы әлі деканатта екені тексеріледі. */
export async function buildExport(job: ExportJob): Promise<{ name: string; data: Buffer } | null> {
  const user = await get('SELECT id FROM users WHERE id = ? AND role = ?', job.u, 'admin');
  if (!user) return null;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Түгел';
  wb.created = new Date();
  let group: string | null = null;
  if (job.g) {
    group = await groupReport(wb, job);
    if (!group) return null;
  } else await allGroupsReport(wb, job);
  const data = Buffer.from(await wb.xlsx.writeBuffer());
  return { name: exportName(job.lang, group, job.from, job.to), data };
}
