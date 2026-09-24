-- =====================================================================
-- SIGA · Serveur de TEST (Supabase gratuit)
-- À exécuter une fois dans « SQL Editor » du projet Supabase.
--
-- Rôle : permettre aux testeurs de la DGREH d'utiliser SIGA à plusieurs,
-- sur Android, Windows et navigateur, avant la mise en place du serveur
-- interne. Les dossiers sont stockés en documents JSON par collection ;
-- le serveur garde la main sur ce qui ne doit jamais diverger entre
-- utilisateurs :
--   * la numérotation officielle, sans trou ni doublon ;
--   * le journal d'audit chaîné, en ajout seul ;
--   * l'isolation par organisation et l'accès réservé aux comptes rattachés.
--
-- Le serveur définitif de la DGREH reprendra le schéma relationnel V1 à V7
-- (règles métier appliquées en base). Aucune donnée réelle sensible ici.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Comptes de test rattachés à un agent
-- ---------------------------------------------------------------------
create table if not exists public.siga_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  tenant         text not null default 'DGREH',
  email          text,
  agent_mat      text,                 -- matricule sans espaces, ex. 203299L ; null = compte technique
  is_admin       boolean not null default false,
  can_impersonate boolean not null default false,   -- « Voir en tant que », réservé aux testeurs pilotes
  created_at     timestamptz not null default now()
);
alter table public.siga_profiles enable row level security;

create or replace function public.siga_my_tenant()
returns text language sql stable security definer set search_path = public, extensions as
$$ select tenant from public.siga_profiles where user_id = auth.uid() $$;

create or replace function public.siga_is_admin()
returns boolean language sql stable security definer set search_path = public, extensions as
$$ select coalesce((select is_admin from public.siga_profiles where user_id = auth.uid()), false) $$;

drop policy if exists profiles_read on public.siga_profiles;
create policy profiles_read on public.siga_profiles for select to authenticated
  using (user_id = auth.uid() or (public.siga_is_admin() and tenant = public.siga_my_tenant()));
-- Aucune écriture directe : les comptes se rattachent par les fonctions ci-dessous.

-- ---------------------------------------------------------------------
-- 2. Dossiers : un document JSON par élément et par collection
-- ---------------------------------------------------------------------
create table if not exists public.siga_records (
  tenant      text not null,
  collection  text not null,           -- missions, requests, mail, audit, ...
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (tenant, collection, id)
);
create index if not exists ix_records_updated on public.siga_records (tenant, updated_at desc);
alter table public.siga_records enable row level security;

drop policy if exists records_read   on public.siga_records;
drop policy if exists records_insert on public.siga_records;
drop policy if exists records_update on public.siga_records;
create policy records_read   on public.siga_records for select to authenticated using (tenant = public.siga_my_tenant());
create policy records_insert on public.siga_records for insert to authenticated with check (tenant = public.siga_my_tenant());
create policy records_update on public.siga_records for update to authenticated
  using (tenant = public.siga_my_tenant()) with check (tenant = public.siga_my_tenant());
-- Pas de politique DELETE : aucune suppression depuis l'application.

-- ---------------------------------------------------------------------
-- 3. Numérotation officielle attribuée par le serveur
--    L'application écrit un jeton {{N:CLE:ANNEE:ref}} ; le serveur le
--    remplace, dans la transaction, par le numéro suivant. Un même jeton
--    reçoit toujours le même numéro, dans tous les dossiers qui le citent.
-- ---------------------------------------------------------------------
create table if not exists public.siga_counters (
  tenant text not null, key text not null, year int not null, last_value int not null default 0,
  primary key (tenant, key, year));
create table if not exists public.siga_tokens (
  tenant text not null, token text not null, value text not null, assigned_at timestamptz not null default now(),
  primary key (tenant, token));
create table if not exists public.siga_counter_width (key text primary key, width int not null);
insert into public.siga_counter_width values
  ('ARRIVEE',4),('DEPART',4),('BORDEREAU',4),('OM',4),('NOTE',3),('DEM',6),('DMD',6)
  on conflict (key) do nothing;
alter table public.siga_counters enable row level security;
alter table public.siga_tokens enable row level security;
alter table public.siga_counter_width enable row level security;
-- Tables internes : aucune politique, donc inaccessibles directement.

