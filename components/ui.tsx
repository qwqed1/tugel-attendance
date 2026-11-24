'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, IdCard, LayoutGrid, LogOut, Users } from 'lucide-react';
import { addDays, api, haptic, PAIRS, tg, todayISO, useApp, weekdayIndex, type Cell } from '@/lib/app';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useData<T = any>(path: string | null) {
  return useSWR<T>(path, (p: string) => api<T>(p), { revalidateOnFocus: true, keepPreviousData: true });
}

/** Топтың бір жолдағы көрінісі: әр студент — бір ұяшық */
export function Strip({ cells, className = 'h-3' }: { cells: Cell[]; className?: string }) {
  return (
    <div className={`flex gap-[2px] ${className}`} aria-hidden>
      {cells.map((s, i) => (
        <i key={i} className={`c c-${s ?? 'none'}`} />
      ))}
    </div>
  );
}

export const Glyph = ({ status }: { status: Cell | 'unmarked' }) => (
  <i className={`glyph c-${status && status !== 'unmarked' ? status : 'none'}`} aria-hidden />
);

export function Chip({ status }: { status: Exclude<Cell, null> }) {
  const { t } = useApp();
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap">
      <Glyph status={status} />
      {t(status)}
    </span>
  );
}

export function Brand({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className={`inline-flex items-center font-display font-extrabold tracking-tight text-white ${lg ? 'gap-3 text-[56px] leading-none' : 'gap-2 text-[17px]'}`}>
      <span className={`flex ${lg ? 'gap-1' : 'gap-[3px]'}`} aria-hidden>
        <i className={`block bg-white ${lg ? 'h-11 w-2.5' : 'h-[15px] w-1'}`} />
        <i className={`block bg-white ${lg ? 'h-11 w-2.5' : 'h-[15px] w-1'}`} />
        <i className={`block bg-red ${lg ? 'h-11 w-2.5' : 'h-[15px] w-1'}`} />
      </span>
      Түгел
    </span>
  );
}

export function LangToggle() {
  const { lang, setLang } = useApp();
  return (
    <button
      onClick={() => setLang(lang === 'kk' ? 'ru' : 'kk')}
      className="h-9 rounded-full border border-white/30 px-3 text-[12px] font-semibold text-white active:bg-white/10"
      aria-label={lang === 'kk' ? 'Переключить на русский' : 'Қазақ тіліне ауыстыру'}
    >
      {lang === 'kk' ? 'Рус' : 'Қаз'}
    </button>
  );
}

function WeekStrip() {
  const { date, setDate, list, t } = useApp();
  const today = todayISO();
  const monday = addDays(date, -weekdayIndex(date));
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const go = (d: string) => {
    haptic();
    setDate(d);
  };
  return (
    <div className="mt-4 flex items-center gap-1">
      <button onClick={() => go(addDays(date, -7))} className="grid h-12 w-7 flex-none place-items-center text-white/60 active:text-white" aria-label="←">
        <ChevronLeft size={20} />
      </button>
      <div className="grid flex-1 grid-cols-6 gap-1">
        {days.map((d) => {
          const on = d === date;
          return (
            <button
              key={d}
              onClick={() => go(d)}
              aria-pressed={on}
              className={`relative flex h-14 flex-col items-center justify-center rounded-xl transition-colors ${on ? 'bg-red text-white' : 'text-white active:bg-white/10'}`}
            >
              <span className={`text-[11px] font-medium ${on ? 'text-white' : 'text-white/55'}`}>{list('wd')[weekdayIndex(d)]}</span>
              <span className="font-display text-[15px] font-bold tabular-nums">{Number(d.slice(8))}</span>
              {d === today && !on && <i className="absolute bottom-1.5 h-1 w-1 rounded-full bg-red" />}
            </button>
          );
        })}
      </div>
      <button onClick={() => go(addDays(date, 7))} className="grid h-12 w-7 flex-none place-items-center text-white/60 active:text-white" aria-label="→">
        <ChevronRight size={20} />
      </button>
      {date !== today && <span className="sr-only">{t('today')}</span>}
    </div>
  );
}

