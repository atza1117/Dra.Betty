// ════════════════════════════════════════════════════════════════
//  Dra. Betty — pantalla y eventos
// ════════════════════════════════════════════════════════════════
import * as db from './db.js';
import * as C from './calculos.js';
import { parsearCorreo } from './lector.js';
import { perezosoSVG, celebrar } from './perezoso.js';
import * as G from './graficas.js';

const S = {
  cuentas: [], movimientos: [], plan: [], ajustes: null,
  tab: 'inicio', mes: C.hoyMes(), filtro: 'todos', busca: '',
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
    limpiarBandeja();
  } catch (e) {
    toast(e.message, true);
    S.listo = true;
  }
  render();
  anotarSolos();
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
      <div class="pz-login">${perezosoSVG('feliz')}</div>
      <div class="brand big">Dra. <i>Betty</i></div>
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
      <div class="pz-login">${perezosoSVG(msg ? 'feliz' : 'feliz')}</div>
      <div class="brand big">Dra. <i>Betty</i></div>
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
  $('#mes-sel').style.visibility = S.tab === 'cuentas' ? 'hidden' : 'visible';
  $$('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'true' : 'false'));
  const app = $('#app');
  if (!S.listo) {
    app.innerHTML = `<div class="card"><div style="display:grid;gap:10px">
      <div class="skel" style="width:40%"></div><div class="skel" style="height:36px;width:62%"></div>
      <div class="skel" style="width:85%"></div><div class="skel" style="width:70%"></div></div></div>`;
    return;
  }
  if (!S.cuentas.length && S.tab !== 'pagos') { app.innerHTML = vBienvenida(); conectar(app); return; }
  if (S.tab !== 'graficas') G.destruirTodo();
  app.innerHTML = S.tab === 'inicio' ? vInicio()
    : S.tab === 'movs' ? vMovs()
    : S.tab === 'graficas' ? vGraficas()
    : S.tab === 'cuentas' ? vCuentas()
    : vPagos();
  conectar(app);
  if (S.tab === 'graficas') G.pintar(S, S.mes);
}

function vBienvenida() {
  return `<div class="hero">
      <div class="lbl">Bienvenida</div>
      <h1 style="font-size:26px;margin:6px 0 8px">Empecemos por tus cuentas</h1>
      <p class="sub" style="margin:0 0 14px">Toda la plata vive en una cuenta: la corriente donde te pagan, tus cuentas de ahorro, los certificados. Agregá la principal con lo que tiene hoy.</p>
      <button class="btn pri" data-nueva-cuenta="corriente">Agregar mi cuenta principal</button>
    </div>
    <div class="card"><h2>¿Ya tenés datos?</h2>
      <p class="sub" style="margin:0">Si ya cargaste tus datos en Supabase, tocá recargar.</p>
      <div class="btnrow" style="margin-top:12px"><button class="btn sm" id="recargar">Recargar</button></div></div>`;
}

