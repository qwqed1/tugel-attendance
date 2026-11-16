import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, types, type PoolClient } from 'pg';

// DATE бағандары 'YYYY-MM-DD' жолы күйінде, COUNT/SUM нәтижелері сан күйінде қайтарылады
types.setTypeParser(1082, (v) => v);
types.setTypeParser(20, (v) => Number(v));

// Dev режимінде модуль қайта жүктелгенде қосылымдар көбеймеуі үшін
const g = globalThis as unknown as { __tugelPool?: Pool };

function pool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL орнатылмаған');
  return (g.__tugelPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 }));
}

const txClient = new AsyncLocalStorage<PoolClient>();

/** «?» таңбаларын PostgreSQL-дің $1, $2 … параметрлеріне айналдырады */
const pg = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

type P = unknown[];
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function all<T = any>(sql: string, ...p: P): Promise<T[]> {
  return (await (txClient.getStore() ?? pool()).query(pg(sql), p)).rows as T[];
}
export const get = async <T = any>(sql: string, ...p: P) => (await all<T>(sql, ...p))[0] as T | undefined;
export const run = all;

/** Транзакция: ішіндегі барлық сұраныс бір қосылым арқылы орындалады */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await txClient.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export const closePool = () => g.__tugelPool?.end();

export const STATUSES = ['present', 'absent', 'late', 'sick', 'excused', 'exempt'] as const;

export const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Университеттің уақыт белдеуіндегі бүгінгі күн (сервер UTC-де жұмыс істейді) */
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Asia/Almaty' }).format(new Date());
}

export function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1 = дүйсенбі … 7 = жексенбі */
export const weekdayOf = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay() || 7;

/** Кестедегі үлгі бойынша берілген күннің сабақтарын жасайды (бар болса, тимейді). */
export async function ensureLessons(date: string) {
  await run(
    `INSERT INTO lessons (date, pair, group_id, subject_id, teacher_id, room, lesson_type)
     SELECT ?::date, pair, group_id, subject_id, teacher_id, room, lesson_type
     FROM timetable WHERE weekday = ?
     ON CONFLICT (date, pair, group_id) DO NOTHING`,
    date,
    weekdayOf(date)
  );
}
