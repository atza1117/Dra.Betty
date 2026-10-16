// ════════════════════════════════════════════════════════════════
//  Mi Plata — pantalla y eventos
// ════════════════════════════════════════════════════════════════
import * as db from './db.js';
import * as C from './calculos.js';
import { parsearCorreo } from './lector.js';

const S = {
  cuentas: [], movimientos: [], plan: [], ajustes: null,
  tab: 'resumen', mes: C.hoyMes(), filtro: 'todos', busca: '',
  listo: false, sesion: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ── Formato ────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
function crc(n) { n = Math.round(Number(n) || 0); return (n < 0 ? '−₡' : '₡') + miles(Math.abs(n)); }
function usd(n) {
  n = Number(n) || 0;
  const [e, d] = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '−$' : '$') + miles(e) + ',' + d;
}
const dinero = (n, moneda) => (moneda === 'USD' ? usd(n) : crc(n));
function fechaCorta(iso) {
  if (!iso) return '—';
  const [, m, d] = String(iso).slice(0, 10).split('-');
  return `${+d} ${C.MESES[+m - 1].slice(0, 3).toLowerCase()}`;
}
function fechaLarga(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  const dt = new Date(+y, +m - 1, +d);
  const dia = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][dt.getDay()];
  return `${dia} ${+d} de ${C.MESES[+m - 1].toLowerCase()}`;
}
const BCOLOR = { 'Necesidades': 'var(--nec)', 'Suscripciones': 'var(--sus)', 'Apoyo familiar': 'var(--apo)',
                 'Antojos': 'var(--ant)', 'Ahorro': 'var(--aho)' };
const tipoCuentaLabel = (t) => (C.TIPOS_CUENTA.find((x) => x[0] === t) || ['', t])[1];

function toast(msg, mal = false) {
  const t = $('#toast');
  t.innerHTML = `<div class="toast${mal ? ' mal' : ''}">${esc(msg)}</div>`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.innerHTML = ''; }, mal ? 4200 : 2400);
}

// ── Ayudas de estado ───────────────────────────────────────────
const cuenta = (id) => S.cuentas.find((c) => c.id === id);
const activas = () => S.cuentas.filter((c) => c.activa);
const principal = () => cuenta(S.ajustes && S.ajustes.cuenta_principal)
  || activas().find((c) => c.tipo === 'corriente') || activas().find((c) => !C.esAhorro(c)) || activas()[0];
const tcambio = () => C.tc(S);

async function recargar() {
  try {
    const d = await db.cargarTodo();
    Object.assign(S, d, { listo: true });
  } catch (e) {
    toast(e.message, true);
    S.listo = true;
  }
  render();
}

