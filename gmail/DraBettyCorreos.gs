// ════════════════════════════════════════════════════════════════
//  DRA. BETTY — lector de correos del banco
//
//  Este script no tiene pantalla. Cada 15 minutos mira tus etiquetas
//  de Gmail del banco y le pasa los correos nuevos a la Dra. Betty.
//  La app los lee y te los deja en Inicio listos para anotar.
//
//  Para ponerlo a andar (una sola vez):
//    1. script.google.com → Nuevo proyecto → borrá lo que trae y pegá todo esto.
//    2. Arriba elegí la función  instalar  y tocá ▶ Ejecutar.
//    3. Google te pide permiso: Revisar permisos → tu cuenta → Configuración
//       avanzada → Ir al proyecto → Permitir.
//    4. Listo. Abrí la app: los correos aparecen en Inicio.
//
//  No importa si ya abriste el correo en Gmail: igual se lee.
//  No marca nada como leído ni cambia nada en tu Gmail.
// ════════════════════════════════════════════════════════════════

const BETTY = {
  URL:    '__URL__',
  KEY:    '__KEY__',      // llave pública de la app (es la misma que va en el código de la página)
  LLAVE:  '__LLAVE__',    // llave del buzón: solo deja meter correos en TU bandeja. No la compartas.
  LABELS: ['Banco Popular', 'BAC'],
  DESDE:  '__DESDE__',    // no manda correos anteriores a esta fecha (lo de antes ya está en la app)
  DIAS:   10,             // cuántos días hacia atrás revisa en cada vuelta
};

// ── 1. Instalar: crea la vuelta de cada 15 minutos y corre la primera ──
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarCorreos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarCorreos').timeBased().everyMinutes(15).create();
  enviarCorreos();
  Logger.log('✓ Instalado. Revisa tus correos del banco cada 15 minutos.');
}

// ── 2. Lo que corre cada 15 minutos ──
function enviarCorreos() {
  const props = PropertiesService.getScriptProperties();
  let enviados = {};
  try { enviados = JSON.parse(props.getProperty('enviados') || '{}'); } catch (e) { enviados = {}; }

  const desde = new Date(BETTY.DESDE + 'T00:00:00-06:00');
  const limite = new Date(Date.now() - BETTY.DIAS * 864e5);
  const corte = desde > limite ? desde : limite;
  let nuevos = 0, repetidos = 0, errores = 0;

  for (let i = 0; i < BETTY.LABELS.length; i++) {
    const nombre = BETTY.LABELS[i];
    const lab = GmailApp.getUserLabelByName(nombre);
    if (!lab) {
      Logger.log('✗ No existe la etiqueta "' + nombre + '". Tus etiquetas son: ' +
        GmailApp.getUserLabels().map(function (l) { return l.getName(); }).join(' | '));
      continue;
    }
    const hilos = lab.getThreads(0, 50);   // vienen del más nuevo al más viejo
    for (let h = 0; h < hilos.length; h++) {
      if (hilos[h].getLastMessageDate() < corte) break;
      const msgs = hilos[h].getMessages();
      for (let m = 0; m < msgs.length; m++) {
        const msg = msgs[m];
        const id = msg.getId();
        if (enviados[id] || msg.getDate() < corte) continue;
        const r = bettyEnviar(nombre, msg);
        if (r.ok) { enviados[id] = Date.now(); r.nuevo ? nuevos++ : repetidos++; }
        else {
          errores++;
          Logger.log('✗ No se pudo mandar "' + msg.getSubject() + '": ' + r.error);
          if (r.llaveMala) {
            Logger.log('La llave del buzón no sirve. En la app: Ajustes → Correos del banco → Conectar Gmail, y pegá el script nuevo.');
            return;
          }
        }
      }
    }
  }

  // Se olvida de los ids viejos para que la lista no crezca para siempre
  const viejo = Date.now() - (BETTY.DIAS + 5) * 864e5;
  Object.keys(enviados).forEach(function (k) { if (enviados[k] < viejo) delete enviados[k]; });
  props.setProperty('enviados', JSON.stringify(enviados));
  Logger.log('Correos nuevos: ' + nuevos + ' · ya estaban: ' + repetidos + ' · con error: ' + errores);
}

function bettyEnviar(banco, msg) {
  let cuerpo = '';
  try { cuerpo = bettyAchicar(msg.getBody()); } catch (e) {}
  if (!cuerpo.trim()) { try { cuerpo = msg.getPlainBody() || ''; } catch (e) {} }
  const res = UrlFetchApp.fetch(BETTY.URL + '/rest/v1/rpc/recibir_correo', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: BETTY.KEY },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      p_llave: BETTY.LLAVE,
      p_gmail_id: msg.getId(),
      p_banco: banco,
      p_asunto: msg.getSubject(),
      p_recibido: msg.getDate().toISOString(),
      p_cuerpo: cuerpo.slice(0, 38000),
    }),
  });
  const code = res.getResponseCode(), txt = res.getContentText();
  if (code === 200) return { ok: true, nuevo: txt.indexOf('nuevo') >= 0 };
  return { ok: false, error: code + ' ' + txt.slice(0, 200), llaveMala: /Llave inv/i.test(txt) };
}

// Le quita al HTML del banco lo que no sirve (estilos, imágenes, atributos)
// pero deja la estructura de la tabla, que es de donde la app saca los datos.
function bettyAchicar(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi, '<$1$2>')
    .replace(/<\/?(span|font|b|strong|i|em|a|u|center|img|o:p|small|big|html|body|table|tbody|thead|meta|link)>/gi, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
}

// ── Para revisar: muestra qué encontraría, sin mandar nada ──
function probar() {
  const desde = new Date(BETTY.DESDE + 'T00:00:00-06:00');
  BETTY.LABELS.forEach(function (nombre) {
    const lab = GmailApp.getUserLabelByName(nombre);
    if (!lab) { Logger.log('✗ No existe la etiqueta "' + nombre + '"'); return; }
    const hilos = lab.getThreads(0, 10);
    Logger.log('— ' + nombre + ': ' + hilos.length + ' hilos recientes');
    hilos.forEach(function (h) {
      h.getMessages().forEach(function (m) {
        if (m.getDate() >= desde) Logger.log('  ' + m.getDate().toISOString().slice(0, 10) + '  ' + m.getSubject());
      });
    });
  });
}

// ── Para apagarlo ──
function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Apagado. Ya no revisa correos.');
}