/** Басты беттердің қара тақырыбы: бренд, күн, апта жолағы */
export function HomeTop({ children }: { children?: ReactNode }) {
  const { user, demo, logout, longDate, date, setDate, t } = useApp();
  const today = todayISO();
  return (
    <header className="bg-ink px-4 pt-4 pb-5 text-white">
      <div className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-2">
          <LangToggle />
          {demo && (
            <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-full border border-white/30 active:bg-white/10" aria-label={t('logout')}>
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-white/55">{user?.full_name}</p>
          <h1 className="mt-0.5 font-display text-[22px] leading-tight font-bold">{longDate(date)}</h1>
        </div>
        {date !== today && (
          <button onClick={() => setDate(today)} className="h-9 flex-none rounded-full bg-white px-3.5 text-[13px] font-semibold text-ink active:bg-white/80">
            {t('today')}
          </button>
        )}
      </div>
      <WeekStrip />
      {children}
    </header>
  );
}

/** Ішкі беттердің тақырыбы: артқа қайту батырмасымен */
export function SubTop({ back, title, sub, children }: { back: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const b = tg()?.BackButton;
    if (!b || !tg()?.initData) return;
    const go = () => router.push(back);
    b.show();
    b.onClick(go);
    return () => {
      b.offClick(go);
      b.hide();
    };
  }, [back, router]);
  return (
    <header className="bg-ink px-4 pt-3 pb-5 text-white">
      <div className="flex items-center justify-between">
        <Link href={back} className="-ml-2 grid h-10 w-10 place-items-center rounded-full active:bg-white/10" aria-label="←">
          <ChevronLeft size={24} />
        </Link>
        <LangToggle />
      </div>
      <h1 className="mt-3 font-display text-[26px] leading-[1.15] font-bold text-balance">{title}</h1>
      {sub && <p className="mt-1.5 text-[14px] leading-snug text-white/60">{sub}</p>}
      {children}
    </header>
  );
}

export function BottomNav() {
  const { t } = useApp();
  const path = usePathname();
  const items = [
    ['/', 'overview', LayoutGrid],
    ['/groups', 'groups', Users],
    ['/orders', 'orders', FileText],
    ['/staff', 'staff', IdCard],
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-[520px] grid-cols-4 border-t-[1.5px] border-ink bg-paper pb-[env(safe-area-inset-bottom)]">
      {items.map(([href, key, Icon]) => {
        const on = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${on ? 'text-ink' : 'text-ash'}`}>
            {on && <i className="absolute top-0 h-[3px] w-10 bg-red" />}
            <Icon size={21} strokeWidth={on ? 2.4 : 1.8} />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/55" onClick={onClose}>
      <div role="dialog" aria-modal className="sheet max-h-[88dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[24px] bg-paper px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <i className="mx-auto block h-1 w-10 rounded-full bg-line" />
        <h2 className="mt-4 mb-4 font-display text-[19px] leading-tight font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function PrimaryButton({ children, className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] bg-red font-display text-[15px] font-bold text-white transition-[background,transform] active:scale-[0.985] active:bg-red-deep disabled:bg-fog disabled:text-ash ${className}`}
    >
      {children}
    </button>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-14">
      <div className="hatch h-10 w-16 opacity-80" aria-hidden />
      <p className="mt-5 font-display text-[19px] leading-tight font-bold">{title}</p>
      {hint && <p className="mt-2 max-w-[34ch] text-[14px] leading-relaxed text-mute">{hint}</p>}
    </div>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-[72px] rounded-xl" />
      ))}
    </div>
  );
}

export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const { errText, t } = useApp();
  return (
    <div className="px-4 py-12">
      <p className="text-[15px] leading-relaxed">{errText(error)}</p>
      <button onClick={retry} className="mt-4 h-11 rounded-xl border-[1.5px] border-ink px-5 text-[14px] font-semibold active:bg-fog">
        {t('retry')}
      </button>
    </div>
  );
}

