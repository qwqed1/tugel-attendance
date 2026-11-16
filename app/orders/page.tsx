'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api, haptic, tg, useApp } from '@/lib/app';
import { BottomNav, Brand, Empty, LangToggle, LoadError, Loading, useData } from '@/components/ui';

type Row = {
  id: number; student_id: number; full_name: string; group_name: string; order_no: string; date_from: string; date_to: string;
  reason: string; issued_by: string; state: 'active' | 'upcoming' | 'past' | 'revoked';
};

const ask = (text: string) =>
  new Promise<boolean>((resolve) => {
    const w = tg();
    if (w?.initData && w.showConfirm) w.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });

export default function Orders() {
  const { t, dayMonth, toast, errText } = useApp();
  const { data, error, mutate } = useData<Row[]>('/admin/exemptions');

  // Бір бұйрықтағы студенттер бірге көрсетіледі
  const orders = new Map<string, Row[]>();
  for (const r of data ?? []) {
    const key = [r.order_no, r.date_from, r.date_to, r.reason, r.state].join('|');
    orders.set(key, [...(orders.get(key) ?? []), r]);
  }

  const revoke = async (rows: Row[]) => {
    if (!(await ask(t('revokeConfirm')))) return;
    try {
      mutate(await api<Row[]>('/admin/exemptions/revoke', { method: 'POST', body: { ids: rows.map((r) => r.id) } }), false);
      haptic('success');
      toast(t('revoked'));
    } catch (e) {
      toast(errText(e));
    }
  };

  return (
    <>
      <header className="bg-ink px-4 pt-4 pb-5 text-white">
        <div className="flex items-center justify-between">
          <Brand />
          <LangToggle />
        </div>
        <h1 className="mt-6 font-display text-[26px] font-bold">{t('orders')}</h1>
        <Link href="/orders/new" className="mt-5 flex h-[54px] items-center justify-center gap-2 rounded-[14px] bg-red font-display text-[15px] font-bold active:bg-red-deep">
          <Plus size={19} strokeWidth={2.6} />
          {t('newOrder')}
        </Link>
      </header>
      <main className="pb-28">
        {error && !data ? (
          <LoadError error={error} retry={() => mutate()} />
        ) : !data ? (
          <Loading />
        ) : !orders.size ? (
          <Empty title={t('noOrders')} hint={t('noOrdersHint')} />
        ) : (
          [...orders.entries()].map(([key, rows]) => {
            const o = rows[0];
            const live = o.state === 'active' || o.state === 'upcoming';
            return (
              <article key={key} className={`relative border-b border-line py-5 pr-4 pl-5 ${live ? '' : 'text-mute'}`}>
                <i className={`absolute inset-y-0 left-0 w-[5px] ${o.state === 'active' ? 'hatch' : o.state === 'upcoming' ? 'bg-ink' : 'bg-line'}`} aria-hidden />
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={`font-display text-[20px] font-bold ${o.state === 'revoked' ? 'line-through' : ''}`}>№ {o.order_no}</h2>
                  <span className={`text-[13px] font-semibold ${o.state === 'active' ? 'text-red' : ''}`}>{t(`state_${o.state}`)}</span>
                </div>
                <p className={`mt-1.5 text-[15px] leading-snug ${live ? 'text-ink' : ''}`}>{o.reason}</p>
                <p className="mt-0.5 text-[13px] text-mute tabular-nums">
                  {dayMonth(o.date_from)} – {dayMonth(o.date_to)}
                </p>
                <ul className="mt-3 space-y-1">
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                      <Link href={`/students/${r.student_id}`} className={`truncate font-semibold ${live ? 'text-ink' : ''}`}>
                        {r.full_name}
                      </Link>
                      <span className="flex-none text-[13px] text-mute">{r.group_name}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="truncate text-[12.5px] text-mute">{t('issuedBy', { name: o.issued_by.split(' ').slice(0, 2).join(' ') })}</span>
                  {live && (
                    <button onClick={() => revoke(rows)} className="h-8 flex-none rounded-full border-[1.5px] border-ink px-3.5 text-[13px] font-semibold text-ink active:bg-fog">
                      {t('revoke')}
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </main>
      <BottomNav />
    </>
  );
}
