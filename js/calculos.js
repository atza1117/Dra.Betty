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
  if (mes === hoyISO(hoy).slice(0, 7)) {
    pagosDelMes(S, mes, hoy).lista.forEach((x) => {
      if (x.estado !== 'pendiente' || x.dias === null) return;
      if (x.dias < 0) out.push({ nivel: 'mal', cobro: x.it, dias: x.dias, monto: x.monto });
      else if (x.dias <= 3) out.push({ nivel: 'ojo', cobro: x.it, dias: x.dias, monto: x.monto });
    });
  }
  if (!tc(S) && S.cuentas.some((c) => c.moneda === 'USD')) out.push({ nivel: 'ojo', sinTipoCambio: true });
  const c = colchon(S);
  if (c.meta > 0 && c.cubiertos < 1) out.push({ nivel: 'ojo', colchon: c });
  return out;
}

// ── Estado de una cuenta (sobre todo certificados) ─────────────
//  clave: activa · vigente · pronto (≤45 días) · vencido · sinfecha · cerrada
export function estadoCuenta(c, hoy = new Date()) {
  if (!c.activa) return { clave: 'cerrada' };
  if (c.tipo !== 'certificado') return { clave: 'activa' };
  if (!c.vence) return { clave: 'sinfecha' };
  const d = diasHasta(c.vence, hoy);
  if (d === null) return { clave: 'sinfecha' };
  if (d <= 0) return { clave: 'vencido', dias: d };
  if (d <= 45) return { clave: 'pronto', dias: d };
  return { clave: 'vigente', dias: d };
}

/** Fecha en que se cerró una cuenta: la del último movimiento que la tocó. */
export function fechaCierre(S, c) {
  let f = null;
  S.movimientos.forEach((m) => {
    if (m.cuenta_origen !== c.id && m.cuenta_destino !== c.id) return;
    if (!f || String(m.fecha) > f) f = String(m.fecha);
  });
  return f;
}

// ── Series para las gráficas ───────────────────────────────────
export function mesesHasta(n, hasta = hoyMes()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(mesShift(hasta, -i));
  return out;
}

export function historialMeses(S, n = 6, hasta = hoyMes()) {
  return mesesHasta(n, hasta).map((m) => {
    const r = resumenMes(S, m);
    return { mes: m, ingresos: r.ingresos, gastos: r.gastos, ahorro: r.ahorroNeto, n: r.n };
  });
}

/** Total en cuentas de ahorro al cierre de cada mes (en ₡, con el tipo de cambio de hoy). */
export function ahorroEnElTiempo(S, n = 6, hasta = hoyMes()) {
  const t = tc(S);
  const ahorros = S.cuentas.filter(esAhorro);
  return mesesHasta(n, hasta).map((m) => {
    const corte = mesShift(m, 1) + '-01';
    let total = 0;
    ahorros.forEach((c) => {
      let s = Number(c.saldo) || 0;
      S.movimientos.forEach((mv) => {
        if (String(mv.fecha) < corte) return;
        if (mv.cuenta_destino === c.id) s -= Number(mv.monto_destino != null ? mv.monto_destino : mv.monto);
        if (mv.cuenta_origen === c.id) s += Number(mv.monto);
      });
      total += aCRC(s, c.moneda, t);
    });
    return { mes: m, total };
  });
}

export function topCategorias(S, mes, n = 6) {
  const t = tc(S), ix = indexar(S.cuentas), acc = {};
  S.movimientos.forEach((m) => {
    if (m.tipo !== 'gasto' || String(m.fecha).slice(0, 7) !== mes) return;
    const k = m.categoria || 'Otros';
    acc[k] = (acc[k] || 0) + movCRC(m, ix, t);
  });
  return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([categoria, monto]) => ({ categoria, monto, bolsa: CAT_BOLSA[categoria] || 'Antojos' }));
}

// ── Ánimo del perezoso ─────────────────────────────────────────
export function animo(S, mes, hoy = new Date()) {
  const vencidos = S.cuentas.filter((c) => estadoCuenta(c, hoy).clave === 'vencido');
  if (vencidos.length) return { cara: 'ojo', texto: `${vencidos[0].nombre} ya venció. Tocá Renovar o Liquidar.` };
  const r = resumenMes(S, mes), p = plan(S);
  const pasada = BOLSAS_GASTO.map((b) => [b, (r.porBolsa[b] || 0) - (p[b] || 0)])
    .filter(([b, d]) => (p[b] || 0) > 0 && d > 0).sort((a, b) => b[1] - a[1])[0];
  if (r.ingresos > 0 && r.queda < 0) return { cara: 'ojo', texto: 'Este mes vamos en rojo. Despacito, que yo tampoco corro.' };
  if (pasada) return { cara: 'ojo', texto: `${pasada[0]} ya se pasó del plan. Frenemos un toque.` };
  if (r.ahorroNeto > 0) return { cara: 'feliz', texto: '¡Ahorraste este mes! Pura vida.' };
  return { cara: 'feliz', texto: 'Todo tranqui por aquí. Seguí así.' };
}


