'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, haptic, PAIRS, useApp } from '@/lib/app';
import { LoadError, Loading, PrimaryButton, Sheet, SubTop, useData } from '@/components/ui';

type Slot = { id: number; weekday: number; pair: number; room: string | null; lesson_type: string; teacher_id: number; subject: string; teacher: string };
type Data = { group: { id: number; name: string }; slots: Slot[]; subjects: string[]; teachers: { id: number; full_name: string }[] };
type Form = { id: number | null; pair: number; subject: string; teacher_id: number; room: string; lesson_type: string };

const TYPES = ['lecture', 'practice', 'lab'];
const label = 'block text-[13px] font-semibold';

export default function Timetable() {
  const { id } = useParams<{ id: string }>();
  const { t, list, toast, errText } = useApp();
  const { data, error, mutate } = useData<Data>(`/admin/timetable?group_id=${id}`);
  const [day, setDay] = useState(1);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (pair: number, slot?: Slot) => {
    setFormError('');
    setForm(
      slot
        ? { id: slot.id, pair, subject: slot.subject, teacher_id: slot.teacher_id, room: slot.room ?? '', lesson_type: slot.lesson_type }
        : { id: null, pair, subject: '', teacher_id: 0, room: '', lesson_type: 'lecture' }
    );
  };

  const done = async (text: string) => {
    await mutate();
    haptic('success');
    toast(t(text));
    setForm(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      await api('/admin/timetable', { method: 'POST', body: { ...form, weekday: day, group_id: Number(id) } });
      await done('saved');
    } catch (err) {
      haptic('error');
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!form?.id) return;
    setBusy(true);
    try {
      await api(`/admin/timetable/${form.id}`, { method: 'DELETE' });
      await done('removed');
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const daySlots = (data?.slots ?? []).filter((s) => s.weekday === day);

  return (
    <>
      <SubTop back={`/groups/${id}`} title={t('timetable')} sub={data ? `${data.group.name}. ${t('timetableHint')}` : ' '}>
        <div className="mt-5 grid grid-cols-6 gap-1">
          {[1, 2, 3, 4, 5, 6].map((d) => {
            const on = d === day;
            const count = (data?.slots ?? []).filter((s) => s.weekday === d).length;
            return (
              <button key={d} onClick={() => setDay(d)} aria-pressed={on} className={`flex h-14 flex-col items-center justify-center rounded-xl transition-colors ${on ? 'bg-red text-white' : 'text-white active:bg-white/10'}`}>
                <span className="font-display text-[14px] font-bold">{list('wd')[d - 1]}</span>
                <span className={`text-[11px] tabular-nums ${on ? 'text-white' : 'text-white/55'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </SubTop>

      <main className="pb-10">
        {error && !data ? (
          <LoadError error={error} retry={() => mutate()} />
        ) : !data ? (
          <Loading rows={6} />
        ) : (
          [1, 2, 3, 4, 5, 6].map((pair) => {
            const slot = daySlots.find((s) => s.pair === pair);
            return (
              <button key={pair} onClick={() => open(pair, slot)} className="flex w-full items-center gap-4 border-b border-line px-4 py-4 text-left active:bg-fog">
                <span className={`w-9 flex-none font-display text-[40px] leading-[0.9] font-extrabold tabular-nums ${slot ? '' : 'text-line'}`}>{pair}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-mute tabular-nums">
                    {PAIRS[pair][0]}–{PAIRS[pair][1]}
                    {slot?.room ? `, ${slot.room} ${t('room')}` : ''}
                  </span>
                  {slot ? (
                    <>
                      <span className="mt-0.5 block text-[17px] leading-snug font-semibold">{slot.subject}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-mute">
                        {slot.teacher.split(' ').slice(0, 2).join(' ')}, {t(slot.lesson_type)}
                      </span>
                    </>
                  ) : (
                    <span className="mt-0.5 block text-[15px] text-ash">{t('freeSlot')}</span>
                  )}
                </span>
                {!slot && (
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-xl border-[1.5px] border-ink">
                    <Plus size={18} strokeWidth={2.6} />
                  </span>
                )}
              </button>
            );
          })
        )}
      </main>

      {form && data && (
        <Sheet title={`${list('weekdays')[day - 1]}, ${form.pair}-${t('pair')}`} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-4">
            <label className={label}>
              {t('subject')}
              <input className="field mt-1.5 font-normal" list="subjects" value={form.subject} maxLength={120} placeholder={t('subjectPlaceholder')} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              <datalist id="subjects">
                {data.subjects.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className={label}>
              {t('teacher')}
              <select className="field mt-1.5 font-normal" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: Number(e.target.value) })}>
                {!form.teacher_id && <option value={0}>—</option>}
                {data.teachers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <label className={label}>
                {t('roomLabel')}
                <input className="field mt-1.5 font-normal" value={form.room} maxLength={20} onChange={(e) => setForm({ ...form, room: e.target.value })} />
              </label>
              <div>
                <p className={label}>{t('lessonType')}</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  {TYPES.map((k) => (
                    <button type="button" key={k} onClick={() => setForm({ ...form, lesson_type: k })} aria-pressed={form.lesson_type === k} className={`h-[50px] truncate rounded-xl border-[1.5px] px-1 text-[12.5px] font-semibold ${form.lesson_type === k ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                      {t(k)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {formError && <p role="alert" className="text-[13px] font-semibold text-red">{formError}</p>}
            <PrimaryButton type="submit" disabled={busy}>
              {t('save')}
            </PrimaryButton>
            {form.id && (
              <button type="button" disabled={busy} onClick={remove} className="h-12 w-full rounded-[14px] border-[1.5px] border-line text-[15px] font-semibold text-red active:bg-fog">
                {t('removeLesson')}
              </button>
            )}
          </form>
        </Sheet>
      )}
    </>
  );
}
