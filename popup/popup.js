window.api.onPopupData((group) => {
  document.getElementById("title").textContent = group.name || "";
  const grid = document.getElementById("grid");
  grid.style.gridTemplateColumns = `repeat(${group.columns || 5}, 84px)`;
  grid.innerHTML = "";

  if (!group.shortcuts || !group.shortcuts.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "This group has no shortcuts yet.";
    grid.appendChild(e);
    return;
  }

  for (const s of group.shortcuts) {
    const tile = document.createElement("div");
    tile.className = "tile";

    const img = document.createElement("img");
    img.src = s.icon || "";
    if (!s.icon) {
      window.api.getIcon(s.path).then((d) => { if (d) img.src = d; });
    }

    const label = document.createElement("span");
    label.textContent = s.name || "";

    tile.append(img, label);
    tile.onclick = () => window.api.launch(s);
    grid.appendChild(tile);
  }
});

// Esc closes the popup.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.api.closePopup();
});
