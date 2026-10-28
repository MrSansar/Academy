# Chalkline

A flipped-classroom site. Students watch short assigned video lessons before class; the teacher
sees who prepared and what confused them.

- **Live site:** https://mrsansar.github.io/Academy/
- **Stack:** Vite + React + TypeScript (static, on GitHub Pages) · Supabase (Auth, Postgres, Row Level
  Security) · YouTube IFrame Player API

```
Browser (GitHub Pages)  ──anon key + user JWT──▶  Supabase
  React app                                         Auth (email + password)
  YouTube IFrame API ── watch intervals ──▶         Postgres + RLS
                                                    RPC: save_progress, open_lesson,
                                                         submit_answer, join_class
```

There is no server of our own: everything goes through Supabase, and Row Level Security decides
what each signed-in user can read or write. The browser only ever has the public anon/publishable
key. The service-role key is never used by the site.

## What it does

**Students** sign up with email, password and a class join code (and can join more classes later).
They see upcoming assignments sorted by due date (“Due before class on …”, not started / in
progress / done), watch lessons with a speed control (0.75×–2×), captions on by default, a clickable
transcript, and a short summary. Optional end-of-lesson practice questions give instant feedback and
can be retried. An optional “What was confusing?” box sends a note to the teacher. *My progress*
shows lessons done vs. assigned per class. No streaks, points, badges or leaderboards.

**The teacher** gets, per assignment, a students × lessons table (not opened / % watched /
complete, with “not opened” turning amber within 3 days of class and red within 24 hours), first-try
% correct per check question with the answer distribution, confusion notes newest first, and CSV
export (per assignment, or the whole class). The editor creates courses, lessons, classes and
assignments, reorders lessons, sets due dates, and toggles questions / the confusion box per lesson.
Lessons over 10 minutes get a soft warning.

### How watch tracking works

- While the YouTube player is playing, the page samples the current time every 250 ms. If the video
  time advanced by about what the wall clock allows at the current speed, the played interval grows;
  any larger jump (a seek, a transcript click, the arrow keys) starts a new interval, so skipped
  seconds are never counted.
- Intervals are in *video* seconds and are merged, so a second watched at 2× or watched twice
  counts once.
- Progress is saved every 10 s, on pause/end, and when the tab is hidden or closed (a `keepalive`
  request). Unsaved intervals are also kept in `localStorage` and sent on the next visit if the
  last save didn’t get through.
- The server (`save_progress`) stores the **union** of intervals, so saves are idempotent and two
  tabs can’t overwrite each other. A lesson is complete once unique watched time reaches **90%**;
  `completed_at` is set once and compared with each assignment’s due time (“late” on the
  dashboard, `finished_before_due` in the CSV). `first_opened_at` and `last_watched_at` are recorded
  too.
- A plausibility check rejects watch time that arrives faster than 2× playback since the last save
  (plus 30 s of slack), so a student can’t mark a video complete by sending one hand-made request.
  The browser simply retries later. Like any client-side tracking, it shows what a browser
  reported, not proof of attention.

## Supabase setup (hosted)

The project `chalkline` (Tokyo, free tier) already has the schema applied. To set up a fresh project:

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Apply the migration in [`supabase/migrations/`](supabase/migrations/). Either paste the file into
   **SQL Editor** and run it, or with the CLI:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
   ```bash
   supabase db push
   ```
3. **Authentication → URL Configuration**
   - **Site URL:** `https://mrsansar.github.io/Academy/`
   - **Redirect URLs:** add `https://mrsansar.github.io/Academy/` and `http://localhost:5173`
4. **Authentication → Sign In / Providers → Email** (pick one):
   - **Simplest:** turn **Confirm email** off. Students can sign in right after signing up. They
     still need your join code to see anything.
   - **Verified emails:** keep it on and set up custom SMTP under **Authentication → Emails → SMTP
     Settings** (e.g. Resend, Postmark). Supabase’s built-in mailer only sends to your own team’s
     addresses, so without SMTP students never get their confirmation or password-reset emails.
   - Set the minimum password length to 8 to match the sign-up form.
5. Copy the **Project URL** and the **publishable key** (Project Settings → API Keys) for the
   deploy step. Never copy the `service_role`/secret key into this repo or the site.

## Make your account the teacher

