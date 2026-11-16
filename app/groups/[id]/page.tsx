'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, Pencil, Plus } from 'lucide-react';
import { GroupSheet, StudentSheet } from '@/components/forms';
import { addDays, todayISO, useApp } from '@/lib/app';
import { Empty, LoadError, Loading, Meter, PeriodTabs, SubTop, useData } from '@/components/ui';

type Row = { id: number; full_name: string; total: number; rate: number | null; absent: number; late: number; sick: number; excused: number; exempt: number };
type Data = { group: { id: number; name: string; specialty: string; course: number }; students: Row[] };

export default function Group() {
  const { id } = useParams<{ id: string }>();
  const { t } = useApp();
  const [period, setPeriod] = useState(30);
  const [sheet, setSheet] = useState<'student' | 'group' | null>(null);
  const { data, error, mutate } = useData<Data>(`/admin/groups/${id}?from=${addDays(todayISO(), 1 - period)}`);
  // Қатысуы төмен студенттер жоғарыда
  const students = data ? [...data.students].sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)) : [];
  return (
    <>
      <SubTop back="/groups" title={data?.group.name ?? ' '} sub={data && `${data.group.specialty}, ${t('course', { n: data.group.course })}`}>
        <div className="mt-5 flex gap-2">
          <button onClick={() => setSheet('student')} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-white text-[14px] font-semibold text-ink active:bg-white/85">
            <Plus size={18} strokeWidth={2.6} />
            {t('addStudent')}
          </button>
          <Link href={`/groups/${id}/timetable`} className="flex h-12 items-center justify-center gap-2 rounded-[14px] border border-white/30 px-4 text-[14px] font-semibold active:bg-white/10">
            <CalendarDays size={16} />
            {t('timetable')}
          </Link>
          <button onClick={() => setSheet('group')} disabled={!data} aria-label={t('edit')} className="grid h-12 w-12 flex-none place-items-center rounded-[14px] border border-white/30 active:bg-white/10">
            <Pencil size={16} />
          </button>
        </div>
        <PeriodTabs value={period} onChange={setPeriod} />
      </SubTop>
      <main className="pb-10">
        {error && !data ? (
          <LoadError error={error} retry={() => mutate()} />
        ) : !data ? (
          <Loading rows={8} />
        ) : !students.length ? (
          <Empty title={t('emptyGroup')} hint={t('emptyGroupHint')} />
        ) : (
          students.map((s) => (
            <Link key={s.id} href={`/students/${s.id}`} className="block border-b border-line px-4 py-3.5 active:bg-fog">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[16px] font-semibold">{s.full_name}</span>
                <span className={`flex-none font-display text-[15px] font-bold tabular-nums ${s.rate != null && s.rate < 75 ? 'text-red' : ''}`}>{s.rate != null ? `${s.rate}%` : '—'}</span>
              </div>
              <div className="mt-2">
                <Meter value={s.rate} />
              </div>
              <p className="mt-1.5 text-[12.5px] text-mute tabular-nums">
                {s.total === 0
                  ? t('noData')
                  : (['absent', 'late', 'sick', 'excused', 'exempt'] as const)
                      .filter((k) => s[k] > 0)
                      .map((k) => `${t(k).toLowerCase()} ${s[k]}`)
                      .join(', ') || t('noAbsences')}
              </p>
            </Link>
          ))
        )}
      </main>
      {sheet === 'student' && <StudentSheet groupId={Number(id)} onClose={() => setSheet(null)} />}
      {sheet === 'group' && data && <GroupSheet group={data.group} onClose={() => setSheet(null)} />}
    </>
  );
}
