const { app, BrowserWindow, ipcMain, Tray, Menu, screen, shell, dialog, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const groups = require("./lib/groups");
const shortcuts = require("./lib/shortcuts");

// ---- Parse which group (if any) this launch should open -------------------
// A pinned taskbar button launches the app with:  --group=<id>
function groupIdFromArgv(argv) {
  const arg = argv.find((a) => a.startsWith("--group="));
  return arg ? arg.split("=")[1] : null;
}

let configWin = null;
let popupWin = null;
let tray = null;

// ---- Single instance: keep one warm process so popups appear instantly ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running and will handle this launch.
  app.quit();
} else {
  // A second launch (e.g. clicking a pinned group) is forwarded here.
  app.on("second-instance", (_e, argv) => {
    const id = groupIdFromArgv(argv);
    if (id) {
      openPopup(id);
    } else {
      showConfig();
    }
  });

  app.whenReady().then(() => {
    const id = groupIdFromArgv(process.argv);
    if (id) {
      // Cold start straight into a popup (no daemon was running).
      // Stay alive as the daemon afterwards so the next click is instant.
      createTray();
      openPopup(id);
    } else {
      createTray();
      showConfig();
    }
  });

  // Don't quit when the config window closes — stay resident in the tray.
  app.on("window-all-closed", (e) => {});
}

// ---- Config window --------------------------------------------------------
function showConfig() {
  if (configWin && !configWin.isDestroyed()) {
    configWin.show();
    configWin.focus();
    return;
  }
  configWin = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    title: "Taskbar Groups",
    backgroundColor: "#16161c",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  configWin.setMenuBarVisibility(false);
  configWin.loadFile(path.join(__dirname, "config", "index.html"));
}

// ---- Popup window (appears above the taskbar) -----------------------------
function openPopup(groupId) {
  const group = groups.get(groupId);
  if (!group) {
    dialog.showErrorBox("Taskbar Groups", `Group "${groupId}" no longer exists.`);
    return;
  }

  if (popupWin && !popupWin.isDestroyed()) {
    popupWin.close();
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const work = display.workArea; // excludes the taskbar

  const cols = Math.min(group.shortcuts.length || 1, group.columns || 5);
  const rows = Math.ceil((group.shortcuts.length || 1) / cols);
  const cellW = 92;
  const cellH = 92;
  const pad = 14;
  const headerH = group.name ? 34 : 0;
  const width = Math.max(cols * cellW + pad * 2, 160);
  const height = rows * cellH + pad * 2 + headerH;

  // Center horizontally on the cursor, sit just above the taskbar.
  let x = Math.round(cursor.x - width / 2);
  let y = work.y + work.height - height - 8;
  // Keep it on-screen.
  x = Math.max(work.x + 4, Math.min(x, work.x + work.width - width - 4));

  popupWin = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popupWin.setMenuBarVisibility(false);
  popupWin.loadFile(path.join(__dirname, "popup", "index.html"));

  popupWin.webContents.once("did-finish-load", () => {
    popupWin.webContents.send("popup:data", group);
    popupWin.show();
    popupWin.focus();
  });

  // Close when the user clicks away.
  popupWin.on("blur", () => {
    if (popupWin && !popupWin.isDestroyed()) popupWin.close();
  });
}

// ---- Tray -----------------------------------------------------------------
function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, "assets", "tray.png");
  let img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) img = nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip("Taskbar Groups");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Taskbar Groups", click: showConfig },
      { type: "separator" },
      { label: "Quit", click: () => app.exit(0) },
    ])
  );
  tray.on("click", showConfig);
}

// ===========================================================================
//  IPC — everything the renderer is allowed to ask the main process to do
// ===========================================================================

ipcMain.handle("groups:list", () => groups.list());

ipcMain.handle("groups:save", async (_e, group) => {
  const saved = groups.save(group);
  // Name the shortcut after the group; remember the filename so a later
  // rename can rewrite it in place instead of leaving a stray file.
  const lnkName = await shortcuts.buildPinnable(saved, groups.list());
  if (lnkName && saved.lnkName !== lnkName) {
    saved.lnkName = lnkName;
    groups.save(saved);
  }
  return saved;
});

ipcMain.handle("groups:delete", (_e, id) => {
  const g = groups.get(id);
  groups.remove(id);
  shortcuts.removePinnable(g || id);
  return true;
});

// Open a native file picker to add a shortcut to a group.
ipcMain.handle("pick:target", async () => {
  const res = await dialog.showOpenDialog(configWin, {
    title: "Choose a program or file",
    properties: ["openFile"],
    filters: [
      { name: "Programs & shortcuts", extensions: ["exe", "lnk", "bat", "cmd", "url"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const target = res.filePaths[0];
  return {
    path: target,
    name: path.basename(target).replace(/\.(exe|lnk|bat|cmd|url)$/i, ""),
    icon: await getFileIconDataUrl(target),
  };
});

// Pick a custom image to use as the group's taskbar icon.
ipcMain.handle("pick:image", async () => {
  const res = await dialog.showOpenDialog(configWin, {
    title: "Choose a group icon",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "ico", "bmp"] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return { raw: imageToDataUrl(res.filePaths[0]) };
});

// Hand back an existing image file's pixels (used when migrating old groups).
ipcMain.handle("image:process", (_e, p) => imageToDataUrl(p));

// Return an icon for any path as a data URL the renderer can show.
ipcMain.handle("icon:get", async (_e, p) => getFileIconDataUrl(p));

// Launch a shortcut from the popup, then close the popup.
ipcMain.handle("launch", async (_e, item) => {
  try {
    if (item.args && item.args.trim()) {
      const { spawn } = require("child_process");
      spawn(item.path, item.args.split(" ").filter(Boolean), {
        detached: true,
        stdio: "ignore",
        shell: false,
      }).unref();
    } else {
      await shell.openPath(item.path);
    }
  } catch (err) {
    dialog.showErrorBox("Couldn't launch", `${item.name}\n\n${err.message}`);
  }
  if (popupWin && !popupWin.isDestroyed()) popupWin.close();
});

// After saving, show the generated .lnk in Explorer so the user can pin it.
ipcMain.handle("reveal:pinnable", (_e, id) => {
  const g = groups.get(id);
  const lnk = shortcuts.pinnablePathForGroup(g || { id }, groups.list());
  if (fs.existsSync(lnk)) shell.showItemInFolder(lnk);
  return lnk;
});

ipcMain.handle("popup:close", () => {
  if (popupWin && !popupWin.isDestroyed()) popupWin.close();
});

// ---- helper: hand the renderer the image's pixels as a data URL -----------
// The renderer does the precise square-crop + rounding on a canvas, which is
// far more predictable than doing it here. We only downscale absurdly large
// images first so the data URL stays a sane size.
function imageToDataUrl(p, maxSide = 2048) {
  try {
    const img = nativeImage.createFromPath(p);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    if (!width || !height) return null;
    const longest = Math.max(width, height);
    let out = img;
    if (longest > maxSide) {
      const s = maxSide / longest;
      out = img.resize({
        width: Math.round(width * s),
        height: Math.round(height * s),
        quality: "good",
      });
    }
    return out.toDataURL();
  } catch (_) {
    return null;
  }
}

// ---- helper: file icon -> data URL ---------------------------------------
async function getFileIconDataUrl(p) {
  try {
    const img = await app.getFileIcon(p, { size: "large" });
    if (img && !img.isEmpty()) return img.toDataURL();
  } catch (_) {}
  return null;
}
