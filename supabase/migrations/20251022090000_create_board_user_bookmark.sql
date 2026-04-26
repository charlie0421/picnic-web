-- board_user_bookmark: 보드 북마크 테이블
create table if not exists board_user_bookmark (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id text not null,
  created_at timestamptz not null default now(),
  unique(user_id, board_id)
);

-- RLS 정책 (프로젝트 정책에 맞게 필요 시 보완)
alter table board_user_bookmark enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'board_user_bookmark' and policyname = 'select own'
  ) then
    create policy "select own" on board_user_bookmark for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'board_user_bookmark' and policyname = 'insert own'
  ) then
    create policy "insert own" on board_user_bookmark for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'board_user_bookmark' and policyname = 'delete own'
  ) then
    create policy "delete own" on board_user_bookmark for delete using (auth.uid() = user_id);
  end if;
end $$;

-- 인덱스
create index if not exists idx_board_user_bookmark_user on board_user_bookmark(user_id);
create index if not exists idx_board_user_bookmark_board on board_user_bookmark(board_id);


