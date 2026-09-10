/*! Centro Sicurezza Card — porta blindata/serratura + sensori d'allarme in
 *  UNA card sola: blocco/sblocco/apri con conferma, stato anta, batteria,
 *  panoramica sensori (finestre/volumetrici/vibrazione) con dettaglio,
 *  ultime attività dal logbook. Pensata per sostituire una vista fatta di
 *  tante mushroom-template-card ripetute, ognuna con il suo CSS a mano.
 */
const CSC_VERSION = "2.10.0";
console.info(`%c CENTRO-SICUREZZA-CARD %c v${CSC_VERSION} `,
  "color:#2b0a0a;background:#ff5442;font-weight:700;border-radius:4px 0 0 4px",
  "color:#ffe0da;background:#1a1b21;border-radius:0 4px 4px 0");

const CSC_DEFAULTS = {
  name: "Porta Blindata",
  lock: "", door_sensor: "", battery: "", sensors: "",
  alarm: "", cameras: "", mostra_porta: true,
  // I tre pezzi si accendono uno per uno: cosi la stessa card puo essere
  // "solo allarme", "solo porta" o "solo telecamere" e si mettono dove si
  // vuole, invece di stare per forza tutti incolonnati insieme.
  mostra_allarme: true, mostra_telecamere: true,
};

// Come si chiamano gli stati di un impianto d'allarme, detti in italiano.
// Lo scudo dell'allarme. Un disegno solo: quello che cambia e come si muove,
// e lo decide lo stato scritto sulla card (data-s). Prima qui c'era un'emoji:
// ferma, e disegnata dal sistema operativo, quindi diversa su ogni telefono.
function cscScudo() {
  return `<svg class="csc-shield" viewBox="0 0 100 116" aria-hidden="true">
    <defs>
      <linearGradient id="cscShieldG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity=".38"/>
        <stop offset="1" stop-color="currentColor" stop-opacity=".08"/>
      </linearGradient>
    </defs>
    <path class="csc-sh-alone" d="M50 4 L92 19 V58 C92 84 73 102 50 112 C27 102 8 84 8 58 V19 Z"/>
    <path class="csc-sh-corpo" d="M50 4 L92 19 V58 C92 84 73 102 50 112 C27 102 8 84 8 58 V19 Z"/>
    <path class="csc-sh-bordo" d="M50 4 L92 19 V58 C92 84 73 102 50 112 C27 102 8 84 8 58 V19 Z"/>
    <g class="csc-sh-segno">
      <path class="csc-sh-spunta" d="M32 58 L44 71 L69 44"/>
      <g class="csc-sh-lucchetto">
        <rect x="36" y="54" width="28" height="24" rx="6"/>
        <path d="M42 54 V46 a8 8 0 0 1 16 0 V54"/>
      </g>
      <path class="csc-sh-arco" d="M50 22 A34 34 0 0 1 84 56"/>
      <g class="csc-sh-bang">
        <path d="M50 40 V64"/>
        <circle cx="50" cy="76" r="4.4"/>
      </g>
    </g>
  </svg>`;
}

const CSC_ALARM = {
  disarmed: { t: "Disinserito", s: "safe" },
  armed_home: { t: "Inserito in casa", s: "warn" },
  armed_away: { t: "Inserito fuori casa", s: "warn" },
  armed_night: { t: "Inserito notte", s: "warn" },
  armed_vacation: { t: "Inserito vacanza", s: "warn" },
  armed_custom_bypass: { t: "Inserito parziale", s: "warn" },
  arming: { t: "Inserimento in corso", s: "busy" },
  pending: { t: "Ingresso in corso", s: "busy" },
  disarming: { t: "Disinserimento", s: "busy" },
  triggered: { t: "ALLARME IN CORSO", s: "danger" },
  unavailable: { t: "Non raggiungibile", s: "off" },
  unknown: { t: "Stato sconosciuto", s: "off" },
};

// Che cosa sorveglia un sensore. La device_class non aiuta: la centrale
// iAlarm dichiara "door" per tutto, volumetrici e vibrazione compresi. Il
// nome invece lo dice sempre, perche lo ha scritto chi ha montato l'impianto.
const CSC_TIPI = [
  { k: "vibrazione", re: /\bvibr/i,                        ico: "\u3030\ufe0f", et: "Vibrazione", aperto: "Scossa" },
  { k: "movimento",  re: /volumetr|\bpir\b|movim|infrar/i,  ico: "\ud83d\udc63", et: "Volumetrico", aperto: "Movimento" },
  { k: "finestra",   re: /finestr|\bfin\b|veland|lucern/i,  ico: "\ud83e\ude9f", et: "Finestra", aperto: "Aperta" },
  { k: "porta",      re: /port|ingress|blindat|cancell/i,   ico: "\ud83d\udeaa", et: "Porta", aperto: "Aperta" },
  { k: "fumo",       re: /fum|incend|gas/i,                 ico: "\ud83d\udd25", et: "Fumo", aperto: "Allarme" },
  { k: "acqua",      re: /allag|acqua|perdit/i,             ico: "\ud83d\udca7", et: "Acqua", aperto: "Perdita" },
];

function cscTipo(nome) {
  const t = CSC_TIPI.find(x => x.re.test(nome || ""));
  return t || { k: "generico", ico: "\ud83d\udee1\ufe0f", et: "Sensore", aperto: "Attivo" };
}

// hass-swipe-navigation ignora già i gesti dentro <hui-card-edit-mode> (il
// wrapper che HA mette intorno alla card in modifica dashboard) — usiamo lo
// stesso segnale per non bloccare mai il drag-and-drop di riordino nativo.
function cscInEditMode(e) {
  const path = e.composedPath ? e.composedPath() : [];
  return path.some(n => n.tagName === "HUI-CARD-EDIT-MODE");
}
function stopSwipeNavHijack(el) {
  ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove"].forEach(evt =>
    el.addEventListener(evt, e => { if (!cscInEditMode(e)) e.stopPropagation(); }, { passive: true }));
}

