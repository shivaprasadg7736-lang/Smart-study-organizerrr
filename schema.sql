-- Run in Supabase > SQL Editor
create table public.profiles(id uuid primary key references auth.users on delete cascade, full_name text, created_at timestamptz default now());
create table public.subjects(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade default auth.uid(), name text not null, created_at timestamptz default now());
create table public.materials(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade default auth.uid(), subject_id uuid not null references public.subjects on delete cascade, kind text not null check(kind in('pdf','photo')), name text not null, path text not null, size bigint not null, favourite boolean default false, last_opened timestamptz, created_at timestamptz default now());
create table public.notes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade default auth.uid(), subject_id uuid references public.subjects on delete set null, title text not null default 'Untitled', description text default '', body text default '', created_at timestamptz default now(), updated_at timestamptz default now());
create table public.live_classes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade default auth.uid(), subject_id uuid references public.subjects on delete set null, title text not null, link text not null check(link ~* '^https://'), starts_at timestamptz not null, description text default '', created_at timestamptz default now());
create index on public.materials(user_id,subject_id); create index on public.notes(user_id); create index on public.live_classes(user_id,starts_at);

alter table public.profiles enable row level security; alter table public.subjects enable row level security; alter table public.materials enable row level security; alter table public.notes enable row level security; alter table public.live_classes enable row level security;
create policy own on public.profiles for all using(id=auth.uid()) with check(id=auth.uid());
create policy own on public.subjects for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own on public.materials for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own on public.notes for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own on public.live_classes for all using(user_id=auth.uid()) with check(user_id=auth.uid());

-- New user: profile + sample folders
create function public.on_signup() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into profiles(id,full_name) values(new.id,new.raw_user_meta_data->>'full_name');
 insert into subjects(user_id,name) select new.id,n from unnest(array['Engineering Physics','Engineering Chemistry','Mathematics','Engineering Programming Paradigm (EPP)','English','Tamil']) n;
 return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_signup();

-- Private bucket, 20 MB limit, PDFs + images only; files live under <user_id>/...
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('materials','materials',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy "own files read" on storage.objects for select using(bucket_id='materials' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "own files insert" on storage.objects for insert with check(bucket_id='materials' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "own files delete" on storage.objects for delete using(bucket_id='materials' and (storage.foldername(name))[1]=auth.uid()::text);
