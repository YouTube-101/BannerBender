"use strict";

const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld("suDesktop", {
  onMessageFromMain: (channel, callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  }
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("platform-" + process.platform);
});

// window.addEventListener("unload") is deprecated.
window.addEventListener("beforeunload", () => {
  document.body.classList.add("invisible");
  localStorage.setItem("pagetype", document.querySelector("main").getAttribute("page-type"));
});

["drop", "dragover"].forEach((t => {document.addEventListener(t, (e => {e.stopPropagation()}), !0)}));