// Disegno fornito da Cristian: porta blindata realistica in 3D (rotazione su
// cerniera + pistoni che rientrano + sensore magnetico), adattato tecnicamente:
// id/classi dei gradienti resi univoci con prefisso "csc" (altrimenti due
// card sulla stessa pagina si "rubano" a vicenda i gradienti, essendo id
// validi una sola volta per pagina), animazione guidata dall'attributo
// data-dooropen già presente su .csc-card (non serve una classe a parte sul
// gruppo), e tolto il testo di stato disegnato dentro l'SVG — lo mostra già
// .csc-state sotto l'icona, ripeterlo lì dentro era ridondante.
function cscIconDoor() {
  return `
  <svg viewBox="0 0 400 500" class="csc-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cscDoorFrameGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0f172a"/><stop offset="50%" stop-color="#334155"/><stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="cscWoodPanel" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b"/><stop offset="50%" stop-color="#334155"/><stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="cscMetalHandle" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/><stop offset="50%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#475569"/>
      </linearGradient>
      <radialGradient id="cscAmbGlow" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#8a94a1" stop-opacity=".28"/><stop offset="1" stop-color="#8a94a1" stop-opacity="0"/></radialGradient>
      <radialGradient id="cscShadowDoor" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".4"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <linearGradient id="cscSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb8e8"/><stop offset="1" stop-color="#cdeeff"/></linearGradient>
      <linearGradient id="cscGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc47f"/><stop offset="1" stop-color="#2d6b3a"/></linearGradient>
      <radialGradient id="cscSun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="#ffd166"/></radialGradient>
      <clipPath id="cscGardenClip"><rect x="70" y="50" width="260" height="380"/></clipPath>
    </defs>

    <ellipse class="csc-glow" cx="200" cy="230" rx="150" ry="190" fill="url(#cscAmbGlow)"/>
    <ellipse cx="200" cy="478" rx="140" ry="14" fill="url(#cscShadowDoor)"/>

    <!-- telaio blindato -->
    <rect x="50" y="30" width="300" height="410" rx="6" fill="url(#cscDoorFrameGrad)" stroke="#1e293b" stroke-width="4"/>
    <rect x="65" y="45" width="270" height="390" fill="none" stroke="#0f172a" stroke-width="3"/>

    <!-- cerniere rinforzate -->
    <rect x="52" y="90" width="12" height="35" rx="2" fill="url(#cscMetalHandle)"/>
    <rect x="52" y="220" width="12" height="35" rx="2" fill="url(#cscMetalHandle)"/>
    <rect x="52" y="350" width="12" height="35" rx="2" fill="url(#cscMetalHandle)"/>

    <!-- pistoni di sicurezza: rientrano quando la porta è aperta -->
    <g class="csc-deadbolt">
      <rect x="330" y="180" width="18" height="10" rx="3" fill="#e2e8f0"/>
      <rect x="330" y="200" width="18" height="10" rx="3" fill="#e2e8f0"/>
      <rect x="330" y="220" width="18" height="10" rx="3" fill="#e2e8f0"/>
    </g>

    <!-- vano/sfondo dietro l'anta: un piccolo giardino, disegnato SOPRA al
         telaio (altrimenti il telaio, opaco, lo coprirebbe sempre) e SOTTO
         all'anta (che lo nasconde quando è chiusa) — visibile solo quando
         ruota aperta, così si vede subito "oltre la porta" invece di un
         buco scuro o del colore del telaio -->
    <g clip-path="url(#cscGardenClip)">
      <rect x="70" y="50" width="260" height="380" fill="url(#cscSky)"/>
      <circle cx="288" cy="98" r="26" fill="url(#cscSun)"/>
      <rect x="70" y="330" width="260" height="100" fill="url(#cscGrass)"/>
      <rect x="118" y="272" width="10" height="58" fill="#5b4632"/>
      <circle cx="100" cy="278" r="22" fill="#3f8850"/>
      <circle cx="150" cy="278" r="22" fill="#3f8850"/>
      <circle cx="123" cy="255" r="30" fill="#4a9a5a"/>
      <circle cx="255" cy="342" r="18" fill="#4a9a5a"/>
      <circle cx="285" cy="348" r="14" fill="#3f8850"/>
    </g>

    <!-- sensore magnetico: parte fissa sul telaio + LED che segue lo stato -->
    <rect x="315" y="35" width="12" height="24" rx="2" fill="#e2e8f0" stroke="#475569" stroke-width="1"/>
    <circle cx="321" cy="47" r="3" class="csc-sensorled"/>

    <!-- anta mobile: ruota in 3D sul cardine sinistro quando è aperta -->
    <g class="csc-doorpanel">
      <rect x="70" y="50" width="260" height="380" rx="4" fill="url(#cscWoodPanel)" stroke="#475569" stroke-width="2"/>
      <rect x="90" y="70" width="220" height="340" fill="none" stroke="#1e293b" stroke-width="2"/>
      <line x1="90" y1="150" x2="310" y2="150" stroke="#1e293b" stroke-width="2"/>
      <line x1="90" y1="330" x2="310" y2="330" stroke="#1e293b" stroke-width="2"/>
      <rect x="301" y="35" width="12" height="24" rx="2" fill="#e2e8f0" stroke="#475569" stroke-width="1"/>
      <rect x="285" y="200" width="22" height="80" rx="4" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
      <circle cx="296" cy="225" r="8" fill="url(#cscMetalHandle)"/>
      <rect x="295" y="221" width="2" height="8" fill="#0f172a"/>
      <rect x="292" y="245" width="8" height="28" rx="2" fill="url(#cscMetalHandle)"/>
    </g>
  </svg>`;
}

