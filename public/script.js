import { sdk } from "https://esm.sh/@farcaster/miniapp-sdk";
import { Attribution } from "https://esm.sh/ox/erc8021";
import { renderApp, qs, toast, setEnvLabel } from "./kinetik-ui.js";

const APP_NAME = "Kinetik";
const STEPS_PER_BLOCK = 1000;

// -------------------------
// TIP BUTTON + BUILDER CODE (MANDATORY, DO NOT MODIFY)
// -------------------------
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DECIMALS = 6;

const BUILDER_CODE = "TODO_REPLACE_BUILDER_CODE";
// User can find this at base.dev → Settings → Builder Code

const RECIPIENT = "0x0000000000000000000000000000000000000000"; // TODO: Must be checksummed EVM address

const dataSuffix = Attribution.toDataSuffix({
  codes: [BUILDER_CODE]
});

// Allowed chains:
const BASE_MAINNET = "0x2105";
const BASE_SEPOLIA = "0x14a34";

// -------------------------
// Utilities
// -------------------------
function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `kinetik:blocks:${yyyy}-${mm}-${dd}`;
}

function getBlocksToday() {
  return Number(localStorage.getItem(todayKey()) || "0");
}
function setBlocksToday(n) {
  localStorage.setItem(todayKey(), String(n));
}

function pad64(hexNo0x) {
  return hexNo0x.padStart(64, "0");
}

function encodeERC20Transfer(to, amountBaseUnitsBigInt) {
  // a9059cbb + 32-byte address + 32-byte amount
  const selector = "a9059cbb";
  const addr = to.toLowerCase().replace(/^0x/, "");
  const amt = amountBaseUnitsBigInt.toString(16);
  return "0x" + selector + pad64(addr) + pad64(amt);
}

function parseAmountToBaseUnits(inputStr) {
  const s = (inputStr || "").trim();
  if (!s) return null;
  // Accept up to DECIMALS decimals
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, fracRaw=""] = s.split(".");
  const frac = (fracRaw + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  const wholeBI = BigInt(whole);
  const fracBI = BigInt(frac);
  const base = BigInt(10) ** BigInt(DECIMALS);
  const val = wholeBI * base + fracBI;
  if (val <= 0n) return null;
  return val;
}

function isTodoRecipientOrBuilder() {
  if (!RECIPIENT || RECIPIENT === "0x0000000000000000000000000000000000000000") return true;
  if (!BUILDER_CODE || BUILDER_CODE.startsWith("TODO_")) return true;
  return false;
}

async function ensureBaseChain(eth) {
  const chainId = await eth.request({ method: "eth_chainId" });
  if (chainId === BASE_MAINNET || chainId === BASE_SEPOLIA) return chainId;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_MAINNET }]
    });
    return BASE_MAINNET;
  } catch (e) {
    throw new Error("Please switch to Base (0x2105) in your wallet to tip.");
  }
}

// -------------------------
// Tip sheet state machine
// -------------------------
const TIP_PRESETS = ["1", "5", "10", "25"];

let tipState = "idle"; // idle | preparing | confirm | sending | done
let selectedPreset = "5";

function setTipCTA(text, disabled=false) {
  const btn = qs("tipCta");
  btn.textContent = text;
  btn.disabled = disabled;
}

function openSheet() {
  qs("sheetBackdrop").classList.add("open");
  qs("tipSheet").classList.add("open");
  qs("sheetBackdrop").setAttribute("aria-hidden","false");
}

function closeSheet() {
  qs("sheetBackdrop").classList.remove("open");
  qs("tipSheet").classList.remove("open");
  qs("sheetBackdrop").setAttribute("aria-hidden","true");
}

function buildPresets() {
  const row = qs("presetRow");
  row.innerHTML = "";
  TIP_PRESETS.forEach(v => {
    const div = document.createElement("div");
    div.className = "chip" + (v === selectedPreset ? " active" : "");
    div.textContent = `$${v}`;
    div.addEventListener("click", () => {
      selectedPreset = v;
      qs("customAmount").value = "";
      buildPresets();
    });
    row.appendChild(div);
  });
}

