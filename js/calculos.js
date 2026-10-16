// ════════════════════════════════════════════════════════════════
//  Cálculos puros: no tocan la pantalla ni la base.
//  Reciben el estado { cuentas, movimientos, plan, ajustes } y devuelven números.
// ════════════════════════════════════════════════════════════════

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
                      'Septiembre','Octubre','Noviembre','Diciembre'];

export const BOLSAS_GASTO = ['Necesidades', 'Suscripciones', 'Apoyo familiar', 'Antojos'];
export const BOLSAS_PLAN  = [...BOLSAS_GASTO, 'Ahorro'];
export const BOLSAS_AHORRO = ['Colchón', 'Ahorro colones', 'Ahorro dólares', 'Casa / inversión',
                              'Pensión', 'Largo plazo', 'Ahorro libre'];

export const CAT_BOLSA = {
  'Supermercado': 'Necesidades', 'Universidad': 'Necesidades', 'Internet': 'Necesidades',
  'Celular': 'Necesidades', 'Luz': 'Necesidades', 'Agua': 'Necesidades', 'Bus': 'Necesidades',
  'Salud': 'Necesidades', 'Alquiler': 'Necesidades',
  'Suscripción': 'Suscripciones',
  'Mami': 'Apoyo familiar', 'Lanna': 'Apoyo familiar', 'Familia otros': 'Apoyo familiar',
  'Gastos familiares': 'Apoyo familiar',
  'Uber / taxi': 'Antojos', 'Comida fuera': 'Antojos', 'Ropa': 'Antojos', 'Regalos': 'Antojos',
  'Otros': 'Antojos',
};
export const CATEGORIAS = Object.keys(CAT_BOLSA);

export const TIPOS_CUENTA = [
  ['corriente', 'Cuenta corriente'], ['ahorro', 'Cuenta de ahorro'], ['certificado', 'Certificado a plazo'],
  ['inversion', 'Inversión'], ['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta de crédito'],
];
export const TIPOS_PLAN = [['suscripcion', 'Suscripciones'], ['fijo', 'Gastos fijos'], ['universidad', 'Universidad']];

/** Las cuentas de ahorro guardan plata que no es para gastar este mes. */
export const esAhorro = (c) => !!c && (c.tipo === 'ahorro' || c.tipo === 'certificado' || c.tipo === 'inversion');

// ── Fechas ─────────────────────────────────────────────────────
const p2 = (n) => (n < 10 ? '0' : '') + n;
export function hoyISO(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
export const hoyMes = () => hoyISO().slice(0, 7);
export function mesShift(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}
export function mesLabel(m) { const [y, mo] = m.split('-'); return `${MESES[+mo - 1]} ${y}`; }
export function diasHasta(iso, hoy = new Date()) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const t = new Date(y, m - 1, d).getTime();
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return Math.round((t - h) / 86400000);
}
export const quincena = (iso) => (+String(iso).slice(8, 10) <= 15 ? 1 : 2);

// ── Monedas ────────────────────────────────────────────────────
export const tc = (S) => Number(S.ajustes && S.ajustes.tipo_cambio) || 0;
export function aCRC(monto, moneda, tipoCambio) {
  const n = Number(monto) || 0;
  return moneda === 'USD' ? n * (tipoCambio || 0) : n;
}

function indexar(cuentas) {
  const ix = {};
  cuentas.forEach((c) => { ix[c.id] = c; });
  return ix;
}

/** Monto en colones de un movimiento, tomado del lado que esté en colones si existe. */
export function movCRC(m, ix, tipoCambio) {
  const o = ix[m.cuenta_origen], d = ix[m.cuenta_destino];
  if (m.tipo === 'ingreso') return aCRC(m.monto, d && d.moneda, tipoCambio);
  if (m.tipo === 'gasto')   return aCRC(m.monto, o && o.moneda, tipoCambio);
  if (o && o.moneda === 'CRC') return Number(m.monto);
  if (d && d.moneda === 'CRC') return Number(m.monto_destino != null ? m.monto_destino : m.monto);
  return aCRC(m.monto, 'USD', tipoCambio);
}

// ── Plan ───────────────────────────────────────────────────────
export function mensualCRC(it, tipoCambio) {
  if (!it.activo) return 0;
  const m = aCRC(it.monto, it.moneda, tipoCambio);
  if (it.tipo === 'universidad') return m / (Number(it.pagos) || 3);
  switch (it.periodicidad) {
    case 'quincenal': return m * 2;
    case 'anual': return m / 12;
    case 'cuatrimestral': return m / 4;
    case 'unico': return 0;
    default: return m;
  }
}

export function plan(S) {
  const t = tc(S), a = S.ajustes || {};
  const p = { Necesidades: 0, Suscripciones: 0, 'Apoyo familiar': 0, Antojos: 0, Ahorro: 0 };
  S.plan.forEach((it) => {
    const b = it.bolsa || 'Necesidades';
    if (b === 'Apoyo familiar' || b === 'Antojos' || b === 'Ahorro') return; // estas las pone ella a mano
    p[b] = (p[b] || 0) + mensualCRC(it, t);
  });
  p['Apoyo familiar'] = Number(a.plan_apoyo) || 0;
  p.Antojos = Number(a.plan_antojos) || 0;
  p.Ahorro = Number(a.plan_ahorro) || 0;
  return p;
}
export const ingresoPlanMes = (S) => (Number(S.ajustes && S.ajustes.ingreso_quincena) || 0) * 2;

