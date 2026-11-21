// Mars68 RGB Studio — เซิร์ฟเวอร์ที่คุยกับคีย์บอร์ดเอง (node-hid) ไฟจึงวิ่งต่อแม้ปิดหน้าเว็บ
// หน้าเว็บ http://localhost:8768 เป็นแค่ตัวตั้งค่า + พรีวิว
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const E = require("./engine.js");
let HID = null; try { HID = require("node-hid"); } catch (e) { console.error("โหลด node-hid ไม่ได้ — รัน npm install ในโฟลเดอร์ studio ก่อน", e.message); }

const PORT = 8768, ROOT = __dirname;
// ในแอปที่ติดตั้งแล้ว โฟลเดอร์โปรแกรมเขียนไม่ได้ → แอปส่งโฟลเดอร์ข้อมูลมาทาง MARS68_DATA_DIR
const STATE_FILE = path.join(process.env.MARS68_DATA_DIR || ROOT, "state.json");
let onQuit = () => process.exit(0);
const { VID, USAGE_PAGE, USAGE } = E;   // รุ่นที่รองรับอยู่ใน E.MODELS (ตระกูล Mars68)
const DEFAULT_HW = { mode: 1, speed: 2, bright: 4, dir: 0, full: true, color: [255, 255, 255] };

// ------------------------------------------------------------ สถานะ
const st = {
  dev: null, version: "", ledMode: null, model: null, gamma: 2.2,   // gamma: แก้สีให้ LED ตรงกับจอ
  running: false,          // กำลังสตรีมเฟรม (custom/image/probe)
  scene: null,             // ฉากล่าสุดที่หน้าเว็บส่งมา
  hw: null,                // เอฟเฟกต์ในตัวล่าสุดที่เลือก (ใช้คืนค่าเมื่อหยุด)
  t0: Date.now(), fps: 0, lastSent: null, needMode13: true, logs: [], cache: {},
};
function log(msg) { const line = new Date().toLocaleTimeString() + "  " + msg; st.logs.unshift(line); st.logs.length = Math.min(st.logs.length, 200); console.log(line); }

// ------------------------------------------------------------ บันทึก/โหลด
function decodeScene(s) {
  if (!s) return null;
  const scene = { ...s };
  if (s.image && s.image.frames) {
    const frames = s.image.frames.map(f => ({ dur: Math.max(20, +f.dur || 100), data: new Uint8ClampedArray(Buffer.from(f.data, "base64")) }))
      .filter(f => f.data.length === E.CW * E.CH * 4);
    scene.image = { ...s.image, frames, total: frames.reduce((a, f) => a + f.dur, 0) || 1 };
  }
  return scene;
}
function save(rawScene) {
  try {
    const prev = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
    const out = { ...prev, hw: st.hw, running: st.running, gamma: st.gamma };
    if (rawScene !== undefined) out.scene = rawScene;
    fs.writeFileSync(STATE_FILE, JSON.stringify(out));
  } catch (e) { log("บันทึกสถานะไม่ได้: " + e.message); }
}
function load() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    st.hw = s.hw || null; if (s.gamma >= 1 && s.gamma <= 3) st.gamma = s.gamma; st.scene = decodeScene(s.scene); st.running = !!(s.running && st.scene);
    if (st.running) log("กลับมาเล่นฉากล่าสุดต่อ");
  } catch (e) { log("อ่าน state.json ไม่ได้: " + e.message); }
}