function getTipAmountString() {
  const custom = (qs("customAmount").value || "").trim();
  if (custom) return custom;
  return selectedPreset;
}

// Pre-transaction emotional UX: animate 1–1.5 seconds BEFORE wallet opens
function playPreTxAnimation() {
  return new Promise(resolve => {
    const btn = qs("tipCta");
    btn.animate([
      { transform: "translateY(0px) scale(1)", filter: "brightness(1)" },
      { transform: "translateY(-1px) scale(1.01)", filter: "brightness(1.15)" },
      { transform: "translateY(0px) scale(1)", filter: "brightness(1)" },
    ], { duration: 1200, iterations: 1, easing: "ease-in-out" });
    setTimeout(resolve, 1200);
  });
}

async function sendTipUSDC() {
  if (isTodoRecipientOrBuilder()) {
    toast("Tip disabled: set RECIPIENT + BUILDER_CODE in script.js");
    return;
  }

  const amountStr = getTipAmountString();
  const amountBI = parseAmountToBaseUnits(amountStr);
  if (!amountBI) {
    toast("Enter a valid positive amount.");
    return;
  }

  const eth = window.ethereum;
  if (!eth || !eth.request) {
    toast("No wallet detected in this environment.");
    return;
  }

  try {
    tipState = "preparing";
    setTipCTA("Preparing tip…", true);

    await playPreTxAnimation();

    tipState = "confirm";
    setTipCTA("Confirm in wallet", true);

    const accounts = await eth.request({ method: "eth_requestAccounts" });
    const from = accounts?.[0];
    if (!from) throw new Error("No account returned from wallet.");

    const chainId = await ensureBaseChain(eth);

    const data = encodeERC20Transfer(RECIPIENT, amountBI);

    tipState = "sending";
    setTipCTA("Sending…", true);

    // MUST use wallet_sendCalls (ERC-5792)
    const params = {
      version: "2.0.0",
      from,
      chainId,
      atomicRequired: true,
      calls: [{
        to: USDC_CONTRACT,
        value: "0x0",
        data
      }],
      capabilities: {
        dataSuffix
      }
    };

    await eth.request({
      method: "wallet_sendCalls",
      params: [params]
    });

    tipState = "done";
    setTipCTA("Send again", false);
    toast("Tip sent. Thank you!");
  } catch (e) {
    // user rejection or wallet errors: reset gracefully
    tipState = "idle";
    setTipCTA("Send USDC", false);
    const msg = (e && e.message) ? e.message : "Tip cancelled.";
    toast(msg.includes("User rejected") ? "Tip cancelled." : msg);
  }
}

// -------------------------
// Walk mining logic (motion-first, timer fallback)
// -------------------------
let sessionOn = false;
let estSteps = 0;
let lastMotionTs = 0;
let lastTick = 0;
let hasMotion = false;

// Motion step heuristic: count peaks in acceleration magnitude
let lastMag = 0;
let peakCooldown = 0;

function setSessionButtons() {
  qs("btnConfirm").disabled = sessionOn;
  qs("btnStop").disabled = !sessionOn;
}

function setHashrate(kh) {
  qs("hashrate").textContent = `${kh.toFixed(2)} KH/s`;
}

function setSteps(n) {
  qs("steps").textContent = String(n);
}

function refreshBlocks() {
  qs("blocks").textContent = String(getBlocksToday());
}

function maybeMineBlock() {
  const blocksFromSteps = Math.floor(estSteps / STEPS_PER_BLOCK);
  const minedAlready = getBlocksToday();
  if (blocksFromSteps > minedAlready) {
    setBlocksToday(blocksFromSteps);
    refreshBlocks();
    toast("Block mined ✅");
  }
}

