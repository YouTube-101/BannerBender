"use strict";

const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld("suDesktop", {
  loadCourseCsv: () => ipcRenderer.invoke("courses:load-default"),
  loadFinished: async () => {
    await ipcRenderer.invoke("loadfinished");
    const wco = navigator.windowControlsOverlay.getTitlebarAreaRect();
    if (process.platform == "win32") document.documentElement.style.setProperty("--title-padding-right", (window.innerWidth - wco.width + 5)+"px");
    else if (process.platform == "darwin") document.documentElement.style.setProperty("--title-padding-left", (wco.x-5)+"px");
    else {
      document.documentElement.style.setProperty("--title-padding-left", (wco.x + 5)+"px");
      document.documentElement.style.setProperty("--title-padding-right", (window.innerWidth - wco.width + 5)+"px");
    }
  }
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("platform-"+process.platform);
});


// window.addEventListener("unload") is deprecated.
window.addEventListener("beforeunload", () => {
  document.body.classList.add("invisible");
});