class CentroSicurezzaCard extends HTMLElement {
  setConfig(config) {
    this._cfg = Object.assign({}, CSC_DEFAULTS, config || {});
    this._built = false;
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._built) { this._build(); this._built = true; }
    this._update();
  }
  getCardSize() { return 5; }
  getLayoutOptions() {
    return { grid_rows: 8, grid_columns: 4, grid_min_rows: 4, grid_max_rows: 12, grid_min_columns: 2, grid_max_columns: 6 };
  }
  static getConfigElement() { return document.createElement("centro-sicurezza-card-editor"); }
  static getStubConfig() { return JSON.parse(JSON.stringify(CSC_DEFAULTS)); }

  _num(id) { const s = this._hass && this._hass.states[id]; const v = s && parseFloat(s.state); return (v == null || isNaN(v)) ? null : v; }
  _name(id) { const s = this._hass && this._hass.states[id]; return (s && s.attributes && s.attributes.friendly_name) || id; }
  _esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // Righe tipo "entity_id" o "entity_id|Nome personalizzato". Se il campo e
  // vuoto NON si resta a mani vuote: i sensori di un impianto d'allarme sono
  // gia tutti li, attaccati alla stessa centrale, e chiedere di riscriverli a
  // mano uno per uno era una richiesta senza motivo.
  _sensorList() {
    const scritti = (this._cfg.sensors || "").split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const [id, label] = line.split("|").map(x => x.trim());
      return { id, label: label || null };
    });
    if (scritti.length) return scritti.map(x => Object.assign({}, x, { nome: x.label || this._nomeCorto(x.id) }));
    return this._sensoriDellaCentrale();
  }

  // Tutti i sensori attaccati alla centrale configurata: prima quelli dello
  // stesso apparecchio, e se il registro non li lega cosi, quelli della stessa
  // integrazione. Il risultato si tiene da parte: il registro non cambia fra
  // un aggiornamento di stato e l'altro, e rifare il giro su tremila entita a
  // ogni battito di un sensore di potenza era una delle ragioni per cui questa
  // scheda si trascinava.
  _sensoriDellaCentrale() {
    const cfg = this._cfg, hass = this._hass;
    if (!cfg.alarm || !hass || !hass.entities) return [];
    if (this._cacheSensori && this._cacheSensori.per === cfg.alarm) return this._cacheSensori.lista;
    const centrale = hass.entities[cfg.alarm];
    if (!centrale) return [];
    const tutte = Object.values(hass.entities).filter(e => e.entity_id.indexOf("binary_sensor.") === 0);
    let trovati = centrale.device_id ? tutte.filter(e => e.device_id === centrale.device_id) : [];
    if (!trovati.length && centrale.platform) trovati = tutte.filter(e => e.platform === centrale.platform);
    const lista = trovati
      .map(e => ({ id: e.entity_id, label: null, nome: this._nomeCorto(e.entity_id) }))
      .filter(x => !/batteria|battery|tamper|manomiss|guasto|alimentaz|carica/i.test(x.nome))
      .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
    this._cacheSensori = { per: cfg.alarm, lista };
    return lista;
  }

  // Il nome del registro ("porta blindata") invece del friendly_name, che si
  // porta dietro il nome della centrale ("ALLARME CASA porta blindata") e
  // riempirebbe l'elenco di dodici volte la stessa parola.
  _nomeCorto(id) {
    const reg = this._hass && this._hass.entities && this._hass.entities[id];
    if (reg && reg.name) return reg.name;
    const pieno = this._name(id);
    const centrale = this._cfg.alarm && this._hass.states[this._cfg.alarm];
    const pref = centrale && centrale.attributes && centrale.attributes.friendly_name;
    if (pref && pieno.indexOf(pref) === 0) return pieno.slice(pref.length).trim() || pieno;
    const m = pieno.match(/^[A-Z][A-Z\s]{3,}\s(.+)$/);
    return m ? m[1] : pieno;
  }

  // Quale sensore dice se l'anta e aperta. Se non e stato scelto a mano, e
  // quello di tipo porta fra i sensori della centrale: nella pratica c'e
  // sempre, e senza di lui la scheda puo solo dire se la serratura e girata,
  // che e un'altra cosa.
  _sensorePorta() {
    if (this._cfg.door_sensor) return this._cfg.door_sensor;
    const porte = this._sensorList().filter(x => cscTipo(x.nome).k === "porta");
    return porte.length ? porte[0].id : "";
  }

  _build() {
    this.innerHTML = `
    <style>
      .csc{--csc-panel:rgba(22,26,34,.86);--csc-stroke:rgba(255,255,255,.09);--csc-ink:#eaf1f8;--csc-muted:#93a1b0;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:var(--csc-ink);padding:6px;
        min-height:100%;display:flex;flex-direction:column}
      .csc *{box-sizing:border-box}
      /* L'attributo hidden e solo un display:none del browser, e QUALUNQUE
         regola di classe lo batte: .csc-card ha display:flex e .csc-cams
         display:grid, quindi nascondere quei riquadri da codice non aveva
         alcun effetto - restavano li. Si vedeva la porta ripetuta dentro la
         card dell'allarme e dentro quella delle telecamere. Questa riga
         restituisce a hidden il suo significato in tutta la card. */
      .csc [hidden]{display:none!important}
      .csc-card{background:var(--csc-panel);border:1px solid var(--csc-stroke);border-radius:22px;padding:16px 14px;
        flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;backdrop-filter:blur(14px);
        box-shadow:0 10px 26px rgba(0,0,0,.35);position:relative;overflow:hidden;transition:background-color .5s,border-color .5s}
      .csc-card::before{content:"";position:absolute;inset:0;border-radius:22px;pointer-events:none;
        background:radial-gradient(120% 60% at 50% -10%,rgba(255,255,255,.06),transparent 60%)}
      /* La tinta dello stato va SOPRA il pannello, non al suo posto. Prima
         sostituiva il background-color scuro con una velatura trasparente: su
         un fondo scuro sembrava giusto, ma dentro Faber Home, col cielo chiaro
         di giorno, il pannello spariva e restavano scritte bianche su azzurro. */
      .csc-card[data-status="danger"]{background-image:linear-gradient(rgba(255,84,66,.16),rgba(255,84,66,.16));border-color:rgba(255,84,66,.36)}
      .csc-card[data-status="warn"]{background-image:linear-gradient(rgba(255,176,32,.14),rgba(255,176,32,.14));border-color:rgba(255,176,32,.32)}
      .csc-card[data-status="safe"]{background-image:linear-gradient(rgba(56,224,138,.12),rgba(56,224,138,.12));border-color:rgba(56,224,138,.28)}
      .csc-iconwrap{width:150px;height:187px}
      .csc-svg{width:100%;height:100%;display:block;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
      .csc-glow{opacity:.2;transition:opacity .5s}
      .csc-card[data-status="danger"] .csc-glow{opacity:1;animation:csc-pulse 1.4s ease-in-out infinite}
      .csc-card[data-status="warn"] .csc-glow{opacity:.85;animation:csc-pulse 2.2s ease-in-out infinite}
      .csc-card[data-status="busy"] .csc-glow{opacity:.85;animation:csc-pulse .8s ease-in-out infinite}
      @keyframes csc-pulse{0%,100%{opacity:.4}50%{opacity:1}}

      /* L'anta si apre verso chi guarda: rotateY POSITIVO. Prima era negativo,
         cioe verso l'esterno - il contrario della porta vera. */
      .csc-doorpanel{transform-origin:70px 240px;transition:transform .8s cubic-bezier(.4,0,.2,1)}
      .csc-card[data-dooropen="1"] .csc-doorpanel{transform:perspective(600px) rotateY(-65deg) skewY(2deg)}
      .csc-deadbolt{transition:transform .5s ease-in-out}
      .csc-card[data-locked="0"] .csc-deadbolt{transform:translateX(-15px)}
      .csc-sensorled{fill:#38e08a;filter:drop-shadow(0 0 4px #38e08a);transition:fill .4s ease,filter .4s ease}
      .csc-card[data-dooropen="1"] .csc-sensorled{fill:#ff5442;filter:drop-shadow(0 0 6px #ff5442)}
      .csc-name{font-size:16px;font-weight:800;margin-top:2px}
      .csc-state{font-size:13.5px;font-weight:800;color:var(--csc-muted);text-align:center}
      .csc-card[data-status="safe"] .csc-state{color:var(--csc-c-ok,#8ff0b4)}
      .csc-card[data-status="warn"] .csc-state{color:var(--csc-c-warn,#ffd28a)}
      .csc-card[data-status="danger"] .csc-state{color:var(--csc-c-bad,#ffb0a3);animation:csc-blink 1s ease-in-out infinite}
      .csc-card[data-status="busy"] .csc-state{color:#ffe6a3}
      @keyframes csc-blink{0%,100%{opacity:1}50%{opacity:.5}}
      .csc-sub{display:flex;gap:14px;font-size:11.5px;color:var(--csc-muted);margin-top:2px;flex-wrap:wrap;justify-content:center}
      .csc-badge{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;margin-top:8px;
        font-size:11.5px;font-weight:800;background:rgba(255,255,255,.06);border:1px solid var(--csc-stroke);
        color:var(--csc-muted);cursor:pointer;width:100%;justify-content:center}
      .csc-badge[data-alert="1"]{background:rgba(255,84,66,.16);border-color:rgba(255,84,66,.4);color:var(--csc-c-bad,#ffb0a3);animation:csc-blink 1.4s ease-in-out infinite}
      .csc-badge[data-alert="0"]{background:rgba(56,224,138,.1);border-color:rgba(56,224,138,.3);color:var(--csc-c-ok,#8ff0b4)}
      .csc-actions{display:flex;gap:8px;width:100%;margin-top:10px}
      .csc-btn{flex:1;background:rgba(255,255,255,.06);border:1px solid var(--csc-stroke);color:var(--csc-ink);
        border-radius:12px;padding:10px 6px;font-size:12.5px;font-weight:700;cursor:pointer;transition:filter .15s;text-align:center}
      .csc-btn:hover{filter:brightness(1.25)}
      .csc-btn.warn{background:rgba(255,84,66,.14);border-color:rgba(255,84,66,.35)}
      .csc-link{margin-top:8px;font-size:11px;font-weight:700;color:var(--csc-muted);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
      .csc-scrim{position:fixed;inset:0;background:rgba(4,5,8,.62);backdrop-filter:blur(6px);display:flex;
        align-items:center;justify-content:center;padding:22px;z-index:100;opacity:0;pointer-events:none;transition:opacity .18s}
      .csc-scrim.on{opacity:1;pointer-events:auto}
      .csc-modal{width:100%;max-width:380px;max-height:80vh;overflow-y:auto;background:#1a1b21;border:1px solid rgba(255,255,255,.16);
        border-radius:22px;padding:20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.6);transform:translateY(14px) scale(.97);transition:transform .2s}
      .csc-scrim.on .csc-modal{transform:none}
      .csc-mh{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
      .csc-mt{font-size:16px;font-weight:850}
      .csc-x{width:28px;height:28px;border-radius:50%;border:1px solid var(--csc-stroke);background:rgba(255,255,255,.05);color:var(--csc-ink);font-size:14px;cursor:pointer;flex:0 0 auto}
      .csc-srow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;
        background:rgba(255,255,255,.04);border-radius:10px;border:1px solid var(--csc-stroke);margin-bottom:6px;font-size:12.5px}
      .csc-srow[data-on="1"]{border-color:rgba(255,84,66,.4);background:rgba(255,84,66,.1)}
      .csc-sdot{width:8px;height:8px;border-radius:50%;background:#38e08a;flex:0 0 auto}
      .csc-srow[data-on="1"] .csc-sdot{background:#ff5442}
      .csc-empty{color:var(--csc-muted);font-size:12.5px;text-align:center;padding:18px 0}
      .csc-confirm-txt{font-size:13.5px;color:var(--csc-ink);margin-bottom:14px;line-height:1.5}
      .csc-confirm-row{display:flex;gap:10px}
      .csc-erow{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--csc-stroke);font-size:12px}
      .csc-erow:last-child{border-bottom:none}
      /* ------------------------------------------------------------ allarme */
      .csc-alarm{background:var(--csc-panel);border:1px solid var(--csc-stroke);border-radius:20px;
        padding:13px 14px;margin-bottom:10px;backdrop-filter:blur(14px);
        box-shadow:0 8px 22px rgba(0,0,0,.3);transition:background-image .4s,border-color .4s}
      .csc-alarm[data-s="safe"]{background-image:linear-gradient(rgba(56,224,138,.12),rgba(56,224,138,.12));border-color:rgba(56,224,138,.3)}
      .csc-alarm[data-s="warn"]{background-image:linear-gradient(rgba(255,176,32,.14),rgba(255,176,32,.14));border-color:rgba(255,176,32,.34)}
      .csc-alarm[data-s="busy"]{background-image:linear-gradient(rgba(255,176,32,.18),rgba(255,176,32,.18));border-color:rgba(255,176,32,.5)}
      .csc-alarm[data-s="danger"]{background-image:linear-gradient(rgba(255,84,66,.2),rgba(255,84,66,.2));border-color:rgba(255,84,66,.55);
        animation:csc-blink 1s ease-in-out infinite}
      .csc-ahead{display:flex;align-items:center;gap:10px;margin-bottom:11px}
      /* ------------------------------------------------ lo scudo animato */
      .csc-shield{width:100%;height:100%;display:block;overflow:visible}
      /* L'alone respira: sta SOTTO lo scudo e cresce appena, cosi si nota con
         la coda dell'occhio senza diventare un lampeggio. */
      .csc-sh-alone{fill:currentColor;opacity:.16;transform-box:fill-box;transform-origin:50% 50%}
      .csc-sh-corpo{fill:url(#cscShieldG)}
      .csc-sh-bordo{fill:none;stroke:currentColor;stroke-width:5.5;stroke-linejoin:round;opacity:.95}
      .csc-sh-segno{fill:none;stroke:currentColor;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
      .csc-sh-lucchetto rect{fill:currentColor;stroke:none;opacity:.9}
      .csc-sh-lucchetto path{stroke-width:5.5}
      /* Di base non si vede nessun segno: ogni stato accende il suo. */
      .csc-sh-spunta,.csc-sh-lucchetto,.csc-sh-arco,.csc-sh-bang{opacity:0;transition:opacity .45s ease}
      .csc-sh-bang circle{fill:currentColor;stroke:none}

      /* DISINSERITO: scudo pieno e calmo, con la spunta. Fermo: "e tutto a
         posto" non ha bisogno di attirare l'attenzione. */
      .csc-alarm[data-s="safe"] .csc-sh-spunta{opacity:1}
      .csc-alarm[data-s="safe"] .csc-sh-alone{opacity:.13}

      /* INSERITO: il lucchetto, e l'alone che respira piano. */
      .csc-alarm[data-s="warn"] .csc-sh-lucchetto{opacity:1}
      .csc-alarm[data-s="warn"] .csc-sh-alone{animation:csc-respira 3.6s ease-in-out infinite}

      /* STA INSERENDO: un arco che gira, il gesto dell'attesa. */
      .csc-alarm[data-s="busy"] .csc-sh-arco{opacity:.95;transform-box:fill-box;
        transform-origin:50% 50%;animation:csc-gira 1.5s linear infinite}
      .csc-alarm[data-s="busy"] .csc-sh-lucchetto{opacity:.35}
      .csc-alarm[data-s="busy"] .csc-sh-alone{animation:csc-respira 1.5s ease-in-out infinite}

      /* SCATTATO: il punto esclamativo, e un lampeggio NETTO a scatti — un
         allarme lampeggia, non sfuma (lezione dei LED). */
      .csc-alarm[data-s="danger"] .csc-sh-bang{opacity:1}
      .csc-alarm[data-s="danger"] .csc-sh-alone{opacity:.42;animation:csc-scatto .62s steps(1,end) infinite}
      .csc-alarm[data-s="danger"] .csc-sh-bordo{animation:csc-scatto .62s steps(1,end) infinite}

      /* NON RAGGIUNGIBILE: scudo vuoto e spento. */
      .csc-alarm[data-s="off"] .csc-sh-corpo{opacity:.25}
      .csc-alarm[data-s="off"] .csc-sh-bordo{opacity:.4}
      .csc-alarm[data-s="off"] .csc-sh-alone{opacity:.05}

      @keyframes csc-respira{
        0%,100%{transform:scale(1);opacity:.14}
        50%{transform:scale(1.09);opacity:.3}}
      @keyframes csc-gira{to{transform:rotate(360deg)}}
      @keyframes csc-scatto{0%{opacity:.5}50%{opacity:.12}}
      @media(prefers-reduced-motion:reduce){.csc-shield *{animation:none!important}}

      /* Il riquadro non serve piu: lo scudo E' la forma, e un quadratino
         intorno a uno scudo e solo un quadratino di troppo. Resta un po' di
         respiro e il colore, che lo scudo eredita da qui con currentColor:
         una riga per stato invece di ridipingere ogni pezzo del disegno. */
      .csc-aico{width:46px;height:46px;display:flex;align-items:center;justify-content:center;
        flex:0 0 auto;color:var(--csc-muted)}
      .csc-alarm[data-s="safe"] .csc-aico{color:var(--csc-c-ok,#8ff0b4)}
      .csc-alarm[data-s="warn"] .csc-aico{color:var(--csc-c-acc,#ffb020)}
      .csc-alarm[data-s="busy"] .csc-aico{color:var(--csc-c-warn,#ffd28a)}
      .csc-alarm[data-s="danger"] .csc-aico{color:#ff5442}
      .csc-atxt{flex:1;min-width:0}
      .csc-alab{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--csc-muted)}
      .csc-aval{font-size:15px;font-weight:800;color:var(--csc-ink);margin-top:2px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .csc-alarm[data-s="safe"] .csc-aval{color:var(--csc-c-ok,#8ff0b4)}
      .csc-alarm[data-s="warn"] .csc-aval,.csc-alarm[data-s="busy"] .csc-aval{color:var(--csc-c-warn,#ffd28a)}
      .csc-alarm[data-s="danger"] .csc-aval{color:var(--csc-c-bad,#ffb0a3)}
      .csc-abtns{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:7px}
      .csc-ab{padding:9px 6px;border-radius:12px;cursor:pointer;font:inherit;font-size:12px;font-weight:800;
        border:1px solid var(--csc-stroke);background:rgba(255,255,255,.06);color:var(--csc-ink);
        display:flex;align-items:center;justify-content:center;gap:5px;transition:background .18s,border-color .18s}
      .csc-ab:hover{background:rgba(255,255,255,.11)}
      .csc-ab.sel{border-color:rgba(255,176,32,.65);background:rgba(255,176,32,.2);color:var(--csc-c-soft,#ffe9c2)}
      .csc-ab.off.sel{border-color:rgba(56,224,138,.6);background:rgba(56,224,138,.18);color:var(--csc-c-ok,#8ff0b4)}
      /* --------------------------------------------------------- telecamere */
      .csc-cams{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:8px;margin-top:10px}
      .csc-cam{position:relative;border-radius:16px;overflow:hidden;cursor:pointer;aspect-ratio:16/10;
        border:1px solid var(--csc-stroke);background:#0d1016;padding:0;font:inherit;display:block;width:100%}
      .csc-cam img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease}
      .csc-cam:hover img{transform:scale(1.05)}
      .csc-camoff{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        color:var(--csc-muted);font-size:11.5px;font-weight:700;text-align:center;padding:8px}
      /* Un display esplicito su una classe batte l'attributo hidden, che vale
         solo per la regola di base del browser: senza questa riga la scritta
         "non raggiungibile" restava stampata sopra un'immagine che c'era. */
      .csc-camoff[hidden]{display:none}
      .csc-camlab{position:absolute;left:0;right:0;bottom:0;padding:16px 9px 7px;text-align:left;
        font-size:11.5px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.9);
        background:linear-gradient(transparent,rgba(0,0,0,.72))}
      .csc-camlive{position:absolute;top:7px;right:7px;display:flex;align-items:center;gap:4px;
        padding:2px 7px;border-radius:20px;font-size:9px;font-weight:900;letter-spacing:.06em;
        background:rgba(0,0,0,.55);color:#fff}
      .csc-camlive i{width:5px;height:5px;border-radius:50%;background:#ff5442;animation:csc-blink 1.6s ease-in-out infinite}
      /* I sensori si vedono senza aprire niente: il punto di una scheda di
         sicurezza e sapere a colpo d'occhio cosa e aperto. Quelli aperti
         restano in cima e sono gli unici colorati. */
      /* 112px stavano stretti: i nomi finivano tutti in "finestr..." e la
         pastiglia diceva solo che esisteva un sensore, non quale. */
      .csc-sensori{display:grid;grid-template-columns:repeat(auto-fill,minmax(152px,1fr));gap:6px;
        width:100%;margin-top:10px}
      .csc-sp{display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:12px;
        border:1px solid var(--csc-stroke,rgba(255,255,255,.12));background:rgba(255,255,255,.04);
        font-size:11.5px;font-weight:700;text-align:left;line-height:1.25;overflow:hidden}
      .csc-sp .csc-spi{flex:0 0 auto;font-size:13px;opacity:.75}
      .csc-sp .csc-spn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .csc-sp .csc-spq{flex:0 0 auto;font-size:9.5px;font-weight:900;letter-spacing:.05em;
        text-transform:uppercase;opacity:.55}
      .csc-sp[data-on="1"]{background:rgba(255,84,66,.16);border-color:rgba(255,84,66,.45);color:#ffd9d3}
      .csc-sp[data-on="1"] .csc-spq{opacity:1;color:#ff8f8f}
      .csc-sp[data-on="1"] .csc-spi{opacity:1;animation:csc-blink 1.8s ease-in-out infinite}
      .csc-spmore{grid-column:1/-1;text-align:center;font-size:11px;font-weight:700;
        color:var(--csc-muted);padding:4px;cursor:pointer;text-decoration:underline}
      .csc-stipo{display:block;font-size:9.5px;font-weight:800;letter-spacing:.06em;
        text-transform:uppercase;color:var(--csc-muted);margin-top:1px}
      .csc-btn:disabled{opacity:.38;cursor:not-allowed}
      .csc-etime{color:var(--csc-muted);white-space:nowrap;flex:0 0 auto}
    </style>
    <div class="csc">
      <div class="csc-alarm" data-role="alarm" hidden></div>
      <div class="csc-card" data-role="card">
        <div class="csc-iconwrap" data-role="iconwrap">${cscIconDoor()}</div>
        <div class="csc-name">${this._esc(this._cfg.name)}</div>
        <div class="csc-state" data-role="state">—</div>
        <div class="csc-sub" data-role="sub"></div>
        <div class="csc-badge" data-role="sensorbadge" hidden>—</div>
        <div class="csc-sensori" data-role="sensori" hidden></div>
        <div class="csc-actions" data-role="actions" hidden>
          <button class="csc-btn" data-role="btn-unlock">🔓 Sblocca</button>
          <button class="csc-btn" data-role="btn-lock">🔒 Blocca</button>
          <button class="csc-btn warn" data-role="btn-open">🚪 Apri</button>
        </div>
        <div class="csc-link" data-role="activitylink" hidden>Ultime attività</div>
      </div>
      <div class="csc-cams" data-role="cams" hidden></div>
    </div>`;
    stopSwipeNavHijack(this.querySelector(".csc"));
    this._el = this.querySelector('[data-role="card"]');
    this.querySelector('[data-role="btn-lock"]').onclick = () => this._confirm("Bloccare la porta?", () => this._call("lock", "lock"));
    this.querySelector('[data-role="btn-unlock"]').onclick = () => this._confirm("Sbloccare la porta?", () => this._call("lock", "unlock"));
    this.querySelector('[data-role="btn-open"]').onclick = () => this._confirm("Aprire la porta blindata?", () => this._call("lock", "open"));
    this.querySelector('[data-role="sensorbadge"]').onclick = () => this._openSensors();
    this.querySelector('[data-role="sensori"]').onclick = () => this._openSensors();
    this.querySelector('[data-role="activitylink"]').onclick = () => this._openActivity();
  }


  // ------------------------------------------------------------- allarme
  _drawAlarm() {
    const box = this.querySelector('[data-role="alarm"]');
    if (!box) return;
    if (this._cfg.mostra_allarme === false) { box.hidden = true; return; }
    const id = this._cfg.alarm;
    const st = id && this._hass ? this._hass.states[id] : null;
    if (!st) { box.hidden = true; return; }
    box.hidden = false;
    const info = CSC_ALARM[st.state] || { t: st.state, s: "off" };
    box.dataset.s = info.s;
    // Si mostrano solo i modi che l'impianto dichiara di conoscere: proporre
    // "notte" a una centrale che non ce l'ha significa un tasto che fallisce.
    const f = st.attributes.supported_features || 0;
    const modi = [];
    if (f & 1) modi.push({ k: "alarm_arm_home", t: "In casa", i: "\ud83c\udfe0", stato: "armed_home" });
    if (f & 2) modi.push({ k: "alarm_arm_away", t: "Fuori", i: "\ud83d\udeaa", stato: "armed_away" });
    if (f & 4) modi.push({ k: "alarm_arm_night", t: "Notte", i: "\ud83c\udf19", stato: "armed_night" });
    const nome = st.attributes.friendly_name || "Allarme";
    box.innerHTML = `
      <div class="csc-ahead">
        <div class="csc-aico">${cscScudo()}</div>
        <div class="csc-atxt">
          <div class="csc-alab">${this._esc(nome)}</div>
          <div class="csc-aval">${this._esc(info.t)}</div>
        </div>
      </div>
      <div class="csc-abtns">
        <button class="csc-ab off${st.state === "disarmed" ? " sel" : ""}" data-srv="alarm_disarm">\ud83d\udd13 Disinserisci</button>
        ${modi.map(m => `<button class="csc-ab${st.state === m.stato ? " sel" : ""}" data-srv="${m.k}">${m.i} ${m.t}</button>`).join("")}
      </div>`;
    box.querySelectorAll("[data-srv]").forEach(b => b.addEventListener("click", () => {
      const srv = b.dataset.srv;
      const dom = "alarm_control_panel";
      // Inserire e disinserire un allarme non e un gesto da sfiorare per
      // sbaglio: si conferma sempre, come per la porta.
      this._confirm(srv === "alarm_disarm" ? "Disinserire l'allarme?" : "Inserire l'allarme?", () => {
        const dati = { entity_id: this._cfg.alarm };
        if (st.attributes.code_format && this._cfg.code) dati.code = this._cfg.code;
        this._hass.callService(dom, srv, dati);
      });
    }));
  }

  // ---------------------------------------------------------- telecamere
  _camList() {
    return (this._cfg.cameras || "").split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const [id, label] = line.split("|").map(x => x.trim());
      return { id, label: label || null };
    });
  }

  _drawCams() {
    const box = this.querySelector('[data-role="cams"]');
    if (!box) return;
    if (this._cfg.mostra_telecamere === false) { box.hidden = true; return; }
    const list = this._camList();
    if (!list.length || !this._hass) { box.hidden = true; return; }
    box.hidden = false;
    // Si ridisegna la struttura solo se cambia l'elenco: rifarla a ogni giro
    // farebbe ripartire tutte le immagini da capo, con uno sfarfallio continuo.
    const firma = list.map(c => c.id).join(",");
    if (box.dataset.firma !== firma) {
      box.dataset.firma = firma;
      box.innerHTML = list.map(c => {
        const st = this._hass.states[c.id];
        const nome = c.label || (st && st.attributes.friendly_name) || c.id;
        return `<button type="button" class="csc-cam" data-cam="${this._esc(c.id)}">
          <img data-img="${this._esc(c.id)}" alt="">
          <div class="csc-camoff" data-off="${this._esc(c.id)}" hidden>Non raggiungibile</div>
          <div class="csc-camlive"><i></i><span data-eta="${this._esc(c.id)}">LIVE</span></div>
          <div class="csc-camlab">${this._esc(nome)}</div>
        </button>`;
      }).join("");
      box.querySelectorAll("[data-cam]").forEach(b => b.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("hass-more-info", {
          detail: { entityId: b.dataset.cam }, bubbles: true, composed: true,
        }));
      }));
      // L'elenco e cambiato: le anteprime nuove vanno caricate subito, senza
      // aspettare il prossimo giro del timer.
      this._refreshCams();
    }
    // NON si ricaricano le immagini a ogni giro. _update() scatta a ogni
    // cambio di stato in casa - con decine di sensori di potenza sono molte
    // volte al secondo - e rimettere il src azzera il caricamento in corso:
    // le anteprime restavano eternamente su "Carico...", senza mai arrivare.
    // Si carica una volta sola, poi ci pensa il timer.
    if (!this._camTimer) {
      this._refreshCams();
      // Le anteprime si aggiornano da sole, ma piano: sono fotogrammi singoli,
      // non uno streaming, e ogni richiesta impegna la telecamera.
      this._camTimer = setInterval(() => {
        if (!document.hidden && this.isConnected) this._refreshCams();
      }, 20000);
    }
  }

  // Queste telecamere rispondono a intermittenza: provate una per una dalla
  // pagina, alcune tornano 500 e altre impiegano dieci secondi, e la volta
  // dopo si scambiano i ruoli. Percio la card non si arrende al primo errore
  // e, soprattutto, non cancella un fotogramma gia buono: meglio l'ultima
  // immagine vera con l'ora sopra che un riquadro nero.
  _refreshCams(soloQuesta) {
    const imgs = [...this.querySelectorAll("[data-img]")]
      .filter(im => !soloQuesta || im.dataset.img === soloQuesta);
    imgs.forEach((img, k) => {
      const id = img.dataset.img;
      const st = this._hass.states[id];
      const off = img.parentElement.querySelector("[data-off]");
      const eta = img.parentElement.querySelector("[data-eta]");
      const pic = st && st.attributes && st.attributes.entity_picture;
      const maiVista = !img.dataset.ok;

      const messaggio = t => { if (off) { off.textContent = t; off.hidden = false; } };
      const nascondiMessaggio = () => { if (off) off.hidden = true; };

      if (!pic || st.state === "unavailable") {
        if (maiVista) { img.removeAttribute("src"); img.style.visibility = "hidden"; messaggio("Non raggiungibile"); }
        else if (eta) eta.textContent = "non raggiungibile";
        return;
      }

      const tentativi = parseInt(img.dataset.try || "0", 10);

      img.onload = () => {
        img.dataset.ok = "1";
        img.dataset.try = "0";
        img.style.visibility = "";
        nascondiMessaggio();
        if (eta) eta.textContent = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      };

      img.onerror = () => {
        // Un errore capita: si riprova un paio di volte prima di dichiarare
        // muta la telecamera, con una pausa che cresce.
        const n = parseInt(img.dataset.try || "0", 10) + 1;
        img.dataset.try = String(n);
        if (n <= 2) {
          setTimeout(() => this._refreshCams(id), n * 2500);
          // Nascondere l'immagine non e un dettaglio: un src fallito lascia
          // l'iconcina di "immagine rotta" del browser stampata in un angolo.
          if (maiVista) { img.style.visibility = "hidden"; messaggio("Riprovo..."); }
          return;
        }
        img.dataset.try = "0";
        if (maiVista) { img.removeAttribute("src"); img.style.visibility = "hidden"; messaggio("Nessuna immagine"); }
        else if (eta) eta.textContent = "immagine vecchia";
      };

      if (maiVista && !tentativi) messaggio("Carico...");
      // Le richieste si sfalsano: chiederle tutte nello stesso istante mette
      // in ginocchio il ponte delle telecamere e ne tornano solo le prime.
      setTimeout(() => {
        img.src = pic + (pic.includes("?") ? "&" : "?") + "t=" + Date.now();
      }, soloQuesta ? 0 : k * 700);
    });
  }

  disconnectedCallback() {
    if (this._camTimer) { clearInterval(this._camTimer); this._camTimer = null; }
  }

  _call(domain, service) {
    if (this._cfg.lock && this._hass.states[this._cfg.lock]) this._hass.callService(domain, service, { entity_id: this._cfg.lock });
  }

  _confirm(text, onYes) {
    let ov = this.querySelector(".csc-scrim.confirm");
    if (!ov) { ov = document.createElement("div"); ov.className = "csc-scrim confirm"; this.querySelector(".csc").appendChild(ov); }
    ov.innerHTML = `<div class="csc-modal">
      <div class="csc-confirm-txt">${this._esc(text)}</div>
      <div class="csc-confirm-row">
        <button class="csc-btn" data-role="no">Annulla</button>
        <button class="csc-btn warn" data-role="yes">Conferma</button>
      </div>
    </div>`;
    requestAnimationFrame(() => ov.classList.add("on"));
    const close = () => ov.classList.remove("on");
    ov.querySelector('[data-role="no"]').onclick = close;
    ov.querySelector('[data-role="yes"]').onclick = () => { close(); onYes(); };
    ov.onclick = e => { if (e.target === ov) close(); };
  }

  _openSensors() {
    let ov = this.querySelector(".csc-scrim.sensors");
    if (!ov) { ov = document.createElement("div"); ov.className = "csc-scrim sensors"; this.querySelector(".csc").appendChild(ov); }
    const list = this._sensorList().map(s => {
      const st = this._hass.states[s.id];
      return Object.assign({}, s, { on: !!(st && st.state === "on"), t: cscTipo(s.nome) });
    });
    // I sensori aperti/attivi vanno in cima, ben visibili — non deve servire
    // scorrere l'elenco per capire quale sia scattato.
    list.sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0));
    const openCount = list.filter(s => s.on).length;
    // Ogni riga dice che tipo di sensore e e cosa vuol dire il suo stato: per
    // un magnete "aperta", per un volumetrico "movimento", per una vibrazione
    // "scossa". Un unico "aperto/attivo" per tutti costringeva a ricordare a
    // memoria che cosa fosse ciascuno.
    const rows = list.map(s => {
      const label = s.nome || s.label || this._name(s.id);
      return `<div class="csc-srow" data-on="${s.on ? 1 : 0}"><span class="csc-sdot"></span>
        <span style="flex:0 0 auto">${s.t.ico}</span>
        <span style="flex:1">${this._esc(label)}<span class="csc-stipo">${this._esc(s.t.et)}</span></span>
        <span>${s.on ? "⚠️ " + this._esc(s.t.aperto) : "a posto"}</span></div>`;
    }).join("");
    ov.innerHTML = `<div class="csc-modal">
      <div class="csc-mh"><div><div class="csc-mt">Sensori</div>
        ${list.length ? `<div style="font-size:11.5px;color:var(--csc-muted);margin-top:2px">${openCount ? `${openCount} di ${list.length} aperti/attivi` : `tutti e ${list.length} a posto`}</div>` : ""}
      </div><button class="csc-x">✕</button></div>
      ${rows || '<div class="csc-empty">Nessun sensore configurato.</div>'}
    </div>`;
    requestAnimationFrame(() => ov.classList.add("on"));
    ov.querySelector(".csc-x").onclick = () => ov.classList.remove("on");
    ov.onclick = e => { if (e.target === ov) ov.classList.remove("on"); };
  }

  async _openActivity() {
    let ov = this.querySelector(".csc-scrim.activity");
    if (!ov) { ov = document.createElement("div"); ov.className = "csc-scrim activity"; this.querySelector(".csc").appendChild(ov); }
    ov.innerHTML = `<div class="csc-modal"><div class="csc-mh"><div class="csc-mt">Ultime attività</div><button class="csc-x">✕</button></div>
      <div class="csc-empty">Carico...</div></div>`;
    requestAnimationFrame(() => ov.classList.add("on"));
    ov.querySelector(".csc-x").onclick = () => ov.classList.remove("on");
    ov.onclick = e => { if (e.target === ov) ov.classList.remove("on"); };
    if (!this._cfg.lock) {
      ov.querySelector(".csc-empty").textContent = "Configura la serratura per vedere le attività.";
      return;
    }
    try {
      const end = new Date(), start = new Date(end.getTime() - 7 * 86400000);
      const events = await this._hass.callWS({
        type: "logbook/get_events",
        start_time: start.toISOString(), end_time: end.toISOString(),
        entity_ids: [this._cfg.lock],
      });
      const body = ov.querySelector(".csc-modal");
      if (!events || !events.length) {
        body.querySelector(".csc-empty").textContent = "Nessuna attività negli ultimi 7 giorni.";
        return;
      }
      const rows = events.slice().reverse().slice(0, 30).map(ev => {
        const d = new Date(ev.when * 1000);
        const time = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        return `<div class="csc-erow"><span class="csc-etime">${time}</span><span>${this._esc(ev.message || ev.state || "")}</span></div>`;
      }).join("");
      body.querySelector(".csc-empty").outerHTML = rows;
    } catch (e) {
      ov.querySelector(".csc-empty").textContent = "Storico non disponibile.";
      console.warn("[centro-sicurezza-card] logbook non disponibile:", e);
    }
  }

  // In casa ci sono centinaia di sensori di potenza che cambiano piu volte al
  // secondo, e "set hass" scatta a OGNI cambiamento: questa scheda si
  // ridisegnava per intero decine di volte al secondo per dati che non la
  // riguardano. Ora prima si guarda se e cambiato qualcosa di suo, e nel caso
  // quasi sempre normale non si fa niente.
  _impronta() {
    const cfg = this._cfg, H = this._hass.states;
    const v = id => { const st = id && H[id]; return st ? st.state : "-"; };
    // Anche le tre spunte fanno parte dell'impronta: senza, cambiando "cosa
    // mostra questa card" nella Configura non succedeva niente finche non
    // cambiava per conto suo lo stato di un sensore. Trovato provandola.
    const parti = [v(cfg.lock), v(this._sensorePorta()), v(cfg.battery), v(cfg.alarm),
      cfg.mostra_allarme === false ? 0 : 1,
      cfg.mostra_porta === false ? 0 : 1,
      cfg.mostra_telecamere === false ? 0 : 1];
    this._sensorList().forEach(x => parti.push(v(x.id)));
    return parti.join("|");
  }

  _update() {
    const ora = this._impronta();
    if (ora === this._segno) return;
    this._segno = ora;
    this._drawAlarm();
    this._drawCams();
    const cardEl = this.querySelector('[data-role="card"]');
    if (cardEl) cardEl.hidden = this._cfg.mostra_porta === false || !this._cfg.lock;
    if (!this._el) return;
    const cfg = this._cfg;
    const lockState = cfg.lock && this._hass.states[cfg.lock] ? this._hass.states[cfg.lock].state : null;
    const idPorta = this._sensorePorta();
    const doorOpen = idPorta ? !!(this._hass.states[idPorta] && this._hass.states[idPorta].state === "on") : false;
    const sensors = this._sensorList().filter(x => x.id !== idPorta);
    const openSensors = sensors.filter(s => { const st = this._hass.states[s.id]; return st && st.state === "on"; });

    let status = "safe", stateLabel = "—";
    // Aperta batte sbloccata. Erano due cose diverse dette come se fossero la
    // stessa: la serratura puo essere girata o no, ma se l'anta e aperta
    // quello e cio che conta. Prima si leggeva "Sbloccata" con la porta
    // spalancata, perche il sensore dell'anta non era nemmeno collegato.
    if (doorOpen) { status = "danger"; stateLabel = "🚪 Aperta"; }
    else if (lockState === "locking" || lockState === "unlocking") { status = "busy"; stateLabel = lockState === "locking" ? "Bloccaggio in corso..." : "Sbloccaggio in corso..."; }
    else if (lockState === "unlocked") { status = "warn"; stateLabel = "🔓 Sbloccata"; }
    else if (lockState === "locked") { status = openSensors.length ? "warn" : "safe"; stateLabel = "🔒 Bloccata"; }
    else if (openSensors.length) { status = "warn"; stateLabel = "Sensori attivi"; }

    this._el.dataset.status = status;
    this._el.dataset.dooropen = doorOpen ? "1" : "0";
    // I pistoni blindati sono il catenaccio della SERRATURA: escono quando è
    // bloccata, rientrano quando è sbloccata — indipendentemente dall'anta
    // (che può essere chiusa ma non a chiave). Senza serratura configurata,
    // restano a riposo "fuori" (aspetto bloccato) come default innocuo.
    this._el.dataset.locked = (!cfg.lock || lockState === "locked" || lockState === "locking") ? "1" : "0";
    this._el.querySelector('[data-role="state"]').textContent = stateLabel;

    const sub = [];
    // Quando l'anta è aperta lo dice già lo stato grande sopra ("🚪 Anta
    // aperta") — ripeterlo qui sotto è ridondante. Quando è chiusa invece è
    // un'informazione in più (utile insieme allo stato serratura), la teniamo.
    if (idPorta && !doorOpen) sub.push("🚪 Chiusa");
    // Il Nuki si scollega di suo (e il mesh, non la scheda). Se si tace,
    // sembra che l'informazione non ci sia mai stata: meglio dire che in
    // questo momento non si riesce a parlarci.
    if (cfg.lock && (!lockState || lockState === "unavailable" || lockState === "unknown"))
      sub.push("🔌 Serratura non raggiungibile");
    // Con l'anta aperta lo stato grande dice gia "Aperta": qui sotto ci sta la
    // serratura, che resta utile sapere (aperta e sbloccata non e come aperta
    // col catenaccio ancora fuori).
    if (doorOpen && lockState === "unlocked") sub.push("🔓 Serratura sbloccata");
    if (doorOpen && (lockState === "locked" || lockState === "locking")) sub.push("🔒 Serratura bloccata");
    if (cfg.battery) { const b = this._num(cfg.battery); if (b != null) sub.push(`🔋 ${Math.round(b)}%`); }
    this._el.querySelector('[data-role="sub"]').innerHTML = sub.map(s => `<span>${s}</span>`).join("");

    const badge = this._el.querySelector('[data-role="sensorbadge"]');
    if (sensors.length) {
      badge.hidden = false;
      badge.dataset.alert = openSensors.length ? "1" : "0";
      // Con 1-2 sensori aperti mostra subito i nomi (non serve aprire
      // l'elenco per saperlo); con di più, solo il numero — altrimenti il
      // badge diventa illeggibile.
      // Quando e tutto chiuso la pastiglia e l'unica cosa che resta in vista:
      // allora dice anche quanti sono e che si puo aprire l'elenco, senno
      // sembra che i sensori siano spariti.
      if (openSensors.length === 0) badge.textContent = `✅ Tutto chiuso · ${sensors.length} sensori`;
      else if (openSensors.length <= 2) {
        const names = openSensors.map(s => s.label || this._name(s.id)).join(", ");
        badge.textContent = `🚨 ${names}`;
      } else badge.textContent = `🚨 ${openSensors.length} sensori aperti/attivi — tocca per vedere quali`;
    } else badge.hidden = true;

    // La griglia mostra SOLO cio che e aperto o attivo. L'elenco completo
    // vive nel popup: tenerlo qui allungava la scheda per dire dieci volte
    // "a posto", che e la cosa meno interessante che ci sia.
    const griglia = this._el.querySelector('[data-role="sensori"]');
    if (sensors.length) {
      griglia.hidden = false;
      const con = sensors.map(x => {
        const st = this._hass.states[x.id];
        return Object.assign({}, x, { on: !!(st && st.state === "on"), t: cscTipo(x.nome) });
      }).sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0) || a.nome.localeCompare(b.nome, "it"));
      // Solo gli aperti. Se e tutto chiuso la griglia sparisce del tutto:
      // la pastiglia verde sopra dice gia quello che c'e da sapere, e la
      // scheda resta corta come dev'essere.
      const mostrati = con.filter(x => x.on);
      griglia.hidden = !mostrati.length;
      griglia.innerHTML = mostrati.map(x => `<div class="csc-sp" data-on="${x.on ? 1 : 0}" title="${this._esc(x.nome)}">
        <span class="csc-spi">${x.t.ico}</span>
        <span class="csc-spn">${this._esc(x.nome)}</span>
        <span class="csc-spq">${x.on ? this._esc(x.t.aperto) : ""}</span>
      </div>`).join("")
        + (con.length > mostrati.length
          ? `<div class="csc-spmore">gli altri ${con.length - mostrati.length} sono a posto — toccami per l'elenco</div>` : "");
    } else griglia.hidden = true;

    const actions = this._el.querySelector('[data-role="actions"]');
    actions.hidden = !cfg.lock;
    // Tre tasti che non fanno niente sembrano un guasto della scheda: se la
    // serratura non risponde, si spengono e lo dicono.
    const giu = !!cfg.lock && (!lockState || lockState === "unavailable" || lockState === "unknown");
    actions.dataset.giu = giu ? "1" : "0";
    actions.querySelectorAll("button").forEach(b => {
      b.disabled = giu;
      b.title = giu ? "La serratura non risponde in questo momento" : "";
    });
    this._el.querySelector('[data-role="activitylink"]').hidden = !cfg.lock;
  }
}
customElements.define("centro-sicurezza-card", CentroSicurezzaCard);

