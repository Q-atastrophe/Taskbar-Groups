const { app } = require("electron");
const path = require("path");
const fs = require("fs");

function dataDir() {
  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function file() {
  return path.join(dataDir(), "groups.json");
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch (_) {
    return [];
  }
}

function writeAll(list) {
  fs.writeFileSync(file(), JSON.stringify(list, null, 2), "utf8");
}

function id() {
  return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = {
  list: () => readAll(),

  get: (gid) => readAll().find((g) => g.id === gid) || null,

  // Insert or update. Returns the saved group (with an id).
  save(group) {
    const list = readAll();
    if (!group.id) group.id = id();
    if (!Array.isArray(group.shortcuts)) group.shortcuts = [];
    if (!group.columns) group.columns = 5;
    const i = list.findIndex((g) => g.id === group.id);
    if (i >= 0) list[i] = group;
    else list.push(group);
    writeAll(list);
    return group;
  },

  remove(gid) {
    writeAll(readAll().filter((g) => g.id !== gid));
  },
};