function onMotion(e) {
  // iOS may provide null; keep safe
  const acc = e.accelerationIncludingGravity || e.acceleration;
  if (!acc) return;

  const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;
  const mag = Math.sqrt(x*x + y*y + z*z);

  // high-pass-ish: detect peaks above threshold
  const delta = mag - lastMag;
  lastMag = mag;

  const now = Date.now();
  lastMotionTs = now;
  hasMotion = true;

  if (peakCooldown > 0) {
    peakCooldown -= 1;
    return;
  }

  // threshold tuned for "walking"
  if (mag > 12.2 && delta > 0.35) {
    estSteps += 1;
    peakCooldown = 3; // basic debounce
  }
}

async function requestMotionPermissionIfNeeded() {
  try {
    const DME = window.DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === "function") {
      const res = await DME.requestPermission();
      if (res !== "granted") {
        toast("Motion permission denied — using time estimate.");
      }
    }
  } catch {
    // ignore
  }
}

function tick() {
  if (!sessionOn) return;
  const now = Date.now();
  if (!lastTick) lastTick = now;
  const dt = Math.max(0, now - lastTick);
  lastTick = now;

  // If we haven't received motion in a bit, fallback estimate while session is active
  const sinceMotion = now - (lastMotionTs || 0);

  // Estimated step rate when no motion: 120 steps/min = 2 steps/sec
  if (!hasMotion || sinceMotion > 2500) {
    const add = Math.floor((dt / 1000) * 2);
    if (add > 0) estSteps += add;
  }

  // Hashrate: if motion recently, scale; else 0
  let kh = 0;
  if (hasMotion && sinceMotion <= 1200) {
    // "kinetic hashrate": 0.5–2.5 KH/s feel
    kh = 0.8 + Math.min(1.7, (1200 - sinceMotion) / 700);
  } else {
    kh = 0;
  }

  setHashrate(kh);
  setSteps(estSteps);
  maybeMineBlock();

  requestAnimationFrame(tick);
}

async function startSession() {
  sessionOn = true;
  setSessionButtons();
  toast("Session started. Walk to mine.");
  await requestMotionPermissionIfNeeded();
  window.addEventListener("devicemotion", onMotion, { passive: true });
  lastTick = 0;
  requestAnimationFrame(tick);
}

function stopSession() {
  sessionOn = false;
  setSessionButtons();
  window.removeEventListener("devicemotion", onMotion);
  setHashrate(0);
  toast("Session stopped.");
}

function resetSession() {
  estSteps = 0;
  hasMotion = false;
  lastMotionTs = 0;
  lastMag = 0;
  peakCooldown = 0;
  setSteps(0);
  setHashrate(0);
  toast("Session reset.");
}

// -------------------------
// Mini App SDK integration
// -------------------------
window.addEventListener("load", async () => {
  const root = document.getElementById("app");
  renderApp(root);

  // Tip sheet bindings
  buildPresets();
  qs("btnTip").addEventListener("click", () => {
    openSheet();
  });
  qs("sheetBackdrop").addEventListener("click", closeSheet);
  qs("tipCta").addEventListener("click", async () => {
    // enforce state machine labels
    if (tipState === "done") {
      tipState = "idle";
      setTipCTA("Send USDC", false);
    }
    await sendTipUSDC();
  });

  // Walk controls
  qs("btnConfirm").addEventListener("click", startSession);
  qs("btnStop").addEventListener("click", stopSession);
  qs("btnReset").addEventListener("click", resetSession);

  refreshBlocks();
  setSessionButtons();

  // Environment detection
  let isMini = false;
  try {
    isMini = await sdk.isInMiniApp();
  } catch {
    isMini = false;
  }
  setEnvLabel(isMini ? "In Mini App" : "In Browser");

  // Update primary CTA label depending on env
  qs("btnConfirm").textContent = isMini ? "Start Walking" : "Confirm Transaction";

  // ALWAYS call ready()
  try {
    await sdk.actions.ready();
  } catch {
    // don't crash
  }

  // Tip disabled hint
  if (isTodoRecipientOrBuilder()) {
    // Keep CTA enabled but show toast on attempt; also visually hint
    qs("tipHint").textContent = "Tip disabled until RECIPIENT + BUILDER_CODE are set in script.js (no crashes).";
  }
});