1. In the dashboard: **Authentication → Users → Add user → Create new user**. Enter your email
   and a password, and tick **Auto Confirm User**.
2. In **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'teacher' where email = 'you@example.com';
   ```
3. Sign in on the site. You’ll land on **Classes & courses**.

Students can’t change their own role: the `role` column isn’t writable through the API.

## Add a lesson

1. Upload the video to YouTube as **Unlisted**, and make sure **Allow embedding** is on (YouTube
   Studio → video → Show more → License and distribution). Add or auto-generate captions.
2. On the site: **Classes & courses → New course** (once), then **Lessons → New lesson**.
3. Paste the YouTube link. The preview loads and the length fills in automatically. Videos over
   10 minutes show a reminder that ~6-minute videos get watched more.
4. Add a short summary and, optionally, a transcript. One cue per line, starting with a time:
   ```
   0:00 Welcome
   1:05 Adding two vectors
   ```
   YouTube’s **Show transcript** text (time on one line, text on the next) and `.vtt` files also work.
5. Optional: switch on **End-of-lesson check questions** (up to 3, multiple choice, mark the
   correct choice, one-line explanation) and/or the **“What was confusing?” box**.
6. **Save lesson.** Use **Preview as student** to check it. Teacher viewing is never recorded.

Then put it in front of students:

- **New class** under the course gives you a join code (e.g. `ABCD-2345`) to share. **New code**
  replaces it; **Archive class** stops new joins.
- On the class page, **New assignment**: title, when class starts (students should finish before
  this), and the lessons in order. Students only see a lesson once it’s in an assignment for their
  class.

## Deploy (GitHub Pages)

The workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the tests, builds,
and publishes `dist/` on every push to `main`.

1. **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the publishable key (`sb_publishable_…`)

   These are public by design; they’re variables, not secrets.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main` (or run the workflow from the Actions tab).

The app uses hash routes (`#/lesson/…`) and relative asset paths, so it works at any Pages path
without a 404 fallback.

## Local development

Needs Node 20+ and Docker (Docker Desktop, OrbStack, or `brew install colima docker && colima start`).

```bash
npm install
```
```bash
supabase start
```
```bash
cp .env.example .env.local
```

Fill `.env.local` with the API URL and publishable key that `supabase start` prints, then:

```bash
npm run dev
```

`supabase start` applies the migration and [`supabase/seed.sql`](supabase/seed.sql), a sample course
and class with join code **SAMPLE24**. To make a local teacher, sign up (or add a user in Studio at
http://127.0.0.1:54323) and run the `update public.profiles …` statement above against the local
database. Stop the stack with `supabase stop`.

### Tests

```bash
npm test
```
Unit tests: interval merging, seek detection, 2× playback, throttled tabs, transcript and YouTube
link parsing, CSV escaping.

```bash
supabase test db
```
44 pgTAP checks against the local database. They cover the sign-up trigger, join codes,
interval merging and the 90% rule, the watch-rate check, and RLS. Students can’t read each other’s
progress, notes, answers, enrollments or the answer key. Nobody can write progress directly, make
themselves a teacher, or see unassigned lessons. Anon gets nothing.

## Data model

```
profiles (id = auth user, role student|teacher)
courses ─┬─ lessons (youtube_id, duration, summary, transcript, check_enabled, confusion_enabled)
         │     ├─ questions ── question_keys (teacher-only answer + explanation)
         │     │      └─ question_attempts (every try, timestamped)
         │     ├─ confusion_notes
         │     └─ lesson_progress (per student: intervals, %, first opened, last watched, completed)
         └─ classes (join_code) ─┬─ enrollments (student ↔ class)
                                 └─ assignments (due_at) ── assignment_lessons (ordered)
```

Lessons belong to a course, so one lesson can be assigned to several classes; progress is per
student per lesson. Every check-question attempt is stored with its timestamp, which is what a
future **spaced review** feature needs. It can add a `review_schedule (student_id, question_id,
due_at, interval, ease)` table fed from `question_attempts` without changing the existing tables.

Not in this version: AI tutor, forum, gamification, adaptive paths, spaced review.

## Legacy demo

The original single-file demo (localStorage only, no real accounts) is kept at
[`legacy/index.html`](legacy/index.html) for reference. It isn’t part of the build.
