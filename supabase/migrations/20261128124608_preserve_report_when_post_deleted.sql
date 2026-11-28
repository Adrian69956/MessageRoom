alter table public.post_reports alter column post_id drop not null;
alter table public.post_reports add column if not exists post_author_id uuid;
alter table public.post_reports add column if not exists post_text_snapshot text;
do $$ declare fk_name text; begin
 select conname into fk_name from pg_constraint where conrelid='public.post_reports'::regclass and contype='f' and pg_get_constraintdef(oid) like 'FOREIGN KEY (post_id)%';
 if fk_name is not null then execute format('alter table public.post_reports drop constraint %I',fk_name); end if;
end $$;
alter table public.post_reports add constraint post_reports_post_id_fkey foreign key(post_id) references public.posts(id) on delete set null;
create or replace function public.snapshot_post_report()
returns trigger language plpgsql security definer set search_path=''
as $$ begin select p.author_id,p.text into new.post_author_id,new.post_text_snapshot from public.posts p where p.id=new.post_id; return new; end $$;
drop trigger if exists post_reports_snapshot on public.post_reports;
create trigger post_reports_snapshot before insert on public.post_reports for each row execute function public.snapshot_post_report();
