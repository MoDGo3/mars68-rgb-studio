/* Mars68 RGB engine — ใช้ร่วมกันทั้งหน้าเว็บ (พรีวิว) และ server.js (ส่งไปคีย์บอร์ด)
   ไม่มีการพึ่ง DOM/canvas เพื่อให้รันใน Node ได้ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- ผังปุ่ม: [ป้าย, กว้าง(u), LED index] (index = col*6 + row) ----------
  const ROWS = [
    [["Esc",1,1],["1",1,7],["2",1,13],["3",1,19],["4",1,25],["5",1,31],["6",1,37],["7",1,43],["8",1,49],["9",1,55],["0",1,61],["-",1,67],["=",1,73],["⟵",2,79],["Ins",1,85]],
    [["Tab",1.5,2],["Q",1,8],["W",1,14],["E",1,20],["R",1,26],["T",1,32],["Y",1,38],["U",1,44],["I",1,50],["O",1,56],["P",1,62],["[",1,68],["]",1,74],["\\",1.5,80],["Del",1,86]],
    [["Caps",1.75,3],["A",1,9],["S",1,15],["D",1,21],["F",1,27],["G",1,33],["H",1,39],["J",1,45],["K",1,51],["L",1,57],[";",1,63],["'",1,69],["Enter",2.25,81],["PgUp",1,87]],
    [["Shift",2.25,4],["Z",1,16],["X",1,22],["C",1,28],["V",1,34],["B",1,40],["N",1,46],["M",1,52],[",",1,58],[".",1,64],["/",1,70],["Shift",1.75,76],["↑",1,82],["PgDn",1,88]],
    [["Ctrl",1.25,5],["Win",1.25,11],["Alt",1.25,17],["",6.25,41],["Alt",1,59],["Fn",1,65],["Ctrl",1,71],["←",1,77],["↓",1,83],["→",1,89]],
  ];
  const KEYS = [];
  ROWS.forEach((r, ri) => { let x = 0; r.forEach(([label, w, led]) => { KEYS.push({ label, w, led, row: ri, x0: x, x1: x + w }); x += w; }); });
  const KB_U = 16, PX = 10, CW = KB_U * PX, CH = ROWS.length * PX; // บัฟเฟอร์ภาพ 160×50
  const LED_SLOTS = 126;

  // ---------- ลายของฉัน ----------
  const PAL = { P: [240,20,120], B: [60,190,255], R: [255,0,0], V: [180,30,240], D: [190,40,70] };
  const MY_PATTERN = ["PPPPPPPPBBPBBPP","PPRPPPPBBPPBBPP","PRRRPPPBBBBBVV","PPPPPPPBBBBPDP","PPPPBPPDDD"];
  function myPattern() { const out = []; MY_PATTERN.forEach(row => [...row].forEach(ch => out.push(PAL[ch].slice()))); return out; }
  // ลายจากวิดีโอบันทึกหน้าจอ 2026-11-21 19:14 (ระบายในแอป CAROTMAS, สีตามพาเลตของแอป)
  const VPAL = { C: [0x38,0xFF,0xF2], R: [0xFF,0,0], U: [0,0x21,0xFF], M: [0xB1,0x1F,0xFF], Y: [0xFF,0xEA,0] };
  const VIDEO_PATTERN = ["CCCCCCCCRRRRRCC","CCRCCCCRRRRRRCC","CRRRCCCRRRRRCC","CCCCCCCCRRRCUC","CMCYRCCUUU"];
  function videoPattern() { const out = []; VIDEO_PATTERN.forEach(row => [...row].forEach(ch => out.push(VPAL[ch].slice()))); return out; }

  // ---------- เอฟเฟกต์ในตัวของเฟิร์มแวร์ (จาก lightEffectList "ca" + ตาราง uWt ใน bundle) ----------
  // type: 0 = เอฟเฟกต์ไฟ RGB, 1 = เอฟเฟกต์ไฟตอบสนอง ; dirs = ทิศที่เลือกได้
  const HW_EFFECTS = [
    { mode: 1,  type: 0, th: "ไฟนิ่ง",            zh: "常亮",     speed: false, dirs: [] },
    { mode: 2,  type: 0, th: "หายใจ",             zh: "呼吸",     speed: true,  dirs: [] },
    { mode: 3,  type: 0, th: "นีออน",             zh: "霓虹",     speed: true,  dirs: [] },
    { mode: 4,  type: 0, th: "คลื่น",              zh: "波浪",     speed: true,  dirs: ["up","down","left","right"] },
    { mode: 6,  type: 0, th: "ดาวระยิบ",           zh: "繁星点点", speed: true,  dirs: [] },
    { mode: 7,  type: 0, th: "ไฟวิ่งวน",            zh: "跑马",     speed: true,  dirs: ["clockwise","counterclockwise"] },
    { mode: 9,  type: 0, th: "ดอกไม้บาน",          zh: "花开富贵", speed: true,  dirs: [] },
    { mode: 10, type: 0, th: "คลื่นไซน์",           zh: "正弦光波", speed: true,  dirs: [] },
    { mode: 11, type: 0, th: "หายใจเป็นจังหวะ",     zh: "呼吸律动", speed: true,  dirs: ["clockwise","counterclockwise"] },
    { mode: 12, type: 0, th: "เฉดสีพลิ้ว",          zh: "色调波动", speed: true,  dirs: ["clockwise","counterclockwise"] },
    { mode: 15, type: 0, th: "กังหันหมุน",          zh: "旋转风车", speed: true,  dirs: ["clockwise","counterclockwise"] },
    { mode: 16, type: 0, th: "ม่านฝน",             zh: "雨落珠帘", speed: true,  dirs: [] },
    { mode: 17, type: 0, th: "เดินกลางสายฝน",      zh: "雨中散步", speed: true,  dirs: [] },
    { mode: 18, type: 0, th: "พิกเซลไหล",          zh: "像素流",   speed: true,  dirs: [] },
    { mode: 23, type: 0, th: "วนซ้าย-ขวา",         zh: "左右循环", speed: true,  dirs: [] },
    { mode: 5,  type: 1, th: "ระลอกเมื่อกด",        zh: "按键涟漪", speed: true,  dirs: [] },
    { mode: 8,  type: 1, th: "กดแล้วติด",          zh: "单击亮",   speed: true,  dirs: [] },
    { mode: 14, type: 1, th: "แฟลชเมื่อกด",        zh: "一触即发", speed: true,  dirs: [] },
    { mode: 19, type: 1, th: "รอยเท้าบนหิมะ",      zh: "踏雪无痕", speed: true,  dirs: [] },
  ];
  // ชื่อภาษาอังกฤษ (อิงชื่อ enum ในโค้ดของแบรนด์)
  const EN_NAMES = { 1: "Static", 2: "Breathing", 3: "Neon", 4: "Wave", 6: "Starry Night", 7: "Racing Lights", 9: "Blossom",
    10: "Sine Wave", 11: "Breathing Rhythm", 12: "Hue Wave", 15: "Spinning Windmill", 16: "Rain Curtain", 17: "Walk in the Rain",
    18: "Pixel Flow", 23: "Side-to-Side Cycle", 5: "Key Ripple", 8: "Click Highlight", 14: "Instant Flash", 19: "Snow Trace" };
  HW_EFFECTS.forEach(e => { e.en = EN_NAMES[e.mode]; });
  const DIR_VALUE = { up: 2, down: 3, left: 1, right: 0, clockwise: 0, counterclockwise: 1 };
  const DIR_LABEL = { up: "↑ ขึ้น", down: "↓ ลง", left: "← ซ้าย", right: "→ ขวา", clockwise: "↻ ตามเข็ม", counterclockwise: "↺ ทวนเข็ม" };
  const DIR_LABEL_EN = { up: "↑ Up", down: "↓ Down", left: "← Left", right: "→ Right", clockwise: "↻ Clockwise", counterclockwise: "↺ Counter-clockwise" };
  const MODE_CUSTOM = 13;

  // ---------- เรนเดอร์ ----------
  function patternBuffer(colors) {
    const d = new Uint8ClampedArray(CW * CH * 4);
    KEYS.forEach((k, i) => {
      const c = colors[i] || [0,0,0], xa = Math.round(k.x0 * PX), xb = Math.round(k.x1 * PX);
      for (let y = k.row * PX; y < (k.row + 1) * PX; y++) for (let x = xa; x < xb; x++) {
        const p = (y * CW + x) * 4; d[p] = c[0]; d[p+1] = c[1]; d[p+2] = c[2]; d[p+3] = 255;
      }
    });
    return d;
  }
  // เฉลี่ยสีในพื้นที่ปุ่ม เลื่อนแนวนอนแบบวนรอบได้
  function sampleKeys(d, offPx) {
    const out = new Array(KEYS.length);
    for (let i = 0; i < KEYS.length; i++) {
      const k = KEYS[i]; let r = 0, g = 0, b = 0, n = 0;
      const x0 = k.x0 * PX + 1, x1 = k.x1 * PX - 1, y0 = k.row * PX + 1, y1 = (k.row + 1) * PX - 1;
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        let sx = Math.floor(x + offPx) % CW; if (sx < 0) sx += CW;
        const p = (y * CW + sx) * 4; r += d[p]; g += d[p+1]; b += d[p+2]; n++;
      }
      out[i] = [r / n, g / n, b / n];
    }
    return out;
  }
  function rgb2hsl([r,g,b]) { r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let h=0, s=0; const l=(mx+mn)/2;
    if (mx!==mn) { const d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h/=6; } return [h,s,l]; }
  function hsl2rgb([h,s,l]) { if (!s) return [l*255,l*255,l*255]; const f=(p,q,t)=>{t=(t%1+1)%1; return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};
    const q=l<.5?l*(1+s):l+s-l*s, p=2*l-q; return [f(p,q,h+1/3)*255,f(p,q,h)*255,f(p,q,h-1/3)*255]; }
  const SPARKLE = KEYS.map((_, i) => (i * 7.31 + 3.7) % 4);

  function frameIndexAt(image, tMs) {
    let tt = (tMs * (image.speed || 1)) % image.total;
    for (const f of image.frames) { if (tt < f.dur) return f; tt -= f.dur; }
    return image.frames[0];
  }

  /* scene = { source:"custom"|"image"|"probe", colors, fx, fxDir, fxSpeed, fxStep,
               image:{frames:[{dur,data:Uint8ClampedArray}], total, speed, scroll, scrollSpeed},
               probeMs, bright }  — cache: วัตถุว่างสำหรับเก็บบัฟเฟอร์ที่คำนวณซ้ำได้ */
  function render(scene, tMs, cache = {}) {
    const t = tMs / 1000;
    if (scene.source === "probe") {
      const idx = Math.floor(tMs / (scene.probeMs || 600)) % KEYS.length;
      return KEYS.map((_, i) => i === idx ? [255,255,255] : [0,0,0]);
    }
    if (scene.source === "image" && scene.image && scene.image.frames.length) {
      const im = scene.image, f = frameIndexAt(im, tMs);
      const off = im.scroll ? -im.scroll * t * (im.scrollSpeed || 5) * PX * 0.5 : 0;
      return sampleKeys(f.data, off);
    }
    return renderCustom(scene, t, cache);
  }

  // ---------- เอฟเฟกต์ทับลายกำหนดเอง (จำลองเอฟเฟกต์ในตัว 15 แบบ แต่ใช้สีจากลายที่ระบาย) ----------
  const CUSTOM_FX = [
    { id: "static",   th: "ไฟนิ่ง",           en: "Static",             dirs: [] },
    { id: "breath",   th: "หายใจ",            en: "Breathing",          dirs: [] },
    { id: "neon",     th: "นีออน",            en: "Neon",               dirs: [] },
    { id: "wave",     th: "คลื่น",             en: "Wave",               dirs: ["left","right","up","down"] },
    { id: "starry",   th: "ดาวระยิบ",          en: "Starry Night",       dirs: [] },
    { id: "racing",   th: "ไฟวิ่งวน",           en: "Racing Lights",      dirs: ["cw","ccw"] },
    { id: "blossom",  th: "ดอกไม้บาน",         en: "Blossom",            dirs: [] },
    { id: "sine",     th: "คลื่นไซน์",          en: "Sine Wave",          dirs: ["left","right"] },
    { id: "rhythm",   th: "หายใจเป็นจังหวะ",    en: "Breathing Rhythm",   dirs: ["cw","ccw"] },
    { id: "huewave",  th: "เฉดสีพลิ้ว",         en: "Hue Wave",           dirs: ["cw","ccw"] },
    { id: "windmill", th: "กังหันหมุน",         en: "Spinning Windmill",  dirs: ["cw","ccw"] },
    { id: "rain",     th: "ม่านฝน",            en: "Rain Curtain",       dirs: [] },
    { id: "rainwalk", th: "เดินกลางสายฝน",     en: "Walk in the Rain",   dirs: [] },
    { id: "pixel",    th: "พิกเซลไหล",         en: "Pixel Flow",         dirs: [] },
    { id: "cycle",    th: "วนซ้าย-ขวา",        en: "Side-to-Side Cycle", dirs: ["left","right"] },
    { id: "scroll",   th: "ไฟวิ่งเลื่อนลาย",    en: "Scroll Pattern",     dirs: ["left","right"], extra: true },
    { id: "blink",    th: "กะพริบ",            en: "Blink",              dirs: [], extra: true },
    { id: "sparkle",  th: "ประกายระยิบ",        en: "Sparkle",            dirs: [], extra: true },
  ];
  const FX_DIR_LABEL = { left: ["← ซ้าย", "← Left"], right: ["→ ขวา", "→ Right"], up: ["↑ ขึ้น", "↑ Up"], down: ["↓ ลง", "↓ Down"],
    cw: ["↻ ตามเข็ม", "↻ Clockwise"], ccw: ["↺ ทวนเข็ม", "↺ Counter-clockwise"] };
  // ตำแหน่งกลางปุ่ม: x 0..16 (u), y 0..4 (แถว) ; dx/dy ปรับสเกลให้คีย์บอร์ดเป็นวงรีรอบจุดกลาง
  const POS = KEYS.map(k => { const x = (k.x0 + k.x1) / 2, y = k.row + 0.5, dx = (x - 8) / 8, dy = (y - 2.5) / 2.5;
    return { x, y, dx, dy, a: Math.atan2(dy, dx), r: Math.hypot(dx, dy) }; });
  const rnd = (a, b = 0) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
  const TAU = Math.PI * 2;
  const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const hueShift = (c, dh) => { const [h, s, l] = rgb2hsl(c); return s ? hsl2rgb([h + dh, s, l]) : c; };
  const normDir = (d, dirs) => d === -1 ? "left" : d === 1 ? "right" : dirs.includes(d) ? d : dirs[0];

  function renderCustom(scene, t, cache) {
    const base = scene.colors || myPattern(), sp = scene.fxSpeed || 6;
    const id = scene.fx === "hue" ? "cycle" : scene.fx || "static";              // รองรับค่าจากเวอร์ชันก่อน
    const def = CUSTOM_FX.find(f => f.id === id) || CUSTOM_FX[0];
    const dir = normDir(scene.fxDir, def.dirs), rot = dir === "ccw" ? -1 : 1, v = sp / 6;   // v = 1 ที่ความเร็วกลาง
    const pat = () => { const key = JSON.stringify(base); if (cache.patKey !== key) { cache.patKey = key; cache.pat = patternBuffer(base); } return cache.pat; };
    switch (id) {
      case "breath": { const k = 0.08 + 0.92 * (0.5 - 0.5 * Math.cos(t * v * 3)); return base.map(c => dim(c, k)); }
      case "neon": return base.map(c => hueShift(c, t * v * 0.15));
      case "wave": return base.map((c, i) => { const p = POS[i];
        const ph = dir === "left" ? p.x / 16 + t * v * 0.6 : dir === "right" ? p.x / 16 - t * v * 0.6 : dir === "up" ? p.y / 5 + t * v * 0.6 : p.y / 5 - t * v * 0.6;
        return dim(c, 0.12 + 0.88 * (0.5 + 0.5 * Math.sin(TAU * ph * 1.3))); });
      case "starry": return base.map((c, i) => dim(c, 0.12 + 0.88 * Math.pow(Math.max(0, Math.sin(TAU * (t * v * 0.35 + rnd(i)))), 4)));
      case "racing": { const head = rot * t * v * 2.2;
        return base.map((c, i) => { let d = (rot * (head - POS[i].a)) % TAU; if (d < 0) d += TAU;   // ระยะหลังหัวขบวน
          return dim(c, 0.1 + 0.9 * Math.max(0, 1 - d / 2.2)); }); }
      case "blossom": return base.map((c, i) => dim(c, 0.12 + 0.88 * (0.5 + 0.5 * Math.cos(TAU * (POS[i].r * 1.4 - t * v * 0.6)))));
      case "sine": { const s = dir === "right" ? -1 : 1;
        return base.map((c, i) => { const p = POS[i], yw = 2.5 + 2.2 * Math.sin(TAU * (p.x / 16 + s * t * v * 0.4));
          return dim(c, 0.1 + 0.9 * Math.max(0, 1 - Math.abs(p.y - yw) / 1.3)); }); }
      case "rhythm": return base.map((c, i) => dim(c, 0.1 + 0.9 * (0.5 + 0.5 * Math.sin(t * v * 3 - rot * POS[i].a))));
      case "huewave": return base.map((c, i) => hueShift(c, rot * (t * v * 0.15) + POS[i].a / TAU));
      case "windmill": return base.map((c, i) => dim(c, 0.08 + 0.92 * Math.pow(0.5 + 0.5 * Math.cos(3 * (POS[i].a - rot * t * v * 1.6)), 2)));
      case "rain": return base.map((c, i) => { const p = POS[i], col = Math.floor(p.x);
        const head = ((t * v * 0.9 + rnd(col, 7)) % 1) * 8 - 1.5, d = head - p.y;        // หยดฝนตกลงมาเป็นแถว
        return dim(c, d >= 0 && d < 2.5 ? 0.15 + 0.85 * (1 - d / 2.5) : 0.15); });
      case "rainwalk": return base.map((c, i) => { const u = t * v * 1.2 + rnd(i, 3), n = Math.floor(u), f = u - n;
        if (rnd(i, n) >= 0.18) return dim(c, 0.3);                                     // หยดฝนกระทบปุ่ม: สว่างวาบแล้วจางลง
        return dim(c, 0.3 + 0.7 * (1 - f)).map(x => x + (255 - x) * 0.35 * (1 - f)); });
      case "pixel": { const d = pat();   // แต่ละแถวไหลคนละความเร็ว/ทิศ
        const offs = [0, 1, 2, 3, 4].map(r => (r % 2 ? 1 : -1) * t * v * (2 + r * 0.7) * PX);
        const out = new Array(KEYS.length);
        for (let r = 0; r < 5; r++) { const row = sampleKeys(d, offs[r]); KEYS.forEach((k, i) => { if (k.row === r) out[i] = row[i]; }); }
        return out; }
      case "cycle": { const s = dir === "right" ? -1 : 1; return base.map((c, i) => hueShift(c, s * t * v * 0.15 + POS[i].x / 16 * 0.6)); }
      case "scroll": { const s = dir === "right" ? 1 : -1; let u = t * sp * 0.6; if (scene.fxStep) u = Math.floor(u);
        return sampleKeys(pat(), -s * u * PX); }
      case "blink": { const on = Math.floor(t * v * 3) % 2 === 0; return base.map(c => on ? c : [0,0,0]); }
      case "sparkle": return base.map((c, i) => { const ph = (t * v * 2.4 + SPARKLE[i]) % 4;
        return ph < 0.5 ? c.map(x => x + (255 - x) * (1 - ph * 2)) : dim(c, 0.6); });
      default: return base;
    }
  }
  function finalize(frame, brightPct = 100) {
    const k = brightPct / 100;
    return frame.map(c => c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))));
  }
  function toLedBuffer(frame) {
    const rgb = new Uint8Array(LED_SLOTS * 3);
    frame.forEach((c, i) => { const p = KEYS[i].led * 3; rgb[p] = c[0]; rgb[p+1] = c[1]; rgb[p+2] = c[2]; });
    return rgb;
  }

  // ---------- แพ็กเก็ต (ดู PROTOCOL.md) ----------
  const ALLOWED_CMDS = [0x87, 0x8F, 0x07, 0x0C];
  function withChecksum7(a) { a[7] = (255 - (a[0]+a[1]+a[2]+a[3]+a[4]+a[5]+a[6])) & 255; return a; }
  function pktGetLed() { const a = new Uint8Array(64); a[0] = 0x87; return withChecksum7(a); }
  function pktVersion() { const a = new Uint8Array(64); a[0] = 0x8F; return withChecksum7(a); }
  function pktSetLedRaw(mode, speed, bright, dirflag, r, g, b) {
    const a = new Uint8Array(64); a.set([7, mode, speed, bright, dirflag, r, g, b]);
    a[8] = (255 - (a[0]+a[1]+a[2]+a[3]+a[4]+a[5]+a[6]+a[7])) & 255; return a;
  }
  // เหมือน Zxt.setLed: สลับทิศ 2<->3, flag 8 = สีรุ้ง(FullColor) / 7 = สีเดียว
  function pktSetLed({ mode, speed = 2, bright = 4, dir = 0, full = true, color = [255,255,255] }) {
    let d = dir === 3 ? 2 : dir === 2 ? 3 : dir;
    return pktSetLedRaw(mode, speed, bright, (d << 4) | (full ? 8 : 7), color[0], color[1], color[2]);
  }
  function pktsCustom(rgb) {
    const out = [], pages = Math.ceil(rgb.length / 56);
    for (let p = 0; p < pages; p++) {
      const chunk = rgb.subarray(p * 56, p * 56 + 56), a = new Uint8Array(64);
      a[0] = 12; a[1] = 0; a[2] = 255; a[3] = p; a[4] = chunk.length; a[5] = p === pages - 1 ? 1 : 0; a.set(chunk, 8);
      out.push(withChecksum7(a));
    }
    return out;
  }

  return { ROWS, KEYS, KB_U, PX, CW, CH, LED_SLOTS, PAL, myPattern, videoPattern, HW_EFFECTS, DIR_VALUE, DIR_LABEL, DIR_LABEL_EN, MODE_CUSTOM, CUSTOM_FX, FX_DIR_LABEL,
    patternBuffer, sampleKeys, render, finalize, toLedBuffer,
    ALLOWED_CMDS, pktGetLed, pktVersion, pktSetLedRaw, pktSetLed, pktsCustom };
});
