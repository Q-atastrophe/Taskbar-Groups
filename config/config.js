const $ = (id) => document.getElementById(id);

let groups = [];
let current = null; // the group being edited

// Turn a source image (data URL) into a 256x256 icon: scale-to-fill, center,
// and bake in rounded corners (transparent outside the radius). Done on a
// canvas so the result is exact and identical everywhere it's shown.
function makeIconData(srcDataUrl, radiusFrac = 0.22) {
  return new Promise((resolve) => {
    if (!srcDataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const S = 256;
      const r = S * radiusFrac;
      const canvas = document.createElement("canvas");
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, S, S);
      ctx.beginPath();
      ctx.roundRect(0, 0, S, S, r);
      ctx.clip();
      const scale = Math.max(S / img.width, S / img.height); // cover
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = srcDataUrl;
  });
}

async function refresh() {
  groups = await window.api.listGroups();
  // Migrate any older groups that stored an image path into inline square data,
  // so the sidebar and preview can show them.
  for (const g of groups) {
    if (!g.iconData && g.iconImage) {
      const raw = await window.api.processImage(g.iconImage);
      g.iconData = await makeIconData(raw);
    } else if (g.iconData) {
      // Re-run existing icons through the processor so older ones pick up
      // the rounded corners (idempotent for already-rounded ones).
      g.iconData = await makeIconData(g.iconData);
    }
  }
  renderList();
}

function renderList() {
  const ul = $("groupList");
  ul.innerHTML = "";
  for (const g of groups) {
    const li = document.createElement("li");
    li.className = current && g.id === current.id ? "active" : "";
    const dot = document.createElement("span");
    dot.className = "dot";
    if (g.iconData) {
      dot.style.backgroundImage = `url("${g.iconData}")`;
      dot.style.backgroundSize = "cover";
      dot.style.backgroundPosition = "center";
      dot.style.backgroundColor = "transparent";
    } else {
      dot.style.background = g.color || "#6c8cff";
    }
    const name = document.createElement("span");
    name.textContent = g.name || "Untitled group";
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = (g.shortcuts || []).length;
    li.append(dot, name, count);
    li.onclick = () => select(g.id);
    ul.appendChild(li);
  }
}

function blankGroup() {
  return { name: "", color: "#6c8cff", columns: 5, shortcuts: [], iconData: null };
}

function showForm(show) {
  $("form").hidden = !show;
  $("emptyState").hidden = show;
}

function hideTips() {
  $("saveTip").hidden = true;
  $("pinTip").hidden = true;
}

function select(id) {
  current = JSON.parse(JSON.stringify(groups.find((g) => g.id === id)));
  fillForm();
  renderList();
  showForm(true);
  hideTips();
}

function newGroup() {
  current = blankGroup();
  fillForm();
  renderList();
  showForm(true);
  hideTips();
  $("name").focus();
}

function fillForm() {
  $("name").value = current.name || "";
  $("color").value = current.color || "#6c8cff";
  $("columns").value = current.columns || 5;
  updateIconPreview();
  renderShortcuts();
  $("del").style.visibility = current.id ? "visible" : "hidden";
}

function updateIconPreview() {
  const el = $("iconPreview");
  if (current.iconData) {
    el.style.backgroundImage = `url("${current.iconData}")`;
    el.style.backgroundColor = "transparent";
  } else {
    el.style.backgroundImage = "none";
    el.style.backgroundColor = current.color || "#6c8cff";
  }
}

async function renderShortcuts() {
  const ul = $("shortcutList");
  ul.innerHTML = "";
  for (let i = 0; i < current.shortcuts.length; i++) {
    const s = current.shortcuts[i];
    const li = document.createElement("li");

    const img = document.createElement("img");
    img.className = "ico";
    img.src = s.icon || "";
    if (!s.icon) {
      window.api.getIcon(s.path).then((d) => { if (d) { s.icon = d; img.src = d; } });
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = s.name || "";
    nameInput.oninput = () => { s.name = nameInput.value; };
    const pathSpan = document.createElement("div");
    pathSpan.className = "path";
    pathSpan.textContent = s.path;
    meta.append(nameInput, pathSpan);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "\u00d7";
    remove.title = "Remove";
    remove.onclick = () => { current.shortcuts.splice(i, 1); renderShortcuts(); };

    li.append(img, meta, remove);
    ul.appendChild(li);
  }
}

// ---- events ----
$("newGroup").onclick = newGroup;
$("newGroup2").onclick = newGroup;

$("name").oninput = (e) => { current.name = e.target.value; };
$("color").oninput = (e) => { current.color = e.target.value; updateIconPreview(); };
$("columns").oninput = (e) => { current.columns = parseInt(e.target.value, 10) || 5; };

$("pickImage").onclick = async () => {
  const res = await window.api.pickImage();
  if (res && res.raw) {
    current.iconData = await makeIconData(res.raw);
    current.iconImage = null;
    updateIconPreview();
  }
};
$("clearImage").onclick = () => {
  current.iconData = null;
  current.iconImage = null;
  updateIconPreview();
};

$("addShortcut").onclick = async () => {
  const picked = await window.api.pickTarget();
  if (picked) {
    current.shortcuts.push({ name: picked.name, path: picked.path, icon: picked.icon, args: "" });
    renderShortcuts();
  }
};

// Save quietly. No Explorer, no re-pin nagging.
$("save").onclick = async () => {
  if (!current.name) current.name = "Untitled group";
  const wasNew = !current.id;
  const saved = await window.api.saveGroup(current);
  current = saved;
  await refresh();
  renderList();
  $("pinTip").hidden = true;
  const tip = $("saveTip");
  tip.textContent = wasNew
    ? "Saved. New group \u2014 click \u201cPin to taskbar\u201d to add it to your taskbar."
    : "Saved. Your pinned button reflects this automatically \u2014 no need to re-pin.";
  tip.hidden = false;
};

// Explicit pin: save, then open Explorer on the shortcut to drag onto the taskbar.
$("pin").onclick = async () => {
  if (!current.name) current.name = "Untitled group";
  const saved = await window.api.saveGroup(current);
  current = saved;
  await refresh();
  renderList();
  await window.api.revealPinnable(saved.id);
  $("saveTip").hidden = true;
  $("pinTip").hidden = false;
};

$("del").onclick = async () => {
  if (!current.id) return;
  await window.api.deleteGroup(current.id);
  current = null;
  await refresh();
  showForm(false);
  hideTips();
};

refresh().then(() => {
  if (groups.length) select(groups[0].id);
});
