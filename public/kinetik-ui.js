export function renderApp(root) {
  root.innerHTML = `
    <div class="header">
      <div class="badge"><span>K</span></div>
      <div>
        <h1>KINETIK</h1>
        <div class="sub" id="envLabel">Initializing…</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="k">Kinetic hashrate</div>
        <div class="v" id="hashrate">0.00 KH/s</div>
      </div>
      <div class="card">
        <div class="k">Steps (session)</div>
        <div class="v" id="steps">0</div>
      </div>
      <div class="card">
        <div class="k">Blocks mined (today)</div>
        <div class="v" id="blocks">0</div>
      </div>
      <div class="card">
        <div class="k">Daily target</div>
        <div class="v" id="target">1 block</div>
      </div>
    </div>

    <div class="row">
      <div class="btnrow">
        <button class="primary" id="btnConfirm">Confirm Transaction</button>
        <button id="btnTip">Tip</button>
      </div>
      <div class="btnrow">
        <button id="btnReset">Reset Session</button>
        <button class="danger" id="btnStop" disabled>Stop</button>
      </div>
    </div>

    <div class="note" id="note">
      Walk like you’re mining. Every ~1,000 steps mines a block. If motion stops, hashrate drops to zero.
      <br/><br/>
      <span style="color: rgba(200,242,255,0.85); font-weight: 800;">MVP note:</span>
      Step counting uses device motion when available; otherwise Kinetik estimates steps by time while the session is running.
    </div>
  `;
}

export function qs(id) { return document.getElementById(id); }

export function toast(msg) {
  const el = qs("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

export function setEnvLabel(text) {
  const el = qs("envLabel");
  if (el) el.textContent = text;
}