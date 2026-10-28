-- Chalkline core schema: flipped-classroom video lessons.
--
-- Content:  courses -> classes (groups of students, with a join code)
--                   -> assignments (due before a class session) -> lessons (ordered)
-- Lessons belong to a course so the same lesson can be assigned to several classes.
--
-- Security model
--   * Every table has RLS. anon gets no table access at all.
--   * A profile's role is 'student' or 'teacher'. Teachers can read and write everything.
--   * Students read only their own rows plus content assigned to a class they are in.
--   * Students never write progress, answers, or enrollments directly: those go through
--     SECURITY DEFINER functions below, which check the caller and validate input.
--   * Helper functions live in the `private` schema, which the API does not expose.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        text not null default 'student' check (role in ('student', 'teacher')),
  created_at  timestamptz not null default now()
);

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  -- Stored without separators, upper case. Shown as ABCD-2345.
  join_code   text not null unique check (join_code ~ '^[A-Z0-9]{6,12}$'),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index classes_course_id_idx on public.classes (course_id);

create table public.enrollments (
  class_id    uuid not null references public.classes (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index enrollments_student_id_idx on public.enrollments (student_id);

create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references public.courses (id) on delete cascade,
  position          integer not null default 0,
  title             text not null check (char_length(title) between 1 and 200),
  youtube_id        text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  duration_seconds  integer not null check (duration_seconds > 0),
  summary           text not null default '',
  -- Raw transcript text, one cue per line: "1:23 text" (parsed in the browser).
  transcript        text,
  check_enabled     boolean not null default false,
  confusion_enabled boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index lessons_course_id_idx on public.lessons (course_id, position);

create table public.assignments (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  instructions text not null default '',
  -- Start of the class session. Students should finish before this.
  due_at       timestamptz not null,
  created_at   timestamptz not null default now()
);
create index assignments_class_id_idx on public.assignments (class_id, due_at);

create table public.assignment_lessons (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  position      integer not null default 0,
  primary key (assignment_id, lesson_id)
);
create index assignment_lessons_lesson_id_idx on public.assignment_lessons (lesson_id);

-- End-of-lesson check questions. The answer key is a separate teacher-only table so
-- students can read the prompt and choices without being able to read the answer.
create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  position    integer not null default 0,
  prompt      text not null check (char_length(prompt) between 1 and 1000),
  choices     jsonb not null check (
                jsonb_typeof(choices) = 'array'
                and jsonb_array_length(choices) between 2 and 6
              ),
  created_at  timestamptz not null default now()
);
create index questions_lesson_id_idx on public.questions (lesson_id, position);

create table public.question_keys (
  question_id   uuid primary key references public.questions (id) on delete cascade,
  correct_index integer not null check (correct_index >= 0),
  explanation   text not null default ''
);

-- Every attempt is kept (students may retry). Keeping the full history with timestamps
-- is what a later spaced-review feature would schedule from.
create table public.question_attempts (
  id            bigint generated always as identity primary key,
  question_id   uuid not null references public.questions (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  chosen_index  integer not null,
  is_correct    boolean not null,
  created_at    timestamptz not null default now()
);
create index question_attempts_question_student_idx
  on public.question_attempts (question_id, student_id, created_at);
create index question_attempts_student_idx on public.question_attempts (student_id);

create table public.confusion_notes (
  id          bigint generated always as identity primary key,
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  student_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index confusion_notes_lesson_idx on public.confusion_notes (lesson_id, created_at desc);
create index confusion_notes_student_idx on public.confusion_notes (student_id);

-- One row per student per lesson. Written only by open_lesson() and save_progress().
create table public.lesson_progress (
  student_id        uuid not null references public.profiles (id) on delete cascade,
  lesson_id         uuid not null references public.lessons (id) on delete cascade,
  -- Merged, sorted, non-overlapping [start, end] pairs in video seconds.
  watched_intervals jsonb not null default '[]'::jsonb,
  watched_seconds   numeric(10, 2) not null default 0,
  duration_seconds  numeric(10, 2),
  percent_watched   numeric(5, 2) not null default 0,
  last_position     numeric(10, 2) not null default 0,
  first_opened_at   timestamptz not null default now(),
  last_watched_at   timestamptz,
  -- Set once, the first time unique watched time reaches 90%. Compared with an
  -- assignment's due_at to tell whether the student finished before class.
  completed_at      timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (student_id, lesson_id)
);
create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

-- ---------------------------------------------------------------------------
-- Helper functions (private schema, not exposed through the API)
-- ---------------------------------------------------------------------------

create or replace function private.is_teacher()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'teacher'
  );
$$;

create or replace function private.is_enrolled(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments
    where class_id = p_class_id and student_id = (select auth.uid())
  );
$$;

create or replace function private.is_in_course(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    where c.course_id = p_course_id and e.student_id = (select auth.uid())
  );
$$;

-- A student can see a lesson only once it is part of an assignment in one of their classes.
create or replace function private.lesson_is_assigned_to_me(p_lesson_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.assignment_lessons al
    join public.assignments a on a.id = al.assignment_id
    join public.enrollments e on e.class_id = a.class_id
    where al.lesson_id = p_lesson_id and e.student_id = (select auth.uid())
  );
$$;

create or replace function private.can_see_lesson(p_lesson_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_teacher() or private.lesson_is_assigned_to_me(p_lesson_id);
$$;

create or replace function private.gen_join_code()
returns text
language sql volatile set search_path = ''
as $$
  -- 8 characters, no 0/O/1/I/L to avoid misreading.
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8);
$$;

create or replace function private.normalize_join_code(p_code text)
returns text
language sql immutable set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

alter table public.classes alter column join_code set default private.gen_join_code();

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Create a profile for every new auth user, and enroll them if they signed up with a
-- valid join code (passed as user metadata, so it works with or without email confirmation).
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_class_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  );

  select id into v_class_id
  from public.classes
  where join_code = private.normalize_join_code(new.raw_user_meta_data ->> 'join_code')
    and not archived;

  if v_class_id is not null then
    insert into public.enrollments (class_id, student_id) values (v_class_id, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger lessons_touch_updated_at
  before update on public.lessons
  for each row execute function private.touch_updated_at();

create or replace function private.limit_questions_per_lesson()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.questions where lesson_id = new.lesson_id) >= 3 then
    raise exception 'A lesson can have at most 3 check questions' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger questions_limit_per_lesson
  before insert on public.questions
  for each row execute function private.limit_questions_per_lesson();

create or replace function private.check_question_key()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.correct_index >= (
    select jsonb_array_length(choices) from public.questions where id = new.question_id
  ) then
    raise exception 'correct_index is out of range for this question' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger question_keys_check
  before insert or update on public.question_keys
  for each row execute function private.check_question_key();

-- ---------------------------------------------------------------------------
-- Privileges: anon gets nothing; authenticated gets only what RLS then narrows.
-- ---------------------------------------------------------------------------

revoke all on table
  public.profiles, public.courses, public.classes, public.enrollments, public.lessons,
  public.assignments, public.assignment_lessons, public.questions, public.question_keys,
  public.question_attempts, public.confusion_notes, public.lesson_progress
from anon, authenticated;

grant select on table
  public.profiles, public.courses, public.classes, public.enrollments, public.lessons,
  public.assignments, public.assignment_lessons, public.questions, public.question_keys,
  public.question_attempts, public.confusion_notes, public.lesson_progress
to authenticated;

-- Content tables: written by the teacher (RLS enforces is_teacher()).
grant insert, update, delete on table
  public.courses, public.classes, public.lessons, public.assignments,
  public.assignment_lessons, public.questions, public.question_keys
to authenticated;

-- Teachers may remove a student from a class; joining goes through join_class().
grant delete on table public.enrollments to authenticated;

-- A user may edit only their display name; role and email are not client-writable.
grant update (full_name) on table public.profiles to authenticated;

-- Students write confusion notes directly (RLS checks the lesson allows it).
grant insert (lesson_id, body) on table public.confusion_notes to authenticated;
grant delete on table public.confusion_notes to authenticated;

-- lesson_progress and question_attempts: no direct writes at all (functions only).

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.courses            enable row level security;
alter table public.classes            enable row level security;
alter table public.enrollments        enable row level security;
alter table public.lessons            enable row level security;
alter table public.assignments        enable row level security;
alter table public.assignment_lessons enable row level security;
alter table public.questions          enable row level security;
alter table public.question_keys      enable row level security;
alter table public.question_attempts  enable row level security;
alter table public.confusion_notes    enable row level security;
alter table public.lesson_progress    enable row level security;

-- profiles
create policy "profiles: read own, teacher reads all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_teacher()));
create policy "profiles: update own name" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- courses
create policy "courses: read if enrolled or teacher" on public.courses
  for select to authenticated
  using ((select private.is_teacher()) or private.is_in_course(id));
create policy "courses: teacher inserts" on public.courses
  for insert to authenticated with check ((select private.is_teacher()));
create policy "courses: teacher updates" on public.courses
  for update to authenticated
  using ((select private.is_teacher())) with check ((select private.is_teacher()));
create policy "courses: teacher deletes" on public.courses
  for delete to authenticated using ((select private.is_teacher()));

-- classes
create policy "classes: read if enrolled or teacher" on public.classes
  for select to authenticated
  using ((select private.is_teacher()) or private.is_enrolled(id));
create policy "classes: teacher inserts" on public.classes
  for insert to authenticated with check ((select private.is_teacher()));
create policy "classes: teacher updates" on public.classes
  for update to authenticated
  using ((select private.is_teacher())) with check ((select private.is_teacher()));
create policy "classes: teacher deletes" on public.classes
  for delete to authenticated using ((select private.is_teacher()));

-- enrollments
create policy "enrollments: read own or teacher" on public.enrollments
  for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_teacher()));
