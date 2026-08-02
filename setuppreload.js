"use strict";

const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld("suDesktop", {
  openAsGuest: () => ipcRenderer.invoke("openAsGuest")
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("platform-"+process.platform);
});

// window.addEventListener("unload") is deprecated.
window.addEventListener("beforeunload", () => {
  document.body.classList.add("invisible");
  localStorage.setItem("pagetype", document.querySelector("main").getAttribute("page-type"));
});