-- Row Level Security and progress-tracking tests. Run with: supabase test db
-- Uses the sample class from seed.sql (join code SAMPLE24). Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- ---------------------------------------------------------------- fixtures
-- Users are created the same way sign-up creates them, so the profile/enrollment trigger runs.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'teacher@test.local', '{"full_name":"Teacher"}', now(), now()),
  -- join code typed lower case with a dash: the trigger should still enroll her
  ('aaaaaaaa-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ana@test.local', '{"full_name":"Ana","join_code":"sample-24"}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ben@test.local', '{"full_name":"Ben"}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cy@test.local', '{"full_name":"Cy","join_code":"WRONG999"}', now(), now());

update public.profiles set role = 'teacher' where id = 'aaaaaaaa-0000-4000-8000-00000000000a';

-- A lesson that is in the course but not in any assignment.
insert into public.lessons (id, course_id, title, youtube_id, duration_seconds)
values ('33333333-3333-4333-8333-333333333339', '11111111-1111-4111-8111-111111111111',
        'Unassigned', 'aircAruvnKk', 600);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
-- now() is fixed inside a transaction, so pretend the last save was an hour ago.
create function pg_temp.time_passes() returns void language sql as $$
  update public.lesson_progress set updated_at = now() - interval '1 hour';
$$;

-- ---------------------------------------------------------------- sign-up trigger
select is((select count(*)::int from public.profiles where email like '%@test.local'), 4, 'every new user gets a profile');
select is((select count(*)::int from public.enrollments where student_id = 'aaaaaaaa-0000-4000-8000-00000000000b'), 1,
  'a valid join code at sign-up enrolls the student (case and dash ignored)');
select is((select count(*)::int from public.enrollments where student_id = 'aaaaaaaa-0000-4000-8000-00000000000d'), 0,
  'an invalid join code enrolls nobody');

-- ---------------------------------------------------------------- anon
set local role anon;
select throws_ok('select * from public.lesson_progress', '42501', null, 'anon cannot read progress');
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select is(public.join_code_is_valid('sample24'), true, 'anon can check a join code on the sign-up form');
select throws_ok($$select public.join_class('SAMPLE24')$$, '42501', null, 'anon cannot join a class');
reset role;

-- ---------------------------------------------------------------- Ben joins with the RPC
select pg_temp.login('aaaaaaaa-0000-4000-8000-00000000000c');
select throws_ok($$select public.join_class('NOPE1234')$$, 'P0002', null, 'a wrong code is rejected');
select lives_ok($$select public.join_class('sample 24')$$, 'Ben joins with the code');
select lives_ok($$select public.open_lesson('33333333-3333-4333-8333-333333333332')$$, 'Ben opens a lesson');
select lives_ok($$select public.save_progress('33333333-3333-4333-8333-333333333332', '[[0,20]]', 592, 20)$$,
  'Ben saves progress');
select lives_ok($$insert into public.confusion_notes (lesson_id, body)
                  values ('33333333-3333-4333-8333-333333333332', 'Ben: what is a basis?')$$, 'Ben leaves a note');
select lives_ok($$select public.submit_answer('44444444-4444-4444-8444-444444444441', 2)$$, 'Ben answers a question');

-- ---------------------------------------------------------------- Ana: tracking
select pg_temp.login('aaaaaaaa-0000-4000-8000-00000000000b');
select is((select first_opened_at is not null and last_watched_at is null
           from public.open_lesson('33333333-3333-4333-8333-333333333332')), true,
  'opening records first_opened_at but not a watch');
select public.save_progress('33333333-3333-4333-8333-333333333332', '[[0,30]]', 592, 30);
-- she seeks from 30 s to 200 s: the browser never reports 30-200 as played
select public.save_progress('33333333-3333-4333-8333-333333333332', '[[200,230]]', 592, 230);
-- rewatches 20-40 at 2x, and the same interval is sent twice (retry after a network error)
select public.save_progress('33333333-3333-4333-8333-333333333332', '[[20,40],[20,40]]', 592, 40);
select is((select watched_seconds from public.lesson_progress
           where student_id = 'aaaaaaaa-0000-4000-8000-00000000000b' and lesson_id = '33333333-3333-4333-8333-333333333332'),
  70.00::numeric, 'skipped seconds do not count and overlaps count once (0-40 + 200-230 = 70 s)');
select is((select watched_intervals from public.lesson_progress
           where student_id = 'aaaaaaaa-0000-4000-8000-00000000000b' and lesson_id = '33333333-3333-4333-8333-333333333332'),
  '[[0, 40], [200, 230]]'::jsonb, 'intervals are stored merged');
select is((select completed_at from public.lesson_progress
           where student_id = 'aaaaaaaa-0000-4000-8000-00000000000b' and lesson_id = '33333333-3333-4333-8333-333333333332'),
  null, 'not complete below 90%');
select public.open_lesson('33333333-3333-4333-8333-333333333331');
select throws_ok($$select public.save_progress('33333333-3333-4333-8333-333333333331', '[[0,250]]', 314, 250)$$,
  'CL429', null, 'a whole video reported seconds after opening it is rejected (faster than 2x)');
