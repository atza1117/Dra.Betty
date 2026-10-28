-- ════════════════════════════════════════════════════════════════
--  DRA. BETTY — bandeja de correos del banco
--
--  Correr una vez en SQL Editor (ya va incluido al final de schema.sql
--  para proyectos nuevos). El script de Gmail (gmail/DraBettyCorreos.gs)
--  manda cada correo del banco con una llave; la app los lee y los anota.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.correos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  gmail_id    text not null,
  banco       text,
  asunto      text,
  recibido    timestamptz,
  cuerpo      text,
  estado      text not null default 'pendiente' check (estado in ('pendiente','anotado','descartado')),
  movimiento  uuid references public.movimientos(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, gmail_id)
);
create index if not exists correos_user_estado on public.correos (user_id, estado);
create index if not exists correos_movimiento on public.correos (movimiento);

-- Una llave por persona. En la base queda solo la huella (sha256), nunca la llave.
create table if not exists public.buzon (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  llave_hash  bytea not null,
  creada      timestamptz not null default now(),
  ultimo_uso  timestamptz
);

alter table public.correos enable row level security;
alter table public.buzon   enable row level security;
drop policy if exists "solo lo mío" on public.correos;
drop policy if exists "solo lo mío" on public.buzon;
create policy "solo lo mío" on public.correos
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "solo lo mío" on public.buzon
  for select using (user_id = (select auth.uid()));

-- La app puede ver, marcar y borrar correos; meterlos solo se puede con la llave (función de abajo).
revoke all on public.correos, public.buzon from anon, authenticated;
grant select, update, delete on public.correos to authenticated;
grant select on public.buzon to authenticated;

-- La app crea (o cambia) la llave del buzón y la recibe una sola vez.
create or replace function public.crear_llave_buzon()
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión primero'; end if;
  v := 'betty_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.buzon (user_id, llave_hash) values (auth.uid(), sha256(convert_to(v, 'UTF8')))
  on conflict (user_id) do update set llave_hash = excluded.llave_hash, creada = now(), ultimo_uso = null;
  return v;
end $$;
revoke all on function public.crear_llave_buzon() from public, anon;
grant execute on function public.crear_llave_buzon() to authenticated;

-- El script de Gmail entrega cada correo con la llave. Solo puede meter correos en la bandeja de su dueña.
create or replace function public.recibir_correo(p_llave text, p_gmail_id text, p_banco text, p_asunto text, p_recibido timestamptz, p_cuerpo text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_n int;
begin
  select user_id into v_user from public.buzon where llave_hash = sha256(convert_to(coalesce(p_llave, ''), 'UTF8'));
  if v_user is null then raise exception 'Llave inválida' using errcode = '28000'; end if;
  if p_gmail_id is null or length(p_gmail_id) > 64 then raise exception 'Id de correo inválido'; end if;
  update public.buzon set ultimo_uso = now() where user_id = v_user;
  insert into public.correos (user_id, gmail_id, banco, asunto, recibido, cuerpo)
  values (v_user, p_gmail_id, left(p_banco, 40), left(p_asunto, 300), p_recibido, left(p_cuerpo, 40000))
  on conflict (user_id, gmail_id) do nothing;
  get diagnostics v_n = row_count;
  return case when v_n > 0 then 'nuevo' else 'repetido' end;
end $$;
revoke all on function public.recibir_correo(text, text, text, text, timestamptz, text) from public;
grant execute on function public.recibir_correo(text, text, text, text, timestamptz, text) to anon, authenticated;
