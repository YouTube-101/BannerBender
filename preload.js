"use strict";
const fs = require("fs");
const {
  contextBridge,
  ipcRenderer
} = require("electron");

function getTopLeftCell(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(512);
  const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
  fs.closeSync(fd);

  // 2. Convert to string
  const textChunk = buffer.toString('utf8', 0, bytesRead);

  const match = textChunk.match(/^"([^"]*)"|^([^,\n\r]*)/);

  let text = "";
  if (match) text = match[1] !== undefined ? match[1] : match[2];
  let prefix = "";
  if (text.includes("Previous Name:")) prefix = "Previous Name:";
  else if (text.includes("Pre. Name:")) prefix = "Pre. Name:";
  else if (text.includes("Pre.Name:")) prefix = "Pre.Name:";
  else if (text.includes("Pre:")) prefix = "Pre:";
  else if (text.includes("Prev. Name:")) prefix = "Prev. Name:";
  if (prefix !== "") {
    const idx = text.indexOf(prefix);
    const nextIndex = text.substring(idx + 15).indexOf(")")
    text = (text.substring(0, idx - 1) + text.substring(nextIndex + idx + 17)).trim();
  }
  text = text.replaceAll("&amp;", "&").replaceAll("  ", " ");
  if (text.endsWith("-")) text = text.substring(0, text.length - 1).trim();
  return text;
}

contextBridge.exposeInMainWorld("suDesktop", {
  loadCourseCsv: () => ipcRenderer.invoke("courses:load-default"),
  scrapeCourses: () => ipcRenderer.invoke("scrapeCourses"),
  requestSignIn: () => ipcRenderer.invoke("requestSignIn"),
  reloadTitlebar: () => {
    const wco = navigator.windowControlsOverlay.getTitlebarAreaRect();
    if (process.platform == "win32") document.documentElement.style.setProperty("--title-padding-right", (window.innerWidth - wco.width + 5) + "px");
    else if (process.platform == "darwin") document.documentElement.style.setProperty("--title-padding-left", (wco.x - 5) + "px");
    else {
      document.documentElement.style.setProperty("--title-padding-left", (wco.x + 5) + "px");
      document.documentElement.style.setProperty("--title-padding-right", (window.innerWidth - wco.width + 5) + "px");
    }
  },
  loadFinished: async () => {
    await ipcRenderer.invoke("loadfinished");
    const wco = navigator.windowControlsOverlay.getTitlebarAreaRect();
    if (process.platform == "win32") document.documentElement.style.setProperty("--title-padding-right", (window.innerWidth - wco.width + 5) + "px");
    else if (process.platform == "darwin") document.documentElement.style.setProperty("--title-padding-left", (wco.x - 5) + "px");
    else {
      document.documentElement.style.setProperty("--title-padding-left", (wco.x + 5) + "px");
      document.documentElement.style.setProperty("--title-padding-right", (window.innerWidth - wco.width + 5) + "px");
    }
  },
  onMessageFromMain: (channel, callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  getMajor: (code, major) => {
    const filePath = code === "MN" ? `scrapeResults/Minors/${major}.csv` : `scrapeResults/${code}Majors/${major}.csv`;
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath, "utf8");
    return data;
  },
  getAllMajors: () => {
    const obj = {
      UG: [],
      MX: [],
      PD: [],
      DM: [],
      MN: [],
    }
    const majorNames = fs.readFileSync("scrapeResults/majorNames.csv", "utf8").split("\n").filter(x => x.trim() !== "").forEach(x => {
      const idx = x.indexOf(",");
      const line = { k: x.substring(0, idx), n: x.substring(idx + 1).replaceAll("\"", "") };
      if (line.k.endsWith("-MINOR") && !obj.MN.includes(line)) obj.MN.push(line);
      else if (line.k.endsWith("-DM") && !obj.DM.includes(line)) obj.DM.push(line);
      else if (line.k.startsWith("PHD") && !obj.PD.includes(line)) obj.PD.push(line);
      else if (line.k.startsWith("M") && !obj.MX.includes(line)) obj.MX.push(line);
      else if (line.k.startsWith("B") && !obj.UG.includes(line)) obj.UG.push(line);
    });
    return obj;
  }
});

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("platform-" + process.platform);
});


// window.addEventListener("unload") is deprecated.
window.addEventListener("beforeunload", async () => {
  document.body.classList.add("invisible");
});

ipcRenderer.on("login-information", async (e, loginInfo) => {
  document.querySelector(".banner-tools").innerHTML = '';
});