create policy "enrollments: teacher removes" on public.enrollments
  for delete to authenticated using ((select private.is_teacher()));

-- lessons
create policy "lessons: read if assigned or teacher" on public.lessons
  for select to authenticated
  using ((select private.is_teacher()) or private.lesson_is_assigned_to_me(id));
create policy "lessons: teacher inserts" on public.lessons
  for insert to authenticated with check ((select private.is_teacher()));
create policy "lessons: teacher updates" on public.lessons
  for update to authenticated
  using ((select private.is_teacher())) with check ((select private.is_teacher()));
create policy "lessons: teacher deletes" on public.lessons
  for delete to authenticated using ((select private.is_teacher()));

-- assignments
create policy "assignments: read if enrolled or teacher" on public.assignments
  for select to authenticated
  using ((select private.is_teacher()) or private.is_enrolled(class_id));
create policy "assignments: teacher inserts" on public.assignments
  for insert to authenticated with check ((select private.is_teacher()));
create policy "assignments: teacher updates" on public.assignments
  for update to authenticated
  using ((select private.is_teacher())) with check ((select private.is_teacher()));
create policy "assignments: teacher deletes" on public.assignments
  for delete to authenticated using ((select private.is_teacher()));

-- assignment_lessons
create policy "assignment_lessons: read if enrolled or teacher" on public.assignment_lessons
  for select to authenticated
  using (
    (select private.is_teacher())
    or exists (
      select 1 from public.assignments a
      where a.id = assignment_id and private.is_enrolled(a.class_id)
    )
  );
