-- «Түгел» — сабаққа қатысуды есепке алу дерекқоры (PostgreSQL)

-- Қызметкерлер: оқытушылар және деканат (жоғары тұрған қолданушылар)
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE,                  -- Telegram аккаунтымен байланыс
  full_name   TEXT        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('teacher', 'admin')),
  position    TEXT,                           -- лауазымы
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Оқу топтары
CREATE TABLE IF NOT EXISTS groups (
  id        SERIAL PRIMARY KEY,
  name      TEXT    NOT NULL UNIQUE,          -- мысалы: АЖ-241
  course    INTEGER NOT NULL CHECK (course BETWEEN 1 AND 6),
  specialty TEXT    NOT NULL
);

-- Студенттер
CREATE TABLE IF NOT EXISTS students (
  id        SERIAL PRIMARY KEY,
  group_id  INTEGER NOT NULL REFERENCES groups(id),
  full_name TEXT    NOT NULL,
  active    BOOLEAN NOT NULL DEFAULT TRUE     -- FALSE = оқудан шыққан
);
CREATE INDEX IF NOT EXISTS idx_students_group ON students(group_id);

-- Пәндер
CREATE TABLE IF NOT EXISTS subjects (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- Апталық сабақ кестесі (үлгі). Нақты сабақтар осыдан жасалады.
CREATE TABLE IF NOT EXISTS timetable (
  id          SERIAL PRIMARY KEY,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),  -- 1 = дүйсенбі
  pair        INTEGER NOT NULL CHECK (pair BETWEEN 1 AND 6),     -- жұп (пара) нөмірі
  group_id    INTEGER NOT NULL REFERENCES groups(id),
  subject_id  INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id  INTEGER NOT NULL REFERENCES users(id),
  room        TEXT,
  lesson_type TEXT    NOT NULL DEFAULT 'lecture'
              CHECK (lesson_type IN ('lecture', 'practice', 'lab')),
  UNIQUE (weekday, pair, group_id)
);

-- Нақты күнгі сабақ
CREATE TABLE IF NOT EXISTS lessons (
  id          SERIAL PRIMARY KEY,
  date        DATE    NOT NULL,
  pair        INTEGER NOT NULL CHECK (pair BETWEEN 1 AND 6),
  group_id    INTEGER NOT NULL REFERENCES groups(id),
  subject_id  INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id  INTEGER NOT NULL REFERENCES users(id),
  room        TEXT,
  lesson_type TEXT    NOT NULL DEFAULT 'lecture',
  marked_at   TIMESTAMPTZ,                    -- жоқтама жасалған уақыт (NULL = жасалмаған)
  UNIQUE (date, pair, group_id)
);
CREATE INDEX IF NOT EXISTS idx_lessons_teacher ON lessons(teacher_id, date);

-- Қатысу белгілері: бір сабақта бір студентке бір жазба
--   present — бар          absent  — жоқ (себепсіз)
--   late    — кешікті      sick    — ауырды
--   excused — себепті      exempt  — бұйрықпен босатылған
CREATE TABLE IF NOT EXISTS attendance (
  id         SERIAL PRIMARY KEY,
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  status     TEXT    NOT NULL
             CHECK (status IN ('present', 'absent', 'late', 'sick', 'excused', 'exempt')),
  note       TEXT,
  marked_by  INTEGER NOT NULL REFERENCES users(id),
  marked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);

-- Деканат бұйрықтары: студентті белгілі бір кезеңге сабақтан босату
CREATE TABLE IF NOT EXISTS exemptions (
  id         SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  order_no   TEXT    NOT NULL,                -- бұйрық нөмірі
  date_from  DATE    NOT NULL,
  date_to    DATE    NOT NULL,
  reason     TEXT    NOT NULL,
  issued_by  INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,                     -- күші жойылған уақыт
  CHECK (date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS idx_exemptions_student ON exemptions(student_id, date_from, date_to);

-- Есептерге арналған көрініс: әр белгі сабақ, топ және студент мәліметімен
CREATE OR REPLACE VIEW v_attendance AS
SELECT a.id, l.date, l.pair, l.group_id, g.name AS group_name,
       a.student_id, s.full_name AS student_name,
       sub.name AS subject_name, l.teacher_id, a.status, a.note
FROM attendance a
JOIN lessons  l   ON l.id = a.lesson_id
JOIN students s   ON s.id = a.student_id
JOIN groups   g   ON g.id = l.group_id
JOIN subjects sub ON sub.id = l.subject_id;
