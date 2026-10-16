-- ════════════════════════════════════════════════════════════════
--  MI PLATA — esquema de la base de datos (Supabase / Postgres)
--
--  Cómo usarlo: en Supabase abrí  SQL Editor → New query,
--  pegá TODO este archivo y tocá Run. Se corre una sola vez.
--
--  La idea central: la plata vive en CUENTAS, y cada movimiento es
--  una de tres cosas:
--    · gasto          → sale plata de una cuenta
--    · ingreso        → entra plata a una cuenta
--    · transferencia  → pasa de una cuenta tuya a otra tuya
--  Ahorrar y sacar del ahorro son transferencias: NUNCA cuentan
--  como gasto. El saldo de cada cuenta no se guarda: se calcula
--  desde los movimientos, así que editar o borrar uno lo corrige solo.
-- ════════════════════════════════════════════════════════════════

-- ── Cuentas ─────────────────────────────────────────────────────
create table if not exists public.cuentas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre         text not null,
  tipo           text not null check (tipo in ('corriente','ahorro','certificado','inversion','efectivo','tarjeta')),
  moneda         text not null default 'CRC' check (moneda in ('CRC','USD')),
  -- Para qué es la plata de esta cuenta. Solo aplica a ahorro/certificado/inversión.
  bolsa          text check (bolsa in ('Colchón','Ahorro colones','Ahorro dólares','Casa / inversión','Pensión','Largo plazo','Ahorro libre')),
  saldo_inicial  numeric(14,2) not null default 0,
  tasa           numeric(7,4),          -- 0.055 = 5,5 % anual
  vence          date,                  -- certificados
  activa         boolean not null default true,
  notas          text,
  orden          int not null default 0,
  created_at     timestamptz not null default now()
);

-- ── Movimientos ────────────────────────────────────────────────
create table if not exists public.movimientos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha           date not null default current_date,
  tipo            text not null check (tipo in ('gasto','ingreso','transferencia')),
  monto           numeric(14,2) not null check (monto > 0),   -- en la moneda de la cuenta de origen (o destino si es ingreso)
  cuenta_origen   uuid references public.cuentas(id) on delete restrict,
  cuenta_destino  uuid references public.cuentas(id) on delete restrict,
  monto_destino   numeric(14,2) check (monto_destino is null or monto_destino > 0), -- solo si las dos cuentas son de distinta moneda
  categoria       text,     -- Supermercado, Uber / taxi, Mami...
  bolsa           text,     -- Necesidades, Suscripciones, Apoyo familiar, Antojos (solo gastos)
  descripcion     text,
  medio           text,     -- Az, SINPE, Efectivo, Black, Roja
  created_at      timestamptz not null default now(),
  constraint movimiento_bien_formado check (
       (tipo = 'gasto'         and cuenta_origen  is not null and cuenta_destino is null)
    or (tipo = 'ingreso'       and cuenta_destino is not null and cuenta_origen  is null)
    or (tipo = 'transferencia' and cuenta_origen  is not null and cuenta_destino is not null
                               and cuenta_origen <> cuenta_destino)
  )
);
create index if not exists movimientos_user_fecha on public.movimientos (user_id, fecha desc);
create index if not exists movimientos_origen     on public.movimientos (cuenta_origen);
create index if not exists movimientos_destino    on public.movimientos (cuenta_destino);

-- ── Plan: suscripciones, gastos fijos, universidad ─────────────
create table if not exists public.plan_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo           text not null check (tipo in ('suscripcion','fijo','universidad')),
  nombre         text not null,
  monto          numeric(14,2) not null default 0,
  moneda         text not null default 'CRC' check (moneda in ('CRC','USD')),
  periodicidad   text not null default 'mensual' check (periodicidad in ('mensual','quincenal','anual','cuatrimestral','unico')),
  pagos          int,              -- universidad: en cuántos pagos se divide el cuatrimestre
  desde          date,             -- universidad: cuándo arrancó
  proximo_cobro  date,             -- cobros anuales: la fecha del año en que se cobra
  dia_cobro      int check (dia_cobro between 1 and 31),  -- día del mes en que se cobra
  meses          int[],            -- meses en que se cobra (null = todos), ej. {10,11,12}
  palabras       text,             -- palabras para reconocer el cobro en los gastos, separadas por coma
  dividir        boolean not null default false,  -- apartar la mitad en cada uno de los dos pagos antes del cobro
  cuenta_apartado uuid references public.cuentas(id) on delete set null,  -- adónde se aparta (opcional)
  bolsa          text not null default 'Necesidades',
  medio          text,
  activo         boolean not null default true,
  notas          text,
  created_at     timestamptz not null default now()
);

