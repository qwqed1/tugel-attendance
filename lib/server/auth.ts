import { createHmac, timingSafeEqual } from 'node:crypto';
import { get, run } from './db';

export type User = {
  id: number;
  telegram_id: number | null;
  full_name: string;
  role: 'teacher' | 'admin';
  position: string | null;
};

export const BOT_TOKEN = process.env.BOT_TOKEN || '';
// Демо режим: Telegram-сыз, рөлді қолмен таңдап кіруге болады.
export const DEMO = process.env.DEMO_MODE ? process.env.DEMO_MODE === '1' : !BOT_TOKEN;
const ADMIN_TG = Number(process.env.ADMIN_TELEGRAM_ID) || null;

/**
 * Telegram Mini App initData қолтаңбасын тексереді.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string, token = BOT_TOKEN, maxAgeSec = 86400) {
  if (!token || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date')) > maxAgeSec) return null;
  try {
    return JSON.parse(params.get('user') || '') as { id: number; first_name?: string; last_name?: string };
  } catch {
    return null;
  }
}

const COLS = 'id, telegram_id, full_name, role, position';

export type AuthResult = { user: User } | { status: number; body: Record<string, unknown> };

export async function authenticate(req: Request): Promise<AuthResult> {
  const header = req.headers.get('authorization') || '';
  const demoId = req.headers.get('x-demo-user');

  if (DEMO && demoId) {
    const user = await get<User>(`SELECT ${COLS} FROM users WHERE id = ?`, Number(demoId));
    if (user) return { user };
  }
  if (header.startsWith('tma ')) {
    const tg = verifyInitData(header.slice(4));
    if (!tg) return { status: 401, body: { error: 'bad_init_data' } };
    let user = await get<User>(`SELECT ${COLS} FROM users WHERE telegram_id = ?`, tg.id);
    if (!user && ADMIN_TG === tg.id) {
      // Алғашқы әкімші .env арқылы тағайындалады
      const name = [tg.last_name, tg.first_name].filter(Boolean).join(' ') || 'Әкімші';
      user = (
        await run(
          `INSERT INTO users (telegram_id, full_name, role, position) VALUES (?, ?, 'admin', 'Деканат') RETURNING ${COLS}`,
          tg.id,
          name
        )
      )[0] as User;
    }
    if (!user) return { status: 403, body: { error: 'unknown_user', telegram_id: tg.id } };
    return { user };
  }
  return { status: 401, body: { error: 'unauthorized' } };
}

// ───────── Telegram бот (webhook) ─────────

export const WEBAPP_URL =
  process.env.WEBAPP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');

/** Webhook сұраныстарының шынымен Telegram-нан келгенін тексеретін құпия сөз */
export const webhookSecret = () => createHmac('sha256', 'webhook').update(BOT_TOKEN).digest('hex').slice(0, 40);

const tgApi = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function handleBotUpdate(update: any) {
  const msg = update?.message;
  if (!msg?.text) return;
  if (msg.text.startsWith('/id')) {
    await tgApi('sendMessage', { chat_id: msg.chat.id, text: `Сіздің Telegram ID: ${msg.from.id}` });
    return;
  }
  await tgApi('sendMessage', {
    chat_id: msg.chat.id,
    text: 'Сәлеметсіз бе! «Түгел» — сабаққа қатысуды есепке алу жүйесі.\nЖоқтама жасау үшін төмендегі батырманы басыңыз.',
    reply_markup: { inline_keyboard: [[{ text: 'Түгел қолданбасын ашу', web_app: { url: WEBAPP_URL } }]] },
  });
}