create policy "assignment_lessons: teacher inserts" on public.assignment_lessons
  for insert to authenticated with check ((select private.is_teacher()));
create policy "assignment_lessons: teacher updates" on public.assignment_lessons
  for update to authenticated
  using ((select private.is_teacher())) with check ((select private.is_teacher()));
create policy "assignment_lessons: teacher deletes" on public.assignment_lessons
  for delete to authenticated using ((select private.is_teacher()));

-- questions: students see prompts only while the lesson's check is switched on
create policy "questions: read if lesson visible and check on" on public.questions
  for select to authenticated
  using (
    (select private.is_teacher())
    or (
      private.lesson_is_assigned_to_me(lesson_id)
      and exists (select 1 from public.lessons l where l.id = lesson_id and l.check_enabled)
    )
  );
create policy "questions: teacher inserts" on public.questions
  for insert to authenticated with check ((select private.is_teacher()));
create policy "questions: teacher updates" on public.questions
  for update to authenticated
  using ((select private.is_teacher())) with check ((select private.is_teacher()));
create policy "questions: teacher deletes" on public.questions
  for delete to authenticated using ((select private.is_teacher()));

-- question_keys: teacher only
create policy "question_keys: teacher reads" on public.question_keys
  for select to authenticated using ((select private.is_teacher()));
create policy "question_keys: teacher inserts" on public.question_keys
  for insert to authenticated with check ((select private.is_teacher()));
create policy "question_keys: teacher updates" on public.question_keys
  for update to authenticated
  using ((select private.is_teacher())) with check ((select private.is_teacher()));
create policy "question_keys: teacher deletes" on public.question_keys
  for delete to authenticated using ((select private.is_teacher()));

-- question_attempts: read own or teacher; written by submit_answer()
create policy "question_attempts: read own or teacher" on public.question_attempts
  for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_teacher()));

-- confusion_notes
create policy "confusion_notes: read own or teacher" on public.confusion_notes
  for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_teacher()));
