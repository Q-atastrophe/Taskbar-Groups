const { app, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFile } = require("child_process");
const pngToIco = require("png-to-ico").default || require("png-to-ico");

function outDir() {
  // Pinnable .lnk files live here. We reveal this folder so the user can
  // drag a group onto the taskbar to pin it.
  const dir = path.join(app.getPath("userData"), "Taskbar Groups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function iconDir() {
  const dir = path.join(app.getPath("userData"), "icons");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(s) {
  return String(s || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

// The .lnk filename for a group: based on its name, with a short suffix only
// if another group would collide. e.g. "VN2.lnk", "Art.lnk".
function lnkNameFor(group, allGroups = []) {
  let base = safeName(group.name) || "Taskbar Group";
  const clash = allGroups.some(
    (g) => g.id !== group.id && safeName(g.name) === base
  );
  if (clash) base += " (" + String(group.id).slice(-4) + ")";
  return base + ".lnk";
}

function pinnablePathForGroup(group, allGroups = []) {
  const name = group.lnkName || lnkNameFor(group, allGroups);
  return path.join(outDir(), name);
}

// Legacy path from when shortcuts were named by id — used only for cleanup.
function legacyPinnablePath(id) {
  return path.join(outDir(), safeName(id) + ".lnk");
}

// Convert the group's chosen image (or a generated fallback) into a .ico.
// The filename includes a hash of the icon's content, so whenever the icon
// changes it gets a NEW path — which forces Windows to drop its cached copy
// and read the new one. Same icon => same name => no needless rewrites.
async function makeIco(group) {
  const key = crypto
    .createHash("md5")
    .update(group.iconData || group.iconImage || "color:" + (group.color || "#6c8cff"))
    .digest("hex")
    .slice(0, 10);
  const icoPath = path.join(iconDir(), safeName(group.id) + "-" + key + ".ico");
  if (fs.existsSync(icoPath)) return icoPath; // unchanged icon, reuse it
  try {
    let pngBuffer;
    if (group.iconData) {
      // Already a clean 256 square produced when the image was chosen.
      pngBuffer = nativeImage.createFromDataURL(group.iconData).toPNG();
    } else if (group.iconImage && fs.existsSync(group.iconImage)) {
      // Legacy groups: cover-crop the original file to a 256 square.
      pngBuffer = coverCropPng(group.iconImage) || fallbackPng(group.color || "#6c8cff");
    } else {
      // Fallback: a flat colored square so the .lnk still has an icon.
      pngBuffer = fallbackPng(group.color || "#6c8cff");
    }
    const ico = await pngToIco(pngBuffer);
    fs.writeFileSync(icoPath, ico);
    return icoPath;
  } catch (err) {
    console.error("makeIco failed:", err);
    return null;
  }
}

// Cover-crop an image file to a centered 256x256 PNG buffer (no stretching).
function coverCropPng(p) {
  try {
    const img = nativeImage.createFromPath(p);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    if (!width || !height) return null;
    const scale = 256 / Math.min(width, height);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const resized = img.resize({ width: w, height: h, quality: "best" });
    const x = Math.max(0, Math.round((w - 256) / 2));
    const y = Math.max(0, Math.round((h - 256) / 2));
    return resized.crop({ x, y, width: 256, height: 256 }).toPNG();
  } catch (_) {
    return null;
  }
}

// A solid-color 256x256 PNG, generated without any image library.
function fallbackPng(hex) {
  const size = 256;
  const img = nativeImage.createEmpty();
  // Build raw BGRA pixels.
  const c = hexToRgb(hex);
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4 + 0] = c.b;
    buf[i * 4 + 1] = c.g;
    buf[i * 4 + 2] = c.r;
    buf[i * 4 + 3] = 255;
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size }).toPNG();
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 108, g: 140, b: 255 };
}

// The target the .lnk should launch. In dev that's electron.exe + app path;
// once packaged it's just our own .exe.
function launchTarget() {
  if (app.isPackaged) {
    return { exe: process.execPath, baseArgs: "" };
  }
  return { exe: process.execPath, baseArgs: `"${app.getAppPath()}"` };
}

// Create (or overwrite) the pinnable .lnk for a group, named after the group.
// Cleans up the previous file if the group was renamed, and the old id-named
// file from earlier versions. Returns the .lnk filename it wrote.
function buildPinnable(group, allGroups = []) {
  return new Promise(async (resolve) => {
    const newName = lnkNameFor(group, allGroups);
    const lnk = path.join(outDir(), newName);

    // Remove the stale file from a previous name, and the legacy id-named one.
    const stale = [];
    if (group.lnkName && group.lnkName !== newName) stale.push(group.lnkName);
    stale.push(safeName(group.id) + ".lnk");
    for (const name of stale) {
      try {
        const p = path.join(outDir(), name);
        if (p !== lnk) fs.unlinkSync(p);
      } catch (_) {}
    }

    const ico = await makeIco(group);
    const { exe, baseArgs } = launchTarget();
    const args = `${baseArgs} --group=${group.id}`.trim();

    // Use PowerShell + WScript.Shell to author the .lnk. Zero npm deps.
    const ps = [
      "$ws = New-Object -ComObject WScript.Shell;",
      `$s = $ws.CreateShortcut('${lnk.replace(/'/g, "''")}');`,
      `$s.TargetPath = '${exe.replace(/'/g, "''")}';`,
      `$s.Arguments = '${args.replace(/'/g, "''")}';`,
      `$s.WindowStyle = 7;`,
      `$s.Description = '${(group.name || "Taskbar Group").replace(/'/g, "''")}';`,
      ico ? `$s.IconLocation = '${ico.replace(/'/g, "''")},0';` : "",
      `$s.Save();`,
    ].join(" ");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      (err) => {
        if (err) console.error("buildPinnable failed:", err.message);
        resolve(newName);
      }
    );
  });
}

function removePinnable(group) {
  const id = typeof group === "string" ? group : group.id;
  // Remove the .lnk (current name + legacy id name).
  const lnks = [];
  if (group && group.lnkName) lnks.push(path.join(outDir(), group.lnkName));
  lnks.push(legacyPinnablePath(id));
  for (const p of lnks) {
    try {
      fs.unlinkSync(p);
    } catch (_) {}
  }
  // Remove every icon variant for this group (id.ico and id-<hash>.ico).
  try {
    const dir = iconDir();
    const prefix = safeName(id);
    for (const f of fs.readdirSync(dir)) {
      if (f === prefix + ".ico" || f.startsWith(prefix + "-")) {
        try {
          fs.unlinkSync(path.join(dir, f));
        } catch (_) {}
      }
    }
  } catch (_) {}
}

module.exports = { buildPinnable, removePinnable, pinnablePathForGroup };