// ── Resumen ────────────────────────────────────────────────────
function vInicio() {
  const r = C.resumenMes(S, S.mes), p = C.plan(S), ingPlan = C.ingresoPlanMes(S);
  const conIngresos = r.ingresos > 0;
  const queda = conIngresos ? r.queda : ingPlan - r.gastos - r.ahorroNeto;
  const an = C.animo(S, S.mes);
  let h = `<div class="hero">
    <div class="hero-txt">
      <div class="lbl">${conIngresos ? 'Te queda de ' + esc(C.mesLabel(S.mes)) : 'Proyectado para ' + esc(C.mesLabel(S.mes))}</div>
      <div class="big${queda < 0 ? ' neg' : ''}">${crc(queda)}</div>
      <div class="sub">${conIngresos
        ? `Entró ${crc(r.ingresos)}, gastaste ${crc(r.gastos)} y ${r.ahorroNeto >= 0 ? 'apartaste ' + crc(r.ahorroNeto) : 'sacaste ' + crc(-r.ahorroNeto) + ' del ahorro'}.`
        : `Todavía no hay ingresos este mes. Uso tu plan de ${crc(ingPlan)}.`}</div>
    </div>
    <div class="hero-pz pz-${an.cara}">${perezosoSVG(an.cara)}</div>
    <div class="globo" role="note">${esc(an.texto)}</div>
    <div class="trio">
      <div><div class="k">Gastos</div><div class="v">${crc(r.gastos)}</div></div>
      <div><div class="k">Ahorro neto</div><div class="v ${r.ahorroNeto < 0 ? 'neg' : 'pos'}">${crc(r.ahorroNeto)}</div></div>
      <div><div class="k">Q1 · Q2</div><div class="v peq">${crc(r.q1)} · ${crc(r.q2)}</div></div>
    </div></div>`;

  h += vBandeja();

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
  else if (a.vencida) { em = '■'; t = `<b>${esc(a.vencida.nombre)}</b> ${a.dias === 0 ? 'vence hoy' : 'venció hace ' + a.dias + ' días'}. Renovalo o liquidalo.`;
    t += ` <span class="btnrow" style="display:inline-flex;margin-left:4px"><button class="btn sm pri" data-renovar="${esc(a.vencida.id)}">Renovar</button><button class="btn sm" data-liquidar="${esc(a.vencida.id)}">Liquidar</button></span>`; }
  else if (a.vence) { em = '◷'; t = `<b>${esc(a.vence.nombre)}</b> vence en ${a.dias} días (${fechaLarga(a.vence.vence)}).`; }
  else if (a.cobro) {
    em = '↻';
    const cuando = a.dias < 0 ? `se cobró hace ${-a.dias} día${a.dias === -1 ? '' : 's'} y no está marcado` : a.dias === 0 ? 'se cobra hoy' : `se cobra en ${a.dias} día${a.dias === 1 ? '' : 's'}`;
    t = `<b>${esc(a.cobro.nombre)}</b> ${cuando} (${crc(a.monto)}). <button class="btn sm" data-pagar="${esc(a.cobro.id)}" style="margin-left:4px">Ya se pagó</button>`;
  }
  else if (a.apartar) {
    const x = a.apartar;
    em = '⬇';
    const cuando = x.dias < 0 ? `El ${+x.dia.slice(8)} te tocaba apartar` : x.dias === 0 ? 'Hoy es día de pago: apartá' : `El ${+x.dia.slice(8)} te toca apartar`;
    t = `${cuando} <b>${crc(x.monto)}</b> para <b>${esc(x.it.nombre)}</b> (se cobra el ${fechaCorta(x.para)}). <button class="btn sm pri" data-apartar="${esc(x.it.id)}|${esc(x.dia)}" style="margin-left:4px">Ya lo aparté</button>`;
  }
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
    <div class="t2"><span class="dot" style="background:${col}"></span>${linea} · ${fechaCorta(m.fecha)}${S.movCorreo && S.movCorreo.has(m.id) ? ' <span class="del-correo" title="Anotado solo desde el correo del banco">✉</span>' : ''}</div>
    <div class="amt ${clase}">${monto}</div><span class="lapiz" aria-hidden="true">✎</span></button>`;
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

  let h = `<div class="card" style="background:linear-gradient(150deg, rgba(53,38,110,.86), rgba(17,21,46,.88) 60%);border-color:rgba(255,209,102,.35)">
    <div class="sub" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800;font-size:12px">Todo lo tuyo</div>
    <div style="font-family:var(--f-dis);font-size:clamp(34px,10vw,48px);color:${totDisp + totAh < 0 ? 'var(--over)' : 'var(--gold)'};line-height:1.1;margin:4px 0">${crc(totDisp + totAh)}</div>
    ${t ? `<div class="sub">≈ ${usd((totDisp + totAh) / t)} a ₡${miles(t)} por dólar</div>` : ''}
    <div class="trio" style="grid-row:auto">
      <div><div class="k">Para gastar</div><div class="v${totDisp < 0 ? ' neg' : ''}">${crc(totDisp)}</div></div>
      <div><div class="k">Ahorrado</div><div class="v pos">${crc(totAh)}</div></div>
      <div><div class="k">Cuentas</div><div class="v">${activas().length}</div></div>
    </div></div>`;

  const bloque = (titulo, lista, total) => `<div class="card">
    <div class="grupo-hd"><b>${titulo}</b><span>${crc(total)}</span></div>
    ${lista.length ? lista.map(tarjetaCuenta).join('') : '<p class="vacio">Ninguna todavía.</p>'}</div>`;
  h += bloque('Ahorro', ahor, totAh);
  h += bloque('Para gastar', disp, totDisp);

  const pb = C.saldoPorBolsa(S);
  const bolsas = C.BOLSAS_AHORRO.filter((b) => pb[b]);
  if (bolsas.length) {
    h += `<div class="card"><h2>Tu ahorro por meta</h2>${bolsas.map((b) => `<div class="saldo-row"><div class="n">
      <span class="dot" style="background:${b === 'Colchón' ? 'var(--aho)' : 'var(--gold)'}"></span>${esc(b)}</div>
      <div class="v">${crc(pb[b])}</div></div>`).join('')}</div>`;
  }
  if (inact.length) {
    h += `<details class="card cerradas"><summary>Cerradas y liquidadas (${inact.length})</summary>${inact.map(tarjetaCuenta).join('')}</details>`;
  }
  h += `<div class="btnrow"><button class="btn pri" data-nueva-cuenta="ahorro">+ Agregar cuenta o certificado</button></div>
    <p class="nota" style="text-shadow:0 1px 6px rgba(0,0,0,.7)">Los saldos se calculan solos con tus movimientos. Si no calzan con el banco, tocá Editar → "¿Cuánto dice el banco?".</p>`;
  return h;
}

function chipEstado(c) {
  const e = C.estadoCuenta(c);
  if (e.clave === 'cerrada') {
    const f = C.fechaCierre(S, c);
    return `<span class="chip sm">Cerrada${f ? ' el ' + fechaCorta(f) : ''}</span>`;
  }
  if (e.clave === 'vencido') return `<span class="chip sm vencido">⚠ ${e.dias === 0 ? 'Vence hoy' : 'Vencido hace ' + (-e.dias) + ' d'}</span>`;
  if (e.clave === 'pronto') return `<span class="chip sm pronto">Vence en ${e.dias} d · ${fechaCorta(c.vence)}</span>`;
  if (e.clave === 'vigente') return `<span class="chip sm vigente">Vence ${fechaCorta(c.vence)}</span>`;
  if (e.clave === 'sinfecha') return '<span class="chip sm sinfecha">Sin fecha de vencimiento</span>';
  return '';
}

function tarjetaCuenta(c) {
  const e = C.estadoCuenta(c);
  const sub = [tipoCuentaLabel(c.tipo)];
  if (c.bolsa) sub.push(c.bolsa);
  if (c.tasa) sub.push((c.tasa * 100).toFixed(2).replace('.', ',') + '% anual');
  let acc = '';
  if (c.activa && c.tipo === 'certificado') {
    const urge = e.clave === 'vencido';
    acc = `<button class="btn sm ${urge ? 'pri' : ''}" data-renovar="${esc(c.id)}">⟳ Renovar</button>
           <button class="btn sm ${urge ? 'vio' : ''}" data-liquidar="${esc(c.id)}">✓ Liquidar</button>`;
  } else if (c.activa && C.esAhorro(c)) {
    acc = `<button class="btn sm" data-sacar="${esc(c.id)}">↑ Sacar</button>
           <button class="btn sm" data-meter="${esc(c.id)}">↓ Meter</button>`;
  }
  acc += `<button class="btn sm" data-editar-cuenta="${esc(c.id)}">✎ Editar</button>`;
  return `<div class="cta" data-estado="${e.clave}"${c.activa ? '' : ' style="opacity:.6"'}>
    <div class="cta-top">
      <div class="cta-nom"><b>${esc(c.nombre)}</b><span class="sub">${esc(sub.join(' · '))}</span></div>
      <div class="cta-saldo${c.saldo < 0 ? ' neg' : ''}">${dinero(c.saldo, c.moneda)}${c.moneda === 'USD' && tcambio() ? `<small>${crc(C.saldoCRC(c, tcambio()))}</small>` : ''}</div>
    </div>
    ${chipEstado(c) ? `<div>${chipEstado(c)}</div>` : ''}
    <div class="cta-acc">${acc}</div>
  </div>`;
}

// ── Gráficas ───────────────────────────────────────────────────
function vGraficas() {
  const r = C.resumenMes(S, S.mes);
  const bolsas = C.BOLSAS_GASTO.filter((b) => (r.porBolsa[b] || 0) > 0);
  const top = C.topCategorias(S, S.mes, 6);
  const h6 = C.historialMeses(S, 6, S.mes);
  const maxTop = top.length ? top[0].monto : 1;
  let h = `<div class="card"><h2>¿En qué se fue la plata? <small>${esc(C.mesLabel(S.mes))}</small></h2>`;
  if (!bolsas.length) h += '<p class="vacio">No hay gastos este mes.</p>';
  else {
    h += `<div class="grafica dona"><canvas id="g-dona" aria-label="Gastos del mes por bolsa"></canvas>
      <div class="dona-centro"><span>Gastaste</span><b>${crc(r.gastos)}</b></div></div>
      <div class="leyenda">${bolsas.map((b) => `<div><span class="dot" style="background:${G.COLOR_BOLSA[b]}"></span><span>${b}</span>
        <b>${crc(r.porBolsa[b])}</b><span class="pc">${Math.round(r.porBolsa[b] / r.gastos * 100)}%</span></div>`).join('')}</div>`;
  }
  h += '</div>';

  h += `<div class="card"><h2>Lo que más pesa <small>por categoría</small></h2>${top.length ? top.map((x) => `<div class="hbar">
      <span>${esc(x.categoria)}</span><span class="b"><i style="width:${Math.max(x.monto / maxTop * 100, 3)}%;background:${G.COLOR_BOLSA[x.bolsa] || G.COLOR_BOLSA.Antojos}"></i></span>
      <b>${crc(x.monto)}</b></div>`).join('') : '<p class="vacio">Sin gastos todavía.</p>'}</div>`;

  h += `<div class="card"><h2>Últimos 6 meses</h2>
    <div class="grafica barras"><canvas id="g-barras" aria-label="Lo que entró, gastaste y ahorraste en los últimos 6 meses"></canvas></div>
    <details class="tabla-ver"><summary>Ver como tabla</summary><div class="tblwrap"><table>
      <thead><tr><th>Mes</th><th class="r">Entró</th><th class="r">Gastaste</th><th class="r">Ahorraste</th></tr></thead>
      <tbody>${h6.map((x) => `<tr><td>${esc(C.mesLabel(x.mes))}</td><td class="r">${crc(x.ingresos)}</td><td class="r">${crc(x.gastos)}</td><td class="r${x.ahorro < 0 ? ' neg' : ''}">${crc(x.ahorro)}</td></tr>`).join('')}</tbody>
    </table></div></details></div>`;

  const a6 = C.ahorroEnElTiempo(S, 6, S.mes);
  const ultimo = a6[a6.length - 1].total, primero = a6[0].total;
  h += `<div class="card"><h2>Tu ahorro mes a mes</h2>
    <div class="sub" style="margin:-6px 0 10px">Hoy: <b style="color:var(--pos)">${crc(ultimo)}</b> · ${ultimo >= primero ? 'subió' : 'bajó'} ${crc(Math.abs(ultimo - primero))} en 6 meses</div>
    <div class="grafica linea"><canvas id="g-linea" aria-label="Total ahorrado al cierre de cada mes"></canvas></div></div>`;
  return h;
}

// ── Pagos ──────────────────────────────────────────────────────
function vPagos() {
  const P = C.pagosDelMes(S, S.mes);
  const t = tcambio();
  const vis = P.lista.filter((x) => x.estado !== 'fuera');
  const fuera = P.lista.filter((x) => x.estado === 'fuera');
  const pct = P.total > 0 ? Math.min(P.pagado / P.total * 100, 100) : 0;

  let h = `<div class="card" style="background:linear-gradient(150deg, rgba(53,38,110,.86), rgba(17,21,46,.88) 60%);border-color:rgba(255,209,102,.35)">
    <div class="sub" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800;font-size:12px">Pagos fijos de ${esc(C.mesLabel(S.mes))}</div>
    <div class="prog" style="margin-top:6px"><div class="pl"><b style="color:var(--gold)">${crc(P.total)}</b><span>pagado ${crc(P.pagado)}</span></div>
      <div class="track" style="height:10px"><i style="width:${pct}%;background:var(--pos)"></i></div>
      <div class="sub">${P.falta > 0.5 ? `Faltan <b style="color:var(--txt)">${crc(P.falta)}</b> por pagar` : '¡Todo pagado este mes!'}${t ? '' : ' · <span class="neg">falta el tipo de cambio</span>'}</div></div></div>`;

  // cuánto apartar
  const listaQ = (q) => vis.filter((x) => !x.it.dividir && x.quincena === q && (x.estado === 'pendiente' || x.estado === 'pagado'))
    .map((x) => ({ chip: 'día ' + x.dia, nombre: x.it.nombre, monto: x.monto }))
    .concat(P.apartados.filter((x) => x.cual === q).map((x) => ({ chip: 'mitad', nombre: `${x.it.nombre} · para el ${fechaCorta(x.para)}`, monto: x.monto })));
  const mini = (arr) => arr.length ? arr.map((x) => `<div class="saldo-row"><div class="n"><span class="chip sm">${esc(x.chip)}</span>${esc(x.nombre)}</div><div class="v">${crc(x.monto)}</div></div>`).join('')
    : '<p class="vacio" style="padding:6px 0">Nada</p>';
  h += `<div class="card"><h2>¿Cuánto apartar?</h2>
    <div class="grid2">
      <div><div class="grupo-hd"><b>Del pago del ${P.p1}</b><span>${crc(P.delP1)}</span></div>${mini(listaQ('p1'))}</div>
      <div><div class="grupo-hd"><b>Del pago del ${P.p2}</b><span>${crc(P.delP2)}</span></div>${mini(listaQ('p2'))}</div>
    </div>
    ${P.porQ.sin > 0 ? `<p class="nota">Los que no tienen día de cobro (${crc(P.porQ.sin)}) los repartí mitad y mitad.</p>` : ''}
    <div class="info" style="margin:14px 0 0">
      <div><span>Si preferís apartar parejo</span><b>${crc(P.parejo)} por quincena</b></div>
      ${P.diaADia ? `<div><span>Y para el día a día (${esc(P.presupuesto.map((x) => x.it.nombre).join(', '))})</span><b>${crc(P.diaADiaQ)} por quincena</b></div>` : ''}
    </div>
    <p class="nota">Lo que se cobra entre el ${P.p1} y el ${P.p2 - 1} sale del pago del ${P.p1}; lo del ${P.p2} en adelante y los primeros días del mes, del pago del ${P.p2}. Los días de pago se cambian en ⚙.</p></div>`;

  // apartados por quincena
  if (P.apartados.length) {
    h += `<div class="card"><h2>Para apartar este mes <small>la mitad en cada pago</small></h2>${P.apartados.map(filaApartado).join('')}
      <p class="nota">Así no tenés que sacar todo de un solo pago cuando llega el cobro.</p></div>`;
  }

  // checklist
  h += `<div class="card"><h2>Checklist del mes</h2>${vis.length ? vis.map(filaPago).join('') : '<p class="vacio">No hay pagos este mes.</p>'}
    ${fuera.length ? `<p class="nota">No se cobran en ${esc(C.mesLabel(S.mes).split(' ')[0].toLowerCase())}: ${esc(fuera.map((x) => x.it.nombre).join(', '))}.</p>` : ''}</div>`;

  // administrar
  C.TIPOS_PLAN.forEach(([tipo, titulo]) => {
    const ls = S.plan.filter((i) => i.tipo === tipo);
    const tot = ls.reduce((s, i) => s + C.mensualCRC(i, t), 0);
    h += `<div class="card"><div class="grupo-hd"><b>${titulo}</b>${tot ? `<span>${crc(tot)}/mes</span>` : ''}</div>`;
    h += ls.length ? ls.map((i) => {
      const sub = [i.bolsa];
      if (i.dia_cobro) sub.push('se cobra el ' + i.dia_cobro);
      else if (i.tipo !== 'universidad' && C.enChecklist(i)) sub.push('sin día de cobro');
      if (Array.isArray(i.meses) && i.meses.length) sub.push(i.meses.map((m) => C.MESES[m - 1].slice(0, 3)).join(', '));
      if (i.tipo === 'universidad') sub.push(`${i.pagos || 3} pagos`);
      if (i.dividir) sub.push('mitad por quincena');
      return `<button class="item" data-plan="${esc(i.id)}"${i.activo ? '' : ' style="opacity:.5"'}>
        <div class="t1">${esc(i.nombre)}${i.activo ? '' : ' <span class="chip sm">apagado</span>'}</div>
        <div class="t2">${esc(sub.join(' · '))}</div>
        <div class="amt">${dinero(i.monto, i.moneda)}${i.moneda === 'USD' || i.tipo === 'universidad' ? `<small>${crc(C.montoCobro(i, t))}${i.tipo === 'universidad' ? ' por pago' : ''}</small>` : ''}</div>
        <span class="lapiz" aria-hidden="true">✎</span></button>`;
    }).join('') : '<p class="vacio">Nada todavía.</p>';
    h += `<div class="btnrow" style="margin-top:8px"><button class="btn sm" data-nuevo-plan="${tipo}">+ Agregar</button></div></div>`;
  });
  return h;
}

function filaPago(x) {
  const it = x.it;
  let chip, acc = '';
  if (x.estado === 'pagado') {
    chip = `<span class="chip sm" style="color:var(--pos);border:1px solid rgba(61,220,151,.4);background:rgba(61,220,151,.12)">✓ Pagado${x.mov ? ' ' + fechaCorta(x.mov.fecha) : ''}</span>`;
    if (x.detectado) chip += `<span class="sub" style="font-size:11.5px">lo reconocí: ${esc((x.mov.descripcion || x.mov.categoria || '').slice(0, 38))}</span>`;
    else acc = `<button class="btn sm" data-desmarcar="${esc(it.id)}">Deshacer</button>`;
  } else if (x.estado === 'no') {
    chip = '<span class="chip sm">Este mes no</span>';
    acc = `<button class="btn sm" data-desmarcar="${esc(it.id)}">Sí toca</button>`;
  } else {
    const d = x.dias;
    chip = d === null ? '<span class="chip sm pronto">Pendiente</span>'
      : d < 0 ? `<span class="chip sm vencido">Se cobró hace ${-d} d · ¿ya pagaste?</span>`
      : d === 0 ? '<span class="chip sm vencido">Se cobra hoy</span>'
      : `<span class="chip sm pronto">Se cobra en ${d} d</span>`;
    acc = `<button class="btn sm pri" data-pagar="${esc(it.id)}">Ya se pagó</button>
           <button class="btn sm" data-no-aplica="${esc(it.id)}">Este mes no</button>`;
  }
  return `<div class="cta" style="gap:8px">
    <div class="cta-top">
      <div class="cta-nom"><b>${x.dia ? `<span class="chip sm" style="margin-right:6px;background:rgba(255,209,102,.16);color:var(--gold)">día ${x.dia}</span>` : ''}${esc(it.nombre)}</b>
        <span class="sub">${esc(it.bolsa)}${it.moneda === 'USD' ? ' · ' + usd(it.monto) : ''}</span></div>
      <div class="cta-saldo">${crc(x.monto)}</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${chip}</div>
    ${acc ? `<div class="cta-acc">${acc}</div>` : ''}
  </div>`;
}

function filaApartado(x) {
  const c = cuenta(x.it.cuenta_apartado);
  let chip, acc;
  if (x.estado === 'apartado') {
    chip = `<span class="chip sm" style="color:var(--pos);border:1px solid rgba(61,220,151,.4);background:rgba(61,220,151,.12)">✓ Apartado${c && x.marca && x.marca.movimiento ? ' en ' + esc(c.nombre) : ''}</span>`;
    acc = `<button class="btn sm" data-desapartar="${esc(x.it.id)}|${esc(x.dia)}">Deshacer</button>`;
  } else {
    chip = x.dias < 0 ? `<span class="chip sm vencido">Te tocaba el ${fechaCorta(x.dia)}</span>`
      : x.dias === 0 ? '<span class="chip sm vencido">Hoy</span>'
      : `<span class="chip sm pronto">El ${fechaCorta(x.dia)} · en ${x.dias} d</span>`;
    acc = `<button class="btn sm pri" data-apartar="${esc(x.it.id)}|${esc(x.dia)}">Ya lo aparté</button>`;
  }
  return `<div class="cta" style="gap:8px">
    <div class="cta-top">
      <div class="cta-nom"><b><span class="chip sm" style="margin-right:6px;background:rgba(255,209,102,.16);color:var(--gold)">pago del ${+x.dia.slice(8)}</span>${esc(x.it.nombre)}</b>
        <span class="sub">Mitad para el cobro del ${fechaLarga(x.para)}${c ? ' · va a ' + esc(c.nombre) : ''}</span></div>
      <div class="cta-saldo">${crc(x.monto)}</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${chip}</div>
    <div class="cta-acc">${acc}</div>
  </div>`;
}

function campo(lbl, id, val, type = 'text', extra = '') {
  return `<div class="fld"><label for="${id}">${esc(lbl)}</label>
    <input class="inp" id="${id}" type="${type}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${esc(val == null ? '' : val)}" ${extra}></div>`;
}

// ── Ajustes (⚙ del encabezado) ─────────────────────────────────
function abrirAjustes() {
  const a = S.ajustes || {};
  const opcCuentas = activas().filter((c) => !C.esAhorro(c))
    .map((c) => `<option value="${esc(c.id)}"${principal() && principal().id === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('');
  const h = `<div class="row2">
      ${campo('Ingreso por quincena', 'a-ingreso_quincena', a.ingreso_quincena, 'number')}
      ${campo('Tipo de cambio (₡ por $1)', 'a-tipo_cambio', a.tipo_cambio, 'number')}
    </div><div class="row2">
      ${campo('Primer día de pago', 'a-dia_pago1', a.dia_pago1 ?? 15, 'number', 'min="1" max="31"')}
      ${campo('Segundo día de pago', 'a-dia_pago2', a.dia_pago2 ?? 30, 'number', 'min="1" max="31"')}
    </div><div class="row2">
      ${campo('Meses de colchón (meta)', 'a-meses_colchon', a.meses_colchon ?? 3, 'number')}
      ${campo('Ahorro planeado al mes', 'a-plan_ahorro', a.plan_ahorro, 'number')}
    </div><div class="row2">
      ${campo('Apoyo familiar al mes', 'a-plan_apoyo', a.plan_apoyo, 'number')}
      ${campo('Antojos al mes', 'a-plan_antojos', a.plan_antojos, 'number')}
    </div>
    ${opcCuentas ? `<div class="fld"><label for="a-cuenta_principal">Cuenta principal (donde te pagan)</label>
      <select class="inp" id="a-cuenta_principal">${opcCuentas}</select></div>` : ''}
    <button class="btn pri wide" id="guardar-ajustes">Guardar</button>
    <p class="nota">Necesidades y Suscripciones salen solas de tus pagos fijos. Apoyo familiar, Antojos y Ahorro los ponés vos.</p>
    <div class="info" style="margin-top:16px">
      <div><b>Correos del banco</b></div>
      <div class="sub">${S.buzon
        ? `Gmail conectado.${S.buzon.ultimo_uso ? ' Último correo recibido: ' + esc(fechaHora(S.buzon.ultimo_uso)) + '.' : ' Todavía no ha llegado ningún correo.'}`
        : 'Conectá tu Gmail y los cobros de Banco Popular y BAC se anotan solos.'}</div>
      <div class="sub">Banco Popular → <b>${esc((cuentaDeBanco('Banco Popular') || {}).nombre || '—')}</b> · BAC → <b>${esc((cuentaDeBanco('BAC') || {}).nombre || '—')}</b></div>
      <div class="sub">Se elige por el nombre de la cuenta: la que diga "Popular" o "BAC". Si no hay, va a tu cuenta principal.</div>
      <div class="btnrow" style="justify-content:flex-start"><button class="btn sm${S.buzon ? '' : ' pri'}" id="conectar-gmail">${S.buzon ? 'Hacer un script nuevo' : 'Conectar Gmail'}</button></div>
    </div>
    <div class="info" style="margin-top:16px">
      <div><span>Tus datos están en tu base de Supabase.</span></div>
      <div class="btnrow" style="justify-content:flex-start"><button class="btn sm" id="exportar">Descargar movimientos (CSV)</button>
      <button class="btn sm" id="salir">Cerrar sesión</button></div>
      <div class="sub">${S.sesion && S.sesion.user ? 'Sesión: ' + esc(S.sesion.user.email) : ''}</div>
    </div>`;
  abrirHoja('Ajustes', h, () => {
    $('#guardar-ajustes').addEventListener('click', () => { guardarAjustes(); cerrar(); });
    $('#exportar').addEventListener('click', exportarCSV);
    const cg = $('#conectar-gmail');
    cg.addEventListener('click', () => {
      if (S.buzon && cg.dataset.ok !== '1') {
        cg.dataset.ok = '1';
        cg.textContent = 'Tocá otra vez (el script viejo deja de servir)';
        return;
      }
      conectarGmail();
    });
    $('#salir').addEventListener('click', async () => { cerrar(); await db.salir(); pantallaLogin('Sesión cerrada.'); });
  });
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
  const on = (attr, fn) => $$(`[data-${attr}]`, root).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); fn(b.getAttribute(`data-${attr}`));
  }));
  on('filtro', (v) => { S.filtro = v; render(); });
  on('ir', (v) => irA(v));
  on('mov', (id) => { const m = S.movimientos.find((x) => x.id === id); if (m) abrirMov(m); });
  on('editar-cuenta', (id) => abrirCuenta(cuenta(id)));
  on('nueva-cuenta', (tipo) => abrirCuenta({ tipo }));
  on('sacar', (id) => abrirNuevo('sacar', { cuenta_origen: id }));
  on('meter', (id) => abrirNuevo('ahorrar', { cuenta_destino: id }));
  on('renovar', (id) => abrirRenovar(cuenta(id)));
  on('liquidar', (id) => abrirLiquidar(cuenta(id)));
  on('plan', (id) => { const p = S.plan.find((x) => x.id === id); if (p) abrirPlan(p); });
  on('nuevo-plan', (tipo) => abrirPlan({ tipo }));
  on('pagar', (id) => abrirPagar(S.plan.find((x) => x.id === id)));
  on('no-aplica', (id) => hacer(() => db.marcarPago(id, S.mes, 'no_aplica'), 'Listo, este mes no cuenta'));
  on('desmarcar', (id) => hacer(() => db.desmarcarPago(id, S.mes), 'Desmarcado'));
  on('apartar', (v) => apartar(...v.split('|')));
  on('correo-anotar', (id) => anotarCorreo(id));
  on('correo-revisar', (id) => revisarCorreo(id));
  on('correo-no', (id) => hacer(() => db.marcarCorreo(id, 'descartado'), 'Listo, no se anota'));
  on('correo-mas', () => { S.verBandeja = true; render(); });
  on('correo-movida', (id) => movidaCorreo(id));
  on('desapartar', (v) => desapartar(...v.split('|')));
  const re = $('#recargar', root);
  if (re) re.addEventListener('click', () => { S.listo = false; render(); recargar(); });
}

