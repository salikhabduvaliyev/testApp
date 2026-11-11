-- DONO — Supabase PostgreSQL Schema, RLS Policies, RPCs & Realtime
-- Run this script in Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ADMINS TABLE
CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text DEFAULT 'Admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid()
  );
$$;

-- 2. SUBJECTS TABLE (Fanlar)
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_key text NOT NULL DEFAULT 'menu_book',
  color_hex text NOT NULL DEFAULT '#2563EB',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. QUIZZES TABLE (Test to'plamlari / Mavzular)
CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  time_per_question_sec int NOT NULL DEFAULT 20 CHECK (time_per_question_sec >= 0),
  points_per_correct int NOT NULL DEFAULT 5 CHECK (points_per_correct >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_subject_id ON public.quizzes(subject_id);

-- 4. QUESTIONS TABLE (Savollar bazasi)
CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  expression_text text,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_option char(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON public.questions(quiz_id);

-- 5. STUDENTS TABLE (O'quvchilar)
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  recovery_code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  first_name text NOT NULL,
  last_name text NOT NULL,
  region text NOT NULL DEFAULT 'Toshkent shahri',
  total_points int NOT NULL DEFAULT 0,
  streak_days int NOT NULL DEFAULT 1,
  daily_questions_count int NOT NULL DEFAULT 0,
  daily_goal_target int NOT NULL DEFAULT 10,
  last_active_date date NOT NULL DEFAULT current_date,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_points ON public.students(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_students_region ON public.students(region);

-- 6. FRIENDSHIPS TABLE (Do'stlar reytingi uchun)
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, friend_id),
  CHECK (student_id <> friend_id)
);

-- 7. TEST ATTEMPTS TABLE (Yechilgan testlar)
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  requested_count int NOT NULL,
  total_questions int NOT NULL,
  correct_count int NOT NULL,
  wrong_count int NOT NULL,
  earned_points int NOT NULL,
  duration_sec int NOT NULL DEFAULT 0,
  score_percent numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_questions > 0
      THEN round((correct_count::numeric / total_questions::numeric) * 100, 2)
      ELSE 0
    END
  ) STORED,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_student_id ON public.test_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_completed_at ON public.test_attempts(completed_at DESC);

-- 8. ATTEMPT ANSWERS TABLE (Har bir savol javobi)
CREATE TABLE IF NOT EXISTS public.attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option char(1),
  is_correct boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt_id ON public.attempt_answers(attempt_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;

-- Admins: users can read own admin row
DROP POLICY IF EXISTS "admins_read_own" ON public.admins;
CREATE POLICY "admins_read_own" ON public.admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Subjects: everyone can read active subjects; admins full access
DROP POLICY IF EXISTS "subjects_public_read" ON public.subjects;
CREATE POLICY "subjects_public_read" ON public.subjects
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "subjects_admin_all" ON public.subjects;
CREATE POLICY "subjects_admin_all" ON public.subjects
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Quizzes: everyone can read active quizzes; admins full access
DROP POLICY IF EXISTS "quizzes_public_read" ON public.quizzes;
CREATE POLICY "quizzes_public_read" ON public.quizzes
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "quizzes_admin_all" ON public.quizzes;
CREATE POLICY "quizzes_admin_all" ON public.quizzes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Questions: admins full access; public reads via RPC get_random_quiz_questions
DROP POLICY IF EXISTS "questions_admin_all" ON public.questions;
CREATE POLICY "questions_admin_all" ON public.questions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "questions_public_read" ON public.questions;
CREATE POLICY "questions_public_read" ON public.questions
  FOR SELECT TO anon, authenticated
  USING (true);

-- Students: admins can read/manage all; public reads leaderboard via RPC or select
DROP POLICY IF EXISTS "students_public_read" ON public.students;
CREATE POLICY "students_public_read" ON public.students
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "students_admin_all" ON public.students;
CREATE POLICY "students_admin_all" ON public.students
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Friendships: read/manage via RPC
DROP POLICY IF EXISTS "friendships_public_read" ON public.friendships;
CREATE POLICY "friendships_public_read" ON public.friendships
  FOR SELECT TO anon, authenticated
  USING (true);

-- Test attempts & attempt answers: public read for dashboard/history, inserts via RPC
DROP POLICY IF EXISTS "attempts_public_read" ON public.test_attempts;
CREATE POLICY "attempts_public_read" ON public.test_attempts
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "attempts_admin_delete" ON public.test_attempts;
CREATE POLICY "attempts_admin_delete" ON public.test_attempts
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "attempt_answers_public_read" ON public.attempt_answers;
CREATE POLICY "attempt_answers_public_read" ON public.attempt_answers
  FOR SELECT TO anon, authenticated
  USING (true);

-- ============================================================
-- HELPER & API RPC FUNCTIONS
-- ============================================================

-- Level calculator helper
CREATE OR REPLACE FUNCTION public.compute_level_name(p_points int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_points >= 2500 THEN 'Ustoz'
    WHEN p_points >= 1500 THEN 'Alloma'
    WHEN p_points >= 800 THEN 'Zukko'
    WHEN p_points >= 300 THEN 'Bilimdon'
    ELSE 'Boshlovchi'
  END;
$$;

-- 1) Upsert Student by device_id (parolsiz kirish + viloyat)
CREATE OR REPLACE FUNCTION public.upsert_student(
  p_device_id text,
  p_first_name text,
  p_last_name text,
  p_region text DEFAULT 'Toshkent shahri'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_today date := current_date;
BEGIN
  SELECT * INTO v_student FROM public.students WHERE device_id = p_device_id;

  IF NOT FOUND THEN
    INSERT INTO public.students (device_id, first_name, last_name, region)
    VALUES (trim(p_device_id), trim(p_first_name), trim(p_last_name), coalesce(nullif(trim(p_region), ''), 'Toshkent shahri'))
    RETURNING * INTO v_student;
  ELSE
    UPDATE public.students
    SET
      first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
      last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
      region = coalesce(nullif(trim(p_region), ''), region),
      streak_days = CASE
        WHEN last_active_date = v_today THEN streak_days
        WHEN last_active_date = v_today - 1 THEN streak_days + 1
        ELSE 1
      END,
      daily_questions_count = CASE
        WHEN last_active_date = v_today THEN daily_questions_count
        ELSE 0
      END,
      last_active_date = v_today,
      last_active_at = now()
    WHERE id = v_student.id
    RETURNING * INTO v_student;
  END IF;

  RETURN to_jsonb(v_student) || jsonb_build_object('level_name', public.compute_level_name(v_student.total_points));
END;
$$;

-- 2) Recover student account using 8-char recovery code
CREATE OR REPLACE FUNCTION public.recover_student_by_code(
  p_recovery_code text,
  p_new_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
BEGIN
  SELECT * INTO v_student
  FROM public.students
  WHERE upper(recovery_code) = upper(trim(p_recovery_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tiklash kodi topilmadi';
  END IF;

  -- Free up p_new_device_id if an empty guest record exists
  DELETE FROM public.students WHERE device_id = p_new_device_id AND id <> v_student.id AND total_points = 0;

  UPDATE public.students
  SET device_id = p_new_device_id, last_active_at = now()
  WHERE id = v_student.id
  RETURNING * INTO v_student;

  RETURN to_jsonb(v_student) || jsonb_build_object('level_name', public.compute_level_name(v_student.total_points));
END;
$$;

-- 3) Add friend by recovery code
CREATE OR REPLACE FUNCTION public.add_friend_by_code(
  p_student_id uuid,
  p_friend_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friend public.students%ROWTYPE;
BEGIN
  SELECT * INTO v_friend
  FROM public.students
  WHERE upper(recovery_code) = upper(trim(p_friend_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bunday kodli foydalanuvchi topilmadi';
  END IF;

  IF v_friend.id = p_student_id THEN
    RAISE EXCEPTION 'Ozingizni dost sifatida qosholmaysiz';
  END IF;

  INSERT INTO public.friendships (student_id, friend_id)
  VALUES (p_student_id, v_friend.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.friendships (student_id, friend_id)
  VALUES (v_friend.id, p_student_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'id', v_friend.id,
    'full_name', v_friend.first_name || ' ' || v_friend.last_name,
    'total_points', v_friend.total_points,
    'region', v_friend.region
  );
END;
$$;

-- 4) Subjects with quiz & question counts (for APK Home / Learn)
CREATE OR REPLACE FUNCTION public.get_subjects_with_stats()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  icon_key text,
  color_hex text,
  sort_order int,
  quiz_count bigint,
  question_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    s.description,
    s.icon_key,
    s.color_hex,
    s.sort_order,
    count(DISTINCT qz.id) FILTER (WHERE qz.is_active) AS quiz_count,
    count(qu.id) FILTER (WHERE qz.is_active) AS question_count
  FROM public.subjects s
  LEFT JOIN public.quizzes qz ON qz.subject_id = s.id
  LEFT JOIN public.questions qu ON qu.quiz_id = qz.id
  WHERE s.is_active = true
  GROUP BY s.id
  ORDER BY s.sort_order ASC, s.created_at ASC;
$$;

-- 5) Quizzes for a selected subject with question count
CREATE OR REPLACE FUNCTION public.get_quizzes_for_subject(p_subject_id uuid)
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  title text,
  description text,
  time_per_question_sec int,
  points_per_correct int,
  question_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    qz.id,
    qz.subject_id,
    qz.title,
    qz.description,
    qz.time_per_question_sec,
    qz.points_per_correct,
    count(qu.id) AS question_count
  FROM public.quizzes qz
  LEFT JOIN public.questions qu ON qu.quiz_id = qz.id
  WHERE qz.subject_id = p_subject_id
    AND qz.is_active = true
  GROUP BY qz.id
  ORDER BY qz.created_at ASC;
$$;

-- 6) Random 10 / 25 / 50 questions for selected quiz
CREATE OR REPLACE FUNCTION public.get_random_quiz_questions(
  p_quiz_id uuid,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  quiz_id uuid,
  question_text text,
  expression_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option char(1),
  explanation text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    qu.id,
    qu.quiz_id,
    qu.question_text,
    qu.expression_text,
    qu.option_a,
    qu.option_b,
    qu.option_c,
    qu.option_d,
    qu.correct_option,
    qu.explanation
  FROM public.questions qu
  JOIN public.quizzes qz ON qz.id = qu.quiz_id
  WHERE qu.quiz_id = p_quiz_id
    AND qz.is_active = true
  ORDER BY random()
  LIMIT greatest(1, least(p_limit, 100));
$$;

-- 7) Submit test attempt & compute score/points server-side
-- p_answers format: [{"question_id": "uuid", "selected_option": "A" | null}, ...]
CREATE OR REPLACE FUNCTION public.submit_test_attempt(
  p_student_id uuid,
  p_quiz_id uuid,
  p_requested_count int,
  p_duration_sec int,
  p_answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quizzes%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_attempt_id uuid;
  v_total int := 0;
  v_correct int := 0;
  v_wrong int := 0;
  v_points int := 0;
  v_item jsonb;
  v_q public.questions%ROWTYPE;
  v_selected char(1);
  v_is_correct boolean;
  v_today date := current_date;
  v_new_total_points int;
BEGIN
  SELECT * INTO v_quiz FROM public.quizzes WHERE id = p_quiz_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test toplami topilmadi';
  END IF;

  SELECT * INTO v_student FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oquvchi topilmadi';
  END IF;

  CREATE TEMP TABLE tmp_graded (
    question_id uuid,
    selected_option char(1),
    is_correct boolean
  ) ON COMMIT DROP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  LOOP
    SELECT * INTO v_q FROM public.questions WHERE id = (v_item->>'question_id')::uuid AND quiz_id = p_quiz_id;
    IF FOUND THEN
      v_selected := upper(nullif(trim(v_item->>'selected_option'), ''));
      v_is_correct := (v_selected IS NOT NULL AND v_selected = v_q.correct_option);
      v_total := v_total + 1;
      IF v_is_correct THEN
        v_correct := v_correct + 1;
      ELSE
        v_wrong := v_wrong + 1;
      END IF;
      INSERT INTO tmp_graded VALUES (v_q.id, v_selected, v_is_correct);
    END IF;
  END LOOP;

  v_points := v_correct * v_quiz.points_per_correct;

  INSERT INTO public.test_attempts (
    student_id, subject_id, quiz_id,
    requested_count, total_questions, correct_count, wrong_count,
    earned_points, duration_sec
  )
  VALUES (
    p_student_id, v_quiz.subject_id, p_quiz_id,
    p_requested_count, v_total, v_correct, v_wrong,
    v_points, greatest(0, p_duration_sec)
  )
  RETURNING id INTO v_attempt_id;

  INSERT INTO public.attempt_answers (attempt_id, question_id, selected_option, is_correct)
  SELECT v_attempt_id, question_id, selected_option, is_correct FROM tmp_graded;

  UPDATE public.students
  SET
    total_points = total_points + v_points,
    streak_days = CASE
      WHEN last_active_date = v_today THEN streak_days
      WHEN last_active_date = v_today - 1 THEN streak_days + 1
      ELSE 1
    END,
    daily_questions_count = CASE
      WHEN last_active_date = v_today THEN daily_questions_count + v_total
      ELSE v_total
    END,
    last_active_date = v_today,
    last_active_at = now()
  WHERE id = p_student_id
  RETURNING total_points INTO v_new_total_points;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'total_questions', v_total,
    'correct_count', v_correct,
    'wrong_count', v_wrong,
    'earned_points', v_points,
    'new_total_points', v_new_total_points,
    'level_name', public.compute_level_name(v_new_total_points)
  );
END;
$$;

-- 8) Leaderboard RPC (Umumiy / Viloyat / Do'stlar)
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_student_id uuid,
  p_scope text DEFAULT 'all'
)
RETURNS TABLE (
  rank bigint,
  id uuid,
  full_name text,
  region text,
  total_points int,
  streak_days int,
  level_name text,
  is_me boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_region text;
BEGIN
  SELECT s.region INTO v_region FROM public.students s WHERE s.id = p_student_id;

  RETURN QUERY
  WITH filtered AS (
    SELECT s.*
    FROM public.students s
    WHERE
      (p_scope = 'all')
      OR (p_scope = 'region' AND s.region = v_region)
      OR (
        p_scope = 'friends'
        AND (
          s.id = p_student_id
          OR EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE f.student_id = p_student_id AND f.friend_id = s.id
          )
        )
      )
  ),
  ranked AS (
    SELECT
      row_number() OVER (ORDER BY f.total_points DESC, f.streak_days DESC, f.created_at ASC) AS rnk,
      f.id,
      (f.first_name || ' ' || f.last_name) AS full_name,
      f.region,
      f.total_points,
      f.streak_days,
      public.compute_level_name(f.total_points) AS level_name,
      (f.id = p_student_id) AS is_me
    FROM filtered f
  )
  SELECT
    r.rnk,
    r.id,
    r.full_name,
    r.region,
    r.total_points,
    r.streak_days,
    r.level_name,
    r.is_me
  FROM ranked r
  WHERE r.rnk <= 50 OR r.is_me
  ORDER BY r.rnk ASC;
END;
$$;

-- 9) Student recent history
CREATE OR REPLACE FUNCTION public.get_student_history(p_student_id uuid)
RETURNS TABLE (
  attempt_id uuid,
  subject_name text,
  quiz_title text,
  total_questions int,
  correct_count int,
  wrong_count int,
  earned_points int,
  score_percent numeric,
  completed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ta.id AS attempt_id,
    sub.name AS subject_name,
    qz.title AS quiz_title,
    ta.total_questions,
    ta.correct_count,
    ta.wrong_count,
    ta.earned_points,
    ta.score_percent,
    ta.completed_at
  FROM public.test_attempts ta
  JOIN public.subjects sub ON sub.id = ta.subject_id
  JOIN public.quizzes qz ON qz.id = ta.quiz_id
  WHERE ta.student_id = p_student_id
  ORDER BY ta.completed_at DESC
  LIMIT 30;
$$;

-- 10) Admin Dashboard KPI summary
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_students', (SELECT count(*) FROM public.students),
    'active_today', (SELECT count(*) FROM public.students WHERE last_active_date = current_date),
    'total_attempts', (SELECT count(*) FROM public.test_attempts),
    'avg_score_percent', coalesce((SELECT round(avg(score_percent))::int FROM public.test_attempts), 0),
    'total_subjects', (SELECT count(*) FROM public.subjects),
    'total_quizzes', (SELECT count(*) FROM public.quizzes),
    'total_questions', (SELECT count(*) FROM public.questions)
  );
$$;

-- ============================================================
-- GRANTS & REALTIME
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.subjects, public.quizzes, public.questions, public.students, public.test_attempts, public.attempt_answers, public.friendships TO anon, authenticated;
GRANT ALL ON public.subjects, public.quizzes, public.questions, public.students, public.test_attempts, public.attempt_answers, public.friendships, public.admins TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_student(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_student_by_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_friend_by_code(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subjects_with_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_quizzes_for_subject(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_random_quiz_questions(uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_test_attempt(uuid, uuid, int, int, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_history(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO anon, authenticated;

-- Enable Realtime for live admin dashboard updates
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.test_attempts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