// ------------------------------------------------------------ HID
function xfer(pkt) {
  if (!E.ALLOWED_CMDS.includes(pkt[0])) throw new Error("คำสั่งไม่อยู่ในรายการอนุญาต 0x" + pkt[0].toString(16));
  st.dev.sendFeatureReport([0, ...pkt]);
  let r = st.dev.getFeatureReport(0, 65);
  if (r.length > 64 || (r[0] === 0 && r[1] === pkt[0])) r = r.slice(1);
  return r;
}
function connect() {
  if (st.dev || !HID) return;
  const info = HID.devices().find(d => d.vendorId === VID && E.SUPPORTED_PIDS.includes(d.productId) && d.usagePage === USAGE_PAGE && d.usage === USAGE);
  if (!info) return;
  try {
    st.dev = new HID.HID(info.path);
    st.model = E.identifyModel(info.productId, info.product || "");
    const v = xfer(E.pktVersion()); st.version = v[0] === 0x8F ? ((v[8] << 8) | v[7]).toString(16) : "?";
    readLed();
    st.needMode13 = true; st.lastSent = null;
    log(`เชื่อมต่อ ${st.model ? st.model.name : "คีย์บอร์ด"} แล้ว ("${info.product || "?"}", PID 0x${info.productId.toString(16)}, เฟิร์มแวร์ ${st.version}, โหมดไฟ ${st.ledMode})`);
  } catch (e) { log("เปิดอุปกรณ์ไม่ได้: " + e.message); dropDevice(); }
}
function dropDevice() { try { st.dev && st.dev.close(); } catch {} st.dev = null; st.model = null; }
// คำตอบ GetLed ที่ถูกต้องต้องมี flag สี 7/8 — ถ้าเฟิร์มแวร์ยังยุ่ง มันจะส่งคำขอของเรากลับมาเฉย ๆ (ไบต์เป็น 0)
const ledReplyValid = l => l[0] === 0x87 && ((l[4] & 15) === 7 || (l[4] & 15) === 8);
// รอจนคีย์บอร์ดพร้อมรับคำสั่ง (ปกติ <1 ms, บางช่วงเฟิร์มแวร์ยุ่ง ~90 ms) — คืนคำตอบ GetLed หรือ null ถ้าหมดเวลา
function waitReady(maxMs = 200) {
  const t = Date.now();
  for (;;) { const l = xfer(E.pktGetLed()); if (ledReplyValid(l)) return l; if (Date.now() - t > maxMs) return null; }
}
function readLed() { const l = waitReady(); if (l) st.ledMode = l[1]; return l; }
// แบบไม่บล็อก/ไม่กิน CPU: ระหว่างเฟิร์มแวร์ยุ่งจะพักทีละ 4 ms
async function waitReadyAsync(maxMs = 300) {
  const t = Date.now();
  for (;;) {
    const l = xfer(E.pktGetLed()); if (ledReplyValid(l)) return l;
    if (Date.now() - t > maxMs) return null;
    await new Promise(r => setTimeout(r, 4));
  }
}

function applyHw(hw) {
  if (!st.dev) return false;
  waitReady(); xfer(E.pktSetLed({ ...hw, color: E.gammaColor(hw.color || [255, 255, 255], st.gamma) })); st.ledMode = hw.mode; return true;
}
function stopStreaming(restore = true) {
  st.running = false; st.fps = 0;
  if (restore && st.dev && (!st.model || st.model.hwEffects)) {   // รุ่นที่ไม่มีเอฟเฟกต์ในตัว (SE) ไม่ต้องคืน
    try { applyHw(st.hw || DEFAULT_HW); log("คืนเอฟเฟกต์ในตัว (โหมด " + (st.hw || DEFAULT_HW).mode + ")"); } catch (e) { log("คืนโหมดไม่ได้: " + e.message); }
  }
}

