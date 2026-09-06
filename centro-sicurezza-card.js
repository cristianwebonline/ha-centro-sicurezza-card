/*! Centro Sicurezza Card — porta blindata/serratura + sensori d'allarme in
 *  UNA card sola: blocco/sblocco/apri con conferma, stato anta, batteria,
 *  panoramica sensori (finestre/volumetrici/vibrazione) con dettaglio,
 *  ultime attività dal logbook. Pensata per sostituire una vista fatta di
 *  tante mushroom-template-card ripetute, ognuna con il suo CSS a mano.
 */
const CSC_VERSION = "1.0.1";
console.info(`%c CENTRO-SICUREZZA-CARD %c v${CSC_VERSION} `,
  "color:#2b0a0a;background:#ff5442;font-weight:700;border-radius:4px 0 0 4px",
  "color:#ffe0da;background:#1a1b21;border-radius:0 4px 4px 0");

const CSC_DEFAULTS = {
  name: "Porta Blindata",
  lock: "", door_sensor: "", battery: "", sensors: "",
};

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

// Icona porta+lucchetto: colore e animazione seguono lo stato complessivo
// (safe = tutto ok, warn = sbloccata, danger = anta aperta o sensore
// scattato, busy = bloccaggio/sbloccaggio in corso).
function cscIconDoor(status) {
  const palette = {
    safe: { a: "#38e08a", b: "#1f9c5c" },
    warn: { a: "#ffb020", b: "#c47a00" },
    danger: { a: "#ff5442", b: "#c22e1e" },
    busy: { a: "#ffd166", b: "#c99a1a" },
  }[status] || { a: "#8a94a1", b: "#5b6472" };
  return `
  <svg viewBox="0 0 100 100" class="csc-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cscDoorBody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a5261"/><stop offset=".5" stop-color="#3a4150"/><stop offset="1" stop-color="#2a3040"/></linearGradient>
      <radialGradient id="cscLockGlow" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="${palette.a}"/><stop offset="1" stop-color="${palette.b}"/></radialGradient>
      <radialGradient id="cscAmbGlow" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${palette.a}" stop-opacity=".35"/><stop offset="1" stop-color="${palette.a}" stop-opacity="0"/></radialGradient>
      <radialGradient id="cscShadowDoor" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".4"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse class="csc-glow" cx="50" cy="52" rx="34" ry="30" fill="url(#cscAmbGlow)"/>
    <ellipse cx="50" cy="90" rx="26" ry="4.5" fill="url(#cscShadowDoor)"/>
    <rect x="26" y="10" width="48" height="78" rx="4" fill="url(#cscDoorBody)" stroke="#12141a" stroke-width="1.6"/>
    <rect x="31" y="15" width="38" height="68" rx="2" fill="none" stroke="#5b6472" stroke-width="1.2" opacity=".6"/>
    <circle class="csc-lockled" cx="63" cy="50" r="9" fill="url(#cscLockGlow)"/>
    <rect class="csc-lockled" x="59" y="46" width="8" height="10" rx="2" fill="#12141a" opacity=".55"/>
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

  // Righe tipo "entity_id" o "entity_id|Nome personalizzato".
  _sensorList() {
    return (this._cfg.sensors || "").split("\n").map(l => l.trim()).filter(Boolean).map(line => {
      const [id, label] = line.split("|").map(s => s.trim());
      return { id, label: label || null };
    });
  }

  _build() {
    this.innerHTML = `
    <style>
      .csc{--csc-panel:rgba(30,38,48,.72);--csc-stroke:rgba(255,255,255,.09);--csc-ink:#eaf1f8;--csc-muted:#93a1b0;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:var(--csc-ink);padding:6px;
        min-height:100%;display:flex;flex-direction:column}
      .csc *{box-sizing:border-box}
      .csc-card{background:var(--csc-panel);border:1px solid var(--csc-stroke);border-radius:22px;padding:16px 14px;
        flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;backdrop-filter:blur(14px);
        box-shadow:0 10px 26px rgba(0,0,0,.35);position:relative;overflow:hidden;transition:background-color .5s,border-color .5s}
      .csc-card::before{content:"";position:absolute;inset:0;border-radius:22px;pointer-events:none;
        background:radial-gradient(120% 60% at 50% -10%,rgba(255,255,255,.06),transparent 60%)}
      .csc-card[data-status="danger"]{background-color:rgba(255,84,66,.1);border-color:rgba(255,84,66,.32)}
      .csc-card[data-status="warn"]{background-color:rgba(255,176,32,.08);border-color:rgba(255,176,32,.28)}
      .csc-card[data-status="safe"]{background-color:rgba(56,224,138,.07);border-color:rgba(56,224,138,.24)}
      .csc-iconwrap{width:68px;height:68px}
      .csc-svg{width:100%;height:100%;display:block;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}
      .csc-glow{opacity:.2;transition:opacity .5s}
      .csc-card[data-status="danger"] .csc-glow{opacity:1;animation:csc-pulse 1.4s ease-in-out infinite}
      .csc-card[data-status="warn"] .csc-glow{opacity:.85;animation:csc-pulse 2.2s ease-in-out infinite}
      .csc-card[data-status="busy"] .csc-glow{opacity:.85;animation:csc-pulse .8s ease-in-out infinite}
      @keyframes csc-pulse{0%,100%{opacity:.4}50%{opacity:1}}
      .csc-lockled{transition:opacity .4s}
      .csc-card[data-status="danger"] .csc-lockled{filter:drop-shadow(0 0 6px #ff5442)}
      .csc-name{font-size:16px;font-weight:800;margin-top:2px}
      .csc-state{font-size:13.5px;font-weight:800;color:var(--csc-muted);text-align:center}
      .csc-card[data-status="safe"] .csc-state{color:#8ff0b4}
      .csc-card[data-status="warn"] .csc-state{color:#ffd28a}
      .csc-card[data-status="danger"] .csc-state{color:#ffb0a3;animation:csc-blink 1s ease-in-out infinite}
      .csc-card[data-status="busy"] .csc-state{color:#ffe6a3}
      @keyframes csc-blink{0%,100%{opacity:1}50%{opacity:.5}}
      .csc-sub{display:flex;gap:14px;font-size:11.5px;color:var(--csc-muted);margin-top:2px;flex-wrap:wrap;justify-content:center}
      .csc-badge{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;margin-top:8px;
        font-size:11.5px;font-weight:800;background:rgba(255,255,255,.06);border:1px solid var(--csc-stroke);
        color:var(--csc-muted);cursor:pointer;width:100%;justify-content:center}
      .csc-badge[data-alert="1"]{background:rgba(255,84,66,.16);border-color:rgba(255,84,66,.4);color:#ffb0a3;animation:csc-blink 1.4s ease-in-out infinite}
      .csc-badge[data-alert="0"]{background:rgba(56,224,138,.1);border-color:rgba(56,224,138,.3);color:#8ff0b4}
      .csc-actions{display:flex;gap:8px;width:100%;margin-top:10px}
      .csc-btn{flex:1;background:rgba(255,255,255,.06);border:1px solid var(--csc-stroke);color:var(--csc-ink);
        border-radius:12px;padding:10px 6px;font-size:12.5px;font-weight:700;cursor:pointer;transition:filter .15s;text-align:center}
      .csc-btn:hover{filter:brightness(1.25)}
      .csc-btn.warn{background:rgba(255,84,66,.14);border-color:rgba(255,84,66,.35)}
      .csc-link{margin-top:8px;font-size:11px;font-weight:700;color:var(--csc-muted);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
      .csc-scrim{position:fixed;inset:0;background:rgba(4,5,8,.62);backdrop-filter:blur(6px);display:flex;
        align-items:center;justify-content:center;padding:22px;z-index:9;opacity:0;pointer-events:none;transition:opacity .18s}
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
      .csc-etime{color:var(--csc-muted);white-space:nowrap;flex:0 0 auto}
    </style>
    <div class="csc">
      <div class="csc-card" data-role="card">
        <div class="csc-iconwrap" data-role="iconwrap"></div>
        <div class="csc-name">${this._esc(this._cfg.name)}</div>
        <div class="csc-state" data-role="state">—</div>
        <div class="csc-sub" data-role="sub"></div>
        <div class="csc-badge" data-role="sensorbadge" hidden>—</div>
        <div class="csc-actions" data-role="actions" hidden>
          <button class="csc-btn" data-role="btn-unlock">🔓 Sblocca</button>
          <button class="csc-btn" data-role="btn-lock">🔒 Blocca</button>
          <button class="csc-btn warn" data-role="btn-open">🚪 Apri</button>
        </div>
        <div class="csc-link" data-role="activitylink" hidden>Ultime attività</div>
      </div>
    </div>`;
    stopSwipeNavHijack(this.querySelector(".csc"));
    this._el = this.querySelector('[data-role="card"]');
    this.querySelector('[data-role="btn-lock"]').onclick = () => this._confirm("Bloccare la porta?", () => this._call("lock", "lock"));
    this.querySelector('[data-role="btn-unlock"]').onclick = () => this._confirm("Sbloccare la porta?", () => this._call("lock", "unlock"));
    this.querySelector('[data-role="btn-open"]').onclick = () => this._confirm("Aprire la porta blindata?", () => this._call("lock", "open"));
    this.querySelector('[data-role="sensorbadge"]').onclick = () => this._openSensors();
    this.querySelector('[data-role="activitylink"]').onclick = () => this._openActivity();
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
      return { ...s, on: !!(st && st.state === "on") };
    });
    // I sensori aperti/attivi vanno in cima, ben visibili — non deve servire
    // scorrere l'elenco per capire quale sia scattato.
    list.sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0));
    const openCount = list.filter(s => s.on).length;
    const rows = list.map(s => {
      const label = s.label || this._name(s.id);
      return `<div class="csc-srow" data-on="${s.on ? 1 : 0}"><span class="csc-sdot"></span><span style="flex:1">${this._esc(label)}</span>
        <span>${s.on ? "⚠️ Aperto/attivo" : "OK"}</span></div>`;
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

  _update() {
    if (!this._el) return;
    const cfg = this._cfg;
    const lockState = cfg.lock && this._hass.states[cfg.lock] ? this._hass.states[cfg.lock].state : null;
    const doorOpen = cfg.door_sensor ? this._hass.states[cfg.door_sensor] && this._hass.states[cfg.door_sensor].state === "on" : false;
    const sensors = this._sensorList();
    const openSensors = sensors.filter(s => { const st = this._hass.states[s.id]; return st && st.state === "on"; });

    let status = "safe", stateLabel = "—";
    if (doorOpen) { status = "danger"; stateLabel = "🚪 Anta aperta"; }
    else if (lockState === "locking" || lockState === "unlocking") { status = "busy"; stateLabel = lockState === "locking" ? "Bloccaggio in corso..." : "Sbloccaggio in corso..."; }
    else if (lockState === "unlocked") { status = "warn"; stateLabel = "🔓 Sbloccata"; }
    else if (lockState === "locked") { status = openSensors.length ? "warn" : "safe"; stateLabel = "🔒 Bloccata"; }
    else if (openSensors.length) { status = "warn"; stateLabel = "Sensori attivi"; }

    this._el.dataset.status = status;
    this._el.querySelector('[data-role="iconwrap"]').innerHTML = cscIconDoor(status);
    this._el.querySelector('[data-role="state"]').textContent = stateLabel;

    const sub = [];
    // Quando l'anta è aperta lo dice già lo stato grande sopra ("🚪 Anta
    // aperta") — ripeterlo qui sotto è ridondante. Quando è chiusa invece è
    // un'informazione in più (utile insieme allo stato serratura), la teniamo.
    if (cfg.door_sensor && !doorOpen) sub.push("🚪 Chiusa");
    if (cfg.battery) { const b = this._num(cfg.battery); if (b != null) sub.push(`🔋 ${Math.round(b)}%`); }
    this._el.querySelector('[data-role="sub"]').innerHTML = sub.map(s => `<span>${s}</span>`).join("");

    const badge = this._el.querySelector('[data-role="sensorbadge"]');
    if (sensors.length) {
      badge.hidden = false;
      badge.dataset.alert = openSensors.length ? "1" : "0";
      // Con 1-2 sensori aperti mostra subito i nomi (non serve aprire
      // l'elenco per saperlo); con di più, solo il numero — altrimenti il
      // badge diventa illeggibile.
      if (openSensors.length === 0) badge.textContent = "✅ Tutto chiuso";
      else if (openSensors.length <= 2) {
        const names = openSensors.map(s => s.label || this._name(s.id)).join(", ");
        badge.textContent = `🚨 ${names}`;
      } else badge.textContent = `🚨 ${openSensors.length} sensori aperti/attivi — tocca per vedere quali`;
    } else badge.hidden = true;

    const actions = this._el.querySelector('[data-role="actions"]');
    actions.hidden = !cfg.lock;
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
    </style>
    <div class="cse">
      <div class="fld"><label>Nome</label><input type="text" id="f_name" value="${(c.name || "").replace(/"/g, "&quot;")}"></div>
      ${this._pickerHTML("lock", ["lock."], c.lock, "Serratura (lock.*)", "opzionale — senza, i tasti blocca/sblocca/apri restano nascosti")}
      ${this._pickerHTML("door_sensor", ["binary_sensor."], c.door_sensor, "Sensore anta aperta/chiusa — opzionale")}
      ${this._pickerHTML("battery", ["sensor."], c.battery, "Sensore batteria — opzionale")}
      <div class="fld"><label>Altri sensori da riepilogare (finestre, volumetrici...)</label>
        <span class="h">Un'entità per riga, es. binary_sensor.finestra_sala oppure binary_sensor.finestra_sala|Finestra Sala per dargli un nome</span>
        <textarea id="f_sensors" placeholder="binary_sensor.finestra_sala|Finestra Sala&#10;binary_sensor.volumetrico_sala">${this._esc(c.sensors || "")}</textarea></div>
      <div class="note">💡 La card mostra "✅ Tutto chiuso" o "🚨 N aperti" e, toccando, l'elenco di quali. Tocca "Ultime attività" per lo storico della serratura (serve la serratura configurata).</div>
    </div>`;
    const on = (id, ev, fn) => { const el = this.querySelector(id); if (el) el.addEventListener(ev, fn); };
    on("#f_name", "input", e => this._set("name", e.target.value));
    on("#f_sensors", "input", e => this._set("sensors", e.target.value));
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
  description: "Porta blindata/serratura + sensori d'allarme in una card sola: blocca/sblocca/apri con conferma, stato anta, batteria, panoramica sensori con dettaglio, ultime attività.",
  preview: true,
  documentationURL: "https://github.com/cristianwebonline/ha-centro-sicurezza-card",
});
