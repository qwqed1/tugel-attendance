'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dict, type Lang } from './dict';

export type Status = 'present' | 'absent' | 'late' | 'sick' | 'excused' | 'exempt';
export type Cell = Status | null;
export type User = { id: number; telegram_id: number | null; full_name: string; role: 'teacher' | 'admin'; position: string | null };

export const PAIRS: Record<number, [string, string]> = {
  1: ['08:30', '09:50'], 2: ['10:00', '11:20'], 3: ['11:30', '12:50'],
  4: ['13:30', '14:50'], 5: ['15:00', '16:20'], 6: ['16:30', '17:50'],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type TG = any;
export const tg = (): TG | undefined => (typeof window === 'undefined' ? undefined : (window as any).Telegram?.WebApp);
export const haptic = (kind: 'tap' | 'success' | 'error' = 'tap') => {
  const h = tg()?.HapticFeedback;
  try {
    if (kind === 'tap') h?.selectionChanged();
    else h?.notificationOccurred(kind);
  } catch {}
};

/** Растау терезесі: Telegram ішінде — өзінікі, браузерде — стандартты */
export const ask = (text: string) =>
  new Promise<boolean>((resolve) => {
    const w = tg();
    if (w?.initData && w.showConfirm) w.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });

// ───────── API ─────────

export class ApiError extends Error {
  constructor(public code: string, public status = 0, public data: any = null) {
    super(code);
  }
}

const auth: { demoId: string | null } = { demoId: null };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth.demoId) headers['x-demo-user'] = auth.demoId;
  else if (tg()?.initData) headers.authorization = `tma ${tg().initData}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch {
    throw new ApiError('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'generic', res.status, data);
  return data;
}

// ───────── Күн көмекшілері ─────────

export function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const parse = (iso: string) => new Date(iso + 'T00:00:00Z');
export const weekdayIndex = (iso: string) => (parse(iso).getUTCDay() + 6) % 7;
export const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

// ───────── Контекст ─────────

type Vars = Record<string, string | number>;
type App = {
  ready: boolean;
  user: User | null;
  demo: boolean;
  unknownTg: number | null;
  loginError: string | null;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Vars) => string;
  list: (key: string) => string[];
  dayMonth: (iso: string) => string;
  longDate: (iso: string) => string;
  errText: (e: unknown) => string;
  date: string;
  setDate: (d: string) => void;
  login: (id: number) => Promise<void>;
  logout: () => void;
  toast: (text: string) => void;
};

const Ctx = createContext<App | null>(null);
export const useApp = () => useContext(Ctx)!;

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [demo, setDemo] = useState(false);
  const [unknownTg, setUnknownTg] = useState<number | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>('kk');
  const [date, setDate] = useState('');
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const w = tg();
    try {
      w?.ready();
      w?.expand();
      w?.setHeaderColor?.('#000000');
      w?.setBackgroundColor?.('#ffffff');
    } catch {}
    (async () => {
      setDate(todayISO());
      try {
        const saved = localStorage.getItem('lang');
        if (saved === 'kk' || saved === 'ru') setLangState(saved);
        else if (w?.initDataUnsafe?.user?.language_code === 'ru') setLangState('ru');
        // ?demo=ID сілтемесі арқылы демо қолданушымен бірден кіруге болады
        const fromUrl = new URLSearchParams(location.search).get('demo');
        if (fromUrl) sessionStorage.setItem('demoUser', fromUrl);
        auth.demoId = sessionStorage.getItem('demoUser');
      } catch {}
      const failed = (e: unknown) => {
        if (e instanceof ApiError && e.code === 'unknown_user') setUnknownTg(e.data.telegram_id);
        else setLoginError(e instanceof ApiError ? e.code : 'generic');
      };
      try {
        setDemo((await api('/config')).demo);
        if (auth.demoId || w?.initData) setUser(await api<User>('/me'));
      } catch (e) {
        if (auth.demoId) {
          // Сақталып қалған демо кіру жарамсыз болса, оны өшіріп, Telegram арқылы қайта кіреміз
          auth.demoId = null;
          try {
            sessionStorage.removeItem('demoUser');
          } catch {}
          if (w?.initData) await api<User>('/me').then(setUser, failed);
        } else failed(e);
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {}
  }, []);

  const value = useMemo<App>(() => {
    const d = dict[lang];
    const t = (key: string, vars?: Vars) => {
      let s = typeof d[key] === 'string' ? (d[key] as string) : key;
      if (vars) for (const k in vars) s = s.replace(`{${k}}`, String(vars[k]));
      return s;
    };
    const list = (key: string) => (Array.isArray(d[key]) ? (d[key] as string[]) : []);
    const dayMonth = (iso: string) => `${parse(iso).getUTCDate()} ${list('months')[parse(iso).getUTCMonth()]}`;
    return {
      ready, user, demo, unknownTg, loginError, lang, setLang, t, list, dayMonth,
      longDate: (iso) => `${list('weekdays')[weekdayIndex(iso)]}, ${dayMonth(iso)}`,
      errText: (e) => {
        const code = e instanceof ApiError ? e.code : 'generic';
        return typeof d[`err_${code}`] === 'string' ? t(`err_${code}`) : t('err_generic');
      },
      date, setDate,
      login: async (id) => {
        auth.demoId = String(id);
        try {
          sessionStorage.setItem('demoUser', auth.demoId);
        } catch {}
        setUser(await api<User>('/me'));
      },
      logout: () => {
        auth.demoId = null;
        try {
          sessionStorage.removeItem('demoUser');
        } catch {}
        setUser(null);
      },
      toast: (text) => {
        setToastText(text);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastText(null), 2200);
      },
    };
  }, [ready, user, demo, unknownTg, loginError, lang, setLang, date]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastText && (
        <div role="status" className="toast">
          {toastText}
        </div>
      )}
    </Ctx.Provider>
  );
}
