'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, type ReactNode } from 'react';
import { api, tg, useApp, type Cell, type User } from '@/lib/app';
import { Brand, LangToggle } from './ui';

export const SeatField = dynamic(() => import('./seat-field').then((m) => m.SeatField), { ssr: false });

// Кіру бетіндегі сахна: аудитория бірте-бірте толады, бірнеше орын бос қалады
const FRAMES: Cell[][] = [
  'p p p a p p p p p|p p l p p p p a p|p p p p p s p p p',
  'p p p a p p p p p|p p p p p p p a p|p x p p p p p p p',
  'p p p p p p a p p|p p p p l p p p p|p p p a p p p p p',
].map((f) =>
  f.replaceAll('|', ' ').split(' ').map((c) => ({ p: 'present', a: 'absent', l: 'late', s: 'sick', x: 'exempt' })[c] as Cell)
);

export function Gate({ children }: { children: ReactNode }) {
  const { ready, user } = useApp();
  if (!ready) return <div className="grid min-h-dvh place-items-center bg-ink"><Brand /></div>;
  if (!user) return <Login />;
  return <>{children}</>;
}

function Login() {
  const { demo, unknownTg, loginError, login, t } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [teacher, setTeacher] = useState<number | null>(null);
  const [frame, setFrame] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!demo) return;
    api<User[]>('/demo/users').then((u) => {
      setUsers(u);
      setTeacher(u.find((x) => x.role === 'teacher')?.id ?? null);
    }).catch(() => {});
  }, [demo]);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 3200);
    return () => clearInterval(id);
  }, []);

  const enter = async (id?: number | null) => {
    if (!id || busy) return;
    setBusy(true);
    try {
      await login(id);
    } finally {
      setBusy(false);
    }
  };
  const admin = users.find((u) => u.role === 'admin');
  const teachers = users.filter((u) => u.role === 'teacher');

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <div className="flex justify-end px-4 pt-4">
        <LangToggle />
      </div>
      <SeatField clusters={[FRAMES[frame]]} className="h-[34dvh] min-h-[220px] w-full" />
      <div className="flex flex-1 flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <Brand size="lg" />
        <p className="mt-4 text-[17px] text-white/70">{t('tagline')}</p>

        <div className="mt-auto pt-10">
          {unknownTg ? (
            <div>
              <p className="font-display text-[19px] font-bold">{t('noAccess')}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-white/65">{t('noAccessHint')}</p>
              <button
                onClick={() => navigator.clipboard?.writeText(String(unknownTg))}
                className="mt-4 w-full rounded-[14px] border border-white/30 py-4 font-display text-[24px] font-bold tracking-wider tabular-nums active:bg-white/10"
              >
                {unknownTg}
              </button>
            </div>
          ) : null}

          {demo ? (
            <div className={unknownTg ? 'mt-8' : ''}>
              {teachers.length > 1 && (
                <select
                  value={teacher ?? ''}
                  onChange={(e) => setTeacher(Number(e.target.value))}
                  className="mb-3 h-12 w-full appearance-none rounded-[14px] border border-white/30 bg-ink px-4 text-[15px] text-white"
                  aria-label={t('role_teacher')}
                >
                  {teachers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              )}
              <button onClick={() => enter(teacher)} disabled={busy || !teacher} className="h-[54px] w-full rounded-[14px] bg-white font-display text-[15px] font-bold text-ink transition-transform active:scale-[0.985] disabled:opacity-50">
                {t('loginTeacher')}
              </button>
              <button onClick={() => enter(admin?.id)} disabled={busy || !admin} className="mt-3 h-[54px] w-full rounded-[14px] bg-red font-display text-[15px] font-bold text-white transition-transform active:scale-[0.985] disabled:opacity-50">
                {t('loginAdmin')}
              </button>
              <p className="mt-5 text-[13px] leading-relaxed text-white/45">{t('demoNote')}</p>
            </div>
          ) : (
            !unknownTg &&
            (tg()?.initData ? (
              <div>
                <p className="font-display text-[19px] font-bold">{t('loginFailed')}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-white/65">
                  {t(loginError === 'network' ? 'err_network' : 'loginFailedHint')}
                </p>
                <button onClick={() => location.reload()} className="mt-5 h-[54px] w-full rounded-[14px] bg-white font-display text-[15px] font-bold text-ink active:bg-white/85">
                  {t('retry')}
                </button>
                {loginError && <p className="mt-4 text-[12px] text-white/35">{loginError}</p>}
              </div>
            ) : (
              <p className="text-[15px] leading-relaxed text-white/70">{t('openInTelegram')}</p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
