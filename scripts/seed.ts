// Дерекқорды құру және демо деректер: топтар, студенттер, кесте, соңғы 4 аптаның қатысуы, бұйрықтар.

import { readFileSync } from 'node:fs';
import { all, get, run, tx, ensureLessons, todayISO, addDays, closePool } from '../lib/server/db';

const SURNAMES = ['Ахметов', 'Нұрланов', 'Сейітов', 'Қасымов', 'Жұмабаев', 'Оспанов', 'Әбенов', 'Төлегенов',
  'Ермеков', 'Мұратов', 'Сұлтанов', 'Қалиев', 'Досжанов', 'Әлібеков', 'Темірбеков', 'Жақсыбеков', 'Байжанов',
  'Серікбаев', 'Кенжебаев', 'Рахымжанов', 'Тұрсынов', 'Омаров', 'Садықов', 'Есенов', 'Әміров', 'Шәкіров',
  'Мұқанов', 'Айтбаев', 'Бекмұхамбетов', 'Жүнісов', 'Қуанышев', 'Сағынтаев'];
const MALE = ['Нұрсұлтан', 'Ерлан', 'Данияр', 'Арман', 'Бауыржан', 'Дәулет', 'Әлихан', 'Санжар', 'Айбек', 'Мирас',
  'Ерасыл', 'Нұржан', 'Темірлан', 'Олжас', 'Дидар', 'Асхат', 'Жандос', 'Рүстем', 'Мағжан', 'Абылай', 'Бекзат',
  'Ислам', 'Диас', 'Алмас'];
const FEMALE = ['Айгерім', 'Динара', 'Әсел', 'Мадина', 'Жанар', 'Гүлнұр', 'Аружан', 'Айдана', 'Томирис', 'Назерке',
  'Камила', 'Дана', 'Меруерт', 'Ақбота', 'Сымбат', 'Балжан', 'Аяулым', 'Інжу', 'Жансая', 'Мөлдір', 'Айым',
  'Еркежан', 'Толғанай', 'Салтанат'];

const STAFF = [
  ['Нұрмағанбетова Айгүл Серікқызы', 'teacher', 'Аға оқытушы'],
  ['Қасымов Ерлан Болатұлы', 'teacher', 'Доцент'],
  ['Тоқтарова Гүлмира Асқарқызы', 'teacher', 'Оқытушы'],
  ['Есімов Бақытжан Мұратұлы', 'teacher', 'Профессор'],
  ['Жүнісова Сәуле Қайратқызы', 'teacher', 'Аға оқытушы'],
  ['Әбілқасымов Марат Төлеуұлы', 'admin', 'Декан орынбасары'],
];
// Әр оқытушыға екі пән (ретімен)
const SUBJECTS = [
  'Дерекқорлар жүйесі', 'Веб-бағдарламалау',
  'Алгоритмдер және деректер құрылымы', 'Объектіге бағытталған бағдарламалау',
  'Жоғары математика', 'Ықтималдықтар теориясы',
  'Компьютерлік желілер', 'Операциялық жүйелер',
  'Ақпараттық қауіпсіздік негіздері', 'Кәсіби ағылшын тілі',
];
const GROUPS: [string, number, string, number][] = [
  ['АЖ-241', 3, 'Ақпараттық жүйелер', 24],
  ['БҚ-242', 3, 'Бағдарламалық қамтамасыз ету', 26],
  ['ЕТ-251', 2, 'Есептеу техникасы', 22],
  ['АҚ-252', 2, 'Ақпараттық қауіпсіздік', 25],
];
type Stu = { id: number; reliability: number; sick: [string, string] | null };
const TYPES = ['lecture', 'practice', 'lab'];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Жолдар жиымын бір сұраныспен кірістіреді */
const bulk = (table: string, cols: Record<string, string>, rows: object[]) =>
  rows.length
    ? run(
        `INSERT INTO ${table} (${Object.keys(cols).join(', ')})
         SELECT ${Object.keys(cols).join(', ')} FROM json_to_recordset(?::json) AS x(${Object.entries(cols).map(([c, t]) => `${c} ${t}`).join(', ')})`,
        JSON.stringify(rows)
      )
    : Promise.resolve([]);

