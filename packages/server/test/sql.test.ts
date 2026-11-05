// Testa a migração SQL num Postgres em memória (PGlite), simulando o que o Supabase fornece
// (schema auth, auth.uid(), papéis anon/authenticated/service_role).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(fileURLToPath(new URL('../../../supabase/migrations/0001_init.sql', import.meta.url)), 'utf8');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

let db: PGlite;

async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; set role service_role;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${uid}';`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; reset request.jwt.claim.sub;`);
  }
}

async function fails(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
    return 'OK';
  } catch (e) {
    return (e as Error).message;
  }
}

const participants = (owner: string) =>
  JSON.stringify([
    { seat: 0, userId: owner, isBot: false, personality: null, name: 'Fulano' },
    { seat: 1, userId: '', isBot: true, personality: 'blefe', name: 'Zé do Blefe' },
    { seat: 2, userId: '', isBot: true, personality: 'equilibrado', name: 'Chico Mineiro' },
    { seat: 3, userId: '', isBot: true, personality: 'desconfiado', name: 'Tião Desconfiado' },
  ]);

async function createMatch(owner: string): Promise<string> {
  const r = await asService(() =>
    db.query<{ id: string }>(`select public.create_match($1, 'solo', $2::jsonb, $3::jsonb, $4::jsonb) as id`, [
      owner,
      participants(owner),
      JSON.stringify({ secret: 'cartas de todo mundo' }),
      JSON.stringify({ events: [] }),
    ]),
  );
  return r.rows[0]!.id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(MIGRATION);
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@x.com'), ('${B}', 'b@x.com');`);
});

describe('migração 0001: funções do servidor', () => {
  it('create_match cria partida, participantes, estado e o passo 1', async () => {
    const id = await createMatch(A);
    const m = await db.query<{ version: number; status: string }>(`select version, status from public.matches where id = $1`, [id]);
    expect(m.rows[0]).toEqual({ version: 1, status: 'active' });
    const p = await db.query(`select seat from public.match_participants where match_id = $1`, [id]);
    expect(p.rows).toHaveLength(4);
    const e = await db.query(`select version from public.match_events where match_id = $1`, [id]);
    expect(e.rows).toEqual([{ version: 1 }]);
  });

  it('nova partida abandona a anterior do mesmo dono', async () => {
    const first = await createMatch(B);
    const second = await createMatch(B);
    const r = await db.query<{ id: string; status: string }>(
      `select id, status from public.matches where owner_id = $1 order by created_at`,
      [B],
    );
    expect(r.rows.find((x) => x.id === first)!.status).toBe('abandoned');
    expect(r.rows.find((x) => x.id === second)!.status).toBe('active');
  });

  it('apply_step: versão certa avança; versão velha devolve null (conflito)', async () => {
    const id = await createMatch(A);
    const ok = await asService(() =>
      db.query<{ v: number | null }>(`select public.apply_step($1, 1, '{}'::jsonb, '{"events":[]}'::jsonb, null) as v`, [id]),
    );
    expect(ok.rows[0]!.v).toBe(2);
    const stale = await asService(() =>
      db.query<{ v: number | null }>(`select public.apply_step($1, 1, '{}'::jsonb, '{"events":[]}'::jsonb, null) as v`, [id]),
    );
    expect(stale.rows[0]!.v).toBeNull();
  });

  it('finalizar atualiza estatísticas, sequência e histórico', async () => {
    const id = await createMatch(A);
    await asService(() =>
      db.query(`select public.apply_step($1, 1, '{}'::jsonb, '{"events":[]}'::jsonb, $2::jsonb)`, [
        id,
        JSON.stringify({ scores: [12, 0], winnerTeam: 0, capote: true }),
      ]),
    );
    const s = await db.query(`select matches_played, wins, losses, capotes, win_streak, best_streak from public.user_stats where user_id = $1`, [A]);
    expect(s.rows[0]).toEqual({ matches_played: 1, wins: 1, losses: 0, capotes: 1, win_streak: 1, best_streak: 1 });
    // partida finalizada não aceita mais passos
    const after = await asService(() =>
      db.query<{ v: number | null }>(`select public.apply_step($1, 2, '{}'::jsonb, '{"events":[]}'::jsonb, null) as v`, [id]),
    );
    expect(after.rows[0]!.v).toBeNull();
    const h = await asService(() => db.query(`select won, score_us, score_them, capote, partner, opponents from public.match_history($1, 10)`, [A]));
    expect(h.rows[0]).toEqual({
      won: true,
      score_us: 12,
      score_them: 0,
      capote: true,
      partner: 'Chico Mineiro',
      opponents: ['Zé do Blefe', 'Tião Desconfiado'],
    });
  });

  it('derrota zera a sequência e mantém o recorde', async () => {
    const id = await createMatch(A);
    await asService(() =>
      db.query(`select public.apply_step($1, 1, '{}'::jsonb, '{"events":[]}'::jsonb, $2::jsonb)`, [
        id,
        JSON.stringify({ scores: [4, 12], winnerTeam: 1, capote: false }),
      ]),
    );
    const s = await db.query(`select matches_played, wins, losses, win_streak, best_streak from public.user_stats where user_id = $1`, [A]);
    expect(s.rows[0]).toEqual({ matches_played: 2, wins: 1, losses: 1, win_streak: 0, best_streak: 1 });
  });
});

