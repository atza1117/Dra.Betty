// ════════════════════════════════════════════════════════════════
//  Todo lo que habla con Supabase vive acá.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const LS_CONEXION = 'miplata.conexion';
let sb = null;

// ── Conexión ───────────────────────────────────────────────────
export function conexion() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, fija: true };
  try {
    const c = JSON.parse(localStorage.getItem(LS_CONEXION) || 'null');
    if (c && c.url && c.key) return { ...c, fija: false };
  } catch (_) { /* sin almacenamiento */ }
  return null;
}

export function guardarConexion(url, key) {
  url = String(url || '').trim().replace(/\/+$/, '');
  key = String(key || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error('La URL tiene que verse así: https://algo.supabase.co');
  }
  if (key.length < 40) throw new Error('Esa key se ve muy corta. Copiá la "anon public" completa.');
  localStorage.setItem(LS_CONEXION, JSON.stringify({ url, key }));
  sb = null;
}

export function borrarConexion() {
  try { localStorage.removeItem(LS_CONEXION); } catch (_) {}
  sb = null;
}

export function cliente() {
  if (sb) return sb;
  const c = conexion();
  if (!c) return null;
  sb = createClient(c.url, c.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return sb;
}

function falla(error, contexto) {
  const msg = (error && (error.message || error.error_description)) || String(error);
  if (/Invalid login credentials/i.test(msg)) return new Error('Correo o contraseña incorrectos.');
  if (/Email not confirmed/i.test(msg)) return new Error('Falta confirmar el correo. Revisá tu bandeja (y spam).');
  if (/User already registered/i.test(msg)) return new Error('Ese correo ya tiene cuenta. Tocá "Entrar".');
  if (/Signups not allowed/i.test(msg)) return new Error('Los registros nuevos están cerrados en esta base.');
  if (/violates foreign key|still referenced/i.test(msg)) {
    return new Error('Esa cuenta tiene movimientos. En vez de borrarla, desactivala.');
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Sin conexión. Revisá el internet.');
  if (/relation .* does not exist|Could not find the table/i.test(msg)) {
    return new Error('La base no tiene las tablas. Corré supabase/schema.sql en el SQL Editor.');
  }
  return new Error((contexto ? contexto + ': ' : '') + msg);
}

// ── Sesión ─────────────────────────────────────────────────────
export async function sesion() {
  const { data, error } = await cliente().auth.getSession();
  if (error) throw falla(error);
  return data.session;
}

export async function entrar(email, password) {
  const { data, error } = await cliente().auth.signInWithPassword({ email, password });
  if (error) throw falla(error);
  return data.session;
}

export async function crearUsuario(email, password) {
  const { data, error } = await cliente().auth.signUp({
    email, password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw falla(error);
  return data;
}

export async function salir() {
  await cliente().auth.signOut();
}

export function alCambiarSesion(fn) {
  return cliente().auth.onAuthStateChange((_evt, s) => fn(s));
}

// ── Lectura ────────────────────────────────────────────────────
async function todas(tabla, orden, asc = false) {
  const out = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await cliente()
      .from(tabla).select('*')
      .order(orden, { ascending: asc })
      .range(desde, desde + paso - 1);
    if (error) throw falla(error, 'Leyendo ' + tabla);
    out.push(...data);
    if (data.length < paso) break;
  }
  return out;
}

export async function cargarTodo() {
  const [cuentas, movimientos, plan, aj, pagosMes] = await Promise.all([
    todas('saldos', 'orden', true),
    todas('movimientos', 'fecha'),
    todas('plan_items', 'nombre', true),
    cliente().from('ajustes').select('*').maybeSingle(),
    todas('pagos_mes', 'mes'),
  ]);
  if (aj.error) throw falla(aj.error, 'Leyendo ajustes');
  const num = (o, ks) => { ks.forEach((k) => { if (o[k] != null) o[k] = Number(o[k]); }); return o; };
  cuentas.forEach((c) => num(c, ['saldo_inicial', 'saldo', 'tasa']));
  movimientos.forEach((m) => num(m, ['monto', 'monto_destino']));
  plan.forEach((p) => num(p, ['monto', 'pagos']));
  const ajustes = aj.data
    ? num({ ...aj.data }, ['tipo_cambio', 'ingreso_quincena', 'meses_colchon', 'plan_ahorro', 'plan_apoyo', 'plan_antojos', 'dia_pago1', 'dia_pago2'])
    : null;
  plan.forEach((p) => num(p, ['dia_cobro']));
  return { cuentas, movimientos, plan, ajustes, pagosMes };
}

// ── Escritura ──────────────────────────────────────────────────
const CAMPOS = {
  movimientos: ['fecha', 'tipo', 'monto', 'cuenta_origen', 'cuenta_destino', 'monto_destino',
                'categoria', 'bolsa', 'descripcion', 'medio'],
  cuentas:     ['nombre', 'tipo', 'moneda', 'bolsa', 'saldo_inicial', 'tasa', 'vence', 'activa', 'notas', 'orden'],
  plan_items:  ['tipo', 'nombre', 'monto', 'moneda', 'periodicidad', 'pagos', 'desde', 'proximo_cobro',
                'bolsa', 'medio', 'activo', 'notas', 'dia_cobro', 'palabras', 'meses'],
};

function limpiar(tabla, obj) {
  const o = {};
  CAMPOS[tabla].forEach((k) => {
    if (obj[k] === undefined) return;
    o[k] = obj[k] === '' ? null : obj[k];
  });
  return o;
}

async function guardar(tabla, obj) {
  const fila = limpiar(tabla, obj);
  const q = obj.id
    ? cliente().from(tabla).update(fila).eq('id', obj.id).select().single()
    : cliente().from(tabla).insert(fila).select().single();
  const { data, error } = await q;
  if (error) throw falla(error, 'Guardando');
  return data;
}

async function borrar(tabla, id) {
  const { error } = await cliente().from(tabla).delete().eq('id', id);
  if (error) throw falla(error, 'Borrando');
}

export const guardarMovimiento = (m) => guardar('movimientos', m);
export const borrarMovimiento  = (id) => borrar('movimientos', id);
export const guardarCuenta     = (c) => guardar('cuentas', c);
export const borrarCuenta      = (id) => borrar('cuentas', id);
export const guardarPlan       = (p) => guardar('plan_items', p);
export const borrarPlan        = (id) => borrar('plan_items', id);

export async function guardarAjustes(a) {
  const fila = {};
  ['tipo_cambio', 'ingreso_quincena', 'meses_colchon', 'plan_ahorro', 'plan_apoyo', 'plan_antojos', 'cuenta_principal', 'dia_pago1', 'dia_pago2']
    .forEach((k) => { if (a[k] !== undefined) fila[k] = a[k] === '' ? null : a[k]; });
  fila.updated_at = new Date().toISOString();
  const { data: u } = await cliente().auth.getUser();
  fila.user_id = u.user.id;
  const { data, error } = await cliente().from('ajustes').upsert(fila).select().single();
  if (error) throw falla(error, 'Guardando ajustes');
  return data;
}

// ── Checklist de pagos por mes ─────────────────────────────────
export async function marcarPago(planItem, mes, estado, movimiento = null) {
  const { data: u } = await cliente().auth.getUser();
  const { error } = await cliente().from('pagos_mes')
    .upsert({ user_id: u.user.id, plan_item: planItem, mes, estado, movimiento }, { onConflict: 'plan_item,mes' });
  if (error) throw falla(error, 'Marcando el pago');
}
export async function desmarcarPago(planItem, mes) {
  const { error } = await cliente().from('pagos_mes').delete().eq('plan_item', planItem).eq('mes', mes);
  if (error) throw falla(error, 'Desmarcando el pago');
}