function irA(tab) { S.tab = tab; S.busca = ''; window.scrollTo(0, 0); render(); }

function guardarAjustes() {
  const o = {};
  ['ingreso_quincena', 'tipo_cambio', 'meses_colchon', 'plan_ahorro', 'plan_apoyo', 'plan_antojos'].forEach((k) => {
    const el = $('#a-' + k); if (el) o[k] = num(el.value);
  });
  ['dia_pago1', 'dia_pago2'].forEach((k) => {
    const el = $('#a-' + k); if (el) o[k] = Math.min(31, Math.max(1, Math.round(num(el.value)) || (k === 'dia_pago1' ? 15 : 30)));
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
function abrirNuevo(modo = 'gasto', preset = {}) {
  if (!S.cuentas.length) { abrirCuenta({ tipo: 'corriente' }); return; }
  const inicial = modo;
  abrirHoja('Anotar', `<div class="seg" id="seg" style="margin-bottom:16px" role="group" aria-label="Tipo de movimiento">
      <button data-m="gasto">Gasto</button><button data-m="ingreso">Ingreso</button>
      <button data-m="ahorrar">Ahorrar</button><button data-m="sacar">Sacar</button></div>
    <div id="form-slot"></div>`, () => {
    const pinta = (m) => {
      $$('#seg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false'));
      const extra = m === inicial ? preset : {};
      $('#form-slot').innerHTML = formMov({ modo: m, fecha: C.hoyISO(), ...extra });
      conectarForm({ modo: m, _correo: m === inicial ? preset._correo : undefined });
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
  hacer(async () => {
    const g = await db.guardarMovimiento(fila);
    if (m._correo && g) await db.marcarCorreo(m._correo, 'anotado', g.id);
  }, m.id || modo === 'ahorrar' ? (m.id ? 'Guardado' : '') : msg)
    .then((ok) => { if (ok && !m.id && modo === 'ahorrar') celebrar('¡Eso! Apartaste ' + dinero(monto, (cuenta(fila.cuenta_origen) || {}).moneda)); });
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
    h += `<div class="info" style="display:block">
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
    <label class="check"><input type="checkbox" id="k-activa"${c.activa === false ? '' : ' checked'}><span>Activa<br><span class="sub">Para certificados, mejor usá Liquidar: mueve la plata y la cierra.</span></span></label>
    <button class="btn pri wide" id="k-save">Guardar</button>
    ${nueva ? '' : '<div class="btnrow" style="margin-top:10px"><button class="btn danger sm" id="k-del"></button></div>'}
    <div id="k-err"></div>`;

  if (!nueva && c.activa && c.tipo === 'certificado') {
    h = `<div class="btnrow" style="margin-bottom:14px">${chipEstado(c)}</div>
      <div class="btnrow" style="margin-bottom:16px"><button class="btn sm pri" id="k-renovar">⟳ Renovar</button><button class="btn sm vio" id="k-liquidar">✓ Liquidar</button></div>` + h;
  } else if (!nueva && c.activa && C.esAhorro(c)) {
    h = `<div class="btnrow" style="margin-bottom:16px"><button class="btn sm" id="k-sacar">↑ Sacar sin que sea gasto</button><button class="btn sm" id="k-meter">↓ Meter</button></div>` + h;
  }
  abrirHoja(nueva ? 'Nueva cuenta' : c.nombre, h, () => {
    const bR = $('#k-renovar'), bL = $('#k-liquidar'), bS = $('#k-sacar'), bM = $('#k-meter');
    if (bR) bR.addEventListener('click', () => abrirRenovar(c));
    if (bL) bL.addEventListener('click', () => abrirLiquidar(c));
    if (bS) bS.addEventListener('click', () => abrirNuevo('sacar', { cuenta_origen: c.id }));
    if (bM) bM.addEventListener('click', () => abrirNuevo('ahorrar', { cuenta_destino: c.id }));
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

// ── Certificados: renovar y liquidar ───────────────────────────
function infoCuenta(c) {
  return `<div class="info">
    <div><span>Saldo según la app</span><b>${dinero(c.saldo, c.moneda)}</b></div>
    ${c.vence ? `<div><span>Vencimiento</span><b>${fechaLarga(c.vence)}</b></div>` : ''}
    ${c.tasa ? `<div><span>Tasa</span><b>${(c.tasa * 100).toFixed(2).replace('.', ',')}% anual</b></div>` : ''}
  </div>`;
}

function convertir(monto, de, a) {
  const t = tcambio();
  if (de === a || !t) return monto;
  return de === 'USD' ? monto * t : monto / t;
}

function abrirRenovar(c) {
  if (!c) return;
  const h = `${infoCuenta(c)}
    <div class="fld"><label for="r-monto">¿Cuánto tiene ahora, con los intereses? (${c.moneda === 'USD' ? 'dólares' : 'colones'})</label>
      <input class="inp money" id="r-monto" type="number" inputmode="decimal" step="any" value="${(Math.round(c.saldo * 100) / 100)}"></div>
    <div class="row2">
      <div class="fld"><label for="r-vence">Nueva fecha de vencimiento</label><input class="inp" id="r-vence" type="date"></div>
      <div class="fld"><label for="r-tasa">Nueva tasa anual %</label><input class="inp" id="r-tasa" type="number" inputmode="decimal" step="any" value="${c.tasa ? +(c.tasa * 100).toFixed(3) : ''}"></div>
    </div>
    <p class="nota" style="margin:-4px 0 14px">Si el monto subió, la diferencia queda como <b>intereses ganados</b> (ingreso). Si bajó porque sacaste una parte, esa parte pasa a tu cuenta principal (no es gasto).</p>
    <button class="btn pri wide" id="r-ok">Renovar certificado</button><div id="r-err"></div>`;
  abrirHoja('Renovar ' + c.nombre, h, () => {
    $('#r-ok').addEventListener('click', () => {
      const nuevo = num($('#r-monto').value), vence = $('#r-vence').value;
      if (!vence) { $('#r-err').innerHTML = '<p class="err">Poné la nueva fecha de vencimiento.</p>'; return; }
      if (vence <= C.hoyISO()) { $('#r-err').innerHTML = '<p class="err">La nueva fecha tiene que ser después de hoy.</p>'; return; }
      const diff = Math.round((nuevo - c.saldo) * 100) / 100;
      const pri = principal();
      const tasa = $('#r-tasa').value ? num($('#r-tasa').value) / 100 : c.tasa;
      cerrar();
      hacer(async () => {
        if (diff > 0) {
          await db.guardarMovimiento({ tipo: 'ingreso', monto: diff, fecha: C.hoyISO(), cuenta_destino: c.id,
            categoria: 'Intereses', descripcion: 'Intereses de ' + c.nombre });
        } else if (diff < 0 && pri) {
          const sale = -diff;
          await db.guardarMovimiento({ tipo: 'transferencia', monto: sale, fecha: C.hoyISO(), cuenta_origen: c.id, cuenta_destino: pri.id,
            monto_destino: pri.moneda !== c.moneda ? Math.round(convertir(sale, c.moneda, pri.moneda) * 100) / 100 : null,
            descripcion: 'Parte retirada al renovar ' + c.nombre });
        }
        await db.guardarCuenta({ id: c.id, vence, tasa, activa: true });
      }, 'Certificado renovado hasta el ' + fechaCorta(vence));
    });
  });
}

function abrirLiquidar(c) {
  if (!c) return;
  const destinos = activas().filter((x) => x.id !== c.id && x.tipo !== 'certificado');
  const pri = principal();
  const sel = (destinos.find((x) => pri && x.id === pri.id) || destinos[0] || {}).id;
  const h = `${infoCuenta(c)}
    <div class="fld"><label for="l-monto">¿Cuánto te depositaron en total? (${c.moneda === 'USD' ? 'dólares' : 'colones'})</label>
      <input class="inp money" id="l-monto" type="number" inputmode="decimal" step="any" value="${(Math.round(c.saldo * 100) / 100)}"></div>
    <div class="fld"><label for="l-dest">¿A cuál cuenta llegó?</label><select class="inp" id="l-dest">${opcionesCuentas(destinos, sel)}</select></div>
    <div class="fld" id="l-md-wrap" hidden><label for="l-md" id="l-md-lbl">Monto que llega</label>
      <input class="inp" id="l-md" type="number" inputmode="decimal" step="any"></div>
    <div class="fld"><label for="l-fecha">Fecha</label><input class="inp" id="l-fecha" type="date" value="${C.hoyISO()}"></div>
    <p class="nota" style="margin:-4px 0 14px">La plata pasa a esa cuenta (no es gasto) y el certificado queda como <b>liquidado</b> en el historial, sin contar en tu total. Si te dieron más de lo que dice la app, la diferencia queda como intereses.</p>
    <button class="btn pri wide" id="l-ok">Liquidar certificado</button><div id="l-err"></div>`;
  abrirHoja('Liquidar ' + c.nombre, h, () => {
    const dest = $('#l-dest'), wrap = $('#l-md-wrap'), md = $('#l-md'), mt = $('#l-monto');
    const revisar = () => {
      const d = cuenta(dest.value);
      const distinta = d && d.moneda !== c.moneda;
      wrap.hidden = !distinta;
      if (distinta) {
        $('#l-md-lbl').textContent = `Llegan (en ${d.moneda === 'USD' ? 'dólares' : 'colones'})`;
        if (!md.dataset.tocado) md.value = (Math.round(convertir(num(mt.value), c.moneda, d.moneda) * 100) / 100).toString();
      }
    };
    dest.addEventListener('change', revisar); mt.addEventListener('input', revisar);
    md.addEventListener('input', () => { md.dataset.tocado = '1'; });
    revisar();
    $('#l-ok').addEventListener('click', () => {
      const total = num(mt.value), fecha = $('#l-fecha').value || C.hoyISO();
      const d = cuenta(dest.value);
      if (!d) { $('#l-err').innerHTML = '<p class="err">Elegí a cuál cuenta llegó la plata.</p>'; return; }
      if (total <= 0) { $('#l-err').innerHTML = '<p class="err">Poné cuánto te depositaron.</p>'; return; }
      const diff = Math.round((total - c.saldo) * 100) / 100;
      cerrar();
      hacer(async () => {
        if (diff > 0) {
          await db.guardarMovimiento({ tipo: 'ingreso', monto: diff, fecha, cuenta_destino: c.id, categoria: 'Intereses', descripcion: 'Intereses de ' + c.nombre });
        } else if (diff < 0) {
          await db.guardarMovimiento({ tipo: 'gasto', monto: -diff, fecha, cuenta_origen: c.id, categoria: 'Otros', bolsa: 'Necesidades',
            descripcion: 'Comisión o penalización de ' + c.nombre });
        }
        await db.guardarMovimiento({ tipo: 'transferencia', monto: total, fecha, cuenta_origen: c.id, cuenta_destino: d.id,
          monto_destino: d.moneda !== c.moneda ? num(md.value) || null : null, descripcion: 'Liquidé ' + c.nombre });
        await db.guardarCuenta({ id: c.id, activa: false });
      }, c.nombre + ' liquidado');
    });
  });
}

// ── Apartar la mitad de un pago grande ─────────────────────────
function apartar(itemId, dia) {
  const it = S.plan.find((x) => x.id === itemId);
  if (!it) return;
  const x = C.apartadosDelMes(S, dia.slice(0, 7)).find((y) => y.it.id === itemId && y.dia === dia);
  const mes = dia.slice(0, 7);
  const destino = cuenta(it.cuenta_apartado), pri = principal();
  hacer(async () => {
    let movId = null;
    if (destino && pri && destino.id !== pri.id && x) {
      const monto = Math.round(convertir(x.monto, 'CRC', pri.moneda) * 100) / 100;
      const g = await db.guardarMovimiento({ tipo: 'transferencia', monto, fecha: C.hoyISO() < dia ? C.hoyISO() : dia,
        cuenta_origen: pri.id, cuenta_destino: destino.id,
        monto_destino: destino.moneda !== pri.moneda ? Math.round(convertir(monto, pri.moneda, destino.moneda) * 100) / 100 : null,
        descripcion: 'Apartado para ' + it.nombre });
      movId = g.id;
    }
    await db.marcarPago(itemId, mes, 'apartado', movId, dia);
  }, 'Apartado ✓ ' + (x ? crc(x.monto) : ''));
}
function desapartar(itemId, dia) {
  const mes = dia.slice(0, 7);
  const marca = (S.pagosMes || []).find((r) => r.plan_item === itemId && r.mes === mes && r.parte === dia);
  hacer(async () => {
    await db.desmarcarPago(itemId, mes, dia);
    if (marca && marca.movimiento) await db.borrarMovimiento(marca.movimiento);
  }, 'Desmarcado');
}

// ── Marcar un pago fijo como pagado ────────────────────────────
function abrirPagar(it) {
  if (!it) return;
  const P = C.pagosDelMes(S, S.mes);
  const x = P.lista.find((y) => y.it.id === it.id);
  const pri = principal();
  const lista = activas();
  const sel = (cuenta(it.cuenta_apartado) || pri || lista[0] || {}).id;
  const c0 = cuenta(sel);
  const montoIni = c0 ? convertir(x ? x.monto : 0, 'CRC', c0.moneda) : (x ? x.monto : 0);
  const [y, m] = S.mes.split('-').map(Number);
  const ult = new Date(y, m, 0).getDate();
  const fechaSug = S.mes === C.hoyMes() ? C.hoyISO() : `${S.mes}-${String(Math.min(it.dia_cobro || ult, ult)).padStart(2, '0')}`;
  const h = `<div class="info">
      <div><span>${esc(it.nombre)}</span><b>${it.moneda === 'USD' ? usd(it.monto) + ' ≈ ' : ''}${crc(x ? x.monto : 0)}</b></div>
      ${it.dia_cobro ? `<div><span>Se cobra</span><b>el ${it.dia_cobro} de cada mes</b></div>` : ''}
    </div>
    <div class="fld"><label for="pg-monto" id="pg-lbl">Monto${c0 ? ' en ' + (c0.moneda === 'USD' ? 'dólares' : 'colones') : ''}</label>
      <input class="inp money" id="pg-monto" type="number" inputmode="decimal" step="any" value="${Math.round(montoIni * 100) / 100}"></div>
    <div class="row2">
      <div class="fld"><label for="pg-cuenta">¿De dónde salió?</label><select class="inp" id="pg-cuenta">${opcionesCuentas(lista, sel)}</select></div>
      <div class="fld"><label for="pg-fecha">Fecha</label><input class="inp" id="pg-fecha" type="date" value="${fechaSug}"></div>
    </div>
    <button class="btn pri wide" id="pg-ok">Anotar el gasto y marcar pagado</button>
    <div class="btnrow" style="margin-top:10px"><button class="btn sm" id="pg-solo">Ya lo había anotado: solo marcar</button></div>
    <div id="pg-err"></div>`;
  abrirHoja('Ya se pagó', h, () => {
    $('#pg-cuenta').addEventListener('change', () => {
      const c = cuenta($('#pg-cuenta').value);
      if (!c) return;
      $('#pg-lbl').textContent = 'Monto en ' + (c.moneda === 'USD' ? 'dólares' : 'colones');
      $('#pg-monto').value = Math.round(convertir(x ? x.monto : 0, 'CRC', c.moneda) * 100) / 100;
    });
    $('#pg-ok').addEventListener('click', () => {
      const monto = num($('#pg-monto').value);
      if (monto <= 0) { $('#pg-err').innerHTML = '<p class="err">Poné el monto.</p>'; return; }
      const fila = { tipo: 'gasto', monto, fecha: $('#pg-fecha').value || C.hoyISO(), cuenta_origen: $('#pg-cuenta').value,
        categoria: C.categoriaDeItem(it), bolsa: it.bolsa || 'Necesidades', medio: it.medio || 'Az', descripcion: it.nombre };
      cerrar();
      hacer(async () => {
        const g = await db.guardarMovimiento(fila);
        await db.marcarPago(it.id, S.mes, 'pagado', g.id);
      }, it.nombre + ' pagado ✓');
    });
    $('#pg-solo').addEventListener('click', () => { cerrar(); hacer(() => db.marcarPago(it.id, S.mes, 'pagado'), it.nombre + ' marcado como pagado'); });
  });
}

// ── Pagos fijos: crear y editar ────────────────────────────────
function abrirPlan(it) {
  const nuevo = !it.id;
  const titulo = { suscripcion: 'Suscripción', fijo: 'Gasto fijo', universidad: 'Universidad' }[it.tipo];
  const meses = Array.isArray(it.meses) ? it.meses : [];
  let h = `<div class="fld"><label for="p-nombre">Nombre</label><input class="inp" id="p-nombre" value="${esc(it.nombre || '')}" placeholder="${it.tipo === 'suscripcion' ? 'Netflix' : it.tipo === 'fijo' ? 'Luz' : 'Cuatrimestre'}"></div>
    <div class="row2">
      <div class="fld"><label for="p-monto">${it.tipo === 'universidad' ? 'Total del cuatrimestre' : 'Monto'}</label>
        <input class="inp money" id="p-monto" type="number" inputmode="decimal" step="any" value="${esc(it.monto ?? '')}"></div>
      <div class="fld"><label for="p-moneda">Moneda</label><select class="inp" id="p-moneda">
        ${['CRC', 'USD'].map((x) => `<option${(it.moneda || (it.tipo === 'suscripcion' ? 'USD' : 'CRC')) === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="row2">
      <div class="fld"><label for="p-dia">Día de cobro (1 a 31)</label>
        <input class="inp" id="p-dia" type="number" inputmode="numeric" min="1" max="31" value="${esc(it.dia_cobro ?? '')}" placeholder="${it.tipo === 'fijo' ? 'Vacío si es del día a día' : 'Ej: 2, 14, 30'}"></div>`;
  if (it.tipo === 'universidad') {
    h += `<div class="fld"><label for="p-pagos">¿En cuántos pagos?</label><input class="inp" id="p-pagos" type="number" inputmode="numeric" value="${esc(it.pagos ?? 3)}"></div></div>`;
  } else {
    h += `<div class="fld"><label for="p-per">Cada cuánto</label><select class="inp" id="p-per">
        ${[['mensual', 'Al mes'], ['quincenal', 'Por quincena'], ['anual', 'Al año']]
          .map(([k, l]) => `<option value="${k}"${(it.periodicidad || 'mensual') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="fld" id="p-anual-wrap"${it.periodicidad === 'anual' ? '' : ' hidden'}><label for="p-cobro">Fecha del cobro anual</label>
        <input class="inp" id="p-cobro" type="date" value="${esc(it.proximo_cobro || '')}"></div>`;
  }
  h += `<div class="fld"><label>¿En qué meses se cobra? <span style="font-weight:600">(ninguno marcado = todos)</span></label>
      <div class="filtros" style="flex-wrap:wrap">${C.MESES.map((nm, i) => `<button type="button" class="btn sm" data-mes-chip="${i + 1}" aria-pressed="${meses.includes(i + 1)}">${nm.slice(0, 3)}</button>`).join('')}</div></div>
    <div class="row2">
      <div class="fld"><label for="p-bolsa">Bolsa</label><select class="inp" id="p-bolsa">
        ${['Necesidades', 'Suscripciones'].map((b) => `<option${(it.bolsa || (it.tipo === 'suscripcion' ? 'Suscripciones' : 'Necesidades')) === b ? ' selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="fld"><label for="p-medio">Se paga con</label><select class="inp" id="p-medio">
        ${['Az', 'Black', 'Roja', 'SINPE', 'Efectivo'].map((x) => `<option${(it.medio || 'Az') === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <label class="check"><input type="checkbox" id="p-dividir"${it.dividir || (nuevo && it.tipo === 'universidad') ? ' checked' : ''}><span>Apartar la mitad en cada quincena<br><span class="sub">Te recuerdo en los dos pagos antes del cobro cuánto meter, para no sacarlo todo de una vez.</span></span></label>
    <div class="fld" id="p-cuenta-wrap"${it.dividir || (nuevo && it.tipo === 'universidad') ? '' : ' hidden'}><label for="p-cuenta">¿Dónde lo apartás? (opcional)</label>
      <select class="inp" id="p-cuenta"><option value="">Lo dejo en mi cuenta principal, solo recordame</option>${activas().filter((c) => c.tipo !== 'certificado').map((c) => `<option value="${esc(c.id)}"${it.cuenta_apartado === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></div>
    <div class="fld"><label for="p-palabras">Palabras para reconocer el cobro en tus gastos (separadas por coma)</label>
      <input class="inp" id="p-palabras" value="${esc(it.palabras || '')}" placeholder="${it.tipo === 'suscripcion' ? 'netflix' : 'luz, cnfl'}"></div>
    <div class="fld"><label for="p-notas">Notas</label><input class="inp" id="p-notas" value="${esc(it.notas || '')}"></div>
    <label class="check"><input type="checkbox" id="p-activo"${it.activo === false ? '' : ' checked'}><span>Activo<br><span class="sub">Apagalo para sacarlo del plan sin borrarlo (por ejemplo, si cancelás la suscripción).</span></span></label>
    <button class="btn pri wide" id="p-save">Guardar</button>
    ${nuevo ? '' : '<div class="btnrow" style="margin-top:10px"><button class="btn danger sm" id="p-del"></button></div>'}
    <div id="p-err"></div>`;

  abrirHoja((nuevo ? 'Nueva: ' : '') + titulo, h, () => {
    $$('[data-mes-chip]').forEach((b) => b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    }));
    const per = $('#p-per');
    if (per) per.addEventListener('change', () => { $('#p-anual-wrap').hidden = per.value !== 'anual'; });
    $('#p-dividir').addEventListener('change', () => { $('#p-cuenta-wrap').hidden = !$('#p-dividir').checked; });
    $('#p-save').addEventListener('click', () => {
      const nombre = $('#p-nombre').value.trim();
      if (!nombre) { $('#p-err').innerHTML = '<p class="err">Ponele nombre.</p>'; return; }
      const dia = $('#p-dia').value ? Math.round(num($('#p-dia').value)) : null;
      if (dia !== null && (dia < 1 || dia > 31)) { $('#p-err').innerHTML = '<p class="err">El día de cobro va del 1 al 31.</p>'; return; }
      const mesesSel = $$('[data-mes-chip]').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => +b.dataset.mesChip);
      const fila = {
        id: it.id, tipo: it.tipo, nombre, monto: num($('#p-monto').value), moneda: $('#p-moneda').value,
        bolsa: $('#p-bolsa').value, medio: $('#p-medio').value, notas: $('#p-notas').value.trim() || null,
        activo: $('#p-activo').checked, dia_cobro: dia, meses: mesesSel.length ? mesesSel : null,
        palabras: $('#p-palabras').value.trim() || null,
        dividir: $('#p-dividir').checked,
        cuenta_apartado: $('#p-dividir').checked ? ($('#p-cuenta').value || null) : null,
      };
      if (it.tipo === 'universidad') {
        Object.assign(fila, { periodicidad: 'cuatrimestral', pagos: Math.max(1, Math.round(num($('#p-pagos').value)) || 3) });
      } else {
        Object.assign(fila, { periodicidad: per.value, proximo_cobro: per.value === 'anual' ? ($('#p-cobro').value || null) : null });
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
  a.href = url; a.download = `dra-betty-${C.hoyISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ════════════════════════════════════════════════════════════════
//  Correos del banco (los manda el script de Gmail)
// ════════════════════════════════════════════════════════════════
function fechaHora(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return `${fechaCorta(C.hoyISO(d))}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sumarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return C.hoyISO(d);
}

const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** La cuenta donde cae lo que avisa cada banco: la que tenga el banco en el nombre, o la principal. */
function cuentaDeBanco(banco) {
  const b = normal(banco);
  const re = /bac/.test(b) ? /\bbac\b|credomatic/ : /popular/.test(b) ? /popular/ : null;
  const opciones = activas().filter((c) => !C.esAhorro(c));
  return (re && opciones.find((c) => re.test(normal(c.nombre)))) || principal();
}

function convertirA(monto, de, a) {
  if (de === a) return monto;
  const t = tcambio();
  if (!t) return null;
  return de === 'USD' ? monto * t : monto / t;
}

/** Lee el correo con el mismo lector de "Pegar el correo" y arma el movimiento. */
function leerCorreoBanco(c) {
  if (c._r) return c;
  const r = parsearCorreo(c.cuerpo || c.asunto || '', tcambio());
  c._r = r;
  const cta = cuentaDeBanco(c.banco);
  c._cta = cta;
  if (!r.ok || !cta) return c;
  let monto = convertirA(r.monto, r.moneda, cta.moneda);
  if (monto == null) return c;   // sin tipo de cambio no se puede anotar solo
  monto = Math.round(monto * 100) / 100;
  const nota = r.moneda === cta.moneda ? '' : r.moneda === 'USD' ? ` (US$${r.monto.toFixed(2)})` : ` (₡${miles(Math.round(r.monto))})`;
  const desc = (r.descripcion || '').slice(0, 120) + nota;
  if (r.tipo === 'ingreso') {
    c._fila = { tipo: 'ingreso', monto, fecha: r.fecha, cuenta_destino: cta.id, categoria: 'Otro', descripcion: desc };
  } else {
    const cat = C.CATEGORIAS.includes(r.categoria) ? r.categoria : 'Otros';
    c._fila = { tipo: 'gasto', monto, fecha: r.fecha, cuenta_origen: cta.id, categoria: cat,
                bolsa: C.CAT_BOLSA[cat], medio: r.medio || 'Az', descripcion: desc };
  }
  // ¿ya está anotado a mano? mismo tipo, mismo monto y fecha a un día de distancia.
  // Los que vinieron de otro correo no cuentan: dos cobros iguales el mismo día son dos cobros.
  const crcDe = (m) => C.movCRC(m, ixCuentas(), tcambio());
  const objetivo = crcDe(c._fila);
  const deCorreo = S.movCorreo || new Set();
  c._rep = S.movimientos.find((m) => m.tipo === c._fila.tipo && !deCorreo.has(m.id)
    && Math.abs(new Date(m.fecha) - new Date(c._fila.fecha)) <= 864e5 * 1.01
    && Math.abs(crcDe(m) - objetivo) <= Math.max(1, objetivo * 0.01)) || null;
  return c;
}

/** listos: se anotan solos · revisar: los que necesitan un ojo (repetidos, movidas propias, sin tipo de cambio) */
function bandeja() {
  const listos = [], revisar = [], raros = [];
  (S.correos || []).forEach((c) => {
    leerCorreoBanco(c);
    if (c._r.ok && c._fila && !c._rep) listos.push(c);
    else if (c._r.ok || c._r.propia) revisar.push(c);
    else if (!c._r.ignorar) raros.push(c);
  });
  revisar.sort((a, b) => (b._r.fecha || '').localeCompare(a._r.fecha || ''));
  return { listos, revisar, raros };
}

/** Autorizaciones en cero no son cobros: se descartan solas. */
function limpiarBandeja() {
  const fuera = (S.correos || []).filter((c) => { leerCorreoBanco(c); return c._r.ignorar; });
  if (!fuera.length) return;
  S.correos = S.correos.filter((c) => !fuera.includes(c));
  db.marcarCorreos(fuera.map((c) => c.id), 'descartado').catch(() => {});
}

/** Lo que llega del banco se anota solo, sin tocar nada. */
let anotandoSolos = false;
async function anotarSolos() {
  if (anotandoSolos) return;
  const lista = bandeja().listos;
  if (!lista.length) return;
  anotandoSolos = true;
  let n = 0;
  try {
    for (const c of lista) {
      if (!(await db.tomarCorreo(c.id))) continue;   // ya lo anotó otro dispositivo
      try {
        const g = await db.guardarMovimiento(c._fila);
        await db.marcarCorreo(c.id, 'anotado', g.id);
        n++;
      } catch (e) {
        await db.marcarCorreo(c.id, 'pendiente').catch(() => {});
        throw e;
      }
    }
  } catch (e) {
    toast(e.message, true);
  } finally {
    anotandoSolos = false;
  }
  if (n) {
    toast(`Anoté ${n} movimiento${n === 1 ? '' : 's'} del banco`);
    await recargar();
  }
}

function vBandeja() {
  const { revisar, raros } = bandeja();
  if (!revisar.length && !raros.length) return '';
  const max = S.verBandeja ? revisar.length : 5;
  let h = `<div class="card bandeja"><h2>Del banco <small>${revisar.length ? revisar.length + ' para revisar' : ''}</small></h2>`;
  revisar.slice(0, max).forEach((c) => {
    const r = c._r, fila = c._fila, rep = c._rep;
    const monto = r.moneda === 'USD' ? usd(r.monto) : crc(r.monto);
    if (r.propia) {
      h += `<div class="correo">
        <div class="t1">Movida entre tus cuentas${r.descripcion ? ' · ' + esc(r.descripcion) : ''}</div>
        <div class="amt tr">⇄ ${monto}</div>
        <div class="t2"><span class="dot" style="background:var(--dim)"></span>${r.entra ? 'Entró a' : 'Salió de'} ${esc((c._cta || {}).nombre || c.banco || '')} · ${fechaCorta(r.fecha)}</div>
        <div class="acciones"><button class="btn sm pri" data-correo-movida="${esc(c.id)}">Anotar movida</button>
          <button class="btn sm" data-correo-no="${esc(c.id)}">No anotar</button></div></div>`;
      return;
    }
    const esIng = r.tipo === 'ingreso';
    const col = esIng ? 'var(--aho)' : (BCOLOR[fila && fila.bolsa] || 'var(--dim)');
    const porque = rep ? `<span class="chip pronto" title="Hay un movimiento igual: ${esc(rep.descripcion || rep.categoria || '')}">¿Ya lo anotaste?</span>`
      : !fila ? '<span class="chip pronto">Falta el tipo de cambio</span>' : '';
    h += `<div class="correo">
      <div class="t1">${esc(r.descripcion || c.asunto || 'Movimiento')}</div>
      <div class="amt${esIng ? ' pos' : ''}">${esIng ? '+' : ''}${monto}${fila && r.moneda !== (c._cta || {}).moneda ? `<small>${dinero(fila.monto, c._cta.moneda)}</small>` : ''}</div>
      <div class="t2"><span class="dot" style="background:${col}"></span>${esc(esIng ? 'Te entró' : r.categoria)} · ${esc(c.banco || '')} · ${fechaCorta(r.fecha)} ${porque}</div>
      <div class="acciones">
        ${fila ? `<button class="btn sm${rep ? '' : ' pri'}" data-correo-anotar="${esc(c.id)}">${rep ? 'Es otro, anotalo' : 'Anotar'}</button>` : ''}
        <button class="btn sm" data-correo-revisar="${esc(c.id)}">Revisar</button>
        <button class="btn sm${rep ? ' pri' : ''}" data-correo-no="${esc(c.id)}">${rep ? 'Ya está' : 'No anotar'}</button>
      </div></div>`;
  });
  if (revisar.length > max) h += `<button class="btn sm" data-correo-mas="1">Ver los ${revisar.length - max} que faltan</button>`;
  if (raros.length) {
    h += `<details class="raros"><summary>${raros.length} correo${raros.length === 1 ? '' : 's'} que no entendí</summary>
      ${raros.map((c) => `<div class="correo">
        <div class="t1">${esc(c.asunto || 'Correo del banco')}</div>
        <div class="t2">${esc(c.banco || '')} · ${c.recibido ? fechaCorta(C.hoyISO(new Date(c.recibido))) : ''}</div>
        <div class="acciones"><button class="btn sm" data-correo-revisar="${esc(c.id)}">Anotar a mano</button>
          <button class="btn sm" data-correo-no="${esc(c.id)}">No anotar</button></div></div>`).join('')}
      <p class="nota">Si un correo así sí era un gasto, anotalo a mano. Si se repite, avisame y le enseño a la Dra. Betty a leerlo.</p></details>`;
  }
  return h + '</div>';
}

function correoPorId(id) { return (S.correos || []).find((c) => c.id === id); }

function anotarCorreo(id) {
  const c = correoPorId(id);
  if (!c) return;
  leerCorreoBanco(c);
  if (!c._fila) { revisarCorreo(id); return; }
  const f = c._fila;
  hacer(async () => {
    const g = await db.guardarMovimiento(f);
    await db.marcarCorreo(id, 'anotado', g.id);
  }, `Anotado: ${f.descripcion || f.categoria}`);
}

function movidaCorreo(id) {
  const c = correoPorId(id);
  if (!c) return;
  leerCorreoBanco(c);
  const r = c._r, cta = c._cta;
  const otra = activas().find((x) => !cta || x.id !== cta.id);
  abrirNuevo('mover', {
    _correo: id, fecha: r.fecha, monto: r.monto, descripcion: r.descripcion || '',
    cuenta_origen: r.entra ? (otra && otra.id) : (cta && cta.id),
    cuenta_destino: r.entra ? (cta && cta.id) : (otra && otra.id),
  });
}

function revisarCorreo(id) {
  const c = correoPorId(id);
  if (!c) return;
  leerCorreoBanco(c);
  const r = c._r;
  if (!r.ok) {
    abrirNuevo('gasto', { _correo: id, descripcion: c.asunto || '', fecha: c.recibido ? C.hoyISO(new Date(c.recibido)) : C.hoyISO() });
    return;
  }
  const f = c._fila || {};
  const modo = r.tipo === 'ingreso' ? 'ingreso' : 'gasto';
  abrirNuevo(modo, {
    _correo: id, fecha: r.fecha, descripcion: f.descripcion || r.descripcion,
    monto: f.monto ?? r.monto, categoria: modo === 'ingreso' ? 'Otro' : (f.categoria || r.categoria),
    bolsa: f.bolsa, medio: r.medio,
  });
}

async function conectarGmail() {
  cerrar();
  let llave, plantilla;
  try {
    [llave, plantilla] = await Promise.all([
      db.crearLlaveBuzon(),
      fetch('gmail/DraBettyCorreos.gs', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error('No encontré el script en la página. Subí también la carpeta gmail a GitHub.');
        return r.text();
      }),
    ]);
  } catch (e) { toast(e.message, true); return; }
  const cx = db.conexion();
  const ult = S.movimientos.reduce((mx, m) => (m.fecha > mx ? m.fecha : mx), '');
  // desde el día después del último movimiento (lo de antes ya está anotado),
  // pero al menos 3 días atrás por si ya fuiste anotando cosas a mano
  let desde = ult ? sumarDias(ult, 1) : sumarDias(C.hoyISO(), -7);
  if (desde > sumarDias(C.hoyISO(), -3)) desde = sumarDias(C.hoyISO(), -3);
  const script = plantilla.replace('__URL__', cx.url).replace('__KEY__', cx.key)
    .replace('__LLAVE__', llave).replace('__DESDE__', desde);
  abrirHoja('Conectar Gmail', `
    <ol class="pasos">
      <li>Tocá <b>Copiar el script</b>.</li>
      <li>Abrí <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> con tu cuenta de Gmail del banco. Se abre un proyecto nuevo.</li>
      <li>Borrá lo que trae, pegá el script y guardá (💾).</li>
      <li>Arriba elegí <b>instalar</b> y tocá <b>▶ Ejecutar</b>.</li>
      <li>Google pide permiso: <i>Revisar permisos → tu cuenta → Configuración avanzada → Ir al proyecto → Permitir</i>.</li>
      <li>Listo. En unos minutos los correos desde el ${fechaLarga(desde)} aparecen en Inicio.</li>
    </ol>
    <button class="btn pri wide" id="copiar-script">Copiar el script</button>
    <textarea class="inp script" id="txt-script" readonly aria-label="Script para Google">${esc(script)}</textarea>
    <p class="nota">Este script trae tu llave del buzón: no lo compartas. Solo sirve para meter correos en tu bandeja; no puede ver ni cambiar nada más.</p>`, () => {
    $('#copiar-script').addEventListener('click', async () => {
      const t = $('#txt-script');
      try { await navigator.clipboard.writeText(script); toast('Script copiado'); }
      catch (_) { t.focus(); t.select(); toast('Ya quedó seleccionado: copialo con Ctrl+C'); }
    });
  });
  recargar();
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

// ── Fondo: las imágenes se van alternando ──────────────────────
const FONDOS = [
  { src: 'img/fondo-1.jpg', pos: 'center 70%' },
  { src: 'img/fondo-2.jpg', pos: 'center' },
  { src: 'img/fondo-3.jpg', pos: '40% center' },
  { src: 'img/fondo-4.jpg', pos: '35% center' },
];
const LS_FONDO = 'drabetty.fondo';
let fondoI = 0, fondoCapa = 0, fondoTimer = null;
try { fondoI = (+localStorage.getItem(LS_FONDO) || 0) % FONDOS.length; } catch (_) {}
function ponerFondo(i) {
  fondoI = (i + FONDOS.length) % FONDOS.length;
  const f = FONDOS[fondoI];
  const capas = [$('#fondo-a'), $('#fondo-b')];
  const nueva = capas[fondoCapa ^ 1], vieja = capas[fondoCapa];
  const img = new Image();
  img.onload = () => {
    nueva.style.backgroundImage = `url("${f.src}")`;
    nueva.style.backgroundPosition = f.pos;
    nueva.classList.add('ver'); vieja.classList.remove('ver');
    fondoCapa ^= 1;
  };
  img.src = f.src;
  try { localStorage.setItem(LS_FONDO, String(fondoI)); } catch (_) {}
}
function rotarFondos() {
  clearInterval(fondoTimer);
  fondoTimer = setInterval(() => { if (document.visibilityState === 'visible') ponerFondo(fondoI + 1); }, 30000);
}
ponerFondo(fondoI);
rotarFondos();
$('#sig-fondo').addEventListener('click', () => { ponerFondo(fondoI + 1); rotarFondos(); });
$('#btn-ajustes').addEventListener('click', abrirAjustes);

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