create policy "confusion_notes: student writes own when box is on" on public.confusion_notes
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and private.lesson_is_assigned_to_me(lesson_id)
    and exists (select 1 from public.lessons l where l.id = lesson_id and l.confusion_enabled)
  );
create policy "confusion_notes: delete own or teacher" on public.confusion_notes
  for delete to authenticated
  using (student_id = (select auth.uid()) or (select private.is_teacher()));

-- lesson_progress: read own or teacher; written by open_lesson() / save_progress()
create policy "lesson_progress: read own or teacher" on public.lesson_progress
  for select to authenticated
  using (student_id = (select auth.uid()) or (select private.is_teacher()));

-- ---------------------------------------------------------------------------
-- API functions (exposed as RPC)
-- ---------------------------------------------------------------------------

-- Used on the sign-up form before creating the account. Returns only true/false.
-- Codes are 8 characters from a 31-letter alphabet (~8.5e11 combinations).
create or replace function public.join_code_is_valid(p_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.classes
    where join_code = private.normalize_join_code(p_code) and not archived
  );
$$;

create or replace function public.join_class(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_class_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;

  select id into v_class_id
  from public.classes
  where join_code = private.normalize_join_code(p_code) and not archived;

  if v_class_id is null then
    raise exception 'No class matches that join code' using errcode = 'P0002';
  end if;

  insert into public.enrollments (class_id, student_id) values (v_class_id, v_uid)
  on conflict do nothing;

  return v_class_id;
end;
$$;

-- Records the first time a student opens a lesson. Returns their progress row.
create or replace function public.open_lesson(p_lesson_id uuid)
returns public.lesson_progress
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.lesson_progress;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if not private.can_see_lesson(p_lesson_id) then
    raise exception 'This lesson is not assigned to you' using errcode = '42501';
  end if;

  insert into public.lesson_progress (student_id, lesson_id)
  values (v_uid, p_lesson_id)
  on conflict (student_id, lesson_id) do nothing;

  select * into v_row from public.lesson_progress
  where student_id = v_uid and lesson_id = p_lesson_id;
  return v_row;
end;
$$;

-- Merges newly played intervals into the stored ones and recomputes progress.
--
-- p_intervals is a JSON array of [start, end] pairs in video seconds that the browser
-- saw actually playing (seeks are not intervals). Because the union of intervals is
-- stored, re-sending the same interval is harmless, two tabs cannot overwrite each
-- other, and a second watched at 2x or watched twice still counts once.
create or replace function public.save_progress(
  p_lesson_id uuid,
  p_intervals jsonb,
  p_duration  numeric default null,
  p_position  numeric default null
)
returns public.lesson_progress
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_lesson_dur numeric;
  v_dur        numeric;
  v_existing   jsonb;
  v_merged     jsonb;
  v_watched    numeric;
  v_new_len    numeric;
  v_prev_len   numeric;
  v_last_save  timestamptz;
  v_row        public.lesson_progress;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if not private.can_see_lesson(p_lesson_id) then
    raise exception 'This lesson is not assigned to you' using errcode = '42501';
  end if;
  if p_intervals is null or jsonb_typeof(p_intervals) <> 'array'
     or jsonb_array_length(p_intervals) > 500 then
    raise exception 'p_intervals must be an array of at most 500 [start, end] pairs'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_intervals) e
    where jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
       or jsonb_typeof(e -> 0) <> 'number' or jsonb_typeof(e -> 1) <> 'number'
  ) then
    raise exception 'Each interval must be [start, end] in seconds' using errcode = '22023';
  end if;

  select duration_seconds into v_lesson_dur from public.lessons where id = p_lesson_id;
  if v_lesson_dur is null then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;

  -- Trust the player's duration only when it is close to the lesson's stored duration.
  v_dur := case
    when p_duration is not null and p_duration between v_lesson_dur * 0.8 and v_lesson_dur * 1.25
      then p_duration
    else v_lesson_dur
  end;

  insert into public.lesson_progress (student_id, lesson_id)
  values (v_uid, p_lesson_id)
  on conflict (student_id, lesson_id) do nothing;

  select watched_intervals, updated_at into v_existing, v_last_save
  from public.lesson_progress
  where student_id = v_uid and lesson_id = p_lesson_id
  for update;

  select coalesce(sum(greatest(0, least((e ->> 1)::numeric, v_dur) - greatest((e ->> 0)::numeric, 0))), 0)
  into v_prev_len
  from jsonb_array_elements(v_existing) e;

  select coalesce(sum(greatest(0, least((e ->> 1)::numeric, v_dur) - greatest((e ->> 0)::numeric, 0))), 0)
  into v_new_len
  from jsonb_array_elements(p_intervals) e;

  -- Union of intervals (gaps-and-islands), clamped to [0, duration].
  with raw as (
    select greatest((e ->> 0)::numeric, 0) as s, least((e ->> 1)::numeric, v_dur) as f
    from jsonb_array_elements(v_existing || p_intervals) e
  ),
  valid as (
    select s, f from raw where f > s
  ),
  marked as (
    select s, f,
      case when s <= max(f) over (order by s, f rows between unbounded preceding and 1 preceding)
           then 0 else 1 end as starts_group
    from valid
  ),
  grouped as (
    select s, f, sum(starts_group) over (order by s, f) as grp from marked
  ),
  merged as (
    select min(s) as s, max(f) as f from grouped group by grp
  )
  select
    coalesce(jsonb_agg(jsonb_build_array(round(s, 2), round(f, 2)) order by s), '[]'::jsonb),
    coalesce(sum(f - s), 0)
  into v_merged, v_watched
  from merged;

  -- Plausibility check against hand-made API calls: unique watched time cannot grow faster
  -- than the video plays at 2x (the top speed offered) since the last save, plus 30 s of
  -- slack. The browser keeps unsaved intervals and retries, so a genuine save that trips
  -- this (e.g. two tabs at once) goes through a little later.
  if v_watched - v_prev_len > extract(epoch from now() - v_last_save) * 2 + 30 then
    raise exception 'Watch time is arriving faster than the video can play. It will be retried.'
      using errcode = 'CL429';
  end if;

  update public.lesson_progress set
    watched_intervals = v_merged,
    watched_seconds   = round(v_watched, 2),
    duration_seconds  = round(v_dur, 2),
    percent_watched   = least(100, round(v_watched / v_dur * 100, 2)),
    completed_at      = coalesce(completed_at, case when v_watched >= 0.9 * v_dur then now() end),
    last_watched_at   = case when v_new_len > 0 then now() else last_watched_at end,
    last_position     = coalesce(round(greatest(0, least(p_position, v_dur)), 2), last_position),
    updated_at        = now()
  where student_id = v_uid and lesson_id = p_lesson_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Checks an answer server-side, records the attempt, and returns feedback.
