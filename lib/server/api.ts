/* eslint-disable @typescript-eslint/no-explicit-any */
import { all, get, run, tx, ensureLessons, isDate, todayISO, addDays, STATUSES } from './db';
import { authenticate, BOT_TOKEN, DEMO, handleBotUpdate, webhookSecret, type User } from './auth';
import { buildExport, exportName, exportToken, readToken } from './export';

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
const fail = (code: string, status = 400): never => {
  throw new HttpError(status, code);
};

type Ctx = { user: User; params: string[]; query: URLSearchParams; body: any };
type Handler = (c: Ctx) => Promise<unknown>;
type Role = 'teacher' | 'admin' | 'any';

const collator = new Intl.Collator('kk');
const byName = (a: { full_name: string }, b: { full_name: string }) => collator.compare(a.full_name, b.full_name);
const dateParam = (v: string | null) => (isDate(v) ? v : todayISO());

function range(q: URLSearchParams): [string, string] {
  const to = q.get('to');
  const from = q.get('from');
  const end = isDate(to) ? to : todayISO();
  return [isDate(from) ? from : addDays(end, -29), end];
}

const LESSON_SQL = `
  SELECT l.id, l.date, l.pair, l.room, l.lesson_type, l.marked_at, l.teacher_id,
         g.id AS group_id, g.name AS group_name, sub.name AS subject, u.full_name AS teacher
  FROM lessons l
  JOIN groups g     ON g.id = l.group_id
  JOIN subjects sub ON sub.id = l.subject_id
  JOIN users u      ON u.id = l.teacher_id`;

type Lesson = { id: number; date: string; pair: number; group_id: number; group_name: string; subject: string; teacher_id: number; marked_at: string | null };

/** Сабақтағы топ тізімі: қойылған белгі және сол күнге жарамды бұйрық. */
async function roster(lesson: Lesson) {
  const rows = await all(
    `SELECT s.id, s.full_name, a.status AS saved, a.note,
            e.order_no, e.reason, e.date_from, e.date_to
     FROM students s
     LEFT JOIN attendance a ON a.student_id = s.id AND a.lesson_id = ?
     LEFT JOIN exemptions e ON e.id = (
       SELECT x.id FROM exemptions x
       WHERE x.student_id = s.id AND x.revoked_at IS NULL AND ?::date BETWEEN x.date_from AND x.date_to
       ORDER BY x.id DESC LIMIT 1)
     WHERE s.group_id = ? AND s.active`,
    lesson.id, lesson.date, lesson.group_id
  );
  return rows.sort(byName).map((r) => ({
    id: r.id as number,
    full_name: r.full_name as string,
    // Бұйрық бар болса, оқытушы белгі қоймай-ақ себебін бірден көреді
    status: (r.saved ?? (r.order_no ? 'exempt' : null)) as string | null,
    saved: r.saved != null,
    note: r.note as string | null,
    order: r.order_no
      ? { order_no: r.order_no, reason: r.reason, date_from: r.date_from, date_to: r.date_to }
      : null,
  }));
}

async function withStrip(lesson: Lesson) {
  const students = await roster(lesson);
  return { lesson: { ...lesson, total: students.length, strip: students.map((s) => s.status) }, students };
}

async function lessonFor(c: Ctx) {
  const lesson = (await get<Lesson>(`${LESSON_SQL} WHERE l.id = ?`, Number(c.params[0]))) ?? fail('not_found', 404);
  if (c.user.role !== 'admin' && lesson.teacher_id !== c.user.id) fail('forbidden', 403);
  return lesson;
}

const WEIGHT: Record<string, number> = { absent: 6, sick: 5, excused: 4, exempt: 3, late: 2, present: 1 };
const COUNTS = STATUSES.map((s) => `COUNT(*) FILTER (WHERE a.status = '${s}') AS ${s}`).join(', ');
// Босатылған сабақтар қатысу пайызын төмендетпейді
const rate = (r: any) => {
  const base = r.total - r.exempt;
  return base > 0 ? Math.round(((r.present + r.late) / base) * 100) : null;
};

