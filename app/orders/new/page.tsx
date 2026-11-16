'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { mutate as mutateAll } from 'swr';
import { Check, Search, X } from 'lucide-react';
import { api, haptic, todayISO, useApp } from '@/lib/app';
import { PrimaryButton, SubTop, useData } from '@/components/ui';

type Student = { id: number; full_name: string; group_name: string };

export default function NewOrder() {
  const { t, list, toast, errText } = useApp();
  const router = useRouter();
  const preset = Number(useSearchParams().get('student')) || null;
  const { data: students } = useData<Student[]>('/admin/students');
  const [picked, setPicked] = useState<number[]>(preset ? [preset] : []);
  const [q, setQ] = useState('');
  const [no, setNo] = useState('');
  const [from, setFrom] = useState(todayISO);
  const [to, setTo] = useState(todayISO);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const needle = q.trim().toLocaleLowerCase();
  const found = needle
    ? (students ?? []).filter((s) => `${s.full_name} ${s.group_name}`.toLocaleLowerCase().includes(needle)).slice(0, 30)
    : [];
  const chosen = (students ?? []).filter((s) => picked.includes(s.id));
  const toggle = (id: number) => {
    haptic();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/exemptions', { method: 'POST', body: { student_ids: picked, order_no: no, date_from: from, date_to: to, reason } });
      haptic('success');
      toast(t('orderIssued'));
      mutateAll(() => true);
      router.push('/orders');
    } catch (err) {
      haptic('error');
      setError(errText(err));
      setBusy(false);
    }
  };

  const label = 'block text-[13px] font-semibold';
  return (
    <>
      <SubTop back="/orders" title={t('newOrder')} sub={t('noOrdersHint')} />
      <form onSubmit={submit} className="space-y-5 px-4 pt-6 pb-36">
        <label className={label}>
          {t('orderNo')}
          <input className="field mt-1.5 font-normal" value={no} onChange={(e) => setNo(e.target.value)} placeholder={t('orderNoPlaceholder')} maxLength={40} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            {t('dateFrom')}
            <input type="date" className="field mt-1.5 font-normal" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
          </label>
          <label className={label}>
            {t('dateTo')}
            <input type="date" className="field mt-1.5 font-normal" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div>
          <label className={label}>
            {t('reason')}
            <input className="field mt-1.5 font-normal" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('reasonPlaceholder')} maxLength={200} />
          </label>
          <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4">
            {list('reasons').map((r) => (
              <button type="button" key={r} onClick={() => setReason(r)} className={`h-9 flex-none rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold ${reason === r ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={label}>
            {t('whom')}
            {chosen.length > 0 && <span className="ml-2 font-normal text-mute">{t('selected', { n: chosen.length })}</span>}
          </p>
          {chosen.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {chosen.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => toggle(s.id)} className="flex h-9 items-center gap-1.5 rounded-full bg-ink pr-2.5 pl-3.5 text-[13px] font-semibold text-white">
                    {s.full_name}
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="relative mt-2.5">
            <Search size={18} className="pointer-events-none absolute top-4 left-3.5 text-ash" />
            <input className="field pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchStudent')} enterKeyHint="search" />
          </div>
          {found.length > 0 && (
            <ul className="mt-2 max-h-[280px] overflow-y-auto rounded-xl border border-line">
              {found.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <li key={s.id} className="border-b border-line last:border-0">
                    <button type="button" onClick={() => toggle(s.id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-fog">
                      <span className={`grid h-6 w-6 flex-none place-items-center rounded-md border-[1.5px] ${on ? 'border-ink bg-ink text-white' : 'border-line'}`}>{on && <Check size={15} strokeWidth={3} />}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{s.full_name}</span>
                      <span className="flex-none text-[13px] text-mute">{s.group_name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[520px] border-t-[1.5px] border-ink bg-paper px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {error && <p role="alert" className="mb-2 text-[13px] font-semibold text-red">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>
            {t('issueOrder')}
          </PrimaryButton>
        </div>
      </form>
    </>
  );
}
