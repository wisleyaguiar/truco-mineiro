-- Fase 3a: perfis, estatísticas, partidas (solo pelo servidor) e histórico.
-- Regra de ouro: o estado completo da partida (com as cartas de todos) só é lido pelo servidor
-- (chave secreta). Clientes nunca leem match_states nem match_events direto: tudo passa pela API.

-- ---------- Tabelas ----------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (
    char_length(nickname) between 2 and 20
    and nickname = btrim(nickname)
    and nickname !~ '[[:cntrl:]<>]'
  ),
  created_at timestamptz not null default now()
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));

create table public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  capotes integer not null default 0,
  win_streak integer not null default 0,
  best_streak integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('solo', 'room', 'queue')),
  status text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  version integer not null default 1,
  owner_id uuid not null references auth.users (id) on delete cascade,
  score_a smallint not null default 0,
  score_b smallint not null default 0,
  winner_team smallint check (winner_team in (0, 1)),
  capote boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index matches_owner_active on public.matches (owner_id) where status = 'active';
create index matches_finished on public.matches (finished_at desc) where status = 'finished';

create table public.match_participants (
  match_id uuid not null references public.matches (id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  user_id uuid references auth.users (id) on delete set null,
  is_bot boolean not null,
  bot_personality text,
  display_name text not null,
  primary key (match_id, seat)
);
create index match_participants_user on public.match_participants (user_id);

create table public.match_states (
  match_id uuid primary key references public.matches (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.match_events (
  match_id uuid not null references public.matches (id) on delete cascade,
  version integer not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (match_id, version)
);

-- ---------- Segurança (RLS) ----------

alter table public.profiles enable row level security;
alter table public.user_stats enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_states enable row level security;
alter table public.match_events enable row level security;

create function public.is_participant(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.match_participants where match_id = p_match and user_id = auth.uid())
$$;

-- Apelidos e estatísticas são públicos para quem está logado (ranking/telas de perfil).
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert_own on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_stats_read on public.user_stats for select to authenticated using (true);
create policy matches_read_own on public.matches for select to authenticated using (public.is_participant(id));
create policy participants_read_own on public.match_participants for select to authenticated
  using (public.is_participant(match_id));
-- match_states e match_events: sem nenhuma policy = ninguém além do servidor lê.

revoke all on public.match_states, public.match_events from anon, authenticated;
revoke insert, update, delete on public.user_stats, public.matches, public.match_participants from anon, authenticated;
revoke all on public.profiles from anon;
revoke update on public.profiles from authenticated;
grant update (nickname) on public.profiles to authenticated;

-- ---------- Funções do servidor (só a chave secreta / service_role chama) ----------

create function public.create_match(
  p_owner uuid, p_mode text, p_participants jsonb, p_state jsonb, p_step jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- Uma partida ativa por dono: a anterior é abandonada (não conta estatística).
  update public.matches set status = 'abandoned', updated_at = now()
    where owner_id = p_owner and status = 'active';
  insert into public.matches (mode, owner_id) values (p_mode, p_owner) returning id into v_id;
  insert into public.match_participants (match_id, seat, user_id, is_bot, bot_personality, display_name)
    select v_id, (p ->> 'seat')::smallint, nullif(p ->> 'userId', '')::uuid, (p ->> 'isBot')::boolean,
           p ->> 'personality', p ->> 'name'
    from jsonb_array_elements(p_participants) p;
  insert into public.match_states (match_id, state) values (v_id, p_state);
  insert into public.match_events (match_id, version, payload) values (v_id, 1, p_step);
  return v_id;
end $$;

create function public.finish_match(p_match uuid, p_finish jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_winner smallint := (p_finish ->> 'winnerTeam')::smallint;
  v_capote boolean := coalesce((p_finish ->> 'capote')::boolean, false);
begin
  update public.matches
    set status = 'finished',
        score_a = (p_finish -> 'scores' ->> 0)::smallint,
        score_b = (p_finish -> 'scores' ->> 1)::smallint,
        winner_team = v_winner,
        capote = v_capote,
        finished_at = now(),
        updated_at = now()
    where id = p_match;

  insert into public.user_stats (user_id)
    select user_id from public.match_participants where match_id = p_match and user_id is not null
    on conflict (user_id) do nothing;

  update public.user_stats s
    set matches_played = s.matches_played + 1,
        wins = s.wins + case when p.won then 1 else 0 end,
        losses = s.losses + case when p.won then 0 else 1 end,
        capotes = s.capotes + case when p.won and v_capote then 1 else 0 end,
        win_streak = case when p.won then s.win_streak + 1 else 0 end,
        best_streak = greatest(s.best_streak, case when p.won then s.win_streak + 1 else 0 end),
        updated_at = now()
    from (
      select user_id, (seat % 2) = v_winner as won
      from public.match_participants where match_id = p_match and user_id is not null
    ) p
    where s.user_id = p.user_id;
end $$;

-- Grava um passo com controle de versão (concorrência otimista). Retorna a nova versão,
-- ou null se a versão esperada não bate (outra jogada chegou antes) ou a partida não está ativa.
create function public.apply_step(
  p_match uuid, p_expected integer, p_state jsonb, p_step jsonb, p_finish jsonb
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v integer;
begin
  update public.matches set version = version + 1, updated_at = now()
    where id = p_match and version = p_expected and status = 'active'
    returning version into v;
  if v is null then
    return null;
  end if;
  update public.match_states set state = p_state, updated_at = now() where match_id = p_match;
  insert into public.match_events (match_id, version, payload) values (p_match, v, p_step);
  if p_finish is not null and p_finish <> 'null'::jsonb then
    perform public.finish_match(p_match, p_finish);
  end if;
  return v;
end $$;

create function public.match_history(p_user uuid, p_limit integer default 20)
returns table (
  match_id uuid, mode text, finished_at timestamptz, won boolean,
  score_us smallint, score_them smallint, capote boolean, partner text, opponents text[]
)
language sql stable security definer set search_path = public as $$
  select m.id, m.mode, m.finished_at,
         (me.seat % 2) = m.winner_team,
         case when me.seat % 2 = 0 then m.score_a else m.score_b end,
         case when me.seat % 2 = 0 then m.score_b else m.score_a end,
         m.capote,
         (select display_name from public.match_participants
           where match_id = m.id and seat = (me.seat + 2) % 4),
         array(select display_name from public.match_participants
                where match_id = m.id and seat % 2 <> me.seat % 2 order by seat)
  from public.matches m
  join public.match_participants me on me.match_id = m.id and me.user_id = p_user
  where m.status = 'finished'
  order by m.finished_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

revoke execute on function public.create_match(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.finish_match(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_step(uuid, integer, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.match_history(uuid, integer) from public, anon, authenticated;
grant execute on function public.create_match(uuid, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.finish_match(uuid, jsonb) to service_role;
grant execute on function public.apply_step(uuid, integer, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.match_history(uuid, integer) to service_role;