select pg_temp.logout();
select pg_temp.time_passes();
select pg_temp.login('aaaaaaaa-0000-4000-8000-00000000000b');
select public.save_progress('33333333-3333-4333-8333-333333333331', '[[0,250]]', 314, 250);
select is((select completed_at from public.lesson_progress
           where student_id = 'aaaaaaaa-0000-4000-8000-00000000000b' and lesson_id = '33333333-3333-4333-8333-333333333331'),
  null, '80% is not complete');
select pg_temp.logout();
select pg_temp.time_passes();
select pg_temp.login('aaaaaaaa-0000-4000-8000-00000000000b');
select public.save_progress('33333333-3333-4333-8333-333333333331', '[[240,290]]', 314, 290);
select isnt((select completed_at from public.lesson_progress
             where student_id = 'aaaaaaaa-0000-4000-8000-00000000000b' and lesson_id = '33333333-3333-4333-8333-333333333331'),
  null, '92% is complete');
select is((select percent_watched from public.save_progress('33333333-3333-4333-8333-333333333331', '[[0,9999]]', 1, 0)),
  100.00::numeric, 'out-of-range intervals are clamped and a bogus duration is ignored');
select throws_ok($$select public.save_progress('33333333-3333-4333-8333-333333333331', '{"a":1}', 314, 0)$$,
  '22023', null, 'malformed intervals are rejected');

-- ---------------------------------------------------------------- Ana: isolation
select is((select count(*)::int from public.lesson_progress where student_id <> auth.uid()), 0,
  'a student cannot read another student''s progress');
select is((select count(*)::int from public.profiles), 1, 'a student sees only her own profile');
select is((select count(*)::int from public.confusion_notes where student_id <> auth.uid()), 0,
  'a student cannot read another student''s confusion notes');
select is((select count(*)::int from public.question_attempts where student_id <> auth.uid()), 0,
  'a student cannot read another student''s answers');
select is((select count(*)::int from public.enrollments where student_id <> auth.uid()), 0,
  'a student cannot see who else is in the class');
select is((select count(*)::int from public.question_keys), 0, 'a student cannot read the answer key');
select is((select count(*)::int from public.lessons where id = '33333333-3333-4333-8333-333333333339'), 0,
  'a student cannot see a lesson that is not assigned');
select throws_ok($$select public.save_progress('33333333-3333-4333-8333-333333333339', '[[0,600]]', 600, 0)$$,
  '42501', null, 'a student cannot record progress on an unassigned lesson');

-- ---------------------------------------------------------------- Ana: forbidden writes
select throws_ok($$insert into public.lesson_progress (student_id, lesson_id, percent_watched)
                   values (auth.uid(), '33333333-3333-4333-8333-333333333333', 100)$$,
  '42501', null, 'progress cannot be written directly');
select throws_ok($$update public.lesson_progress set completed_at = now()$$,
  '42501', null, 'progress cannot be edited directly');
select throws_ok($$update public.profiles set role = 'teacher' where id = auth.uid()$$,
  '42501', null, 'a student cannot make herself a teacher');
select throws_ok($$insert into public.confusion_notes (lesson_id, student_id, body)
                   values ('33333333-3333-4333-8333-333333333332', 'aaaaaaaa-0000-4000-8000-00000000000c', 'forged')$$,
  '42501', null, 'a student cannot write a note as someone else');
select throws_ok($$insert into public.confusion_notes (lesson_id, body)
                   values ('33333333-3333-4333-8333-333333333331', 'box is off')$$,
  '42501', null, 'no confusion notes when the box is switched off');
select throws_ok($$insert into public.courses (title) values ('mine')$$, '42501', null, 'a student cannot create courses');
select is((select is_correct from public.submit_answer('44444444-4444-4444-8444-444444444441', 0)), true,
  'answers are checked on the server');

-- ---------------------------------------------------------------- Cy: not in any class
select pg_temp.login('aaaaaaaa-0000-4000-8000-00000000000d');
select is((select count(*)::int from public.lessons), 0, 'a user in no class sees no lessons');
select is((select count(*)::int from public.classes), 0, 'a user in no class sees no classes');
select throws_ok($$select public.open_lesson('33333333-3333-4333-8333-333333333332')$$,
  '42501', null, 'a user in no class cannot open lessons');

-- ---------------------------------------------------------------- teacher
select pg_temp.login('aaaaaaaa-0000-4000-8000-00000000000a');
select is((select count(distinct lp.student_id)::int from public.lesson_progress lp
           join public.profiles p on p.id = lp.student_id where p.email like '%@test.local'), 2,
  'the teacher sees every student''s progress');
select is((select count(*)::int from public.confusion_notes n
           join public.profiles p on p.id = n.student_id where p.email like '%@test.local'), 1,
  'the teacher reads confusion notes');
select is((select count(*)::int from public.question_keys), 2, 'the teacher reads the answer key');
select lives_ok($$insert into public.courses (title) values ('Teacher course')$$, 'the teacher can create a course');

select pg_temp.logout();
select * from finish();
rollback;
