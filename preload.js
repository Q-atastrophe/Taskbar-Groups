const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // config window
  listGroups: () => ipcRenderer.invoke("groups:list"),
  saveGroup: (g) => ipcRenderer.invoke("groups:save", g),
  deleteGroup: (id) => ipcRenderer.invoke("groups:delete", id),
  pickTarget: () => ipcRenderer.invoke("pick:target"),
  pickImage: () => ipcRenderer.invoke("pick:image"),
  processImage: (p) => ipcRenderer.invoke("image:process", p),
  getIcon: (p) => ipcRenderer.invoke("icon:get", p),
  revealPinnable: (id) => ipcRenderer.invoke("reveal:pinnable", id),

  // popup window
  onPopupData: (cb) => ipcRenderer.on("popup:data", (_e, data) => cb(data)),
  launch: (item) => ipcRenderer.invoke("launch", item),
  closePopup: () => ipcRenderer.invoke("popup:close"),
});