// ===========================================================================
// Editor
// ===========================================================================
class CentroSicurezzaCardEditor extends HTMLElement {
  _esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  _entityName(id) {
    const hs = this._hass ? this._hass.states : {};
    return (hs[id] && hs[id].attributes && hs[id].attributes.friendly_name) || id;
  }

  // Stesso pattern di Mini Card: _typingLock salta il ridisegno mentre
  // l'utente scrive, altrimenti su telefono la tastiera si apre e chiude a
  // ogni carattere (l'editor si ridisegnerebbe da capo a ogni keystroke).
  setConfig(config) {
    this._config = Object.assign({}, CSC_DEFAULTS, config || {});
    if (this._typingLock) return;
    this._render();
  }
  set hass(h) { this._hass = h; if (h && this._config && !this._built) { this._render(); this._built = true; } }

  _emit() { this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true })); }
  _set(key, val) { this._config = Object.assign({}, this._config, { [key]: val }); this._emit(); }

  _pickerHTML(field, domainPrefixes, sel, label, hint) {
    const shown = sel ? this._esc(this._entityName(sel)) : "";
    return `<div class="fld csc-picker" data-field="${field}" data-domains="${domainPrefixes.join(",")}">
      <label>${label}</label>${hint ? `<span class="h">${hint}</span>` : ""}
      <div class="csc-pickwrap">
        <input type="text" class="csc-search" autocomplete="off" placeholder="Cerca sensore o dispositivo..." value="${shown}">
        <button type="button" class="csc-clear" title="Svuota" ${sel ? "" : "hidden"}>✕</button>
        <div class="csc-optlist" hidden></div>
      </div>
    </div>`;
  }

  _wirePicker(container) {
    const field = container.dataset.field;
    const domainPrefixes = container.dataset.domains.split(",");
    const input = container.querySelector(".csc-search");
    const list = container.querySelector(".csc-optlist");
    const clearBtn = container.querySelector(".csc-clear");
    const hs = this._hass ? this._hass.states : {};
    const ids = Object.keys(hs).filter(id => domainPrefixes.some(p => id.startsWith(p)));
    const renderList = filterText => {
      const f = (filterText || "").toLowerCase().trim();
      const matches = (f === "" ? ids : ids.filter(id =>
        this._entityName(id).toLowerCase().includes(f) || id.toLowerCase().includes(f)
      )).slice(0, 80);
      list.innerHTML = matches.length
        ? matches.map(id => `<div class="csc-opt" data-val="${id}">${this._esc(this._entityName(id))}<small>${id}</small></div>`).join("")
        : `<div class="csc-opt csc-opt-empty">Nessun risultato</div>`;
      list.hidden = false;
    };
    input.addEventListener("focus", () => renderList(input.value === this._esc(this._entityName(this._config[field] || "")) ? "" : input.value));
    input.addEventListener("input", () => renderList(input.value));
    input.addEventListener("blur", () => setTimeout(() => { list.hidden = true; }, 150));
    list.addEventListener("mousedown", e => {
      const opt = e.target.closest(".csc-opt[data-val]");
      if (!opt) return;
      e.preventDefault();
      const val = opt.dataset.val;
      input.value = this._entityName(val);
      list.hidden = true;
      clearBtn.hidden = false;
      this._set(field, val);
    });
    clearBtn.addEventListener("mousedown", e => {
      e.preventDefault();
      input.value = "";
      clearBtn.hidden = true;
      this._set(field, "");
    });
  }

  _render() {
    if (!this._config) return;
    const c = this._config;
    this.innerHTML = `<style>
      .cse{display:flex;flex-direction:column;gap:14px;padding:6px 2px;font-family:inherit}
      .cse .fld{display:flex;flex-direction:column;gap:6px;margin-top:8px}
      .cse label{font-size:13px;font-weight:600;color:var(--primary-text-color)}
      .cse .h{font-size:11px;color:var(--secondary-text-color);font-weight:400}
      .cse input,.cse textarea{padding:10px 11px;border-radius:8px;font-size:15px;font-family:inherit;
        border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)}
      .cse textarea{min-height:90px;font-family:monospace;font-size:13px;resize:vertical}
      .cse .note{font-size:11.5px;color:var(--secondary-text-color);line-height:1.5;margin-top:4px}
      .csc-picker{position:relative}
      .csc-pickwrap{position:relative}
      .csc-pickwrap input{width:100%;padding-right:30px}
      .csc-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;
        color:var(--secondary-text-color);font-size:14px;cursor:pointer;padding:4px}
      .csc-optlist{position:absolute;z-index:999;top:calc(100% + 2px);left:0;right:0;max-height:220px;overflow-y:auto;
        background:var(--card-background-color,var(--primary-background-color,#1c1f26));
        border:1px solid var(--divider-color);border-radius:8px;box-shadow:0 10px 26px rgba(0,0,0,.45)}
      .csc-opt{padding:8px 11px;font-size:13.5px;line-height:1.35;color:var(--primary-text-color);cursor:pointer;
        background:var(--card-background-color,var(--primary-background-color,#1c1f26))}
      .csc-opt:hover{background:rgba(var(--rgb-primary-color,3,169,244),.14)}
      .csc-opt small{display:block;font-size:10px;color:var(--secondary-text-color);margin-top:1px}
      .csc-opt-empty{color:var(--secondary-text-color);cursor:default}
      .cse-auto{margin-top:6px;padding:8px 10px;border-radius:9px;cursor:pointer;font:inherit;font-size:12.5px;font-weight:700;
        border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color)}
      .cse-auto:hover{border-color:rgba(255,176,32,.55)}
      .cse-check label{display:flex;align-items:center;gap:8px;cursor:pointer}
      .cse-check input{width:auto}
    </style>
    <div class="cse">
      <div class="fld cse-check"><label>Cosa mostra questa card</label>
        <label><input type="checkbox" id="f_mallarme"${c.mostra_allarme === false ? "" : " checked"}> L'impianto d'allarme</label>
        <label><input type="checkbox" id="f_mporta"${c.mostra_porta === false ? "" : " checked"}> La porta</label>
        <label><input type="checkbox" id="f_mcams"${c.mostra_telecamere === false ? "" : " checked"}> Le telecamere</label>
        <span class="h">Lasciando una sola spunta ottieni una card di solo allarme, di sola porta o di sole telecamere, da mettere dove vuoi nella pagina. Qui sotto compaiono solo i campi che servono a quello che hai scelto.</span></div>

      <div class="fld"><label>Nome</label><input type="text" id="f_name" value="${(c.name || "").replace(/"/g, "&quot;")}"></div>

      ${c.mostra_allarme === false ? "" : this._pickerHTML("alarm", ["alarm_control_panel."], c.alarm, "Impianto d'allarme", "compare in cima con lo stato e i tasti per inserirlo; i modi mostrati sono solo quelli che la centrale dichiara di conoscere")}

      ${c.mostra_porta === false ? "" : `
        ${this._pickerHTML("lock", ["lock."], c.lock, "Serratura (lock.*)", "opzionale — senza, i tasti blocca/sblocca/apri restano nascosti")}
        ${this._pickerHTML("door_sensor", ["binary_sensor."], c.door_sensor, "Sensore anta aperta/chiusa — opzionale")}
        ${this._pickerHTML("battery", ["sensor."], c.battery, "Sensore batteria — opzionale")}`}

      ${c.mostra_allarme === false && c.mostra_porta === false ? "" : `
        <div class="fld"><label>Altri sensori da riepilogare (finestre, volumetrici...)</label>
          <span class="h">Lascia vuoto: i sensori attaccati alla centrale scelta qui sopra li trova da solo, con il loro nome. Scrivili solo se ne vuoi alcuni o vuoi rinominarli — un'entità per riga, es. binary_sensor.finestra_sala oppure binary_sensor.finestra_sala|Finestra Sala</span>
          <textarea id="f_sensors" placeholder="vuoto = li trova da solo dalla centrale">${this._esc(c.sensors || "")}</textarea></div>`}

      ${c.mostra_telecamere === false ? "" : `
        <div class="fld"><label>Telecamere</label>
          <span class="h">Una per riga, es. camera.telecamera_giardino oppure camera.telecamera_giardino|Giardino per dargli un nome. Le anteprime si aggiornano da sole; al tocco si apre il video dal vivo.</span>
          <textarea id="f_camlist" placeholder="camera.telecamera_giardino|Giardino&#10;camera.telecamera_sala|Sala">${this._esc(c.cameras || "")}</textarea>
          <button type="button" class="cse-auto" id="f_camauto">Prendi tutte le telecamere della casa</button></div>`}

      <div class="note">💡 La card mostra "✅ Tutto chiuso" o "🚨 N aperti" e, toccando, l'elenco di quali. Tocca "Ultime attività" per lo storico della serratura (serve la serratura configurata).</div>
    </div>`;
    const on = (id, ev, fn) => { const el = this.querySelector(id); if (el) el.addEventListener(ev, fn); };
    on("#f_name", "input", e => this._set("name", e.target.value));
    on("#f_sensors", "input", e => this._set("sensors", e.target.value));
    on("#f_camlist", "input", e => this._set("cameras", e.target.value));
    // Le tre spunte cambiano anche QUALI campi si vedono: dopo averle toccate
    // il pannello va ridisegnato, altrimenti restano i campi di prima.
    const spunta = (id, campo) => on(id, "change", e => {
      this._set(campo, e.target.checked);
      this._render();
    });
    spunta("#f_mporta", "mostra_porta");
    spunta("#f_mallarme", "mostra_allarme");
    spunta("#f_mcams", "mostra_telecamere");
    // Scriverle a mano una per una e' lavoro inutile: le telecamere le sa gia
    // Home Assistant. Si scartano quelle che non sono di sorveglianza (il
    // browser, i tablet, il flusso della stampante 3D).
    on("#f_camauto", "click", () => {
      const hs = this._hass ? this._hass.states : {};
      const scarto = /browser_mod|tablet|stampante|printer|^camera\.[0-9a-f]{8}_/i;
      const righe = Object.keys(hs)
        .filter(id => id.startsWith("camera.") && !scarto.test(id))
        .map(id => {
          const n = (hs[id].attributes && hs[id].attributes.friendly_name) || "";
          return n ? id + "|" + n : id;
        });
      this._set("cameras", righe.join("\n"));
      this._render();
    });
    this.querySelectorAll(".csc-picker").forEach(p => this._wirePicker(p));
    this.querySelectorAll('input[type="text"], textarea').forEach(inp => {
      inp.addEventListener("focus", () => { this._typingLock = true; });
      inp.addEventListener("blur", () => { this._typingLock = false; });
    });
  }
}
customElements.define("centro-sicurezza-card-editor", CentroSicurezzaCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "centro-sicurezza-card",
  name: "Centro Sicurezza Card",
  description: "Centro sicurezza: impianto d'allarme con inserimento, porta blindata, sensori di finestre e volumetrici, e le telecamere con anteprima dal vivo. Tutto in una card.",
  preview: true,
  documentationURL: "https://github.com/cristianwebonline/ha-centro-sicurezza-card",
});
