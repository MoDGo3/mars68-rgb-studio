# Mars68 RGB Studio

Unofficial lighting controller for the **CAROTMAS Mars68** keyboard family (USB).
โปรแกรมคุมไฟคีย์บอร์ดตระกูล CAROTMAS Mars68 แบบไม่เป็นทางการ (ต่อสาย USB)

## Supported models / รุ่นที่รองรับ

| Model | USB PID | Built-in effects | Status |
|---|---|---|---|
| Mars68 Pro Wireless | `0x5030` | ✅ 15 RGB + 4 reactive | ✅ Tested (firmware 302) |
| Mars68 Wireless | `0x5030` | ✅ 15 RGB + 4 reactive | ⚠️ Untested |
| Mars68 Pro | `0x5029` | ✅ 15 RGB + 4 reactive | ⚠️ Untested |
| Mars68 | `0x5029` | ✅ 15 RGB + 4 reactive | ⚠️ Untested |
| Mars68 SE | `0x5029` | ❌ none in the official app — custom/GIF only | ⚠️ Untested, may have no RGB |

All Mars68 models share the same lighting protocol and per-key LED layout in the official driver; the model is told apart by its USB product name.
Wireless (2.4G dongle) connections and other CAROTMAS lines (Mars75, Mer68) are **not** supported.
If you own an untested model, please open an issue with what works and what doesn't.
ทุกรุ่นใช้โปรโตคอลและผังไฟเดียวกัน — รุ่นที่ยังไม่ได้ทดสอบ ถ้าลองแล้วแจ้งผลใน Issues ได้

It adds what the official app can't do / เพิ่มสิ่งที่แอปทางการทำไม่ได้:

- Animated GIF / WebP lighting, with drag-to-position and zoom — เล่นไฟจาก GIF เคลื่อนไหว ลากจัดตำแหน่งและซูมได้
- RGB effects layered over your own per-key pattern (running lights, wave, windmill …) — เอฟเฟกต์ทับลายที่ระบายเอง
- All 15 built-in RGB effects + 4 reactive effects — เอฟเฟกต์ในตัวครบ 19 แบบ
- Keeps running after you close the browser (background service) — ปิดเว็บแล้วไฟยังวิ่งต่อ
- Live on-screen preview of every effect — พรีวิวเอฟเฟกต์บนหน้าจอ
- Per-key rainbow for every RGB effect (the firmware only does it for Static) — สีรุ้งไล่ตามปุ่มได้ทุกเอฟเฟกต์
- Waving-flag effect and ready-made patterns (rainbow, Thai flag) — เอฟเฟกต์ธงสะบัด และลายสำเร็จรูป
- Gamma correction so keyboard colors match the screen — ปรับความสดของสีให้ตรงกับจอ
- Thai / English UI — หน้าเว็บสองภาษา

## Run / วิธีใช้

Requires Windows and [Node.js](https://nodejs.org/) 18+.

```bat
cd studio
npm install
start.bat
```

`start.bat` starts the background service (hidden) and opens <http://localhost:8768>.
Close the official CAROTMAS app first — both talking to the keyboard at once makes the lights flicker.

| File | What it does |
|---|---|
| `studio/server.js` | Background service: talks to the keyboard over HID (`node-hid`) and serves the page |
| `studio/engine.js` | Frame renderer + packet builders, shared by the page (preview) and the service |
| `studio/index.html` | The control page |
| `studio/autostart-on.bat` / `autostart-off.bat` | Start the service when Windows logs in |
| `studio/app-main.js` | Electron desktop-app wrapper — work in progress, not wired up yet |
| `PROTOCOL.md` | Notes on the keyboard's HID lighting protocol |
| `tools/` | Small research/test scripts |

## Limits / ข้อจำกัด

- Per-key (custom / GIF) lighting updates about **8 times per second** — a firmware limit, measured on firmware 302.
  For smooth motion use the built-in RGB effects. — ไฟรายปุ่มอัปเดตได้ราว 8 ครั้ง/วินาที
- USB cable only; the 2.4G dongle is not supported.
- Only lighting commands are ever sent (`0x87`, `0x8F`, `0x07`, `0x0C`); firmware, reset, keymap and macro commands are blocked in code.

## Disclaimer

Not affiliated with or endorsed by CAROTMAS. Built by observing the keyboard's behaviour for interoperability with a keyboard I own.
This repository contains no code from the official app. Use at your own risk.
