'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { StudentSheet } from '@/components/forms';
import { addDays, shortDate, todayISO, useApp, type Status } from '@/lib/app';
import { Chip, Glyph, LoadError, Loading, Meter, PeriodTabs, SectionTitle, SubTop, useData } from '@/components/ui';

type Data = {
  student: { id: number; full_name: string; group_id: number; group_name: string; specialty: string };
  stats: Record<Status, number> & { total: number; rate: number | null };
  records: { date: string; pair: number; subject: string; status: Status; note: string | null }[];
  orders: { id: number; order_no: string; date_from: string; date_to: string; reason: string; state: string }[];
};

export default function Student() {
  const { id } = useParams<{ id: string }>();
  const { t, dayMonth } = useApp();
  const [period, setPeriod] = useState(30);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const { data, error, mutate } = useData<Data>(`/admin/students/${id}?from=${addDays(todayISO(), 1 - period)}`);
  const s = data?.stats;
  return (
    <>
      <SubTop back={data ? `/groups/${data.student.group_id}` : '/groups'} title={data?.student.full_name ?? ' '} sub={data && `${data.student.group_name}, ${data.student.specialty}`}>
        <button onClick={() => setEditing(true)} disabled={!data} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-white/30 text-[14px] font-semibold active:bg-white/10">
          <Pencil size={15} />
          {t('edit')}
        </button>
        <PeriodTabs value={period} onChange={setPeriod} />
      </SubTop>
      <main className="pb-32">
        {error && !data ? (
          <LoadError error={error} retry={() => mutate()} />
        ) : !data || !s ? (
          <Loading />
        ) : (
          <>
            <section className="px-4 pt-6">
              <div className="flex items-end justify-between">
                <span className="text-[14px] text-mute">{t('attendanceRate')}</span>
                <span className={`font-display text-[44px] leading-[0.85] font-extrabold tabular-nums ${s.rate != null && s.rate < 75 ? 'text-red' : ''}`}>
                  {s.rate ?? '—'}
                  {s.rate != null && <span className="text-[20px]">%</span>}
                </span>
              </div>
              <div className="mt-3">
                <Meter value={s.rate} />
              </div>
              <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5">
                {(['present', 'late', 'absent', 'sick', 'excused', 'exempt'] as Status[]).map((k) => (
                  <li key={k} className="flex items-center gap-2 text-[14px]">
                    <Glyph status={k} />
                    <span className="flex-1 text-mute">{t(k)}</span>
                    <span className="font-semibold tabular-nums">{s[k]}</span>
                  </li>
                ))}
              </ul>
            </section>

            {data.orders.length > 0 && (
              <>
                <SectionTitle>{t('studentOrders')}</SectionTitle>
                <ul className="border-t border-line">
                  {data.orders.map((o) => (
                    <li key={o.id} className="relative border-b border-line py-3.5 pr-4 pl-5">
                      <i className={`absolute inset-y-0 left-0 w-[5px] ${o.state === 'active' ? 'hatch' : 'bg-line'}`} aria-hidden />
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-display text-[15px] font-bold">№ {o.order_no}</span>
                        <span className="text-[13px] text-mute">{t(`state_${o.state}`)}</span>
                      </div>
                      <p className="mt-1 text-[14px]">{o.reason}</p>
                      <p className="text-[13px] text-mute">
                        {dayMonth(o.date_from)} – {dayMonth(o.date_to)}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <SectionTitle aside={data.records.length || undefined}>{t('absences')}</SectionTitle>
            {data.records.length ? (
              <ul className="border-t border-line">
                {data.records.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <span className="w-12 flex-none font-display text-[13px] font-bold tabular-nums">{shortDate(r.date)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px]">{r.subject}</p>
                      <p className="truncate text-[12.5px] text-mute">
                        {r.pair}-{t('pair')}
                        {r.note ? `, ${r.note}` : ''}
                      </p>
                    </div>
                    <Chip status={r.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 text-[14px] text-mute">{t('noAbsences')}</p>
            )}
          </>
        )}
      </main>
      {data && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[520px] border-t-[1.5px] border-ink bg-paper px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <Link href={`/orders/new?student=${data.student.id}`} className="flex h-[54px] items-center justify-center rounded-[14px] bg-red font-display text-[15px] font-bold text-white active:bg-red-deep">
            {t('issueOrder')}
          </Link>
        </div>
      )}
      {editing && data && (
        <StudentSheet student={data.student} onClose={() => setEditing(false)} onExpelled={() => router.push(`/groups/${data.student.group_id}`)} />
      )}
    </>
  );
}