create or replace function public.siga_resolve_tokens(p_tenant text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  txt text := p_data::text; m text[]; v text; seq int; w int;
begin
  if position('{{N:' in txt) = 0 then return p_data; end if;
  for m in select regexp_matches(txt, '\{\{N:([A-Z]+):([0-9]{4}):([a-z0-9]+)\}\}', 'g') loop
    select value into v from siga_tokens
     where tenant = p_tenant and token = '{{N:'||m[1]||':'||m[2]||':'||m[3]||'}}';
    if v is null then
      insert into siga_counters(tenant, key, year) values (p_tenant, m[1], m[2]::int)
        on conflict do nothing;
      update siga_counters set last_value = last_value + 1
       where tenant = p_tenant and key = m[1] and year = m[2]::int
       returning last_value into seq;                 -- verrou de ligne : pas de doublon
      select coalesce((select width from siga_counter_width where key = m[1]), 4) into w;
      v := lpad(seq::text, w, '0');
      insert into siga_tokens(tenant, token, value)
      values (p_tenant, '{{N:'||m[1]||':'||m[2]||':'||m[3]||'}}', v);
    end if;
    txt := replace(txt, '{{N:'||m[1]||':'||m[2]||':'||m[3]||'}}', v);
    v := null;
  end loop;
  return txt::jsonb;
end $$;

-- ---------------------------------------------------------------------
-- 4. Journal d'audit chaîné, en ajout seul
--    Même formule que l'application : sha256(prev|seq|at|actor|action|target|detail)
-- ---------------------------------------------------------------------
create table if not exists public.siga_audit_state (
  tenant text primary key, last_seq bigint not null default 0,
  last_hash text not null default repeat('0', 64));
alter table public.siga_audit_state enable row level security;

create or replace function public.siga_records_before_write()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare st siga_audit_state%rowtype; h text; r int;
begin
  if tg_op = 'UPDATE' then
    if old.collection = 'audit' then
      return old;                                 -- une ligne d'audit ne change jamais
    end if;
    -- Contrôle de version : on ne modifie que la version qu'on a lue
    r := coalesce((old.data->>'_rev')::int, 0);
    if coalesce((new.data->>'_rev')::int, -1) <> r then
      raise exception 'SIGA_CONFLICT: dossier % modifié entre-temps par un autre utilisateur', new.id
        using errcode = 'PT409';   -- rendu en HTTP 409 par l'API (40001 serait rejoué indéfiniment)
    end if;
    new.tenant := old.tenant; new.collection := old.collection; new.id := old.id;
    new.data := siga_resolve_tokens(new.tenant, new.data) || jsonb_build_object('_rev', r + 1);
  else
    -- Envoi répété après une coupure : la ligne existe déjà, on l'ignore
    if exists (select 1 from siga_records where tenant = new.tenant and collection = new.collection and id = new.id) then
      return null;
    end if;
    new.data := siga_resolve_tokens(new.tenant, new.data) || jsonb_build_object('_rev', 1);
    if new.collection = 'audit' then
      insert into siga_audit_state(tenant) values (new.tenant) on conflict do nothing;
      select * into st from siga_audit_state where tenant = new.tenant for update;
      h := encode(digest(st.last_hash || '|' || (st.last_seq + 1) || '|' ||
                         coalesce(new.data->>'at','') || '|' || coalesce(new.data->>'actor','') || '|' ||
                         coalesce(new.data->>'action','') || '|' || coalesce(new.data->>'target','') || '|' ||
                         coalesce(new.data->>'detail',''), 'sha256'), 'hex');
      new.data := new.data || jsonb_build_object('seq', st.last_seq + 1, 'prev', st.last_hash, 'hash', h);
      update siga_audit_state set last_seq = st.last_seq + 1, last_hash = h where tenant = new.tenant;
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists trg_records_before_write on public.siga_records;
create trigger trg_records_before_write before insert or update on public.siga_records
  for each row execute function public.siga_records_before_write();

-- Vérification serveur de la chaîne (renvoie null si intègre)
create or replace function public.siga_verify_audit()
returns bigint language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; prev text := repeat('0',64); h text;
begin
  for r in select data from siga_records where tenant = siga_my_tenant() and collection = 'audit'
           order by (data->>'seq')::bigint loop
    h := encode(digest(prev || '|' || (r.data->>'seq') || '|' || coalesce(r.data->>'at','') || '|' ||
                coalesce(r.data->>'actor','') || '|' || coalesce(r.data->>'action','') || '|' ||
                coalesce(r.data->>'target','') || '|' || coalesce(r.data->>'detail',''), 'sha256'), 'hex');
    if h <> r.data->>'hash' then return (r.data->>'seq')::bigint; end if;
    prev := h;
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 5. Administration des comptes de test
-- ---------------------------------------------------------------------
-- Derniers numéros attribués (affichage « prochain numéro » dans l'application)
create or replace function public.siga_counters_peek()
returns table(key text, year int, last_value int) language sql stable security definer set search_path = public, extensions as
$$ select key, year, last_value from siga_counters where tenant = siga_my_tenant() $$;

-- Premier administrateur : à lancer une fois dans le SQL Editor (hors application)
create or replace function public.siga_bootstrap_admin(p_email text, p_tenant text default 'DGREH')
returns text language plpgsql security definer set search_path = public, extensions as $$
declare u uuid;
begin
  select id into u from auth.users where lower(email) = lower(p_email);
  if u is null then return 'Utilisateur introuvable : créez-le d''abord dans Authentication > Users'; end if;
  insert into siga_profiles(user_id, tenant, email, is_admin, can_impersonate)
  values (u, p_tenant, p_email, true, true)
  on conflict (user_id) do update set is_admin = true, can_impersonate = true, tenant = excluded.tenant;
  return 'Administrateur de test : ' || p_email;
end $$;
revoke execute on function public.siga_bootstrap_admin(text, text) from public, anon, authenticated;

-- Rattacher un compte à un agent (depuis l'application, par un administrateur)
create or replace function public.siga_link_user(p_email text, p_mat text, p_admin boolean default false, p_impersonate boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare u uuid; t text := siga_my_tenant();
begin
  if not siga_is_admin() then raise exception 'Réservé aux administrateurs de test'; end if;
  select id into u from auth.users where lower(email) = lower(p_email);
  if u is null then raise exception 'Aucun compte pour %. Créez-le dans Supabase : Authentication > Users.', p_email; end if;
  insert into siga_profiles(user_id, tenant, email, agent_mat, is_admin, can_impersonate)
  values (u, t, p_email, nullif(p_mat,''), p_admin, p_impersonate)
  on conflict (user_id) do update set agent_mat = excluded.agent_mat, is_admin = excluded.is_admin,
    can_impersonate = excluded.can_impersonate, email = excluded.email;
  return 'Compte rattaché';
end $$;

-- Vider les dossiers de test (les comptes restent)
create or replace function public.siga_reset_test_data()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text := siga_my_tenant();
begin
  if not siga_is_admin() then raise exception 'Réservé aux administrateurs de test'; end if;
  delete from siga_records where tenant = t;
  delete from siga_counters where tenant = t;
  delete from siga_tokens where tenant = t;
  delete from siga_audit_state where tenant = t;
  return 'Données de test effacées';
end $$;

-- Supabase accorde par défaut l'exécution des fonctions à tous : on referme,
-- puis on n'ouvre que ce dont l'application a besoin, aux seuls comptes connectés.
revoke execute on function public.siga_resolve_tokens(text, jsonb) from public, anon, authenticated;
revoke execute on function public.siga_records_before_write() from public, anon, authenticated;
revoke execute on function public.siga_link_user(text, text, boolean, boolean) from public, anon;
revoke execute on function public.siga_reset_test_data() from public, anon;
revoke execute on function public.siga_verify_audit() from public, anon;
revoke execute on function public.siga_counters_peek() from public, anon;
revoke execute on function public.siga_my_tenant() from public, anon;
revoke execute on function public.siga_is_admin() from public, anon;
revoke all on public.siga_counters, public.siga_tokens, public.siga_counter_width, public.siga_audit_state from anon, authenticated;
revoke all on public.siga_records, public.siga_profiles from anon;
revoke delete, truncate on public.siga_records from authenticated;
grant execute on function public.siga_link_user(text, text, boolean, boolean) to authenticated;
grant execute on function public.siga_reset_test_data() to authenticated;
grant execute on function public.siga_verify_audit() to authenticated;
grant execute on function public.siga_counters_peek() to authenticated;
grant execute on function public.siga_my_tenant() to authenticated;
grant execute on function public.siga_is_admin() to authenticated;
grant select, insert, update on public.siga_records to authenticated;
grant select on public.siga_profiles to authenticated;

-- ---------------------------------------------------------------------
-- 6. Temps réel : les autres utilisateurs voient les changements aussitôt
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='siga_records') then
    execute 'alter publication supabase_realtime add table public.siga_records';
  end if;
end $$;