async function exemptions(where = 'TRUE', ...params: number[]) {
  const today = todayISO();
  const rows = await all(
    `SELECT e.id, e.student_id, s.full_name, g.name AS group_name, e.order_no, e.date_from, e.date_to,
            e.reason, e.created_at, e.revoked_at, u.full_name AS issued_by
     FROM exemptions e
     JOIN students s ON s.id = e.student_id
     JOIN groups g   ON g.id = s.group_id
     JOIN users u    ON u.id = e.issued_by
     WHERE ${where}
     ORDER BY e.date_from DESC, e.id DESC`,
    ...params
  );
  return rows.map((e) => ({
    ...e,
    state: e.revoked_at ? 'revoked' : e.date_to < today ? 'past' : e.date_from > today ? 'upcoming' : 'active',
  }));
}

const users = () => all('SELECT id, telegram_id, full_name, role, position FROM users ORDER BY role, full_name');

function userInput(body: any) {
  const full_name = String(body?.full_name || '').trim().slice(0, 120);
  const role = body?.role === 'admin' ? 'admin' : 'teacher';
  const position = String(body?.position || '').trim().slice(0, 80) || null;
  const raw = String(body?.telegram_id ?? '').trim();
  if (raw && !/^\d{4,15}$/.test(raw)) fail('invalid_telegram_id');
  if (!full_name) fail('name_required');
  return { full_name, role, position, telegram_id: raw ? Number(raw) : null };
}

/**
 * Кесте өзгергенде бүгіннен бастап әлі жоқтама жасалмаған сабақтар өшіріледі:
 * олар жаңа кесте бойынша қайта жасалады. Белгіленген сабақтарға тимейді.
 */
const dropPendingLessons = (groupId: number, weekday: number, pair: number) =>
  run(
    `DELETE FROM lessons l
     WHERE l.group_id = ? AND l.pair = ? AND EXTRACT(ISODOW FROM l.date) = ? AND l.date >= ?::date
       AND l.marked_at IS NULL AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.lesson_id = l.id)`,
    groupId, pair, weekday, todayISO()
  );

function groupInput(body: any) {
  const name = String(body?.name || '').trim().slice(0, 20);
  const specialty = String(body?.specialty || '').trim().slice(0, 120);
  const course = Number(body?.course);
  if (!name) fail('group_name_required');
  if (!specialty) fail('specialty_required');
  if (!Number.isInteger(course) || course < 1 || course > 6) fail('invalid_course');
  return { name, specialty, course };
}

