// ════════════════════════════════════════════════════════════════
//  La Dra. Betty: una perezosa colgada de una rama.
//  Caras: 'feliz' · 'ojo' (preocupada) · 'fiesta' (celebrando)
// ════════════════════════════════════════════════════════════════

const BOCAS = {
  feliz:  '<path d="M73 107 Q80 113 87 107" class="pz-trazo"/>',
  ojo:    '<path d="M74 109 Q77 106 80 109 Q83 112 86 109" class="pz-trazo"/>',
  fiesta: '<path d="M72 105 Q80 117 88 105 Z" class="pz-boca"/>',
};

function ojos(cara) {
  if (cara === 'fiesta') {
    return `<path d="M64 93 Q69 88 74 93" class="pz-trazo pz-ojo-c"/>
            <path d="M86 93 Q91 88 96 93" class="pz-trazo pz-ojo-c"/>`;
  }
  return `<g class="pz-ojos">
      <circle cx="69" cy="92" r="3.4" class="pz-pupila"/><circle cx="70.2" cy="90.8" r="1.1" fill="#fff"/>
      <circle cx="91" cy="92" r="3.4" class="pz-pupila"/><circle cx="92.2" cy="90.8" r="1.1" fill="#fff"/>
    </g>
    ${cara === 'ojo' ? `<path d="M62 82 Q68 79 74 82" class="pz-trazo"/><path d="M86 82 Q92 79 98 82" class="pz-trazo"/>` : ''}`;
}

export function perezosoSVG(cara = 'feliz') {
  return `<svg class="pz" viewBox="0 0 160 200" role="img" aria-label="La Dra. Betty, una perezosa con anteojos colgada de una rama">
  <g class="pz-rama">
    <path d="M-4 24 Q40 14 80 20 T164 16" class="pz-palo"/>
    <ellipse cx="22" cy="12" rx="11" ry="5" transform="rotate(-25 22 12)" class="pz-hoja"/>
    <ellipse cx="34" cy="8" rx="9" ry="4" transform="rotate(20 34 8)" class="pz-hoja pz-hoja2"/>
    <ellipse cx="136" cy="9" rx="11" ry="5" transform="rotate(22 136 9)" class="pz-hoja"/>
    <ellipse cx="148" cy="15" rx="8" ry="4" transform="rotate(-15 148 15)" class="pz-hoja pz-hoja2"/>
  </g>
  <g class="pz-cuerpo">
    <path d="M58 98 Q48 60 52 24" class="pz-brazo"/>
    <path d="M102 98 Q112 60 108 24" class="pz-brazo"/>
    <path d="M46 22 q6 -6 12 0" class="pz-garra"/><path d="M102 22 q6 -6 12 0" class="pz-garra"/>
    <path d="M66 168 Q62 186 70 190" class="pz-pierna"/>
    <path d="M94 168 Q98 186 90 190" class="pz-pierna"/>
    <ellipse cx="80" cy="138" rx="36" ry="42" class="pz-pelo"/>
    <ellipse cx="80" cy="144" rx="22" ry="28" class="pz-panza"/>
    <circle cx="80" cy="94" r="31" class="pz-pelo2"/>
    <ellipse cx="80" cy="98" rx="25" ry="20" class="pz-cara"/>
    <ellipse cx="68" cy="94" rx="10" ry="6.5" transform="rotate(18 68 94)" class="pz-mancha"/>
    <ellipse cx="92" cy="94" rx="10" ry="6.5" transform="rotate(-18 92 94)" class="pz-mancha"/>
    ${ojos(cara)}
    <circle cx="69" cy="92" r="8.5" class="pz-lente"/>
    <circle cx="91" cy="92" r="8.5" class="pz-lente"/>
    <path d="M77.5 91 Q80 89 82.5 91" class="pz-lente-puente"/>
    <ellipse cx="80" cy="101" rx="4.2" ry="3" class="pz-nariz"/>
    ${BOCAS[cara] || BOCAS.feliz}
    <circle cx="62" cy="104" r="4" class="pz-cachete"/><circle cx="98" cy="104" r="4" class="pz-cachete"/>
  </g>
</svg>`;
}

/** Monta a la Dra. Betty con su globo de diálogo dentro de `el`. */
export function montarPerezoso(el, { cara = 'feliz', texto = '' } = {}) {
  if (!el) return;
  el.innerHTML = `<div class="pz-wrap pz-${cara}">${perezosoSVG(cara)}</div>
    ${texto ? `<div class="globo" role="note">${texto}</div>` : ''}`;
}

/** Celebración corta: la perezosa brinca y caen moneditas. */
export function celebrar(mensaje = '¡Eso! Ahorraste') {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const capa = document.createElement('div');
  capa.className = 'fiesta';
  capa.setAttribute('aria-hidden', 'true');
  let monedas = '';
  if (!reduce) {
    for (let i = 0; i < 14; i++) {
      const x = Math.round(Math.random() * 100);
      const d = (Math.random() * 0.6).toFixed(2);
      const s = (0.8 + Math.random() * 0.7).toFixed(2);
      monedas += `<span class="moneda" style="left:${x}%;animation-delay:${d}s;--s:${s}">₡</span>`;
    }
  }
  capa.innerHTML = `${monedas}<div class="fiesta-pz">${perezosoSVG('fiesta')}<div class="globo">${mensaje}</div></div>`;
  document.body.appendChild(capa);
  setTimeout(() => capa.classList.add('fuera'), 2200);
  setTimeout(() => capa.remove(), 2700);
}
