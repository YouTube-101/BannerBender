"use strict";

const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld("suDesktop", {
  loadCourseCsv: () => ipcRenderer.invoke("courses:load-default"),
  loadFinished: () => ipcRenderer.invoke("loadfinished")
});