// Mars68 RGB Studio — แอป Electron: หน้าต่าง + ไอคอนถาดระบบ + เซิร์ฟเวอร์คุมไฟในตัว
"use strict";
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require("electron");
const path = require("path");

// ให้มีแอปเปิดได้ตัวเดียว — เปิดซ้ำจะไปโชว์หน้าต่างเดิมแทน
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

process.env.MARS68_DATA_DIR = app.getPath("userData");   // state.json อยู่ใน %APPDATA%\Mars68 RGB Studio
const server = require("./server.js");
const URL = `http://localhost:${server.PORT}/`;
const ICON = path.join(__dirname, "build", "icon.png");
const startHidden = process.argv.includes("--hidden");     // ตอนเปิดพร้อม Windows → อยู่ในถาดเงียบ ๆ

let win = null, tray = null, quitting = false, ownServer = false;
const lang = () => (app.getLocale() || "").startsWith("th") ? "th" : "en";
const T = (th, en) => lang() === "th" ? th : en;

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 960, minWidth: 900, minHeight: 640, show: false,
    title: "Mars68 RGB Studio", icon: ICON, backgroundColor: "#2f9fd0", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadURL(URL);
  win.once("ready-to-show", () => { if (!startHidden) win.show(); });
  // ลิงก์ภายนอกเปิดในเบราว์เซอร์ ไม่เปิดในแอป
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(URL)) e.preventDefault(); });
  // ปิดหน้าต่าง = ซ่อนไปถาดระบบ ไฟยังวิ่งต่อ
  win.on("close", e => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!app.__toldTray) { app.__toldTray = true;
      tray.displayBalloon({ iconType: "info", title: "Mars68 RGB Studio",
        content: T("แอปยังทำงานอยู่ในถาดระบบ ไฟยังวิ่งต่อ — คลิกขวาที่ไอคอนเพื่อออก", "Still running in the system tray — right-click the icon to quit.") }); }
  });
}
function showWindow() { if (!win) createWindow(); win.show(); if (win.isMinimized()) win.restore(); win.focus(); }

function buildTrayMenu() {
  const login = app.getLoginItemSettings({ args: ["--hidden"] }).openAtLogin;
  return Menu.buildFromTemplate([
    { label: T("เปิดหน้าต่าง", "Open window"), click: showWindow },
    { label: T("หยุดไฟกำหนดเอง/GIF", "Stop custom/GIF lighting"), click: () => fetch(URL + "api/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {}) },
    { type: "separator" },
    { label: T("เปิดพร้อม Windows", "Start with Windows"), type: "checkbox", checked: login,
      click: m => { app.setLoginItemSettings({ openAtLogin: m.checked, args: ["--hidden"] }); tray.setContextMenu(buildTrayMenu()); } },
    { type: "separator" },
    { label: T("ออกจากแอป (ไฟกลับเป็นเอฟเฟกต์ในตัว)", "Quit (keyboard returns to built-in effect)"), click: quit },
  ]);
}

async function quit() {
  quitting = true;
  try { if (ownServer) server.shutdown(true); else await fetch(URL + "api/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch {}
  app.quit();
}

app.on("second-instance", showWindow);
app.on("window-all-closed", e => { /* อยู่ในถาดต่อ */ });
app.on("before-quit", () => { quitting = true; });

app.whenReady().then(async () => {
  app.setAppUserModelId("Mars68.RGB.Studio");
  try {
    ownServer = await server.start({ onQuit: () => { quitting = true; app.quit(); } });
  } catch (e) {
    dialog.showErrorBox("Mars68 RGB Studio", T("เริ่มตัวควบคุมไฟไม่ได้: ", "Could not start the lighting service: ") + e.message);
  }
  // ถ้ามีตัวควบคุมไฟจากเวอร์ชันสคริปต์ (start.bat) เปิดค้างอยู่ จะใช้ตัวนั้นแทน
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip("Mars68 RGB Studio");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", showWindow);
  createWindow();
});