describe('migração 0001: segurança (RLS e permissões)', () => {
  it('jogador logado NÃO lê o estado com as cartas nem os eventos brutos', async () => {
    await createMatch(A);
    const states = await asUser(A, () => fails(`select * from public.match_states`));
    const events = await asUser(A, () => fails(`select * from public.match_events`));
    expect(states).toMatch(/permission denied/);
    expect(events).toMatch(/permission denied/);
  });

  it('jogador logado NÃO chama as funções do servidor', async () => {
    const id = await createMatch(A);
    const r1 = await asUser(A, () => fails(`select public.apply_step($1, 1, '{}'::jsonb, '{}'::jsonb, null)`, [id]));
    const r2 = await asUser(A, () => fails(`select public.finish_match($1, '{"scores":[12,0],"winnerTeam":0}'::jsonb)`, [id]));
    const r3 = await asUser(A, () => fails(`select * from public.match_history($1, 10)`, [B]));
    expect(r1).toMatch(/permission denied/);
    expect(r2).toMatch(/permission denied/);
    expect(r3).toMatch(/permission denied/);
  });

  it('jogador vê só as partidas em que joga', async () => {
    const mine = await asUser(B, () => db.query<{ owner_id: string }>(`select owner_id from public.matches`));
    expect(mine.rows.length).toBeGreaterThan(0);
    expect(mine.rows.every((r) => r.owner_id === B)).toBe(true);
  });

  it('jogador NÃO altera estatísticas nem partidas', async () => {
    expect(await asUser(A, () => fails(`update public.user_stats set wins = 999`))).toMatch(/permission denied/);
    expect(await asUser(A, () => fails(`insert into public.user_stats (user_id) values ('${B}')`))).toMatch(/permission denied/);
    expect(await asUser(A, () => fails(`update public.matches set winner_team = 0`))).toMatch(/permission denied/);
  });

  it('perfil: cria e muda o próprio apelido; não mexe no dos outros', async () => {
    expect(await asUser(A, () => fails(`insert into public.profiles (user_id, nickname) values ('${A}', 'Fulano')`))).toBe('OK');
    expect(await asUser(A, () => fails(`insert into public.profiles (user_id, nickname) values ('${B}', 'Intruso')`))).toMatch(
      /row-level security/,
    );
    expect(await asUser(A, () => fails(`update public.profiles set nickname = 'Fulano Mineiro' where user_id = '${A}'`))).toBe('OK');
    expect(await asUser(A, () => fails(`update public.profiles set user_id = '${B}' where user_id = '${A}'`))).toMatch(/permission denied/);
  });

  it('apelido: único sem diferenciar maiúsculas e sem caracteres perigosos', async () => {
    expect(await asUser(B, () => fails(`insert into public.profiles (user_id, nickname) values ('${B}', 'fulano mineiro')`))).toMatch(
      /duplicate key/,
    );
    expect(await asUser(B, () => fails(`insert into public.profiles (user_id, nickname) values ('${B}', '<script>')`))).toMatch(/check/);
    expect(await asUser(B, () => fails(`insert into public.profiles (user_id, nickname) values ('${B}', 'x')`))).toMatch(/check/);
  });

  it('visitante (anon) não lê nada', async () => {
    await db.exec(`set role anon;`);
    try {
      expect(await fails(`select * from public.profiles`)).toMatch(/permission denied/);
      expect(await fails(`select * from public.match_states`)).toMatch(/permission denied/);
    } finally {
      await db.exec(`reset role;`);
    }
  });
});