// ── Pagos fijos del mes (suscripciones, recibos, universidad) ──
export function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function claves(it) {
  const base = it.palabras ? it.palabras.split(',') : [it.nombre];
  return base.map(normalizar).filter((k) => k.length >= 3);
}
/** ¿Se cobra este item en ese mes? */
export function aplicaEnMes(it, mes) {
  if (!it.activo) return false;
  const m = +mes.slice(5, 7);
  if (it.periodicidad === 'unico') return false;
  if (it.periodicidad === 'anual') return !!it.proximo_cobro && +String(it.proximo_cobro).slice(5, 7) === m;
  if (Array.isArray(it.meses) && it.meses.length && !it.meses.includes(m)) return false;
  return true;
}
/** Lo que cuesta en un mes en que sí se cobra, en colones. */
export function montoCobro(it, tipoCambio) {
  const m = aCRC(it.monto, it.moneda, tipoCambio);
  if (it.tipo === 'universidad') return m / (Number(it.pagos) || 3);
  if (it.periodicidad === 'quincenal') return m * 2;
  return m;
}
export const enChecklist = (it) => !!it.dia_cobro || it.tipo === 'suscripcion' || it.tipo === 'universidad';

/**
 * El checklist del mes y cuánto apartar en cada pago.
 * estado: pendiente · pagado · no (marcado "este mes no") · fuera (no se cobra este mes)
 * quincena: 'p1' (sale del pago del día dia_pago1) · 'p2' (del pago del día dia_pago2) · 'sin' (no tiene día)
 */
export function pagosDelMes(S, mes, hoy = new Date()) {
  const t = tc(S);
  const a = S.ajustes || {};
  const p1 = Number(a.dia_pago1) || 15, p2 = Number(a.dia_pago2) || 30;
  const regs = {};
  (S.pagosMes || []).forEach((r) => { if (r.mes === mes) regs[r.plan_item] = r; });
  const usados = new Set(Object.values(regs).map((r) => r.movimiento).filter(Boolean));
  const gastos = S.movimientos.filter((m) => m.tipo === 'gasto' && String(m.fecha).slice(0, 7) === mes);
  const esEsteMes = mes === hoyISO(hoy).slice(0, 7);

  const lista = [], presupuesto = [];
  const items = S.plan.filter((it) => it.activo).slice()
    .sort((x, y) => (x.dia_cobro || 99) - (y.dia_cobro || 99) || String(x.nombre).localeCompare(y.nombre));

  items.forEach((it) => {
    const monto = montoCobro(it, t);
    if (!enChecklist(it)) {
      if (aplicaEnMes(it, mes)) presupuesto.push({ it, monto });
      return;
    }
    const reg = regs[it.id];
    const d = Number(it.dia_cobro) || null;
    const quincena = !d ? 'sin' : (d >= p1 && d < p2 ? 'p1' : 'p2');
    let estado, mov = null, detectado = false;
    if (!aplicaEnMes(it, mes)) estado = 'fuera';
    else if (reg && reg.estado === 'no_aplica') estado = 'no';
    else if (reg && reg.estado === 'pagado') { estado = 'pagado'; mov = S.movimientos.find((m) => m.id === reg.movimiento) || null; }
    else {
      const ks = claves(it);
      mov = gastos.find((g) => !usados.has(g.id) && ks.some((k) => normalizar(`${g.descripcion || ''} ${g.categoria || ''}`).includes(k)));
      if (mov) { estado = 'pagado'; detectado = true; usados.add(mov.id); }
      else estado = 'pendiente';
    }
    let dias = null;
    if (d && esEsteMes) {
      const ult = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      dias = Math.min(d, ult) - hoy.getDate();
    }
    lista.push({ it, monto, estado, mov, detectado, dia: d, quincena, dias, reg });
  });

  const cuenta = lista.filter((x) => x.estado === 'pendiente' || x.estado === 'pagado');
  const suma = (arr) => arr.reduce((acc, x) => acc + x.monto, 0);
  const porQ = { p1: suma(cuenta.filter((x) => x.quincena === 'p1')), p2: suma(cuenta.filter((x) => x.quincena === 'p2')),
                 sin: suma(cuenta.filter((x) => x.quincena === 'sin')) };
  const total = suma(cuenta), pagado = suma(cuenta.filter((x) => x.estado === 'pagado'));
  const diaADia = suma(presupuesto);
  return { lista, presupuesto, total, pagado, falta: total - pagado, porQ, p1, p2,
           parejo: total / 2, diaADia, diaADiaQ: diaADia / 2,
           delP1: porQ.p1 + porQ.sin / 2, delP2: porQ.p2 + porQ.sin / 2 };
}

/** Categoría para el gasto cuando se marca pagado. */
export function categoriaDeItem(it) {
  if (it.tipo === 'suscripcion') return 'Suscripción';
  if (it.tipo === 'universidad') return 'Universidad';
  const n = normalizar(it.nombre);
  const c = CATEGORIAS.find((k) => n.includes(normalizar(k)));
  return c || 'Otros';
}
