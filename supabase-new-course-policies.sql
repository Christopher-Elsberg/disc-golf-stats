-- Run this once in Supabase SQL Editor before creating courses from the frontend.

alter table public.courses enable row level security;
alter table public.course_holes enable row level security;

drop policy if exists "Authenticated can insert courses" on public.courses;
create policy "Authenticated can insert courses"
on public.courses
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can insert course holes" on public.course_holes;
create policy "Authenticated can insert course holes"
on public.course_holes
for insert
to authenticated
with check (true);

grant select, insert on public.courses to authenticated;
grant select, insert on public.course_holes to authenticated;