async function hacer(fn, ok) {
  try {
    await fn();
    if (ok) toast(ok);
    await recargar();
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════
//  Pantallas de acceso
// ════════════════════════════════════════════════════════════════
function modoApp(on) {
  $('#top').hidden = !on;
  $('#fab').hidden = !on;
}

function pantallaConexion(error) {
  modoApp(false);
  $('#app').innerHTML = `
    <section class="acceso">
      <div class="brand big">Mi <i>Plata</i></div>
      <div class="card">
        <h2>Conectá tu base</h2>
        <ol class="pasos">
          <li>Entrá a <b>supabase.com</b> y abrí tu proyecto.</li>
          <li>Andá a <b>Project Settings → API</b>.</li>
          <li>Copiá el <b>Project URL</b> y la key <b>anon public</b>.</li>
        </ol>
        <div style="height:14px"></div>
        <div class="fld"><label for="c-url">Project URL</label>
          <input class="inp" id="c-url" placeholder="https://xxxx.supabase.co" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="fld"><label for="c-key">anon public key</label>
          <input class="inp" id="c-key" placeholder="eyJhbGciOi…" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <button class="btn pri wide" id="c-ok">Conectar</button>
        <p class="err" id="c-err">${error ? esc(error) : ''}</p>
        <p class="nota">Se guarda solo en este dispositivo. Para no tener que pegarlo en cada uno, ponelo en <code>js/config.js</code>.</p>
      </div>
    </section>`;
  $('#c-ok').addEventListener('click', () => {
    try {
      db.guardarConexion($('#c-url').value, $('#c-key').value);
      arrancar();
    } catch (e) { $('#c-err').textContent = e.message; }
  });
}

function pantallaLogin(msg) {
  modoApp(false);
  const cx = db.conexion();
  $('#app').innerHTML = `
    <section class="acceso">
      <div class="brand big">Mi <i>Plata</i></div>
      <form class="card" id="f-login" novalidate>
        <div class="fld"><label for="l-email">Correo</label>
          <input class="inp" id="l-email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="fld"><label for="l-pass">Contraseña</label>
          <input class="inp" id="l-pass" type="password" autocomplete="current-password" minlength="8" required></div>
        <button class="btn pri wide" type="submit" id="l-ok">Entrar</button>
        <p class="err" id="l-err"></p>
        <p class="ok-msg" id="l-msg">${msg ? esc(msg) : ''}</p>
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px">
          <button type="button" class="linkbtn" id="l-nuevo">Es mi primera vez: crear usuario</button>
          ${cx && !cx.fija ? '<button type="button" class="linkbtn" id="l-cx" style="color:var(--dim)">Cambiar de base</button>' : ''}
        </div>
      </form>
    </section>`;
  const err = $('#l-err'), ok = $('#l-ok');
  $('#f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    ok.disabled = true; ok.textContent = 'Entrando…';
    try {
      await db.entrar($('#l-email').value.trim(), $('#l-pass').value);
      arrancar();
    } catch (x) {
      err.textContent = x.message;
      ok.disabled = false; ok.textContent = 'Entrar';
    }
  });
  $('#l-nuevo').addEventListener('click', async () => {
    const email = $('#l-email').value.trim(), pass = $('#l-pass').value;
    err.textContent = '';
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Escribí tu correo arriba.'; return; }
    if (pass.length < 8) { err.textContent = 'La contraseña necesita al menos 8 caracteres.'; return; }
    try {
      const r = await db.crearUsuario(email, pass);
      if (r.session) arrancar();
      else $('#l-msg').textContent = 'Listo. Te mandé un correo para confirmar; abrilo y después entrá acá.';
    } catch (x) { err.textContent = x.message; }
  });
  const cxb = $('#l-cx');
  if (cxb) cxb.addEventListener('click', () => { db.borrarConexion(); pantallaConexion(); });
}

// ════════════════════════════════════════════════════════════════
//  App
// ════════════════════════════════════════════════════════════════
function render() {
  $('#mlbl').textContent = C.mesLabel(S.mes);
  $('#mes-sel').style.visibility = S.tab === 'cuentas' || S.tab === 'plan' ? 'hidden' : 'visible';
  $$('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'true' : 'false'));
  const app = $('#app');
  if (!S.listo) {
    app.innerHTML = `<div class="card"><div style="display:grid;gap:10px">
      <div class="skel" style="width:40%"></div><div class="skel" style="height:36px;width:62%"></div>
      <div class="skel" style="width:85%"></div><div class="skel" style="width:70%"></div></div></div>`;
    return;
  }
  if (!S.cuentas.length && S.tab !== 'plan') { app.innerHTML = vBienvenida(); conectar(app); return; }
  app.innerHTML = S.tab === 'resumen' ? vResumen()
    : S.tab === 'movs' ? vMovs()
    : S.tab === 'cuentas' ? vCuentas()
    : vPlan();
  conectar(app);
}

function vBienvenida() {
  return `<div class="hero">
      <div class="lbl">Bienvenida</div>
      <h1 style="font-size:26px;margin:6px 0 8px">Empecemos por tus cuentas</h1>
      <p class="sub" style="margin:0 0 14px">Toda la plata vive en una cuenta: la corriente donde te pagan, tus cuentas de ahorro, los certificados. Agregá la principal con lo que tiene hoy.</p>
      <button class="btn pri" data-nueva-cuenta="corriente">Agregar mi cuenta principal</button>
    </div>
    <div class="card"><h2>¿Ya tenés datos?</h2>
      <p class="sub" style="margin:0">Si corriste <code>seed.sql</code> en Supabase, tocá recargar.</p>
      <div class="btnrow" style="margin-top:12px"><button class="btn sm" id="recargar">Recargar</button></div></div>`;
}

// ── Resumen ────────────────────────────────────────────────────
function vResumen() {
  const r = C.resumenMes(S, S.mes), p = C.plan(S), ingPlan = C.ingresoPlanMes(S);
  const conIngresos = r.ingresos > 0;
  const queda = conIngresos ? r.queda : ingPlan - r.gastos - r.ahorroNeto;
  let h = `<div class="hero">
    <div class="lbl">${conIngresos ? 'Te queda de ' + esc(C.mesLabel(S.mes)) : 'Proyectado para ' + esc(C.mesLabel(S.mes))}</div>
    <div class="big${queda < 0 ? ' neg' : ''}">${crc(queda)}</div>
    <div class="sub">${conIngresos
      ? `Entró ${crc(r.ingresos)}, gastaste ${crc(r.gastos)} y ${r.ahorroNeto >= 0 ? 'apartaste ' + crc(r.ahorroNeto) : 'sacaste ' + crc(-r.ahorroNeto) + ' del ahorro'}.`
      : `Todavía no hay ingresos este mes. Uso tu plan de ${crc(ingPlan)}.`}</div>
    <div class="trio">
      <div><div class="k">Gastos</div><div class="v">${crc(r.gastos)}</div></div>
      <div><div class="k">Ahorro neto</div><div class="v ${r.ahorroNeto < 0 ? 'neg' : 'pos'}">${crc(r.ahorroNeto)}</div></div>
      <div><div class="k">Q1 · Q2</div><div class="v" style="font-size:14px">${crc(r.q1)} · ${crc(r.q2)}</div></div>
    </div></div>`;

  const av = C.avisos(S, S.mes);
  if (av.length) {
    h += `<div class="card"><h2>Ojo con esto</h2><div class="avisos">${av.map(textoAviso).join('')}</div></div>`;
  }

  h += '<div class="card"><h2>Plan contra lo real</h2><div class="bk">';
  C.BOLSAS_PLAN.forEach((b) => {
    const lim = p[b] || 0, real = r.porBolsa[b] || 0;
    const esAh = b === 'Ahorro';
    const malo = esAh ? real < lim && lim > 0 && S.mes < C.hoyMes() : lim > 0 && real > lim;
    const pasado = !esAh && lim > 0 && real > lim;
    // Si se pasó, la barra entera es lo gastado: el tramo de color es el plan y el rojo, el exceso.
    const w1 = pasado ? lim / real * 100 : (lim > 0 ? Math.max(Math.min(real / lim * 100, 100), 0) : (real > 0 ? 100 : 0));
    h += `<div class="bk-row"><div class="bk-l">
        <b style="color:${BCOLOR[b]}">${b}</b>
        <span${pasado ? ' class="neg"' : ''}>${crc(real)} / ${crc(lim)}</span></div>
      <div class="track"><i style="width:${w1}%;background:${BCOLOR[b]}"></i>${pasado ? `<i style="width:${100 - w1}%;background:var(--over)"></i>` : ''}</div>
      ${pasado ? `<div class="bk-note">${crc(real - lim)} de más</div>` : ''}
      ${esAh && real < 0 ? `<div class="bk-note">Sacaste más de lo que apartaste</div>` : ''}
      ${malo && esAh && real >= 0 ? `<div class="bk-note">Faltaron ${crc(lim - real)} para la meta</div>` : ''}
    </div>`;
  });
  const totalPlan = C.BOLSAS_PLAN.reduce((a, b) => a + (p[b] || 0), 0);
  h += `</div><div class="total-row"><span class="sub">Tu plan suma</span><b${totalPlan > ingPlan ? ' class="neg"' : ''}>${crc(totalPlan)}</b></div>
    <p class="nota">Tu ingreso del mes es ${crc(ingPlan)}. ${totalPlan > ingPlan
      ? `El plan pide ${crc(totalPlan - ingPlan)} más de lo que entra: hay que bajar algo.`
      : `Quedan ${crc(ingPlan - totalPlan)} sin asignar.`}</p></div>`;

  const c = C.colchon(S), u = C.cuatri(S);
  h += '<div class="grid2">';
  h += `<div class="card"><h2>Colchón de emergencias</h2>${c.meta > 0
    ? `<div class="prog"><div class="pl"><b class="pos">${crc(c.ahorrado)}</b><span>meta ${crc(c.meta)}</span></div>
        <div class="track" style="height:9px"><i style="width:${Math.min(c.ahorrado / c.meta * 100, 100)}%;background:var(--aho)"></i></div>
        <div class="sub">Aguantás <b style="color:${c.cubiertos >= 1 ? 'var(--aho)' : 'var(--apo)'}">${c.cubiertos.toFixed(1)} meses</b> sin ingresos. ${c.falta > 0 ? 'Faltan ' + crc(c.falta) + '.' : '¡Meta cumplida!'}</div></div>
       <p class="nota">Gasto esencial ${crc(c.gasto)}/mes × ${c.meses} meses.</p>`
    : '<p class="vacio">Agregá tus gastos fijos en Plan para calcular la meta.</p>'}</div>`;
  h += `<div class="card"><h2>Universidad</h2>${u
    ? `<div class="prog"><div class="pl"><b>${crc(u.pagado)}</b><span>de ${crc(u.total)}</span></div>
        <div class="track" style="height:9px"><i style="width:${Math.min(u.pagado / u.total * 100, 100)}%;background:var(--nec)"></i></div>
        <div class="sub">${u.falta > 0 ? `Faltan ${crc(u.falta)} · ${crc(u.porPago)} por pago` : 'Cuatrimestre pagado completo'}</div></div>`
    : '<p class="vacio">No hay cuatrimestre activo.</p>'}</div>`;
  h += '</div>';

  const ult = movsMes().slice(0, 6);
  h += `<div class="card"><h2>Lo último</h2>${ult.length ? ult.map(filaMov).join('') : '<p class="vacio">Sin movimientos este mes.</p>'}
    ${ult.length ? '<div class="btnrow" style="margin-top:6px"><button class="btn sm" data-ir="movs">Ver todos</button></div>' : ''}</div>`;
  return h;
}

function textoAviso(a) {
  let em = '•', t = '';
  if (a.bolsa) { em = '▲'; t = `<b>${esc(a.bolsa)}</b> se pasó ${crc(a.exceso)} del plan de ${crc(a.limite)}.`; }
  else if (a.vencida) { em = '■'; t = `<b>${esc(a.vencida.nombre)}</b> venció hace ${a.dias} días. Renovalo o mové la plata.`; }
  else if (a.vence) { em = '◷'; t = `<b>${esc(a.vence.nombre)}</b> vence en ${a.dias} días (${fechaLarga(a.vence.vence)}).`; }
  else if (a.cobro) { em = '↻'; t = `<b>${esc(a.cobro.nombre)}</b> se cobra ${a.dias === 0 ? 'hoy' : 'en ' + a.dias + ' días'} (${dinero(a.cobro.monto, a.cobro.moneda)}).`; }
  else if (a.sinTipoCambio) { em = '$'; t = 'Falta el <b>tipo de cambio</b> en Plan: sin él no puedo sumar tus dólares.'; }
  else if (a.colchon) { em = '◇'; t = `El colchón aguanta <b>${a.colchon.cubiertos.toFixed(1)} meses</b>. Tu meta es ${a.colchon.meses}.`; }
  return `<div class="aviso ${a.nivel}"><span class="em" aria-hidden="true">${em}</span><div>${t}</div></div>`;
}

function cmpMov(a, b) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
  return (a.created_at || '') < (b.created_at || '') ? 1 : -1;
}
const movsMes = () => S.movimientos.filter((m) => String(m.fecha).slice(0, 7) === S.mes).sort(cmpMov);

function filaMov(m) {
  const o = cuenta(m.cuenta_origen), d = cuenta(m.cuenta_destino);
  let titulo, linea, monto, clase = '', col;
  if (m.tipo === 'transferencia') {
    const aAh = C.esAhorro(d) && !C.esAhorro(o), deAh = C.esAhorro(o) && !C.esAhorro(d);
    titulo = m.descripcion || (aAh ? 'Ahorro' : deAh ? 'Saqué del ahorro' : 'Movida entre cuentas');
    linea = `${esc(o ? o.nombre : '?')} → ${esc(d ? d.nombre : '?')}`;
    col = aAh ? 'var(--aho)' : deAh ? 'var(--apo)' : 'var(--dim)';
    clase = aAh ? 'pos' : 'tr';
    monto = dinero(m.monto, o && o.moneda);
    const extra = m.monto_destino != null && d && o && d.moneda !== o.moneda
      ? `<small>llegan ${dinero(m.monto_destino, d.moneda)}</small>` : '';
    monto = `${aAh ? '' : '⇄ '}${monto}${extra}`;
  } else if (m.tipo === 'ingreso') {
    titulo = m.descripcion || m.categoria || 'Ingreso';
    linea = `Entró a ${esc(d ? d.nombre : '?')}`;
    col = 'var(--aho)'; clase = 'pos';
    monto = '+' + dinero(m.monto, d && d.moneda);
  } else {
    const b = m.bolsa || C.CAT_BOLSA[m.categoria];
    titulo = m.descripcion || m.categoria || 'Gasto';
    linea = `${esc(m.categoria || '—')}${o && C.esAhorro(o) ? ' · <span style="color:var(--apo)">del ' + esc(o.nombre) + '</span>' : ''}${m.medio ? ' · ' + esc(m.medio) : ''}`;
    col = BCOLOR[b] || 'var(--dim)';
    monto = dinero(m.monto, o && o.moneda);
  }
  return `<button class="item" data-mov="${esc(m.id)}">
    <div class="t1">${esc(titulo)}</div>
    <div class="t2"><span class="dot" style="background:${col}"></span>${linea} · ${fechaCorta(m.fecha)}</div>
    <div class="amt ${clase}">${monto}</div></button>`;
}

// ── Movimientos ────────────────────────────────────────────────
function vMovs() {
  let lista = movsMes();
  const f = S.filtro;
  if (f !== 'todos') {
    lista = lista.filter((m) => {
      if (f === 'ingreso' || f === 'transferencia') return m.tipo === f;
      return m.tipo === 'gasto' && (m.bolsa || C.CAT_BOLSA[m.categoria]) === f;
    });
  }
  if (S.busca) {
    const q = S.busca.toLowerCase();
    lista = lista.filter((m) => `${m.descripcion || ''} ${m.categoria || ''}`.toLowerCase().includes(q));
  }
  const gastos = lista.filter((m) => m.tipo === 'gasto').reduce((a, m) => a + C.movCRC(m, ixCuentas(), tcambio()), 0);
  const filtros = [['todos', 'Todo'], ...C.BOLSAS_GASTO.map((b) => [b, b]), ['transferencia', 'Ahorro y movidas'], ['ingreso', 'Ingresos']];

  let h = `<div class="card flat">
    <div class="fld" style="margin-bottom:10px"><input class="inp" id="q" type="search" placeholder="Buscar…" value="${esc(S.busca)}" aria-label="Buscar movimientos"></div>
    <div class="filtros">${filtros.map(([k, l]) => `<button class="btn sm" data-filtro="${esc(k)}" aria-pressed="${f === k}">${esc(l)}</button>`).join('')}</div>
  </div>
  <div class="card flat"><div class="sub" style="padding:2px 2px 10px">${lista.length} movimiento${lista.length === 1 ? '' : 's'}${gastos ? ' · ' + crc(gastos) + ' en gastos' : ''}</div>`;
  if (!lista.length) return h + '<p class="vacio">Nada por acá. Tocá el + para anotar algo.</p></div>';
  let dia = null;
  lista.forEach((m) => {
    if (m.fecha !== dia) {
      if (dia !== null) h += '</div>';
      dia = m.fecha;
      h += `<div class="daygrp"><div class="dayhd">${fechaLarga(m.fecha)}</div>`;
    }
    h += filaMov(m);
  });
  return h + '</div></div>';
}
let _ix = null, _ixSrc = null;
function ixCuentas() {
  if (_ixSrc !== S.cuentas) { _ix = {}; S.cuentas.forEach((c) => { _ix[c.id] = c; }); _ixSrc = S.cuentas; }
  return _ix;
}

// ── Cuentas ────────────────────────────────────────────────────
function vCuentas() {
  const t = tcambio();
  const disp = activas().filter((c) => !C.esAhorro(c));
  const ahor = activas().filter((c) => C.esAhorro(c));
  const totDisp = disp.reduce((a, c) => a + C.saldoCRC(c, t), 0);
  const totAh = ahor.reduce((a, c) => a + C.saldoCRC(c, t), 0);
  const inact = S.cuentas.filter((c) => !c.activa);

  let h = `<div class="hero">
    <div class="lbl">Todo lo tuyo</div>
    <div class="big${totDisp + totAh < 0 ? ' neg' : ''}">${crc(totDisp + totAh)}</div>
    ${t ? `<div class="sub">≈ ${usd((totDisp + totAh) / t)} a ₡${miles(t)}</div>` : ''}
    <div class="trio">
      <div><div class="k">Para gastar</div><div class="v">${crc(totDisp)}</div></div>
      <div><div class="k">Ahorrado</div><div class="v pos">${crc(totAh)}</div></div>
      <div><div class="k">Cuentas</div><div class="v">${activas().length}</div></div>
    </div></div>`;

  const bloque = (titulo, lista, total) => `<div class="card">
    <div class="grupo-hd"><b>${titulo}</b><span>${crc(total)}</span></div>
    ${lista.length ? lista.map(filaCuenta).join('') : '<p class="vacio">Ninguna todavía.</p>'}</div>`;
  h += bloque('Para gastar', disp, totDisp);
  h += bloque('Ahorro', ahor, totAh);

  const pb = C.saldoPorBolsa(S);
  const bolsas = C.BOLSAS_AHORRO.filter((b) => pb[b]);
  if (bolsas.length) {
    h += `<div class="card"><h2>Tu ahorro por meta</h2>${bolsas.map((b) => `<div class="saldo-row"><div class="n">
      <span class="dot" style="background:${b === 'Colchón' ? 'var(--aho)' : 'var(--accent)'}"></span>${esc(b)}</div>
      <div class="v">${crc(pb[b])}</div></div>`).join('')}</div>`;
  }
  if (inact.length) {
    h += `<div class="card"><h2>Cerradas</h2>${inact.map(filaCuenta).join('')}</div>`;
  }
  h += `<div class="btnrow"><button class="btn" data-nueva-cuenta="ahorro">+ Agregar cuenta</button></div>
    <p class="nota">Los saldos se calculan solos con tus movimientos. Si no calza con el banco, abrí la cuenta y tocá "Ajustar saldo".</p>`;
  return h;
}

function filaCuenta(c) {
  const d = c.vence ? C.diasHasta(c.vence) : null;
  const sub = [tipoCuentaLabel(c.tipo)];
  if (c.bolsa) sub.push(c.bolsa);
  if (c.tasa) sub.push((c.tasa * 100).toFixed(2).replace('.', ',') + '%');
  let chip = '';
  if (c.activa && d !== null) {
    chip = d < 0 ? `<span class="chip sm neg">venció hace ${-d}d</span>`
      : d <= 45 ? `<span class="chip sm" style="color:var(--apo)">vence en ${d}d</span>`
      : `<span class="chip sm" style="color:var(--dim)">vence ${fechaCorta(c.vence)}</span>`;
  } else if (c.activa && c.tipo === 'certificado') chip = '<span class="chip sm" style="color:var(--apo)">sin fecha</span>';
  return `<button class="item" data-cuenta="${esc(c.id)}"${c.activa ? '' : ' style="opacity:.5"'}>
    <div class="t1">${esc(c.nombre)}</div>
    <div class="t2">${esc(sub.join(' · '))} ${chip}</div>
    <div class="amt${c.saldo < 0 ? ' neg' : ''}">${dinero(c.saldo, c.moneda)}${c.moneda === 'USD' && tcambio() ? `<small>${crc(C.saldoCRC(c, tcambio()))}</small>` : ''}</div></button>`;
}

// ── Plan ───────────────────────────────────────────────────────
function vPlan() {
  const a = S.ajustes || {}, t = tcambio();
  const opcCuentas = activas().filter((c) => !C.esAhorro(c))
    .map((c) => `<option value="${esc(c.id)}"${principal() && principal().id === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('');
  let h = `<div class="card"><h2>Lo básico</h2>
    <div class="row2">
      ${campo('Ingreso por quincena', 'a-ingreso_quincena', a.ingreso_quincena, 'number')}
      ${campo('Tipo de cambio (₡ por $1)', 'a-tipo_cambio', a.tipo_cambio, 'number')}
    </div><div class="row2">
      ${campo('Meses de colchón (meta)', 'a-meses_colchon', a.meses_colchon ?? 3, 'number')}
      ${campo('Ahorro planeado al mes', 'a-plan_ahorro', a.plan_ahorro, 'number')}
    </div><div class="row2">
      ${campo('Apoyo familiar al mes', 'a-plan_apoyo', a.plan_apoyo, 'number')}
      ${campo('Antojos al mes', 'a-plan_antojos', a.plan_antojos, 'number')}
    </div>
    ${opcCuentas ? `<div class="fld"><label for="a-cuenta_principal">Cuenta principal (donde te pagan)</label>
      <select class="inp" id="a-cuenta_principal">${opcCuentas}</select></div>` : ''}
    <button class="btn pri" id="guardar-ajustes">Guardar</button>
    <p class="nota">Necesidades y Suscripciones salen solas de la lista de abajo. Apoyo familiar, Antojos y Ahorro los ponés vos.</p></div>`;

  C.TIPOS_PLAN.forEach(([tipo, titulo]) => {
    const ls = S.plan.filter((i) => i.tipo === tipo);
    const tot = ls.reduce((s, i) => s + C.mensualCRC(i, t), 0);
    h += `<div class="card"><div class="grupo-hd"><b>${titulo}</b>${tot ? `<span>${crc(tot)}/mes</span>` : ''}</div>`;
    h += ls.length ? ls.map((i) => {
      const sub = [i.bolsa, i.tipo === 'universidad' ? `${i.pagos || 3} pagos` : i.periodicidad];
      if (i.proximo_cobro) sub.push('cobro ' + fechaCorta(i.proximo_cobro));
      return `<button class="item" data-plan="${esc(i.id)}"${i.activo ? '' : ' style="opacity:.5"'}>
        <div class="t1">${esc(i.nombre)}${i.activo ? '' : ' <span class="chip sm">apagado</span>'}</div>
        <div class="t2">${esc(sub.join(' · '))}</div>
        <div class="amt">${dinero(i.monto, i.moneda)}${i.moneda === 'USD' || i.tipo === 'universidad' ? `<small>${crc(C.mensualCRC(i, t))}/mes</small>` : ''}</div></button>`;
    }).join('') : '<p class="vacio">Nada todavía.</p>';
    h += `<div class="btnrow" style="margin-top:8px"><button class="btn sm" data-nuevo-plan="${tipo}">+ Agregar</button></div></div>`;
  });

  h += `<div class="card"><h2>Tus datos</h2>
    <p class="sub" style="margin:0 0 12px">Todo está en tu base de Supabase. Podés bajarlo cuando quieras.</p>
    <div class="btnrow">
      <button class="btn sm" id="exportar">Descargar movimientos (CSV)</button>
      <button class="btn sm" id="salir">Cerrar sesión</button>
    </div>
    <p class="nota">${S.sesion && S.sesion.user ? 'Sesión: ' + esc(S.sesion.user.email) : ''}</p></div>`;
  return h;
}

function campo(lbl, id, val, type = 'text', extra = '') {
  return `<div class="fld"><label for="${id}">${esc(lbl)}</label>
    <input class="inp" id="${id}" type="${type}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${esc(val == null ? '' : val)}" ${extra}></div>`;
}

// ── Eventos de la vista ────────────────────────────────────────
function conectar(root) {
  const q = $('#q', root);
  if (q) q.addEventListener('input', () => {
    S.busca = q.value;
    const pos = q.selectionStart;
    render();
    const n = $('#q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  });
  $$('[data-filtro]', root).forEach((b) => b.addEventListener('click', () => { S.filtro = b.dataset.filtro; render(); }));
  $$('[data-ir]', root).forEach((b) => b.addEventListener('click', () => irA(b.dataset.ir)));
  $$('[data-mov]', root).forEach((b) => b.addEventListener('click', () => {
    const m = S.movimientos.find((x) => x.id === b.dataset.mov); if (m) abrirMov(m);
  }));
  $$('[data-cuenta]', root).forEach((b) => b.addEventListener('click', () => abrirCuenta(cuenta(b.dataset.cuenta))));
  $$('[data-nueva-cuenta]', root).forEach((b) => b.addEventListener('click', () => abrirCuenta({ tipo: b.dataset.nuevaCuenta })));
  $$('[data-plan]', root).forEach((b) => b.addEventListener('click', () => {
    const p = S.plan.find((x) => x.id === b.dataset.plan); if (p) abrirPlan(p);
  }));
  $$('[data-nuevo-plan]', root).forEach((b) => b.addEventListener('click', () => abrirPlan({ tipo: b.dataset.nuevoPlan })));
  const ga = $('#guardar-ajustes', root);
  if (ga) ga.addEventListener('click', guardarAjustes);
  const ex = $('#exportar', root);
  if (ex) ex.addEventListener('click', exportarCSV);
  const sa = $('#salir', root);
  if (sa) sa.addEventListener('click', async () => { await db.salir(); pantallaLogin('Sesión cerrada.'); });
  const re = $('#recargar', root);
  if (re) re.addEventListener('click', () => { S.listo = false; render(); recargar(); });
}

function irA(tab) { S.tab = tab; S.busca = ''; window.scrollTo(0, 0); render(); }

function guardarAjustes() {
  const o = {};
  ['ingreso_quincena', 'tipo_cambio', 'meses_colchon', 'plan_ahorro', 'plan_apoyo', 'plan_antojos'].forEach((k) => {
    const el = $('#a-' + k); if (el) o[k] = num(el.value);
  });
  const cp = $('#a-cuenta_principal'); if (cp) o.cuenta_principal = cp.value || null;
  hacer(() => db.guardarAjustes(o), 'Guardado');
}

// ════════════════════════════════════════════════════════════════
//  Hojas (formularios)
// ════════════════════════════════════════════════════════════════
function cerrar() { $('#modal').innerHTML = ''; document.body.style.overflow = ''; }
function abrirHoja(titulo, cuerpo, alMontar) {
  $('#modal').innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="sheet-hd"><h3>${esc(titulo)}</h3><button class="x" id="cerrar" aria-label="Cerrar">✕</button></div>
    <div id="sheet-body">${cuerpo}</div></div></div>`;
  document.body.style.overflow = 'hidden';
  $('#cerrar').addEventListener('click', cerrar);
  $('#scrim').addEventListener('click', (e) => { if (e.target.id === 'scrim') cerrar(); });
  if (alMontar) alMontar();
  const f = $('#sheet-body .inp.money');
  if (f && window.matchMedia('(min-width: 760px)').matches) f.focus();
}

function opcionesCuentas(lista, sel) {
  return lista.map((c) => `<option value="${esc(c.id)}"${sel === c.id ? ' selected' : ''}>${esc(c.nombre)} · ${dinero(c.saldo, c.moneda)}</option>`).join('');
}

function botonBorrar(id, etiqueta, fn) {
  const b = $('#' + id);
  if (!b) return;
  b.addEventListener('click', () => {
    if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Tocá otra vez para confirmar'; return; }
    fn();
  });
  b.textContent = etiqueta;
}

// ── Anotar ─────────────────────────────────────────────────────
//  modos: gasto · ingreso · ahorrar · sacar · mover (editar transferencia)
function abrirNuevo(modo = 'gasto') {
  if (!S.cuentas.length) { abrirCuenta({ tipo: 'corriente' }); return; }
  abrirHoja('Anotar', `<div class="seg" id="seg" style="margin-bottom:16px" role="group" aria-label="Tipo de movimiento">
      <button data-m="gasto">Gasto</button><button data-m="ingreso">Ingreso</button>
      <button data-m="ahorrar">Ahorrar</button><button data-m="sacar">Sacar</button></div>
    <div id="form-slot"></div>`, () => {
    const pinta = (m) => {
      $$('#seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false'));
      $('#form-slot').innerHTML = formMov({ modo: m, fecha: C.hoyISO() });
      conectarForm({ modo: m });
    };
    $$('#seg button').forEach((b) => b.addEventListener('click', () => pinta(b.dataset.m)));
    pinta(modo);
  });
}

function modoDe(m) {
  if (m.tipo !== 'transferencia') return m.tipo;
  const o = cuenta(m.cuenta_origen), d = cuenta(m.cuenta_destino);
  if (C.esAhorro(d) && !C.esAhorro(o)) return 'ahorrar';
  if (C.esAhorro(o) && !C.esAhorro(d)) return 'sacar';
  return 'mover';
}

function abrirMov(m) {
  const modo = modoDe(m);
  const titulos = { gasto: 'Editar gasto', ingreso: 'Editar ingreso', ahorrar: 'Editar ahorro', sacar: 'Editar retiro del ahorro', mover: 'Editar movida' };
  abrirHoja(titulos[modo], formMov({ ...m, modo }) +
    '<div class="btnrow" style="margin-top:10px"><button class="btn danger sm" id="borrar"></button></div>', () => {
    conectarForm({ ...m, modo });
    botonBorrar('borrar', 'Borrar este movimiento', () => {
      cerrar();
      hacer(() => db.borrarMovimiento(m.id), 'Borrado');
    });
  });
}

function formMov(m) {
  const modo = m.modo;
  const pri = principal();
  const ahorros = activas().filter((c) => C.esAhorro(c));
  const noAhorros = activas().filter((c) => !C.esAhorro(c));
  let h = '';

  if (modo === 'gasto' || modo === 'ingreso') {
    const lista = activas();
    const sel = modo === 'gasto' ? (m.cuenta_origen || (pri && pri.id)) : (m.cuenta_destino || (pri && pri.id));
    const cta = cuenta(sel);
    h += `<div class="fld"><label for="f-monto">Monto${cta ? ' en ' + (cta.moneda === 'USD' ? 'dólares' : 'colones') : ''}</label>
      <input class="inp money" id="f-monto" type="number" inputmode="decimal" step="any" min="0" value="${esc(m.monto ?? '')}" placeholder="0"></div>`;
    h += `<div class="row2">
      <div class="fld"><label for="f-fecha">Fecha</label><input class="inp" id="f-fecha" type="date" value="${esc(m.fecha || C.hoyISO())}"></div>
      <div class="fld"><label for="f-cuenta">${modo === 'gasto' ? '¿De dónde salió?' : '¿A qué cuenta entró?'}</label>
        <select class="inp" id="f-cuenta">${opcionesCuentas(lista, sel)}</select></div></div>`;
    if (modo === 'gasto') {
      h += `<div class="row2">
        <div class="fld"><label for="f-cat">Categoría</label><select class="inp" id="f-cat">
          ${C.CATEGORIAS.map((c) => `<option${m.categoria === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="fld"><label for="f-bolsa">Bolsa</label><select class="inp" id="f-bolsa">
          ${C.BOLSAS_GASTO.map((b) => `<option${(m.bolsa || C.CAT_BOLSA[m.categoria || C.CATEGORIAS[0]]) === b ? ' selected' : ''}>${b}</option>`).join('')}</select></div></div>
        <div class="fld"><label for="f-medio">Pagado con</label><select class="inp" id="f-medio">
          ${['Az', 'SINPE', 'Efectivo', 'Black', 'Roja'].map((x) => `<option${(m.medio || 'Az') === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
        <p class="nota" id="f-aviso-ahorro" style="margin:-4px 0 12px;color:var(--apo)" hidden>Este gasto sale directo de una cuenta de ahorro: baja tu ahorro y cuenta como gasto.</p>`;
    } else {
      h += `<div class="fld"><label for="f-cat">Concepto</label><select class="inp" id="f-cat">
        ${['Quincena', 'Adicional', 'Aguinaldo', 'Intereses', 'Devolución', 'Otro'].map((x) => `<option${(m.categoria || 'Quincena') === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>`;
    }
  } else {
    // transferencias
    let de, a, listaDe, listaA, ayuda;
    if (modo === 'ahorrar') {
      listaDe = noAhorros; listaA = ahorros;
      de = m.cuenta_origen || (pri && pri.id); a = m.cuenta_destino || (ahorros[0] && ahorros[0].id);
      ayuda = 'Pasa plata a tu ahorro. No cuenta como gasto.';
    } else if (modo === 'sacar') {
      listaDe = ahorros; listaA = noAhorros;
      de = m.cuenta_origen || ((ahorros.find((c) => c.bolsa === 'Colchón') || ahorros[0]) || {}).id;
      a = m.cuenta_destino || (pri && pri.id);
      ayuda = 'Pasa plata del ahorro a tu cuenta. No es gasto: si después la usás, anotá ese gasto aparte.';
    } else {
      listaDe = activas(); listaA = activas();
      de = m.cuenta_origen; a = m.cuenta_destino;
      ayuda = 'Plata que pasa de una cuenta tuya a otra tuya.';
    }
    if (!listaDe.length || !listaA.length) {
      return `<p class="vacio">${modo === 'ahorrar' || modo === 'sacar'
        ? 'Primero agregá una cuenta de ahorro en la pestaña Cuentas.' : 'Necesitás al menos dos cuentas.'}</p>
        <div class="btnrow" style="justify-content:center"><button class="btn pri" id="ir-cuenta">Agregar cuenta de ahorro</button></div>`;
    }
    const ctaDe = cuenta(de);
    h += `<p class="sub" style="margin:-4px 0 14px">${ayuda}</p>
      <div class="fld"><label for="f-monto">Monto${ctaDe ? ' en ' + (ctaDe.moneda === 'USD' ? 'dólares' : 'colones') : ''}</label>
        <input class="inp money" id="f-monto" type="number" inputmode="decimal" step="any" min="0" value="${esc(m.monto ?? '')}" placeholder="0"></div>
      <div class="fld"><label for="f-de">Sale de</label><select class="inp" id="f-de">${opcionesCuentas(listaDe, de)}</select></div>
      <div class="flecha" aria-hidden="true">↓</div>
      <div class="fld"><label for="f-a">Llega a</label><select class="inp" id="f-a">${opcionesCuentas(listaA, a)}</select></div>
      <div class="fld" id="f-destino-wrap" hidden><label for="f-monto-destino" id="f-monto-destino-lbl">Monto que llega</label>
        <input class="inp" id="f-monto-destino" type="number" inputmode="decimal" step="any" min="0" value="${esc(m.monto_destino ?? '')}"></div>
      <div class="fld"><label for="f-fecha">Fecha</label><input class="inp" id="f-fecha" type="date" value="${esc(m.fecha || C.hoyISO())}"></div>`;
  }

  h += `<div class="fld"><label for="f-desc">Nota</label>
    <input class="inp" id="f-desc" value="${esc(m.descripcion || '')}" placeholder="${modo === 'gasto' ? '¿En qué fue?' : 'Opcional'}"></div>`;
  h += `<button class="btn pri wide" id="f-save">${m.id ? 'Guardar cambios' : 'Anotar'}</button>`;
  if ((modo === 'gasto' || modo === 'ingreso') && !m.id) {
    h += `<details style="margin-top:16px"${modo === 'gasto' ? '' : ' hidden'}><summary style="cursor:pointer;font-size:14px;color:var(--accent)">Pegar el correo del banco</summary>
      <div class="fld" style="margin-top:11px"><textarea class="inp" id="f-correo" placeholder="Copiá el correo del banco y pegalo acá. Saco monto, comercio, fecha y categoría."></textarea></div>
      <button class="btn sm" id="f-leer">Leer el correo</button><div id="f-leer-res"></div></details>`;
  }
  h += '<div id="f-err"></div>';
  return h;
}

function conectarForm(m) {
  const modo = m.modo;
  const ir = $('#ir-cuenta');
  if (ir) { ir.addEventListener('click', () => { cerrar(); abrirCuenta({ tipo: 'ahorro' }); }); return; }

  const cat = $('#f-cat'), bolsa = $('#f-bolsa');
  if (cat && bolsa) cat.addEventListener('change', () => { if (C.CAT_BOLSA[cat.value]) bolsa.value = C.CAT_BOLSA[cat.value]; });

  const fc = $('#f-cuenta'), avAh = $('#f-aviso-ahorro');
  const revisarCuenta = () => {
    if (!fc) return;
    const c = cuenta(fc.value);
    const lbl = document.querySelector('label[for="f-monto"]');
    if (lbl && c) lbl.textContent = 'Monto en ' + (c.moneda === 'USD' ? 'dólares' : 'colones');
    if (avAh) avAh.hidden = !C.esAhorro(c);
  };
  if (fc) { fc.addEventListener('change', revisarCuenta); revisarCuenta(); }

  // transferencias entre monedas distintas
  const fde = $('#f-de'), fa = $('#f-a'), wrap = $('#f-destino-wrap'), fmd = $('#f-monto-destino'), fm = $('#f-monto');
  const revisarMonedas = () => {
    if (!fde || !fa) return;
    const o = cuenta(fde.value), d = cuenta(fa.value);
    const lbl = document.querySelector('label[for="f-monto"]');
    if (lbl && o) lbl.textContent = 'Monto en ' + (o.moneda === 'USD' ? 'dólares' : 'colones');
    const distinta = o && d && o.moneda !== d.moneda;
    wrap.hidden = !distinta;
    if (distinta) {
      $('#f-monto-destino-lbl').textContent = `Llegan (en ${d.moneda === 'USD' ? 'dólares' : 'colones'})`;
      const t = tcambio();
      if (t && fm.value && !fmd.dataset.tocado) {
        const v = num(fm.value);
        fmd.value = (o.moneda === 'CRC' ? v / t : v * t).toFixed(2);
      }
    }
  };
  if (fde) {
    fde.addEventListener('change', revisarMonedas);
    fa.addEventListener('change', revisarMonedas);
    fm.addEventListener('input', revisarMonedas);
    fmd.addEventListener('input', () => { fmd.dataset.tocado = '1'; });
    revisarMonedas();
  }

  $('#f-save').addEventListener('click', () => guardarMov(m));

  const leer = $('#f-leer');
  if (leer) leer.addEventListener('click', () => {
    const r = parsearCorreo($('#f-correo').value, tcambio());
    const res = $('#f-leer-res');
    if (!r.ok) { res.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
    if (r.tipo === 'ingreso' && modo === 'gasto') {
      // era plata que entró: cambiar a Ingreso y rellenar
      $$('#seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === 'ingreso' ? 'true' : 'false'));
      $('#form-slot').innerHTML = formMov({ modo: 'ingreso', fecha: r.fecha, monto: r.monto, descripcion: r.descripcion, categoria: 'Otro' });
      conectarForm({ modo: 'ingreso' });
      toast('Era plata que te entró: lo pasé a Ingreso');
      return;
    }
    const c = cuenta($('#f-cuenta').value);
    let monto = r.monto;
    if (c && c.moneda === 'CRC' && r.moneda === 'USD') monto = tcambio() ? r.monto * tcambio() : r.monto;
    if (c && c.moneda === 'USD' && r.moneda === 'CRC') monto = tcambio() ? r.monto / tcambio() : r.monto;
    $('#f-monto').value = (Math.round(monto * 100) / 100).toString();
    $('#f-fecha').value = r.fecha;
    $('#f-desc').value = r.descripcion;
    if (cat && C.CATEGORIAS.includes(r.categoria)) { cat.value = r.categoria; if (bolsa) bolsa.value = C.CAT_BOLSA[r.categoria]; }
    const md = $('#f-medio'); if (md && r.medio) md.value = r.medio;
    let aviso = r.aviso || 'Listo. Revisá los campos de arriba y tocá Anotar.';
    if (r.moneda === 'USD' && c && c.moneda === 'CRC' && !tcambio()) aviso = 'Venía en dólares y no tenés tipo de cambio en Plan: corregí el monto a mano.';
    res.innerHTML = `<p class="ok-msg">${esc(aviso)}</p>`;
  });
}

function guardarMov(m) {
  const modo = m.modo;
  const err = $('#f-err');
  const monto = num($('#f-monto').value);
  if (monto <= 0) { err.innerHTML = '<p class="err">Poné un monto mayor que cero.</p>'; return; }
  const fila = {
    id: m.id, monto, fecha: $('#f-fecha').value || C.hoyISO(),
    descripcion: $('#f-desc').value.trim() || null,
    cuenta_origen: null, cuenta_destino: null, monto_destino: null,
    categoria: null, bolsa: null, medio: null,
  };
  if (modo === 'gasto') {
    Object.assign(fila, { tipo: 'gasto', cuenta_origen: $('#f-cuenta').value,
      categoria: $('#f-cat').value, bolsa: $('#f-bolsa').value, medio: $('#f-medio').value });
  } else if (modo === 'ingreso') {
    Object.assign(fila, { tipo: 'ingreso', cuenta_destino: $('#f-cuenta').value, categoria: $('#f-cat').value });
  } else {
    const de = $('#f-de').value, a = $('#f-a').value;
    if (de === a) { err.innerHTML = '<p class="err">Elegí dos cuentas distintas.</p>'; return; }
    const o = cuenta(de), d = cuenta(a);
    Object.assign(fila, { tipo: 'transferencia', cuenta_origen: de, cuenta_destino: a });
    if (o && d && o.moneda !== d.moneda) {
      const md = num($('#f-monto-destino').value);
      if (md <= 0) { err.innerHTML = '<p class="err">Poné cuánto llega en la otra moneda.</p>'; return; }
      fila.monto_destino = md;
    }
  }
  const btn = $('#f-save'); btn.disabled = true;
  cerrar();
  const msg = { gasto: 'Gasto anotado', ingreso: 'Ingreso anotado', ahorrar: 'Ahorro anotado',
                sacar: 'Retiro anotado. No cuenta como gasto', mover: 'Movida anotada' }[modo];
  hacer(() => db.guardarMovimiento(fila), m.id ? 'Guardado' : msg);
}

// ── Cuentas ────────────────────────────────────────────────────
function abrirCuenta(c) {
  if (!c) return;
  const nueva = !c.id;
  const ah = C.esAhorro(c);
  let h = `<div class="fld"><label for="k-nombre">Nombre</label>
      <input class="inp" id="k-nombre" value="${esc(c.nombre || '')}" placeholder="${c.tipo === 'corriente' ? 'Banco Popular' : 'Cuenta de ahorro colones'}"></div>
    <div class="row2">
      <div class="fld"><label for="k-tipo">Tipo</label><select class="inp" id="k-tipo">
        ${C.TIPOS_CUENTA.map(([k, l]) => `<option value="${k}"${(c.tipo || 'corriente') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="fld"><label for="k-moneda">Moneda</label><select class="inp" id="k-moneda"${nueva ? '' : ' disabled'}>
        ${['CRC', 'USD'].map((x) => `<option${(c.moneda || 'CRC') === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>`;
  if (nueva) {
    h += `<div class="fld"><label for="k-saldo">¿Cuánto tiene hoy?</label>
      <input class="inp money" id="k-saldo" type="number" inputmode="decimal" step="any" value="" placeholder="0"></div>`;
  } else {
    h += `<div class="card" style="background:var(--surface2);margin-bottom:14px;padding:13px">
      <div class="grupo-hd" style="margin:0 0 8px"><b>Saldo según la app</b><span>${dinero(c.saldo, c.moneda)}</span></div>
      <div class="fld" style="margin-bottom:8px"><label for="k-real">¿Cuánto dice el banco?</label>
        <input class="inp" id="k-real" type="number" inputmode="decimal" step="any" placeholder="Dejalo vacío si calza"></div>
      <p class="nota" style="margin:0">Si ponés un número, ajusto el saldo para que calce. No crea ningún gasto.</p></div>`;
  }
  h += `<div id="k-ahorro"${ah ? '' : ' hidden'}>
      <div class="fld"><label for="k-bolsa">¿Para qué es esta plata?</label><select class="inp" id="k-bolsa">
        ${C.BOLSAS_AHORRO.map((b) => `<option${(c.bolsa || 'Colchón') === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
      <div class="row2">
        <div class="fld"><label for="k-tasa">Tasa anual %</label><input class="inp" id="k-tasa" type="number" inputmode="decimal" step="any" value="${c.tasa ? +(c.tasa * 100).toFixed(3) : ''}" placeholder="5.5"></div>
        <div class="fld"><label for="k-vence">Vence (certificados)</label><input class="inp" id="k-vence" type="date" value="${esc(c.vence || '')}"></div>
      </div></div>
    <div class="fld"><label for="k-notas">Notas</label><input class="inp" id="k-notas" value="${esc(c.notas || '')}"></div>
    <label class="check"><input type="checkbox" id="k-activa"${c.activa === false ? '' : ' checked'}><span>Activa<br><span class="sub">Desactivala cuando la cierres o el certificado se liquide.</span></span></label>
    <button class="btn pri wide" id="k-save">Guardar</button>
    ${nueva ? '' : '<div class="btnrow" style="margin-top:10px"><button class="btn danger sm" id="k-del"></button></div>'}
    <div id="k-err"></div>`;

  abrirHoja(nueva ? 'Nueva cuenta' : c.nombre, h, () => {
    const tipo = $('#k-tipo');
    tipo.addEventListener('change', () => { $('#k-ahorro').hidden = !C.esAhorro({ tipo: tipo.value }); });
    $('#k-save').addEventListener('click', () => {
      const nombre = $('#k-nombre').value.trim();
      if (!nombre) { $('#k-err').innerHTML = '<p class="err">Ponele nombre.</p>'; return; }
      const t = tipo.value, esAh = C.esAhorro({ tipo: t });
      const fila = {
        id: c.id, nombre, tipo: t,
        bolsa: esAh ? $('#k-bolsa').value : null,
        tasa: esAh && $('#k-tasa').value ? num($('#k-tasa').value) / 100 : null,
        vence: esAh ? ($('#k-vence').value || null) : null,
        notas: $('#k-notas').value.trim() || null,
        activa: $('#k-activa').checked,
      };
      if (nueva) {
        fila.moneda = $('#k-moneda').value;
        fila.saldo_inicial = num($('#k-saldo').value);
        fila.orden = S.cuentas.length;
      } else {
        const real = $('#k-real').value;
        if (real !== '') fila.saldo_inicial = Number(c.saldo_inicial) + (num(real) - Number(c.saldo));
      }
      cerrar();
      hacer(async () => {
        const g = await db.guardarCuenta(fila);
        if (nueva && !S.ajustes && t === 'corriente') await db.guardarAjustes({ cuenta_principal: g.id, meses_colchon: 3 });
      }, nueva ? 'Cuenta agregada' : 'Guardado');
    });
    botonBorrar('k-del', 'Borrar cuenta', () => { cerrar(); hacer(() => db.borrarCuenta(c.id), 'Cuenta borrada'); });
  });
}

// ── Plan ───────────────────────────────────────────────────────
function abrirPlan(it) {
  const nuevo = !it.id;
  const titulo = { suscripcion: 'Suscripción', fijo: 'Gasto fijo', universidad: 'Universidad' }[it.tipo];
  let h = `<div class="fld"><label for="p-nombre">Nombre</label><input class="inp" id="p-nombre" value="${esc(it.nombre || '')}"></div>
    <div class="row2">
      <div class="fld"><label for="p-monto">${it.tipo === 'universidad' ? 'Total del cuatrimestre' : 'Monto'}</label>
        <input class="inp money" id="p-monto" type="number" inputmode="decimal" step="any" value="${esc(it.monto ?? '')}"></div>
      <div class="fld"><label for="p-moneda">Moneda</label><select class="inp" id="p-moneda">
        ${['CRC', 'USD'].map((x) => `<option${(it.moneda || (it.tipo === 'suscripcion' ? 'USD' : 'CRC')) === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="row2">
      <div class="fld"><label for="p-bolsa">Bolsa</label><select class="inp" id="p-bolsa">
        ${['Necesidades', 'Suscripciones'].map((b) => `<option${(it.bolsa || (it.tipo === 'suscripcion' ? 'Suscripciones' : 'Necesidades')) === b ? ' selected' : ''}>${b}</option>`).join('')}</select></div>`;
  if (it.tipo === 'universidad') {
    h += `<div class="fld"><label for="p-pagos">¿En cuántos pagos?</label><input class="inp" id="p-pagos" type="number" inputmode="numeric" value="${esc(it.pagos ?? 3)}"></div></div>
      <div class="fld"><label for="p-desde">Arrancó el</label><input class="inp" id="p-desde" type="date" value="${esc(it.desde || '')}"></div>`;
  } else {
    h += `<div class="fld"><label for="p-per">Cada cuánto</label><select class="inp" id="p-per">
        ${[['mensual', 'Al mes'], ['quincenal', 'Por quincena'], ['anual', 'Al año'], ['cuatrimestral', 'Por cuatrimestre']]
          .map(([k, l]) => `<option value="${k}"${(it.periodicidad || 'mensual') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="row2">
        <div class="fld"><label for="p-cobro">Próximo cobro</label><input class="inp" id="p-cobro" type="date" value="${esc(it.proximo_cobro || '')}"></div>
        <div class="fld"><label for="p-medio">Se paga con</label><select class="inp" id="p-medio">
          ${['Az', 'Black', 'Roja', 'SINPE', 'Efectivo'].map((x) => `<option${(it.medio || 'Az') === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
      </div>`;
  }
  h += `<div class="fld"><label for="p-notas">Notas</label><input class="inp" id="p-notas" value="${esc(it.notas || '')}"></div>
    <label class="check"><input type="checkbox" id="p-activo"${it.activo === false ? '' : ' checked'}><span>Activo<br><span class="sub">Apagalo para sacarlo del plan sin borrarlo.</span></span></label>
    <button class="btn pri wide" id="p-save">Guardar</button>
    ${nuevo ? '' : '<div class="btnrow" style="margin-top:10px"><button class="btn danger sm" id="p-del"></button></div>'}
    <div id="p-err"></div>`;

  abrirHoja((nuevo ? 'Nuevo: ' : '') + titulo, h, () => {
    $('#p-save').addEventListener('click', () => {
      const nombre = $('#p-nombre').value.trim();
      if (!nombre) { $('#p-err').innerHTML = '<p class="err">Ponele nombre.</p>'; return; }
      const fila = {
        id: it.id, tipo: it.tipo, nombre, monto: num($('#p-monto').value), moneda: $('#p-moneda').value,
        bolsa: $('#p-bolsa').value, notas: $('#p-notas').value.trim() || null, activo: $('#p-activo').checked,
      };
      if (it.tipo === 'universidad') {
        Object.assign(fila, { periodicidad: 'cuatrimestral', pagos: Math.max(1, Math.round(num($('#p-pagos').value)) || 3),
          desde: $('#p-desde').value || null });
      } else {
        Object.assign(fila, { periodicidad: $('#p-per').value, proximo_cobro: $('#p-cobro').value || null, medio: $('#p-medio').value });
      }
      cerrar();
      hacer(() => db.guardarPlan(fila), 'Guardado');
    });
    botonBorrar('p-del', 'Borrar', () => { cerrar(); hacer(() => db.borrarPlan(it.id), 'Borrado'); });
  });
}

// ── Exportar ───────────────────────────────────────────────────
function exportarCSV() {
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const filas = [['fecha', 'tipo', 'monto', 'moneda', 'sale_de', 'llega_a', 'monto_que_llega', 'categoria', 'bolsa', 'medio', 'nota']];
  S.movimientos.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).forEach((m) => {
    const o = cuenta(m.cuenta_origen), d = cuenta(m.cuenta_destino);
    filas.push([m.fecha, m.tipo, m.monto, (o || d || {}).moneda || 'CRC', o ? o.nombre : '', d ? d.nombre : '',
      m.monto_destino ?? '', m.categoria || '', m.bolsa || '', m.medio || '', m.descripcion || '']);
  });
  const csv = '﻿' + filas.map((f) => f.map(q).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `mi-plata-${C.hoyISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ════════════════════════════════════════════════════════════════
//  Arranque
// ════════════════════════════════════════════════════════════════
let escuchando = false;
async function arrancar() {
  if (!db.conexion()) { pantallaConexion(); return; }
  let s;
  try { s = await db.sesion(); }
  catch (e) { pantallaConexion(e.message); return; }
  if (!s) { pantallaLogin(); return; }
  S.sesion = s;
  modoApp(true);
  S.listo = false;
  render();
  await recargar();
  if (!escuchando) {
    escuchando = true;
    db.alCambiarSesion((ses) => {
      if (!ses) { S.sesion = null; pantallaLogin(); }
    });
  }
}

$('#mprev').addEventListener('click', () => { S.mes = C.mesShift(S.mes, -1); render(); });
$('#mnext').addEventListener('click', () => { S.mes = C.mesShift(S.mes, 1); render(); });
$('#fab').addEventListener('click', () => abrirNuevo('gasto'));
$$('#tabs button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.tab)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
// Al volver a la app (por ejemplo, después de anotar algo en la compu), traer lo último.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.sesion && !$('#modal').innerHTML) recargar();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

arrancar();