// ── Resumen de un mes ──────────────────────────────────────────
//  ingresos   → lo que entró
//  gastos     → lo que se gastó, salga de la cuenta que salga
//  ahorroNeto → cuánto crecieron (o bajaron) tus cuentas de ahorro por movimientos del mes
//  queda      → ingresos − gastos − ahorroNeto  =  lo que cambió la plata disponible
//
//  Sacar del colchón: ahorroNeto baja y "queda" sube. NO es gasto.
//  Gastar esa plata después: ahí sí sube gastos.
export function resumenMes(S, mes) {
  const t = tc(S), ix = indexar(S.cuentas);
  const r = { ingresos: 0, gastos: 0, ahorroNeto: 0, aportes: 0, retiros: 0, q1: 0, q2: 0, porBolsa: {}, n: 0 };
  BOLSAS_PLAN.forEach((b) => { r.porBolsa[b] = 0; });

  S.movimientos.forEach((m) => {
    if (String(m.fecha).slice(0, 7) !== mes) return;
    r.n++;
    const crc = movCRC(m, ix, t);
    const o = ix[m.cuenta_origen], d = ix[m.cuenta_destino];

    if (m.tipo === 'ingreso') {
      r.ingresos += crc;
      if (esAhorro(d)) { r.ahorroNeto += crc; r.aportes += crc; }
      return;
    }
    if (m.tipo === 'gasto') {
      r.gastos += crc;
      const b = m.bolsa || CAT_BOLSA[m.categoria] || 'Antojos';
      r.porBolsa[b] = (r.porBolsa[b] || 0) + crc;
      if (quincena(m.fecha) === 1) r.q1 += crc; else r.q2 += crc;
      if (esAhorro(o)) { r.ahorroNeto -= crc; r.retiros += crc; }
      return;
    }
    // transferencia
    const deAhorro = esAhorro(o), aAhorro = esAhorro(d);
    if (!deAhorro && aAhorro) { r.ahorroNeto += crc; r.aportes += crc; }
    else if (deAhorro && !aAhorro) { r.ahorroNeto -= crc; r.retiros += crc; }
  });

  r.porBolsa.Ahorro = r.ahorroNeto;
  r.queda = r.ingresos - r.gastos - r.ahorroNeto;
  return r;
}

// ── Saldos ─────────────────────────────────────────────────────
export function saldoCRC(c, tipoCambio) { return aCRC(c.saldo, c.moneda, tipoCambio); }

export function saldoPorBolsa(S) {
  const t = tc(S), s = {};
  BOLSAS_AHORRO.forEach((b) => { s[b] = 0; });
  S.cuentas.forEach((c) => {
    if (!c.activa || !esAhorro(c)) return;
    const b = c.bolsa || 'Ahorro libre';
    s[b] = (s[b] || 0) + saldoCRC(c, t);
  });
  return s;
}

export function disponible(S) {
  const t = tc(S);
  return S.cuentas.filter((c) => c.activa && !esAhorro(c))
    .reduce((a, c) => a + saldoCRC(c, t), 0);
}

export function gastoEsencialMes(S) {
  const t = tc(S);
  return S.plan.reduce((a, it) => {
    const b = it.bolsa || 'Necesidades';
    return (b === 'Necesidades' || b === 'Suscripciones') ? a + mensualCRC(it, t) : a;
  }, 0);
}

export function colchon(S) {
  const gasto = gastoEsencialMes(S);
  const meses = Number(S.ajustes && S.ajustes.meses_colchon) || 3;
  const meta = gasto * meses;
  const ahorrado = saldoPorBolsa(S)['Colchón'] || 0;
  return { gasto, meses, meta, ahorrado, falta: Math.max(meta - ahorrado, 0),
           cubiertos: gasto > 0 ? ahorrado / gasto : 0 };
}

export function cuatri(S) {
  const it = S.plan.find((i) => i.activo && i.tipo === 'universidad');
  if (!it) return null;
  const t = tc(S), ix = indexar(S.cuentas);
  const total = aCRC(it.monto, it.moneda, t);
  const pagos = Number(it.pagos) || 3;
  const desde = it.desde || mesShift(hoyMes(), -3) + '-01';
  const pagado = S.movimientos
    .filter((m) => m.tipo === 'gasto' && m.categoria === 'Universidad' && String(m.fecha) >= desde)
    .reduce((a, m) => a + movCRC(m, ix, t), 0);
  return { nombre: it.nombre, total, pagos, porPago: total / pagos, pagado, falta: Math.max(total - pagado, 0) };
}

// ── Avisos ─────────────────────────────────────────────────────
export function avisos(S, mes, hoy = new Date()) {
  const out = [], r = resumenMes(S, mes), p = plan(S);
  BOLSAS_GASTO.forEach((b) => {
    const lim = p[b] || 0, real = r.porBolsa[b] || 0;
    if (lim > 0 && real > lim) out.push({ nivel: 'mal', bolsa: b, exceso: real - lim, limite: lim });
  });
  S.cuentas.forEach((c) => {
    if (!c.activa || !c.vence) return;
    const d = diasHasta(c.vence, hoy);
    if (d === null) return;
    if (d < 0) out.push({ nivel: 'mal', vencida: c, dias: -d });
    else if (d <= 45) out.push({ nivel: 'ojo', vence: c, dias: d });
  });
  S.plan.forEach((it) => {
    if (!it.activo || it.tipo !== 'suscripcion' || !it.proximo_cobro) return;
    const d = diasHasta(it.proximo_cobro, hoy);
    if (d !== null && d >= 0 && d <= 7) out.push({ nivel: 'ojo', cobro: it, dias: d });
  });
  if (!tc(S) && S.cuentas.some((c) => c.moneda === 'USD')) out.push({ nivel: 'ojo', sinTipoCambio: true });
  const c = colchon(S);
  if (c.meta > 0 && c.cubiertos < 1) out.push({ nivel: 'ojo', colchon: c });
  return out;
}
