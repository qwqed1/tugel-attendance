'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, haptic, useApp, type User } from '@/lib/app';
import { BottomNav, Brand, LangToggle, LoadError, Loading, PrimaryButton, Sheet, useData } from '@/components/ui';

type Form = { id: number | null; full_name: string; position: string; role: 'teacher' | 'admin'; telegram_id: string };

export default function Staff() {
  const { t, toast, errText, user: me } = useApp();
  const { data, error, mutate } = useData<User[]>('/admin/users');
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (u?: User) => {
    setFormError('');
    setForm(u ? { id: u.id, full_name: u.full_name, position: u.position ?? '', role: u.role, telegram_id: u.telegram_id ? String(u.telegram_id) : '' } : { id: null, full_name: '', position: '', role: 'teacher', telegram_id: '' });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const { id, ...body } = form;
      mutate(await api<User[]>(id ? `/admin/users/${id}` : '/admin/users', { method: id ? 'PATCH' : 'POST', body }), false);
      haptic('success');
      toast(t('saved'));
      setForm(null);
    } catch (err) {
      haptic('error');
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const label = 'block text-[13px] font-semibold';
  return (
    <>
      <header className="bg-ink px-4 pt-4 pb-5 text-white">
        <div className="flex items-center justify-between">
          <Brand />
          <LangToggle />
        </div>
        <h1 className="mt-6 font-display text-[26px] font-bold">{t('staff')}</h1>
        <button onClick={() => open()} className="mt-5 flex h-[54px] w-full items-center justify-center gap-2 rounded-[14px] bg-white font-display text-[15px] font-bold text-ink active:bg-white/85">
          <Plus size={19} strokeWidth={2.6} />
          {t('addStaff')}
        </button>
      </header>
      <main className="pb-28">
        {error && !data ? (
          <LoadError error={error} retry={() => mutate()} />
        ) : !data ? (
          <Loading />
        ) : (
          data.map((u) => (
            <button key={u.id} onClick={() => open(u)} className="block w-full border-b border-line px-4 py-4 text-left active:bg-fog">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[16px] font-semibold">{u.full_name}</span>
                <span className={`flex-none text-[13px] font-semibold ${u.role === 'admin' ? 'text-red' : ''}`}>{t(`role_${u.role}`)}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-mute tabular-nums">
                {u.position ? `${u.position}, ` : ''}
                {u.telegram_id ? `Telegram ID ${u.telegram_id}` : t('notLinked')}
              </p>
            </button>
          ))
        )}
      </main>
      <BottomNav />

      {form && (
        <Sheet title={form.id ? t('editStaff') : t('addStaff')} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            <label className={label}>
              {t('fullName')}
              <input className="field mt-1.5 font-normal" value={form.full_name} maxLength={120} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </label>
            <label className={label}>
              {t('position')}
              <input className="field mt-1.5 font-normal" value={form.position} maxLength={80} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </label>
            <div>
              <p className={label}>{t('role')}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {(['teacher', 'admin'] as const).map((r) => (
                  <button type="button" key={r} disabled={form.id === me!.id} onClick={() => setForm({ ...form, role: r })} aria-pressed={form.role === r} className={`h-[50px] rounded-xl border-[1.5px] text-[15px] font-semibold disabled:opacity-50 ${form.role === r ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                    {t(`role_${r}`)}
                  </button>
                ))}
              </div>
            </div>
            <label className={label}>
              {t('telegramId')}
              <input className="field mt-1.5 font-normal tabular-nums" inputMode="numeric" value={form.telegram_id} onChange={(e) => setForm({ ...form, telegram_id: e.target.value.replace(/\D/g, '') })} />
              <span className="mt-1.5 block font-normal text-mute">{t('telegramHint')}</span>
            </label>
            {formError && <p role="alert" className="text-[13px] font-semibold text-red">{formError}</p>}
            <PrimaryButton type="submit" disabled={busy}>
              {t('save')}
            </PrimaryButton>
          </form>
        </Sheet>
      )}
    </>
  );
}