// ------------------------------------------------------------ ลูปส่งเฟรม
let frames = 0, fpsT = Date.now(), otherMode = 0, nextAt = 0, idleCheck = 0;
async function loop() {
  for (;;) {
    const now = Date.now();
    try {
      if (!st.dev) connect();
      if (st.dev && st.running && st.scene) {
        if (st.needMode13) { waitReady(); xfer(E.pktSetLedRaw(E.MODE_CUSTOM, 0, 4, 7, 0, 0, 0)); st.ledMode = E.MODE_CUSTOM; st.needMode13 = false; st.lastSent = null; otherMode = 0; }
        // เฟิร์มแวร์มีรอบทำงาน ~120 ms (ยุ่ง ~88 ms ทุกครั้งที่ได้เฟรม) → รอให้ว่างก่อน แล้วค่อยเรนเดอร์เฟรมล่าสุด
        const ready = await waitReadyAsync();
        if (!st.dev || !st.running || !st.scene) continue;
        const fr = E.finalize(E.render(st.scene, Date.now() - st.t0, st.cache), st.scene.bright ?? 100);
        const rgb = E.toLedBuffer(fr, st.gamma);
        if (!st.lastSent || rgb.some((v, i) => v !== st.lastSent[i])) {
          if (ready) {
            st.ledMode = ready[1];
            // ผู้ใช้กด Fn เปลี่ยนโหมดไฟบนคีย์บอร์ด (เห็นโหมดอื่นติดกัน 3 ครั้ง) → หยุดสตรีมให้เอง
            otherMode = ready[1] !== E.MODE_CUSTOM ? otherMode + 1 : 0;
            if (otherMode >= 3) { log(`โหมดไฟถูกเปลี่ยนจากคีย์บอร์ด (โหมด ${ready[1]}) หยุดสตรีม`); st.running = false; save(); continue; }
          }
          for (const p of E.pktsCustom(rgb)) xfer(p);
          st.lastSent = rgb; frames++;
        }
      } else if (st.dev && now - idleCheck > 3000) {   // ตรวจว่ายังต่ออยู่ (ถอดสาย → เชื่อมต่อใหม่)
        idleCheck = now; readLed();
      }
    } catch (e) {
      log("การสื่อสารผิดพลาด: " + e.message + " (จะเชื่อมต่อใหม่)"); dropDevice();
    }
    if (Date.now() - fpsT >= 1000) { st.fps = frames * 1000 / (Date.now() - fpsT); frames = 0; fpsT = Date.now(); }
    let wait;
    if (st.running && st.dev) {
      // นัดเวลาแบบสัมบูรณ์ ทำให้ FPS เฉลี่ยตรงแม้ตัวจับเวลา Windows หยาบ ~15 ms
      const interval = 1000 / Math.max(1, Math.min(12, (st.scene && st.scene.fpsCap) || 8));
      nextAt = Math.max(nextAt + interval, Date.now() - interval);
      wait = nextAt - Date.now();
    } else { nextAt = Date.now(); wait = st.dev ? 100 : 1500; }
    await new Promise(r => setTimeout(r, Math.max(0, wait)));
  }
}

// ------------------------------------------------------------ HTTP
function readBody(req) {
  return new Promise((res, rej) => { const parts = []; let n = 0;
    req.on("data", c => { n += c.length; if (n > 60e6) { rej(new Error("ข้อมูลใหญ่เกินไป")); req.destroy(); } else parts.push(c); });
    req.on("end", () => { try { res(parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : {}); } catch (e) { rej(e); } });
  });
}
function send(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); }
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css" };

