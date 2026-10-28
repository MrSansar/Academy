-- Local development data only (`supabase db reset` runs this; the hosted project never does).
-- Join code for the sample class: SAMPLE24

insert into public.courses (id, title, description) values
  ('11111111-1111-4111-8111-111111111111', 'Linear algebra (sample)',
   'Sample course for local testing.');

insert into public.classes (id, course_id, name, join_code) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'Period 2 (sample)', 'SAMPLE24');

insert into public.lessons
  (id, course_id, position, title, youtube_id, duration_seconds, summary, transcript,
   check_enabled, confusion_enabled)
values
  ('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111', 0,
   'Why linear algebra?', 'kjBOesZCoqc', 314,
   'A preview of the series: why geometric intuition matters before computation.',
   E'0:00 Opening\n0:30 Why a geometric view helps\n1:30 What the series covers\n3:00 How to watch the series\n4:30 Closing',
   false, false),
  ('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111111', 1,
   'Vectors', 'fNk_zzaMoSs', 592,
   'Three views of a vector (arrow, list of numbers, abstract object), then vector addition and scaling.',
   null, true, true),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 2,
   'The essence of calculus', 'WUvTyaaNkzM', 1025,
   'Deriving the area of a circle by slicing it into rings, as a first look at integrals.',
   null, false, false);

insert into public.questions (id, lesson_id, position, prompt, choices) values
  ('44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 0,
   'What does the vector [2, -1] tell you to do, starting at the origin?',
   '["Move 2 right, then 1 down", "Move 2 up, then 1 left", "Move 1 right, then 2 down"]'),
  ('44444444-4444-4444-8444-444444444442', '33333333-3333-4333-8333-333333333332', 1,
   'Multiplying a vector by -2 does what?',
   '["Rotates it 90 degrees", "Flips its direction and doubles its length", "Halves its length"]');

insert into public.question_keys (question_id, correct_index, explanation) values
  ('44444444-4444-4444-8444-444444444441', 0,
   'The first coordinate is horizontal movement, the second is vertical.'),
  ('44444444-4444-4444-8444-444444444442', 1,
   'A negative scalar flips the direction; its size (2) stretches the length.');

insert into public.assignments (id, class_id, title, instructions, due_at) values
  ('55555555-5555-4555-8555-555555555551', '22222222-2222-4222-8222-222222222222',
   'Before Thursday: vectors', 'Watch both before class. We will start with the check questions.',
   date_trunc('hour', now()) + interval '30 hours'),
  ('55555555-5555-4555-8555-555555555552', '22222222-2222-4222-8222-222222222222',
   'Before next week: calculus preview', '',
   date_trunc('hour', now()) + interval '8 days');

insert into public.assignment_lessons (assignment_id, lesson_id, position) values
  ('55555555-5555-4555-8555-555555555551', '33333333-3333-4333-8333-333333333331', 0),
  ('55555555-5555-4555-8555-555555555551', '33333333-3333-4333-8333-333333333332', 1),
  ('55555555-5555-4555-8555-555555555552', '33333333-3333-4333-8333-333333333333', 0);
