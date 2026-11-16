'use client';

import { useState } from 'react';
import { mutate as mutateAll } from 'swr';
import { api, ask, haptic, useApp } from '@/lib/app';
import { PrimaryButton, Sheet, useData } from './ui';

const label = 'block text-[13px] font-semibold';
const refresh = () => mutateAll(() => true);

export type GroupValue = { id: number; name: string; course: number; specialty: string };

/** Топ қосу немесе өзгерту */
export function GroupSheet({ group, onClose }: { group?: GroupValue; onClose: () => void }) {
  const { t, toast, errText } = useApp();
  const [name, setName] = useState(group?.name ?? '');
  const [course, setCourse] = useState(group?.course ?? 1);
  const [specialty, setSpecialty] = useState(group?.specialty ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(group ? `/admin/groups/${group.id}` : '/admin/groups', { method: group ? 'PATCH' : 'POST', body: { name, course, specialty } });
      haptic('success');
      toast(t(group ? 'saved' : 'added'));
      refresh();
      onClose();
    } catch (err) {
      haptic('error');
      setError(errText(err));
      setBusy(false);
    }
  };

  return (
    <Sheet title={t(group ? 'editGroup' : 'addGroup')} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label className={label}>
          {t('groupName')}
          <input className="field mt-1.5 font-normal" value={name} maxLength={20} placeholder={t('groupNamePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </label>
        <div>
          <p className={label}>{t('courseLabel')}</p>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button type="button" key={n} onClick={() => setCourse(n)} aria-pressed={course === n} className={`h-[50px] rounded-xl border-[1.5px] font-display text-[15px] font-bold ${course === n ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <label className={label}>
          {t('specialty')}
          <input className="field mt-1.5 font-normal" value={specialty} maxLength={120} placeholder={t('specialtyPlaceholder')} onChange={(e) => setSpecialty(e.target.value)} />
        </label>
        {!group && <p className="text-[13px] leading-relaxed text-mute">{t('newGroupHint')}</p>}
        {error && <p role="alert" className="text-[13px] font-semibold text-red">{error}</p>}
        <PrimaryButton type="submit" disabled={busy}>
          {t(group ? 'save' : 'addGroup')}
        </PrimaryButton>
      </form>
    </Sheet>
  );
}

export type StudentValue = { id: number; full_name: string; group_id: number };

/** Студент қосу немесе өзгерту (топ ауыстыру, оқудан шығару) */
export function StudentSheet({ student, groupId, onClose, onExpelled }: { student?: StudentValue; groupId?: number; onClose: () => void; onExpelled?: () => void }) {
  const { t, toast, errText } = useApp();
  const { data } = useData<{ groups: GroupValue[] }>('/admin/groups');
  const [fullName, setFullName] = useState(student?.full_name ?? '');
  const [group, setGroup] = useState(student?.group_id ?? groupId ?? 0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (active: boolean) => {
    setBusy(true);
    try {
      await api(student ? `/admin/students/${student.id}` : '/admin/students', { method: student ? 'PATCH' : 'POST', body: { full_name: fullName, group_id: group, active } });
      haptic('success');
      toast(t(!active ? 'expelled' : student ? 'saved' : 'added'));
      refresh();
      if (active) onClose();
      else (onExpelled ?? onClose)();
    } catch (err) {
      haptic('error');
      setError(errText(err));
      setBusy(false);
    }
  };

  return (
    <Sheet title={t(student ? 'editStudent' : 'addStudent')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(true);
        }}
        className="space-y-4"
      >
        <label className={label}>
          {t('fullName')}
          <input className="field mt-1.5 font-normal" value={fullName} maxLength={120} placeholder={t('studentNamePlaceholder')} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className={label}>
          {t('group')}
          <select className="field mt-1.5 font-normal" value={group} onChange={(e) => setGroup(Number(e.target.value))}>
            {!group && <option value={0}>—</option>}
            {data?.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert" className="text-[13px] font-semibold text-red">{error}</p>}
        <PrimaryButton type="submit" disabled={busy}>
          {t(student ? 'save' : 'addStudent')}
        </PrimaryButton>
        {student && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => (await ask(t('expelConfirm'))) && send(false)}
            className="h-12 w-full rounded-[14px] border-[1.5px] border-line text-[15px] font-semibold text-red active:bg-fog"
          >
            {t('expel')}
          </button>
        )}
      </form>
    </Sheet>
  );
}
