"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { mutate as mutateAll } from "swr";
import { Check, MoreHorizontal, X } from "lucide-react";
import { api, haptic, PAIRS, useApp, type Cell, type Status } from "@/lib/app";
import { SeatField } from "@/components/gate";
import {
  Chip,
  Glyph,
  LoadError,
  Loading,
  PrimaryButton,
  Sheet,
  Strip,
  SubTop,
} from "@/components/ui";

type Student = {
  id: number;
  full_name: string;
  status: Cell;
  saved: boolean;
  note: string | null;
  order: {
    order_no: string;
    reason: string;
    date_from: string;
    date_to: string;
  } | null;
};
type Lesson = {
  id: number;
  date: string;
  pair: number;
  room: string;
  lesson_type: string;
  group_name: string;
  subject: string;
  teacher: string;
};
type Data = { lesson: Lesson; students: Student[]; editable: boolean };

const OTHER: Status[] = ["late", "sick", "excused"];
const refreshLists = () =>
  mutateAll((key) => typeof key === "string" && !key.startsWith("/lessons/"));

export default function RollCall() {
  const { id } = useParams<{ id: string }>();
  const { t, user, longDate, dayMonth, errText, toast } = useApp();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<{
    id: number;
    status: Status | null;
    note: string;
  } | null>(null);
  const latest = useRef({ data, dirty });
  useEffect(() => {
    latest.current = { data, dirty };
  });

  const load = useCallback(() => {
    api<Data>(`/lessons/${id}`).then((d) => {
      setError(null);
      setData(d);
    }, setError);
  }, [id]);
  useEffect(load, [load]);

  const marksOf = (students: Student[]) =>
    students
      .filter((s) => s.status)
      .map((s) => ({ student_id: s.id, status: s.status, note: s.note }));

  // Беттен шыққанда сақталмаған белгілер жоғалмауы үшін
  useEffect(
    () => () => {
      const { data, dirty } = latest.current;
      if (data && dirty)
        api(`/lessons/${id}/attendance`, {
          method: "PUT",
          body: { marks: marksOf(data.students) },
        }).then(refreshLists, () => {});
    },
    [id],
  );

  if (error && !data)
    return (
      <>
        <SubTop back="/" title=" " />
        <LoadError error={error} retry={load} />
      </>
    );
  if (!data)
    return (
      <>
        <SubTop back="/" title=" " />
        <Loading rows={8} />
      </>
    );

  const { lesson, students, editable } = data;
  const cells = students.map((s) => s.status);
  const count = (s: Cell) => cells.filter((c) => c === s).length;
  const here = count("present") + count("late");
  const unmarked = count(null);
  const unsaved = dirty || students.some((s) => s.status && !s.saved);

  const set = (sid: number, status: Cell, note: string | null = null) => {
    haptic();
    setDirty(true);
    setData(
      (d) =>
        d && {
          ...d,
          students: d.students.map((s) =>
            s.id === sid ? { ...s, status, note } : s,
          ),
        },
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const fresh = await api<Data>(`/lessons/${id}/attendance`, {
        method: "PUT",
        body: { marks: marksOf(students) },
      });
      setData(fresh);
      setDirty(false);
      haptic("success");
      toast(t("saved"));
      refreshLists();
    } catch (e) {
      haptic("error");
      toast(errText(e));
    } finally {
      setSaving(false);
    }
  };

  const sheetStudent = sheet && students.find((s) => s.id === sheet.id);

  return (
    <>
      <SubTop
        back="/"
        title={lesson.group_name}
        sub={
          <>
            {lesson.subject}
            <span className="block tabular-nums">
              {longDate(lesson.date)}, {PAIRS[lesson.pair][0]}–
              {PAIRS[lesson.pair][1]}, {lesson.room} {t("room")}
            </span>
            {user!.role === "admin" && (
              <span className="block">{lesson.teacher}</span>
            )}
          </>
        }
      >
        <SeatField clusters={[cells]} className="mt-1 h-[176px] w-full" />
        <div className="flex items-end gap-3">
          <span className="font-display text-[64px] leading-[0.8] font-extrabold tabular-nums">
            {here}
          </span>
          <span className="pb-0.5 text-[15px] text-white/60 tabular-nums">
            / {students.length} {t("inClass")}
          </span>
        </div>
      </SubTop>

      <div className="sticky top-0 z-20 border-b-[1.5px] border-ink bg-paper px-4 pt-3 pb-3">
        <Strip cells={cells} className="h-4" />
        <ul className="no-scrollbar -mx-4 mt-3 flex gap-4 overflow-x-auto px-4 text-[13px]">
          {(["absent", "late", "sick", "excused", "exempt"] as Status[]).map(
            (s) => (
              <li key={s} className="flex flex-none items-center gap-1.5">
                <Glyph status={s} />
                <span className="text-mute">{t(s)}</span>
                <span className="font-semibold tabular-nums">{count(s)}</span>
              </li>
            ),
          )}
        </ul>
      </div>

      {!editable && (
        <p className="border-b border-line bg-fog px-4 py-3 text-[13px] text-mute">
          {t("readOnly")}
        </p>
      )}

      {editable && unmarked > 0 && (
        <div className="px-4 pt-4">
          <button
            onClick={() => {
              haptic("success");
              setDirty(true);
              setData(
                (d) =>
                  d && {
                    ...d,
                    students: d.students.map((s) =>
                      s.status ? s : { ...s, status: "present" as const },
                    ),
                  },
              );
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-ink text-[15px] font-semibold active:bg-fog"
          >
            <Check size={18} strokeWidth={2.6} />
            {t("restPresent")}
          </button>
        </div>
      )}

      <ol className={editable ? "pb-36" : "pb-10"}>
        {students.map((s, i) => {
          const other =
            s.status && s.status !== "present" && s.status !== "absent"
              ? s.status
              : null;
          return (
            <li
              key={s.id}
              className="relative border-b border-line py-3 pr-4 pl-5"
            >
              <i
                className={`absolute inset-y-0 left-0 w-[5px] ${s.status === "absent" ? "bg-red" : s.order ? "hatch" : ""}`}
                aria-hidden
              />
              <div className="flex items-center gap-3">
                <span className="w-6 flex-none text-[13px] text-ash tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`line-clamp-2 text-[16px] leading-tight font-semibold ${s.status === "absent" ? "text-red" : ""}`}
                  >
                    {s.full_name}
                  </p>
                  {!s.order && s.note && (
                    <p className="mt-0.5 truncate text-[12.5px] text-mute">
                      {s.note}
                    </p>
                  )}
                </div>

                {editable ? (
                  <div className="flex flex-none gap-1.5">
                    <button
                      onClick={() =>
                        set(s.id, s.status === "present" ? null : "present")
                      }
                      aria-pressed={s.status === "present"}
                      aria-label={t("present")}
                      className={`grid h-11 w-11 place-items-center rounded-xl border-[1.5px] transition-colors ${s.status === "present" ? "pop border-ink bg-ink text-white" : "border-line text-ink"}`}
                    >
                      <Check size={20} strokeWidth={2.6} />
                    </button>
                    <button
                      onClick={() =>
                        set(s.id, s.status === "absent" ? null : "absent")
                      }
                      aria-pressed={s.status === "absent"}
                      aria-label={t("absent")}
                      className={`grid h-11 w-11 place-items-center rounded-xl border-[1.5px] transition-colors ${s.status === "absent" ? "pop border-red bg-red text-white" : "border-line text-ink"}`}
                    >
                      <X size={20} strokeWidth={2.6} />
                    </button>
                    <button
                      onClick={() =>
                        setSheet({
                          id: s.id,
                          status: other,
                          note: s.note ?? "",
                        })
                      }
                      aria-label={t("other")}
                      className={`grid h-11 place-items-center rounded-xl border-[1.5px] text-[12.5px] font-semibold transition-colors ${other ? "pop border-ink bg-paper px-2.5" : "w-11 border-line"}`}
                    >
                      {other ? (
                        <Chip status={other} />
                      ) : (
                        <MoreHorizontal size={20} />
                      )}
                    </button>
                  </div>
                ) : s.status ? (
                  <Chip status={s.status} />
                ) : (
                  <span className="text-[13px] text-ash">{t("unmarked")}</span>
                )}
              </div>
              {s.order && (
                <p className="mt-2 ml-9 text-[12.5px] leading-snug">
                  {t("byOrder", { no: s.order.order_no })}
                  <span className="block text-mute">
                    {s.order.reason},{" "}
                    {t("until", { date: dayMonth(s.order.date_to) })}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[520px] border-t-[1.5px] border-ink bg-paper px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {unmarked > 0 && (
            <p className="mb-2 text-center text-[13px] text-mute tabular-nums">
              {t("unmarkedLeft", { n: unmarked })}
            </p>
          )}
          <PrimaryButton
            onClick={save}
            disabled={saving || !unsaved || unmarked === students.length}
          >
            {unsaved ? t("save") : t("rollDone")}
          </PrimaryButton>
        </div>
      )}

      {sheet && sheetStudent && (
        <Sheet title={sheetStudent.full_name} onClose={() => setSheet(null)}>
          <div className="grid gap-2">
            {[
              ...OTHER,
              ...(sheetStudent.order ? (["exempt"] as Status[]) : []),
            ].map((s) => (
              <button
                key={s}
                onClick={() => setSheet({ ...sheet, status: s })}
                aria-pressed={sheet.status === s}
                className={`flex h-[52px] items-center gap-3 rounded-[14px] border-[1.5px] px-4 text-left text-[16px] font-semibold ${sheet.status === s ? "border-ink bg-ink text-white" : "border-line"}`}
              >
                <i
                  className={`glyph c-${s} ${sheet.status === s ? "outline outline-1 outline-white" : ""}`}
                />
                {t(s)}
              </button>
            ))}
          </div>
          <label className="mt-5 block text-[13px] font-semibold">
            {t("note")}
            <input
              className="field mt-1.5 font-normal"
              value={sheet.note}
              maxLength={200}
              placeholder={t("notePlaceholder")}
              onChange={(e) => setSheet({ ...sheet, note: e.target.value })}
            />
          </label>
          <PrimaryButton
            className="mt-5"
            disabled={!sheet.status}
            onClick={() => {
              set(sheet.id, sheet.status, sheet.note.trim() || null);
              setSheet(null);
            }}
          >
            {t("done")}
          </PrimaryButton>
        </Sheet>
      )}
    </>
  );
}
