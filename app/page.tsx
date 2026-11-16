'use client';

import Link from 'next/link';
import { useApp, type Cell, type Status } from '@/lib/app';
import { SeatField } from '@/components/gate';
import { BottomNav, Chip, Empty, Glyph, HomeTop, LessonItem, LoadError, Loading, SectionTitle, Strip, useData, type LessonRow } from '@/components/ui';

export default function Home() {
  const { user } = useApp();
  return user!.role === 'admin' ? <Overview /> : <TeacherDay />;
}

// ───────── Оқытушы: күннің сабақтары ─────────

function TeacherDay() {
  const { date, t } = useApp();
  const { data, error, mutate } = useData<{ date: string; lessons: LessonRow[] }>(`/teacher/lessons?date=${date}`);
  const lessons = data?.date === date ? data.lessons : null;
  return (
    <>
      <HomeTop />
      <main className="pb-10">
        {error && !lessons ? (
          <LoadError error={error} retry={() => mutate()} />
        ) : !lessons ? (
          <Loading rows={3} />
        ) : lessons.length ? (
          lessons.map((l) => <LessonItem key={l.id} lesson={l} />)
        ) : (
          <Empty title={t('noLessons')} hint={t('noLessonsHint')} />
        )}
      </main>
    </>
  );
}

// ───────── Деканат: күннің шолуы ─────────

type OverviewData = {
  date: string;
  students: number;
  totals: Record<Status | 'unmarked', number>;
  groups: { id: number; name: string; total: number; strip: Cell[]; missing: number; lessons: number; marked: number }[];
  lessons: LessonRow[];
  missing: {
    id: number; full_name: string; group_name: string; status: Status;
    order: { order_no: string; reason: string; date_to: string } | null;
    marks: { pair: number; subject: string; status: Status; note: string | null }[];
  }[];
};

const ORDER: (Status | 'unmarked')[] = ['present', 'late', 'absent', 'sick', 'excused', 'exempt', 'unmarked'];

function Overview() {
  const { date, t, dayMonth } = useApp();
  const { data, error, mutate } = useData<OverviewData>(`/admin/overview?date=${date}`);
  const d = data?.date === date ? data : null;
  const gone = d ? d.totals.absent + d.totals.sick + d.totals.excused + d.totals.exempt : 0;

  return (
    <>
      <HomeTop>
        {d && d.lessons.length > 0 && (
          <>
            <SeatField clusters={d.groups.map((g) => g.strip)} className="mt-3 h-[190px] w-full" />
            <div className="flex items-end gap-4">
              <span className="font-display text-[76px] leading-[0.8] font-extrabold text-red tabular-nums">{gone}</span>
              <p className="pb-0.5 text-[15px] leading-snug">
                {t('missingNow')}
                <span className="block text-white/55">{t('outOf', { n: d.students })}</span>
              </p>
            </div>
          </>
        )}
      </HomeTop>

      <main className="pb-28">
        {error && !d ? (
          <LoadError error={error} retry={() => mutate()} />
        ) : !d ? (
          <Loading />
        ) : !d.lessons.length ? (
          <Empty title={t('noLessons')} hint={t('noLessonsHint')} />
        ) : (
          <>
            <section className="px-4 pt-6">
              <div className="flex h-5 gap-[2px]" aria-hidden>
                {ORDER.filter((s) => d.totals[s] > 0).map((s) => (
                  <i key={s} className={`c c-${s === 'unmarked' ? 'none' : s}`} style={{ flexGrow: d.totals[s] }} />
                ))}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
                {ORDER.map((s) => (
                  <li key={s} className="flex items-center gap-2 text-[14px]">
                    <Glyph status={s} />
                    <span className="flex-1 text-mute">{t(s)}</span>
                    <span className="font-semibold tabular-nums">{d.totals[s]}</span>
                  </li>
                ))}
              </ul>
            </section>

            <SectionTitle>{t('byGroup')}</SectionTitle>
            <div className="border-t border-line">
              {d.groups.map((g) => (
                <Link key={g.id} href={`/groups/${g.id}`} className="block border-b border-line px-4 py-4 active:bg-fog">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[17px] font-bold">{g.name}</span>
                    <span className={`text-[14px] font-semibold tabular-nums ${g.missing ? 'text-red' : ''}`}>{t('missingCount', { n: g.missing })}</span>
                  </div>
                  <Strip cells={g.strip} className="mt-2.5 h-3.5" />
                  <p className="mt-2 text-[13px] text-mute tabular-nums">{t('lessonsMarked', { a: g.marked, b: g.lessons })}</p>
                </Link>
              ))}
            </div>

            <SectionTitle aside={d.missing.length || undefined}>{t('whoMissing')}</SectionTitle>
            {d.missing.length ? (
              <ul className="border-t border-line">
                {d.missing.map((p) => (
                  <li key={p.id} className="relative border-b border-line py-3.5 pr-4 pl-5">
                    <i className={`absolute inset-y-0 left-0 w-[5px] ${p.status === 'absent' ? 'bg-red' : p.order ? 'hatch' : 'bg-line'}`} aria-hidden />
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/students/${p.id}`} className="min-w-0">
                        <p className="truncate text-[16px] font-semibold">{p.full_name}</p>
                        <p className="text-[13px] text-mute">{p.group_name}</p>
                      </Link>
                      <Chip status={p.status} />
                    </div>
                    {p.order ? (
                      <p className="mt-2 text-[13px] leading-snug">
                        {t('byOrder', { no: p.order.order_no })}
                        <span className="block text-mute">
                          {p.order.reason}, {t('until', { date: dayMonth(p.order.date_to) })}
                        </span>
                      </p>
                    ) : (
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <p className="min-w-0 text-[13px] leading-snug text-mute">
                          {p.marks.map((m) => (
                            <span key={m.pair} className="block truncate">
                              {m.pair}-{t('pair')}, {m.subject}
                              {m.note ? ` (${m.note})` : ''}
                            </span>
                          ))}
                        </p>
                        {p.status === 'absent' && (
                          <Link href={`/orders/new?student=${p.id}`} className="inline-flex h-8 flex-none items-center rounded-full border-[1.5px] border-ink px-3.5 text-[13px] font-semibold active:bg-fog">
                            {t('exemptAction')}
                          </Link>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 text-[14px] text-mute">{t('nobodyMissingHint')}</p>
            )}

            <SectionTitle>{t('dayLessons')}</SectionTitle>
            <div className="border-t border-line">
              {d.lessons.map((l) => (
                <LessonItem key={l.id} lesson={l} showTeacher />
              ))}
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
