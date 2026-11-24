'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { GroupSheet } from '@/components/forms';
import { addDays, todayISO, useApp } from '@/lib/app';
import { BottomNav, Brand, ExportButton, LangToggle, LoadError, Loading, Meter, PeriodTabs, useData } from '@/components/ui';

type Group = { id: number; name: string; course: number; specialty: string; students: number; rate: number | null; absent: number };

export default function Groups() {
  const { t } = useApp();
  const [period, setPeriod] = useState(30);
  const [adding, setAdding] = useState(false);
  const { data, error, mutate } = useData<{ groups: Group[] }>(`/admin/groups?from=${addDays(todayISO(), 1 - period)}`);
  return (
    <>
      <header className="bg-ink px-4 pt-4 pb-5 text-white">
        <div className="flex items-center justify-between">
          <Brand />
          <LangToggle />
        </div>
        <h1 className="mt-6 font-display text-[26px] font-bold">{t('groups')}</h1>
        <button onClick={() => setAdding(true)} className="mt-5 flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] bg-white font-display text-[15px] font-bold text-ink active:bg-white/85">
          <Plus size={19} strokeWidth={2.6} />
          {t('addGroup')}
        </button>
        <PeriodTabs value={period} onChange={setPeriod} />
        <ExportButton period={period} />
      </header>
      <main className="pb-28">
        {error && !data ? (
          <LoadError error={error} retry={() => mutate()} />
        ) : !data ? (
          <Loading />
        ) : (
          data.groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="block border-b border-line px-4 py-5 active:bg-fog">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-[20px] font-bold">{g.name}</p>
                  <p className="mt-0.5 truncate text-[13px] text-mute">
                    {g.specialty}, {t('course', { n: g.course })}
                  </p>
                </div>
                <p className={`font-display text-[30px] leading-none font-extrabold tabular-nums ${g.rate != null && g.rate < 75 ? 'text-red' : ''}`}>
                  {g.rate ?? '—'}
                  {g.rate != null && <span className="text-[15px]">%</span>}
                </p>
              </div>
              <div className="mt-3">
                <Meter value={g.rate} />
              </div>
              <p className="mt-2 text-[13px] text-mute tabular-nums">
                {t('studentsCount', { n: g.students })}, {t('absent').toLowerCase()}: {g.absent}
              </p>
            </Link>
          ))
        )}
      </main>
      <BottomNav />
      {adding && <GroupSheet onClose={() => setAdding(false)} />}
    </>
  );
}