export const SectionTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="flex items-baseline justify-between px-4 pt-8 pb-3">
    <h2 className="font-display text-[17px] font-bold">{children}</h2>
    {aside && <span className="text-[13px] text-mute tabular-nums">{aside}</span>}
  </div>
);

/** Қатысу пайызы: 75%-дан төмен болса қызыл */
export function Meter({ value }: { value: number | null }) {
  return (
    <div className="h-[6px] w-full bg-fog">
      {value != null && <div className={`h-full ${value < 75 ? 'bg-red' : 'bg-ink'}`} style={{ width: `${value}%` }} />}
    </div>
  );
}

export function PeriodTabs({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useApp();
  return (
    <div className="mt-5 grid grid-cols-3 rounded-xl border border-white/25 p-1">
      {[7, 30, 90].map((n) => (
        <button key={n} onClick={() => onChange(n)} aria-pressed={n === value} className={`h-9 rounded-lg text-[13px] font-semibold transition-colors ${n === value ? 'bg-white text-ink' : 'text-white/70'}`}>
          {t(`period${n}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * Excel есебін жүктеу. Сервер 10 минутқа жарамды сілтеме береді:
 * Telegram ішінде — downloadFile (Bot API 8.0+) немесе сыртқы браузер, әйтпесе — кәдімгі жүктеу.
 */
export function ExportButton({ period, groupId }: { period: number; groupId?: number }) {
  const { t, lang, toast, errText } = useApp();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    haptic();
    try {
      const to = todayISO();
      const { path, file_name } = await api<{ path: string; file_name: string }>('/admin/export', {
        method: 'POST',
        body: { group_id: groupId, from: addDays(to, 1 - period), to, lang },
      });
      const url = location.origin + path;
      const w = tg();
      if (w?.initData && w.downloadFile && w.isVersionAtLeast?.('8.0')) w.downloadFile({ url, file_name });
      else if (w?.initData && w.openLink) w.openLink(url);
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = file_name;
        a.click();
      }
      toast(t('exportReady'));
    } catch (e) {
      haptic('error');
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={run} disabled={busy} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-white/30 text-[14px] font-semibold active:bg-white/10 disabled:opacity-50">
      <FileSpreadsheet size={17} />
      {busy ? t('exportBusy') : `${t('exportExcel')} · ${t(`period${period}`)}`}
    </button>
  );
}

export type LessonRow = {
  id: number; pair: number; room: string; lesson_type: string; marked_at: string | null;
  group_name: string; subject: string; teacher: string; total: number; strip: Cell[];
};

export function LessonItem({ lesson: l, showTeacher }: { lesson: LessonRow; showTeacher?: boolean }) {
  const { t } = useApp();
  const here = l.strip.filter((s) => s === 'present' || s === 'late').length;
  return (
    <Link href={`/lesson/${l.id}`} className="flex gap-4 border-b border-line px-4 py-5 active:bg-fog">
      <div className="w-9 flex-none font-display text-[40px] leading-[0.9] font-extrabold tabular-nums">{l.pair}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-mute tabular-nums">
          {PAIRS[l.pair][0]}–{PAIRS[l.pair][1]}, {l.room} {t('room')}
        </p>
        <p className="mt-0.5 text-[17px] leading-snug font-semibold">{l.subject}</p>
        <p className="mt-0.5 truncate text-[13px] text-mute">
          {l.group_name}, {t(l.lesson_type)}
          {showTeacher && `, ${l.teacher.split(' ').slice(0, 2).join(' ')}`}
        </p>
        <Strip cells={l.strip} className="mt-3 h-3" />
        <div className="mt-2.5 flex items-center justify-between">
          {l.marked_at ? (
            <span className="text-[13px] font-semibold tabular-nums">
              {here}/{l.total} {t('attended')}
            </span>
          ) : showTeacher ? (
            <span className="text-[13px] font-semibold text-red">{t('unmarked')}</span>
          ) : (
            <span className="inline-flex h-8 items-center rounded-full bg-red px-3.5 text-[13px] font-semibold text-white">{t('takeRoll')}</span>
          )}
          <ChevronRight size={18} className="text-ash" />
        </div>
      </div>
    </Link>
  );
}