-- The correct choice is not returned, so a retry is still a real retry.
create or replace function public.submit_answer(p_question_id uuid, p_choice integer)
returns table (is_correct boolean, explanation text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_lesson_id uuid;
  v_enabled   boolean;
  v_count     integer;
  v_correct   integer;
  v_expl      text;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;

  select q.lesson_id, l.check_enabled, jsonb_array_length(q.choices), k.correct_index, k.explanation
  into v_lesson_id, v_enabled, v_count, v_correct, v_expl
  from public.questions q
  join public.lessons l on l.id = q.lesson_id
  left join public.question_keys k on k.question_id = q.id
  where q.id = p_question_id;

  if v_lesson_id is null or not private.can_see_lesson(v_lesson_id) then
    raise exception 'Question not found' using errcode = 'P0002';
  end if;
  if not v_enabled and not private.is_teacher() then
    raise exception 'Questions are switched off for this lesson' using errcode = '42501';
  end if;
  if p_choice is null or p_choice < 0 or p_choice >= v_count then
    raise exception 'Choice out of range' using errcode = '22023';
  end if;
  if v_correct is null then
    raise exception 'This question has no answer key yet' using errcode = 'P0002';
  end if;

  insert into public.question_attempts (question_id, student_id, chosen_index, is_correct)
  values (p_question_id, v_uid, p_choice, p_choice = v_correct);

  return query select p_choice = v_correct, coalesce(v_expl, '');
end;
$$;

revoke all on function
  public.join_code_is_valid(text), public.join_class(text), public.open_lesson(uuid),
  public.save_progress(uuid, jsonb, numeric, numeric), public.submit_answer(uuid, integer)
from public, anon;

grant execute on function
  public.join_class(text), public.open_lesson(uuid),
  public.save_progress(uuid, jsonb, numeric, numeric), public.submit_answer(uuid, integer)
to authenticated;

grant execute on function public.join_code_is_valid(text) to anon, authenticated;

-- Private helpers are callable by signed-in users (RLS policies and the join_code column
-- default run as the caller) but never by anon. Trigger functions are not callable at all.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_teacher(), private.is_enrolled(uuid), private.is_in_course(uuid),
  private.lesson_is_assigned_to_me(uuid), private.can_see_lesson(uuid),
  private.gen_join_code()
to authenticated;