async function seed() {
  const rand = rng(20261116);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const today = todayISO();

  await tx(async () => {
    await bulk('users', { id: 'int', full_name: 'text', role: 'text', position: 'text' },
      STAFF.map(([full_name, role, position], i) => ({ id: i + 1, full_name, role, position })));
    const teachers = [1, 2, 3, 4, 5];
    const admin = 6;
    await bulk('subjects', { id: 'int', name: 'text' }, SUBJECTS.map((name, i) => ({ id: i + 1, name })));
    await bulk('groups', { id: 'int', name: 'text', course: 'int', specialty: 'text' },
      GROUPS.map(([name, course, specialty], i) => ({ id: i + 1, name, course, specialty })));

    const used = new Set<string>();
    const studentRows: object[] = [];
    let sid = 0;
    const groups = GROUPS.map(([, , , size], gi) => {
      const students: Stu[] = [];
      while (students.length < size) {
        const female = rand() < 0.45;
        const full = `${pick(SURNAMES)}${female ? 'а' : ''} ${pick(female ? FEMALE : MALE)}`;
        if (used.has(full)) continue;
        used.add(full);
        studentRows.push({ id: ++sid, group_id: gi + 1, full_name: full });
        // Көпшілігі тұрақты қатысады, әр топта бірнеше «қиын» студент бар
        students.push({ id: sid, reliability: rand() < 0.12 ? 0.6 + rand() * 0.2 : 0.93 + rand() * 0.065, sick: null });
      }
      return { id: gi + 1, students };
    });
    await bulk('students', { id: 'int', group_id: 'int', full_name: 'text' }, studentRows);

    // Апталық кесте: дс–жм күніне 3 жұп, сенбіде екі топта 2 жұп
    const slots: object[] = [];
    groups.forEach((g, gi) => {
      for (let d = 1; d <= 6; d++) {
        const pairs = d === 6 ? (gi % 2 === 0 ? [1, 2] : []) : gi < 2 ? [1, 2, 3] : [2, 3, 4];
        for (const p of pairs) {
          const t = (gi + 2 * d + p) % 5;
          const room = `${1 + (t % 3)}${String(10 + ((gi * 7 + p * 3 + d) % 30)).padStart(2, '0')}`;
          slots.push({ weekday: d, pair: p, group_id: g.id, subject_id: t * 2 + ((gi + d) % 2) + 1, teacher_id: teachers[t], room, lesson_type: TYPES[(p + d) % 3] });
        }
      }
    });
    await bulk('timetable', { weekday: 'int', pair: 'int', group_id: 'int', subject_id: 'int', teacher_id: 'int', room: 'text', lesson_type: 'text' }, slots);

    // Бұйрықтар
    const orders: [Stu[], string, number, number, string][] = [
      [groups[0].students.slice(3, 6), '214-с', -1, 4, 'Республикалық студенттер спартакиадасы'],
      [groups[1].students.slice(8, 9), '209-с', -3, 1, 'Бағдарламалаудан халықаралық олимпиада'],
      [groups[2].students.slice(5, 7), '198-с', -14, -10, 'Әскери комиссариатқа шақырту'],
      [groups[3].students.slice(11, 12), '217-с', 0, 2, 'Отбасы жағдайына байланысты'],
    ];
    const exempt = new Map<number, [string, string]>();
    const orderRows: object[] = [];
    for (const [students, order_no, from, to, reason] of orders)
      for (const s of students) {
        const range: [string, string] = [addDays(today, from), addDays(today, to)];
        exempt.set(s.id, range);
        orderRows.push({ student_id: s.id, order_no, date_from: range[0], date_to: range[1], reason, issued_by: admin });
      }
    await bulk('exemptions', { student_id: 'int', order_no: 'text', date_from: 'date', date_to: 'date', reason: 'text', issued_by: 'int' }, orderRows);

    // Ауырған кезеңдер
    for (const g of groups)
      for (const s of g.students)
        if (rand() < 0.18) {
          const start = -Math.floor(2 + rand() * 24);
          s.sick = [addDays(today, start), addDays(today, start + 1 + Math.floor(rand() * 3))];
        }

    for (let d = -28; d <= 0; d++) await ensureLessons(addDays(today, d));
    const lessons = await all<{ id: number; date: string; pair: number; group_id: number; teacher_id: number }>(
      'SELECT id, date, pair, group_id, teacher_id FROM lessons ORDER BY date, pair, group_id');

    const marks: object[] = [];
    const marked: number[] = [];
    for (const lesson of lessons) {
      // Бүгінгі күн: демо оқытушының сабақтары белгіленбеген күйде қалады
      if (lesson.date === today && (lesson.teacher_id === teachers[0] || lesson.pair > 3)) continue;
      marked.push(lesson.id);
      for (const s of groups[lesson.group_id - 1].students) {
        const ex = exempt.get(s.id);
        let status = 'present';
        let note: string | null = null;
        if (ex && lesson.date >= ex[0] && lesson.date <= ex[1]) status = 'exempt';
        else if (s.sick && lesson.date >= s.sick[0] && lesson.date <= s.sick[1]) status = 'sick';
        else if (rand() > s.reliability) {
          const r = rand();
          status = r < 0.6 ? 'absent' : r < 0.88 ? 'late' : 'excused';
          if (status === 'excused') note = pick(['Өтініш бойынша', 'Анықтама әкелді', 'Куратор рұқсатымен']);
        }
        marks.push({ lesson_id: lesson.id, student_id: s.id, status, note, marked_by: lesson.teacher_id });
      }
    }
    await bulk('attendance', { lesson_id: 'int', student_id: 'int', status: 'text', note: 'text', marked_by: 'int' }, marks);
    await run('UPDATE lessons SET marked_at = now() WHERE id = ANY(?::int[])', marked);

    // Қолмен берілген id-лерден кейін тізбектерді түзету
    for (const t of ['users', 'subjects', 'groups', 'students'])
      await run(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT MAX(id) FROM ${t}))`);
  });
}

async function main() {
  await run(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  if (process.argv.includes('--reset'))
    await run('TRUNCATE attendance, exemptions, lessons, timetable, students, subjects, groups, users RESTART IDENTITY CASCADE');
  if ((await get('SELECT COUNT(*) AS n FROM users'))!.n === 0) {
    await seed();
    console.log('Демо деректер жүктелді.');
  }
  console.log('Дайын:', (await get('SELECT COUNT(*) AS n FROM attendance'))!.n, 'қатысу жазбасы.');
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