const server = http.createServer(async (req, res) => {
  // อนุญาตเฉพาะหน้าเว็บจาก localhost เท่านั้น (กันเว็บอื่นสั่งคีย์บอร์ด)
  const origin = req.headers.origin;
  if (req.method !== "GET" && origin && !/^http:\/\/(localhost|127\.0\.0\.1):8768$/.test(origin)) return send(res, 403, { error: "forbidden" });
  const url = req.url.split("?")[0];
  try {
    if (url === "/api/status") return send(res, 200, {
      connected: !!st.dev, version: st.version, model: st.model && { id: st.model.id, name: st.model.name, hwEffects: st.model.hwEffects, tested: st.model.tested }, ledMode: st.ledMode, running: st.running, fps: +st.fps.toFixed(1),
      source: st.scene && st.scene.source, fromHw: !!(st.scene && st.scene.fromHw), hw: st.hw, gamma: st.gamma, t: Date.now() - st.t0, logs: st.logs.slice(0, 40) });
    if (url === "/api/state") {
      const s = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
      return send(res, 200, { scene: s.scene || null, hw: s.hw || null, running: st.running });
    }
    if (req.method === "POST" && url === "/api/scene") {
      const body = await readBody(req);
      st.scene = decodeScene(body.scene); st.cache = {};
      if (body.restartClock) st.t0 = Date.now();
      if (!st.running) { st.running = true; st.needMode13 = true; st.t0 = Date.now(); }
      st.lastSent = null; save(body.scene);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url === "/api/stop") { stopStreaming(true); save(); return send(res, 200, { ok: true }); }
    if (req.method === "POST" && url === "/api/hw") {
      const hw = await readBody(req);
      const valid = E.HW_EFFECTS.some(e => e.mode === hw.mode);
      if (!valid) return send(res, 400, { error: "โหมดไม่รู้จัก" });
      if (st.model && !st.model.hwEffects) return send(res, 400, { error: st.model.name + " ไม่มีเอฟเฟกต์ในตัว" });
      st.hw = { mode: hw.mode, speed: hw.speed & 7, bright: Math.min(4, hw.bright | 0), dir: hw.dir & 3, full: !!hw.full,
                color: (hw.color || [255,255,255]).slice(0, 3).map(v => v & 255) };
      st.running = false; st.fps = 0;
      const ok = applyHw(st.hw); save();
      return send(res, 200, { ok, connected: !!st.dev });
    }
    if (req.method === "POST" && url === "/api/settings") {
      const b = await readBody(req);
      if (typeof b.gamma === "number" && b.gamma >= 1 && b.gamma <= 3) {
        st.gamma = Math.round(b.gamma * 100) / 100; st.lastSent = null;              // ส่งเฟรมใหม่ด้วยค่าใหม่
        if (!st.running && st.dev && st.hw && (!st.model || st.model.hwEffects)) { try { applyHw(st.hw); } catch {} }
      }
      save(); return send(res, 200, { ok: true, gamma: st.gamma });
    }
    if (req.method === "POST" && url === "/api/quit") {
      send(res, 200, { ok: true }); log("ปิดเซิร์ฟเวอร์ตามคำสั่ง");
      if (st.running) stopStreaming(true); save(); setTimeout(() => onQuit(), 200); return;
    }
    // ไฟล์ static
    const file = path.join(ROOT, url === "/" ? "index.html" : path.normalize(decodeURIComponent(url)));
    if (!file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)] || !fs.existsSync(file)) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)], "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  } catch (e) { log("API ผิดพลาด: " + e.message); send(res, 500, { error: e.message }); }
});

// เริ่มเซิร์ฟเวอร์ — คืน Promise: true = เริ่มเอง, false = มีตัวอื่นใช้พอร์ตอยู่แล้ว
function start(opts = {}) {
  if (opts.onQuit) onQuit = opts.onQuit;
  return new Promise((resolve, reject) => {
    server.once("error", e => { if (e.code === "EADDRINUSE") { console.log("เซิร์ฟเวอร์ทำงานอยู่แล้ว: http://localhost:" + PORT); resolve(false); } else reject(e); });
    server.listen(PORT, "127.0.0.1", () => { log(`Mars68 RGB Studio: http://localhost:${PORT}`); load(); loop(); resolve(true); });
  });
}
// ปิดอย่างเรียบร้อย: คืนเอฟเฟกต์ในตัว + บันทึก (ใช้ตอนออกจากแอป)
function shutdown(restore = true) { if (st.running && restore) stopStreaming(true); save(); dropDevice(); }
module.exports = { start, shutdown, PORT, status: () => ({ connected: !!st.dev, running: st.running }), stop: () => { stopStreaming(true); save(); } };

if (require.main === module) {
  start({ onQuit: () => process.exit(0) }).then(ok => { if (!ok) process.exit(0); });
  process.on("SIGINT", () => { shutdown(); process.exit(0); });
}
