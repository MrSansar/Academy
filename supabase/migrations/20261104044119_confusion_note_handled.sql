-- Teachers can mark a "What was confusing?" note as handled (answered, or covered in class),
-- and reopen it. Stored on the note so it is the same on every device.

alter table public.confusion_notes
  add column handled_at timestamptz,
  add column handled_by uuid references public.profiles (id) on delete set null;

-- The nav badge and the Notes page's "Open" tab count unhandled notes, newest first.
create index confusion_notes_open_idx on public.confusion_notes (created_at desc) where handled_at is null;

-- Marks the given notes handled (p_handled = true) or open again (false). Teacher only.
-- handled_by is always the caller, never client-supplied. Returns how many notes changed.
-- Students keep no write access to these columns: there is no column grant for them.
create or replace function public.set_notes_handled(p_note_ids bigint[], p_handled boolean)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not private.is_teacher() then
    raise exception 'Only the teacher can mark notes handled' using errcode = '42501';
  end if;

  update public.confusion_notes
     set handled_at = case when p_handled then coalesce(handled_at, now()) end,
         handled_by = case when p_handled then coalesce(handled_by, auth.uid()) end
   where id = any(p_note_ids)
     and (handled_at is null) = p_handled; -- only notes whose state actually changes
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.set_notes_handled(bigint[], boolean) from public, anon;
grant execute on function public.set_notes_handled(bigint[], boolean) to authenticated;
