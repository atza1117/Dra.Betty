// ════════════════════════════════════════════════════════════════
//  Lector de correos del banco (Banco Popular y BAC).
//  Recibe el texto (o el HTML) de un correo pegado y devuelve
//  monto, fecha, comercio y categoría. No toca la base de datos.
// ════════════════════════════════════════════════════════════════

const p2 = (n) => (n < 10 ? '0' : '') + n;

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function limpiarHTML(s) {
  s = String(s || '');
  if (s.indexOf('<') < 0) return s;
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|div|h[1-6]|li|td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  if (typeof document !== 'undefined') {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    s = t.value;
  } else {
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
         .replace(/&oacute;/g, 'ó').replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
         .replace(/&iacute;/g, 'í').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ');
  }
  return s.replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n');
}

function campo(txt, etiqueta) {
  const re = new RegExp(etiqueta + '\\s*:?\\s*\\n?\\s*([^\\n]+)', 'i');
  const m = txt.match(re);
  return m ? m[1].trim() : '';
}

export function leerMonto(s) {
  s = String(s || '').trim();
  const moneda = /USD|\$/i.test(s) ? 'USD' : 'CRC';
  const m = s.match(/(\d[\d.,]*)/);
  if (!m) return null;
  let n = m[1];
  if (/[.,]\d{2}$/.test(n)) {
    const sep = n.slice(-3, -2);
    const partes = n.split(sep);
    const dec = partes.pop();
    n = partes.join('').replace(/[.,]/g, '') + '.' + dec;
  } else {
    n = n.replace(/[.,]/g, '');
  }
  const v = parseFloat(n);
  return Number.isFinite(v) ? { monto: v, moneda } : null;
}

const MESES = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
                ene:1, abr:4, ago:8, dic:12, set:9 };

function leerFecha(txt) {
  let m = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = txt.match(/([A-Za-zÁÉÍÓÚáéíóú]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mm = MESES[m[1].toLowerCase().slice(0, 3)];
    if (mm) return `${m[3]}-${p2(mm)}-${p2(+m[2])}`;
  }
  return hoyISO();
}

export function categoriaComercio(c) {
  c = String(c || '').toLowerCase();
  if (/uber|didi|taxi|tochi|cabify/.test(c)) return 'Uber / taxi';
  if (/maxipali|walmart|automercado|masxmenos|mas x menos|super|fresh market|pali|am pm|minisuper|go market/.test(c)) return 'Supermercado';
  if (/netflix|spotify|apple|anthropic|crunchy|google|youtube|disney|paypal|prime|hbo/.test(c)) return 'Suscripción';
  if (/farmacia|fischel|farmavalue|medismart|medic|clinica|hospital/.test(c)) return 'Salud';
  if (/pizza|burger|kfc|spoon|subway|starbucks|restaur|pops|mcdonald|mc donald|musmanni|panaderia|panadero|cafe|freddo|moyo|grill|sushi|taco/.test(c)) return 'Comida fuera';
  if (/cenfotec|universidad|matricula/.test(c)) return 'Universidad';
  if (/sinpe tp|\bbus\b|pista|transporte publico/.test(c)) return 'Bus';
  if (/oneill|o neill|skechers|puma|adidas|nike|zara|forever|pequeno mundo/.test(c)) return 'Ropa';
  if (/\bice\b|kolbi|claro|movistar|liberty|cabletica/.test(c)) return 'Celular';
  return 'Otros';
}

export function categoriaSinpe(d) {
  d = String(d || '').toLowerCase();
  if (/audrey|mama|mami|laidy/.test(d)) return 'Mami';
  if (/lanna/.test(d)) return 'Lanna';
  if (/sibaja|fernandez|joram/.test(d)) return 'Familia otros';
  if (/cenfotec|universidad/.test(d)) return 'Universidad';
  if (/uber|didi|ride/.test(d)) return 'Uber / taxi';
  return 'Otros';
}

/**
 * @returns {{ok:true, tipo:'gasto'|'ingreso', monto:number, moneda:'CRC'|'USD',
 *            montoOriginal:number, fecha:string, categoria:string, medio:string,
 *            descripcion:string, aviso:string} | {ok:false, error:string}}
 */
export function parsearCorreo(raw, tipoCambio) {
  const txt = limpiarHTML(raw).replace(/ /g, ' ');
  if (!txt.trim()) return { ok: false, error: 'Pegá el correo primero.' };
  const tc = Number(tipoCambio) || 0;

  // ── SINPE ──
  if (/Tipo de [Mm]ovimiento|Referencia SINPE|Sinpe M[oó]vil/i.test(txt)) {
    const tipoMov = campo(txt, 'Tipo de [Mm]ovimiento');
    const idO = campo(txt, 'Identificaci[oó]n Origen');
    const idD = campo(txt, 'Identificaci[oó]n Destino');
    if (idO && idD && idO === idD) {
      return { ok: false, error: 'Es una transferencia entre tus propias cuentas (misma cédula). Anotala con "Mover plata", no como gasto.' };
    }
    const mm = leerMonto(campo(txt, 'Monto Enviado') || campo(txt, 'Monto Neto') || campo(txt, 'Monto'));
    if (!mm || !mm.monto) return { ok: false, error: 'No encontré el monto en este correo.' };
    const fecha = leerFecha(txt);
    if (/cr[eé]dito/i.test(tipoMov)) {
      const origen = campo(txt, 'Nombre Origen') || 'SINPE';
      return {
        ok: true, tipo: 'ingreso', monto: mm.monto, moneda: mm.moneda, montoOriginal: mm.monto,
        fecha, categoria: 'Ingreso', medio: 'SINPE',
        descripcion: 'SINPE de ' + origen.replace(/_+/g, ' ').trim().toLowerCase(),
        aviso: 'Es plata que te entró. Lo dejé como ingreso.',
      };
    }
    const dest = campo(txt, 'Nombre Destino') || 'SINPE';
    const nota = campo(txt, 'Descripci[oó]n');
    return {
      ok: true, tipo: 'gasto', monto: mm.monto, moneda: mm.moneda, montoOriginal: mm.monto,
      fecha, categoria: categoriaSinpe(dest), medio: 'SINPE',
      descripcion: 'SINPE a ' + dest.toLowerCase() + (nota ? ` (${nota})` : ''),
      aviso: '',
    };
  }

  // ── Compra con tarjeta ──
  if (!/COMPRA|Comercio/i.test(txt)) {
    return { ok: false, error: 'No reconozco este correo. Si el comprobante venía como adjunto, anotalo a mano.' };
  }
  const mc = leerMonto(campo(txt, 'Monto'));
  if (!mc) return { ok: false, error: 'No encontré el monto en este correo.' };
  if (!mc.monto) return { ok: false, error: 'El monto venía en cero: es solo una autorización, no un cobro.' };
  const comercio = campo(txt, 'Comercio') || 'Compra';
  const enCRC = mc.moneda === 'USD' && tc ? mc.monto * tc : mc.monto;
  return {
    ok: true, tipo: 'gasto', monto: mc.monto, moneda: mc.moneda, montoOriginal: mc.monto,
    montoCRC: enCRC, fecha: leerFecha(txt), categoria: categoriaComercio(comercio), medio: 'Az',
    descripcion: comercio,
    aviso: mc.moneda === 'USD'
      ? `Venía en dólares: $${mc.monto.toFixed(2)}${tc ? ` ≈ ₡${String(Math.round(enCRC)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : ''}.`
      : '',
  };
}