async function studentInput(body: any) {
  const full_name = String(body?.full_name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const group_id = Number(body?.group_id);
  if (!full_name) fail('name_required');
  if (!(await get('SELECT 1 AS ok FROM groups WHERE id = ?', group_id || 0))) fail('group_required');
  return { full_name, group_id };
}

const routes: [string, RegExp, Role, Handler][] = [
  ['GET', /^me$/, 'any', async (c) => c.user],

  // ───────── Оқытушы ─────────
  ['GET', /^teacher\/lessons$/, 'teacher', async (c) => {
    const date = dateParam(c.query.get('date'));
    await ensureLessons(date);
    const lessons = await all<Lesson>(`${LESSON_SQL} WHERE l.date = ? AND l.teacher_id = ? ORDER BY l.pair`, date, c.user.id);
    return { date, lessons: (await Promise.all(lessons.map(withStrip))).map((l) => l.lesson) };
  }],

  ['GET', /^lessons\/(\d+)$/, 'any', async (c) => {
    const lesson = await lessonFor(c);
    return { lesson, students: await roster(lesson), editable: lesson.teacher_id === c.user.id };
  }],

  ['PUT', /^lessons\/(\d+)\/attendance$/, 'teacher', async (c) => {
    const lesson = await lessonFor(c);
    const marks: any[] = Array.isArray(c.body?.marks) ? c.body.marks : fail('marks_required');
    const students = new Map((await roster(lesson)).map((s) => [s.id, s]));
    for (const m of marks) {
      const s = students.get(m.student_id);
      if (!s || !STATUSES.includes(m.status)) fail('invalid_mark');
      if (m.status === 'exempt' && !s!.order) fail('no_order_for_student');
    }
    const rows = marks.map((m) => ({
      student_id: m.student_id,
      status: m.status,
      note: typeof m.note === 'string' && m.note.trim() ? m.note.trim().slice(0, 200) : null,
    }));
    await tx(async () => {
      // Барлық белгі бір сұраныспен жазылады
      await run(
        `INSERT INTO attendance (lesson_id, student_id, status, note, marked_by)
         SELECT ?, x.student_id, x.status, x.note, ?
         FROM json_to_recordset(?::json) AS x(student_id int, status text, note text)
         ON CONFLICT (lesson_id, student_id) DO UPDATE SET
           status = excluded.status, note = excluded.note,
           marked_by = excluded.marked_by, marked_at = now()`,
        lesson.id, c.user.id, JSON.stringify(rows)
      );
      await run('UPDATE lessons SET marked_at = now() WHERE id = ?', lesson.id);
    });
    return { lesson: await get(`${LESSON_SQL} WHERE l.id = ?`, lesson.id), students: await roster(lesson), editable: true };
  }],

  // ───────── Деканат ─────────
  ['GET', /^admin\/overview$/, 'admin', async (c) => {
    const date = dateParam(c.query.get('date'));
    await ensureLessons(date);
    const [lessonRows, groupRows, studentRows] = await Promise.all([
      all<Lesson>(`${LESSON_SQL} WHERE l.date = ? ORDER BY l.pair, g.name`, date),
      all('SELECT id, name FROM groups ORDER BY name'),
      all('SELECT id, group_id, full_name FROM students WHERE active'),
    ]);
    const lessons = await Promise.all(lessonRows.map(withStrip));

    // Әр студенттің сол күнгі ең «ауыр» күйі
    const people = new Map<number, any>();
    for (const { lesson: l, students } of lessons) {
      for (const s of students) {
        if (!s.status) continue;
        let p = people.get(s.id);
        if (!p) people.set(s.id, (p = { id: s.id, full_name: s.full_name, group_name: l.group_name, status: s.status, order: s.order, marks: [] }));
        if (WEIGHT[s.status] > WEIGHT[p.status]) p.status = s.status;
        if (s.status !== 'present') p.marks.push({ pair: l.pair, subject: l.subject, status: s.status, note: s.note });
      }
    }

    const groups = groupRows.map((g) => {
      const students = studentRows.filter((s) => s.group_id === g.id).sort(byName);
      const strip: (string | null)[] = students.map((s) => people.get(s.id)?.status ?? null);
      const dayLessons = lessons.filter((l) => l.lesson.group_id === g.id);
      return {
        ...g,
        total: students.length,
        strip,
        missing: strip.filter((s) => s && s !== 'present' && s !== 'late').length,
        lessons: dayLessons.length,
        marked: dayLessons.filter((l) => l.lesson.marked_at).length,
      };
    });

    const totals: Record<string, number> = { present: 0, late: 0, absent: 0, sick: 0, excused: 0, exempt: 0, unmarked: 0 };
    let students = 0;
    for (const g of groups) for (const s of g.strip) { totals[s ?? 'unmarked']++; students++; }

    return {
      date,
      students,
      totals,
      groups,
      lessons: lessons.map((l) => l.lesson),
      missing: [...people.values()]
        .filter((p) => p.status !== 'present')
        .sort((a, b) => WEIGHT[b.status] - WEIGHT[a.status] || byName(a, b)),
    };
  }],

  ['GET', /^admin\/groups$/, 'admin', async (c) => {
    const [from, to] = range(c.query);
    const rows = await all(
      `SELECT g.id, g.name, g.course, g.specialty,
              (SELECT COUNT(*) FROM students s WHERE s.group_id = g.id AND s.active) AS students,
              COUNT(a.id) AS total, ${COUNTS}
       FROM groups g
       LEFT JOIN lessons l    ON l.group_id = g.id AND l.date BETWEEN ? AND ?
       LEFT JOIN attendance a ON a.lesson_id = l.id
       GROUP BY g.id ORDER BY g.name`,
      from, to
    );
    return { from, to, groups: rows.map((r) => ({ ...r, rate: rate(r) })) };
  }],

  ['GET', /^admin\/groups\/(\d+)$/, 'admin', async (c) => {
    const [from, to] = range(c.query);
    const group = (await get('SELECT * FROM groups WHERE id = ?', Number(c.params[0]))) ?? fail('not_found', 404);
    const students = await all(
      `SELECT s.id, s.full_name, COUNT(a.id) AS total, ${COUNTS}
       FROM students s
       LEFT JOIN attendance a ON a.student_id = s.id
         AND a.lesson_id IN (SELECT id FROM lessons WHERE date BETWEEN ? AND ?)
       WHERE s.group_id = ? AND s.active
       GROUP BY s.id`,
      from, to, group.id
    );
    return { from, to, group, students: students.sort(byName).map((r) => ({ ...r, rate: rate(r) })) };
  }],

  ['POST', /^admin\/groups$/, 'admin', async (c) => {
    const g = groupInput(c.body);
    try {
      return (await run('INSERT INTO groups (name, course, specialty) VALUES (?, ?, ?) RETURNING id', g.name, g.course, g.specialty))[0];
    } catch {
      return fail('group_name_taken', 409);
    }
  }],

  ['PATCH', /^admin\/groups\/(\d+)$/, 'admin', async (c) => {
    const g = groupInput(c.body);
    try {
      await run('UPDATE groups SET name = ?, course = ?, specialty = ? WHERE id = ?', g.name, g.course, g.specialty, Number(c.params[0]));
    } catch {
      fail('group_name_taken', 409);
    }
    return { ok: true };
  }],

  // ───── Кесте ─────
  ['GET', /^admin\/timetable$/, 'admin', async (c) => {
    const groupId = Number(c.query.get('group_id'));
    const group = (await get('SELECT id, name, course, specialty FROM groups WHERE id = ?', groupId || 0)) ?? fail('not_found', 404);
    const [slots, subjects, teachers] = await Promise.all([
      all(
        `SELECT t.id, t.weekday, t.pair, t.room, t.lesson_type, t.teacher_id, sub.name AS subject, u.full_name AS teacher
         FROM timetable t JOIN subjects sub ON sub.id = t.subject_id JOIN users u ON u.id = t.teacher_id
         WHERE t.group_id = ? ORDER BY t.weekday, t.pair`,
        group.id
      ),
      all('SELECT name FROM subjects ORDER BY name'),
      all("SELECT id, full_name FROM users WHERE role = 'teacher'"),
    ]);
    return { group, slots, subjects: subjects.map((x) => x.name), teachers: teachers.sort(byName) };
  }],

  ['POST', /^admin\/timetable$/, 'admin', async (c) => {
    const b = c.body || {};
    const weekday = Number(b.weekday);
    const pair = Number(b.pair);
    const groupId = Number(b.group_id);
    const teacherId = Number(b.teacher_id);
    const subject = String(b.subject || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const room = String(b.room || '').trim().slice(0, 20) || null;
    const type = ['lecture', 'practice', 'lab'].includes(b.lesson_type) ? b.lesson_type : 'lecture';
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !Number.isInteger(pair) || pair < 1 || pair > 6) fail('invalid_slot');
    if (!subject) fail('subject_required');
    if (!(await get('SELECT 1 AS ok FROM groups WHERE id = ?', groupId || 0))) fail('group_required');
    if (!(await get("SELECT 1 AS ok FROM users WHERE id = ? AND role = 'teacher'", teacherId || 0))) fail('teacher_required');
    // Бір оқытушы бір уақытта екі топта сабақ бере алмайды
    if (await get('SELECT 1 AS ok FROM timetable WHERE weekday = ? AND pair = ? AND teacher_id = ? AND group_id <> ?', weekday, pair, teacherId, groupId))
      fail('teacher_busy', 409);

    await tx(async () => {
      const [{ id: subjectId }] = await run(
        'INSERT INTO subjects (name) VALUES (?) ON CONFLICT (name) DO UPDATE SET name = excluded.name RETURNING id', subject);
      await run(
        `INSERT INTO timetable (weekday, pair, group_id, subject_id, teacher_id, room, lesson_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (weekday, pair, group_id) DO UPDATE SET
           subject_id = excluded.subject_id, teacher_id = excluded.teacher_id,
           room = excluded.room, lesson_type = excluded.lesson_type`,
        weekday, pair, groupId, subjectId, teacherId, room, type
      );
      await dropPendingLessons(groupId, weekday, pair);
    });
    return { ok: true };
  }],

  ['DELETE', /^admin\/timetable\/(\d+)$/, 'admin', async (c) => {
    await tx(async () => {
      const [slot] = await run('DELETE FROM timetable WHERE id = ? RETURNING group_id, weekday, pair', Number(c.params[0]));
      if (slot) await dropPendingLessons(slot.group_id, slot.weekday, slot.pair);
    });
    return { ok: true };
  }],

  ['POST', /^admin\/students$/, 'admin', async (c) => {
    const st = await studentInput(c.body);
    return (await run('INSERT INTO students (group_id, full_name) VALUES (?, ?) RETURNING id', st.group_id, st.full_name))[0];
  }],

  ['PATCH', /^admin\/students\/(\d+)$/, 'admin', async (c) => {
    const st = await studentInput(c.body);
    // active = false: студент оқудан шығарылды, бірақ қатысу тарихы сақталады
    await run('UPDATE students SET full_name = ?, group_id = ?, active = ? WHERE id = ?',
      st.full_name, st.group_id, c.body?.active !== false, Number(c.params[0]));
    return { ok: true };
  }],

  ['GET', /^admin\/students$/, 'admin', async () =>
    (await all(`SELECT s.id, s.full_name, s.group_id, g.name AS group_name
                FROM students s JOIN groups g ON g.id = s.group_id WHERE s.active`)).sort(byName)],

  ['GET', /^admin\/students\/(\d+)$/, 'admin', async (c) => {
    const [from, to] = range(c.query);
    const student = (await get(
      `SELECT s.id, s.full_name, s.group_id, g.name AS group_name, g.specialty, g.course
       FROM students s JOIN groups g ON g.id = s.group_id WHERE s.id = ?`,
      Number(c.params[0])
    )) ?? fail('not_found', 404);
    const [stats, records, orders] = await Promise.all([
      get(
        `SELECT COUNT(a.id) AS total, ${COUNTS} FROM attendance a
         JOIN lessons l ON l.id = a.lesson_id
         WHERE a.student_id = ? AND l.date BETWEEN ? AND ?`,
        student.id, from, to
      ),
      all(
        `SELECT date, pair, subject_name AS subject, status, note FROM v_attendance
         WHERE student_id = ? AND status <> 'present' AND date BETWEEN ? AND ?
         ORDER BY date DESC, pair DESC LIMIT 60`,
        student.id, from, to
      ),
      exemptions('e.student_id = ?', student.id),
    ]);
    return { from, to, student, stats: { ...stats, rate: rate(stats) }, records, orders };
  }],

  ['GET', /^admin\/exemptions$/, 'admin', async () => exemptions()],

  ['POST', /^admin\/exemptions$/, 'admin', async (c) => {
    const { student_ids, order_no, date_from, date_to, reason } = c.body || {};
    const no = String(order_no || '').trim();
    const why = String(reason || '').trim();
    if (!Array.isArray(student_ids) || !student_ids.length) fail('students_required');
    if (!no) fail('order_no_required');
    if (!why) fail('reason_required');
    if (!isDate(date_from) || !isDate(date_to) || date_to < date_from) fail('invalid_dates');

    await tx(async () => {
      for (const id of new Set<number>(student_ids.map(Number))) {
        if (!(await get('SELECT 1 AS ok FROM students WHERE id = ?', id))) fail('invalid_student');
        await run('INSERT INTO exemptions (student_id, order_no, date_from, date_to, reason, issued_by) VALUES (?, ?, ?, ?, ?, ?)',
          id, no.slice(0, 40), date_from, date_to, why.slice(0, 200), c.user.id);
        // Бұрын «жоқ» деп қойылған белгілер бұйрық шыққан соң «босатылған» болады
        await run(`UPDATE attendance SET status = 'exempt'
                   WHERE student_id = ? AND status = 'absent'
                     AND lesson_id IN (SELECT id FROM lessons WHERE date BETWEEN ? AND ?)`,
          id, date_from, date_to);
      }
    });
    return exemptions();
  }],

  ['POST', /^admin\/exemptions\/revoke$/, 'admin', async (c) => {
    const ids: number[] = Array.isArray(c.body?.ids) ? c.body.ids.map(Number) : [];
    await tx(async () => {
      for (const id of ids) {
        const e = await get('SELECT * FROM exemptions WHERE id = ? AND revoked_at IS NULL', id);
        if (!e) continue;
        await run('UPDATE exemptions SET revoked_at = now() WHERE id = ?', id);
        // Басқа жарамды бұйрық болмаса, «босатылған» белгілер қайтадан «жоқ» болады
        await run(`UPDATE attendance SET status = 'absent'
                   WHERE student_id = ? AND status = 'exempt' AND lesson_id IN (
                     SELECT l.id FROM lessons l WHERE l.date BETWEEN ? AND ? AND NOT EXISTS (
                       SELECT 1 FROM exemptions x WHERE x.student_id = ? AND x.revoked_at IS NULL
                         AND l.date BETWEEN x.date_from AND x.date_to))`,
          e.student_id, e.date_from, e.date_to, e.student_id);
      }
    });
    return exemptions();
  }],

  // Excel есебіне қол қойылған сілтеме (Telegram ішінде файл тек сілтеме арқылы жүктеледі)
  ['POST', /^admin\/export$/, 'admin', async (c) => {
    const [from, to] = range(new URLSearchParams({ from: String(c.body?.from ?? ''), to: String(c.body?.to ?? '') }));
    const g = Number(c.body?.group_id) || null;
    const lang = c.body?.lang === 'ru' ? 'ru' : 'kk';
    const group = g ? ((await get('SELECT name FROM groups WHERE id = ?', g)) ?? fail('not_found', 404)) : null;
    const token = exportToken({ u: c.user.id, g, from, to, lang });
    return { path: `/api/export?t=${token}`, file_name: exportName(lang, group?.name ?? null, from, to) };
  }],

  ['GET', /^admin\/users$/, 'admin', async () => users()],

  ['POST', /^admin\/users$/, 'admin', async (c) => {
    const u = userInput(c.body);
    try {
      await run('INSERT INTO users (telegram_id, full_name, role, position) VALUES (?, ?, ?, ?)', u.telegram_id, u.full_name, u.role, u.position);
    } catch {
      fail('telegram_id_taken', 409);
    }
    return users();
  }],

  ['PATCH', /^admin\/users\/(\d+)$/, 'admin', async (c) => {
    const id = Number(c.params[0]);
    const u = userInput(c.body);
    // Өз рөлін алып тастап, жүйені әкімшісіз қалдыруға болмайды
    if (id === c.user.id && u.role !== 'admin') fail('cannot_demote_self');
    try {
      await run('UPDATE users SET telegram_id = ?, full_name = ?, role = ?, position = ? WHERE id = ?', u.telegram_id, u.full_name, u.role, u.position, id);
    } catch {
      fail('telegram_id_taken', 409);
    }
    return users();
  }],
];

export async function handle(req: Request, segments: string[]): Promise<Response> {
  const path = segments.join('/');
  try {
    // Кірусіз қолжетімді
    if (req.method === 'GET' && path === 'config') return Response.json({ demo: DEMO });
    if (req.method === 'GET' && path === 'demo/users') {
      if (!DEMO) fail('not_found', 404);
      return Response.json(await all('SELECT id, full_name, role, position FROM users ORDER BY role DESC, id'));
    }
    if (req.method === 'POST' && path === 'telegram/webhook') {
      if (!BOT_TOKEN || req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) fail('forbidden', 403);
      await handleBotUpdate(await req.json().catch(() => null));
      return Response.json({ ok: true });
    }

    if (req.method === 'GET' && path === 'export') {
      const job = readToken(new URL(req.url).searchParams.get('t'));
      const file = job && (await buildExport(job));
      if (!file) fail('link_expired', 403);
      return new Response(new Uint8Array(file!.data), {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': `attachment; filename="report.xlsx"; filename*=UTF-8''${encodeURIComponent(file!.name)}`,
          'cache-control': 'private, no-store',
        },
      });
    }

    const auth = await authenticate(req);
    if (!('user' in auth)) {
      // Кіру қателерін журналға жазамыз (құпия деректерсіз)
      console.warn('auth failed:', auth.body.error, { tma: !!req.headers.get('authorization'), demo: !!req.headers.get('x-demo-user') });
      return Response.json(auth.body, { status: auth.status });
    }

    for (const [method, pattern, role, handler] of routes) {
      if (method !== req.method) continue;
      const m = pattern.exec(path);
      if (!m) continue;
      if (role !== 'any' && auth.user.role !== role) fail('forbidden', 403);
      const body = method === 'GET' ? null : await req.json().catch(() => null);
      const result = await handler({ user: auth.user, params: m.slice(1), query: new URL(req.url).searchParams, body });
      return Response.json(result);
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.code }, { status: e.status });
    console.error(e);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