-- ── Ajustes (una fila por persona) ─────────────────────────────
create table if not exists public.ajustes (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  tipo_cambio       numeric(10,2) not null default 0,
  ingreso_quincena  numeric(14,2) not null default 0,
  meses_colchon     numeric(4,1)  not null default 3,
  plan_ahorro       numeric(14,2) not null default 0,
  plan_apoyo        numeric(14,2) not null default 0,
  plan_antojos      numeric(14,2) not null default 0,
  cuenta_principal  uuid references public.cuentas(id) on delete set null,
  dia_pago1         int not null default 15 check (dia_pago1 between 1 and 31),
  dia_pago2         int not null default 30 check (dia_pago2 between 1 and 31),
  updated_at        timestamptz not null default now()
);

-- ── Checklist de pagos por mes ─────────────────────────────────
-- Una fila por pago fijo, mes y parte:
--   parte 'pago'        → 'pagado' (con el gasto que lo pagó) o 'no_aplica' ("este mes no")
--   parte 'AAAA-MM-DD'  → 'apartado': la mitad que se apartó en ese día de pago
create table if not exists public.pagos_mes (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_item   uuid not null references public.plan_items(id) on delete cascade,
  mes         text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  parte       text not null default 'pago',
  estado      text not null check (estado in ('pagado','no_aplica','apartado')),
  movimiento  uuid references public.movimientos(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (plan_item, mes, parte)
);

-- ── Saldos calculados ──────────────────────────────────────────
-- security_invoker hace que la vista respete los permisos de quien consulta.
create or replace view public.saldos with (security_invoker = true) as
select
  c.*,
  c.saldo_inicial
    + coalesce((select sum(coalesce(m.monto_destino, m.monto))
                  from public.movimientos m where m.cuenta_destino = c.id), 0)
    - coalesce((select sum(m.monto)
                  from public.movimientos m where m.cuenta_origen  = c.id), 0)
  as saldo
from public.cuentas c;

-- ── Seguridad: cada quien ve y toca SOLO lo suyo ───────────────
alter table public.cuentas      enable row level security;
alter table public.movimientos  enable row level security;
alter table public.plan_items   enable row level security;
alter table public.ajustes      enable row level security;
alter table public.pagos_mes    enable row level security;

drop policy if exists "solo lo mío" on public.cuentas;
drop policy if exists "solo lo mío" on public.movimientos;
drop policy if exists "solo lo mío" on public.plan_items;
drop policy if exists "solo lo mío" on public.ajustes;
drop policy if exists "solo lo mío" on public.pagos_mes;

create policy "solo lo mío" on public.cuentas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "solo lo mío" on public.plan_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "solo lo mío" on public.ajustes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "solo lo mío" on public.pagos_mes
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.plan_items p where p.id = plan_item and p.user_id = auth.uid()));

-- En movimientos además se revisa que las cuentas usadas sean tuyas.
create policy "solo lo mío" on public.movimientos
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (cuenta_origen  is null or exists (select 1 from public.cuentas c where c.id = cuenta_origen  and c.user_id = auth.uid()))
    and (cuenta_destino is null or exists (select 1 from public.cuentas c where c.id = cuenta_destino and c.user_id = auth.uid()))
  );

-- ── Permisos explícitos ─────────────────────────────────────────
-- Solo quien inició sesión (authenticated) puede usar las tablas, y las
-- reglas de arriba limitan cada fila a su dueña. Las visitas sin sesión
-- (anon) no reciben nada. Funciona aunque el proyecto tenga apagado
-- "Automatically expose new tables".
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.cuentas, public.movimientos, public.plan_items, public.ajustes, public.pagos_mes
  to authenticated;
grant select on public.saldos to authenticated;
revoke all on public.cuentas, public.movimientos, public.plan_items, public.ajustes, public.pagos_mes, public.saldos from anon;
