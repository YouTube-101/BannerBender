"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const pathFile = path.join(__dirname, ".electron-path");

const isWindows = process.platform === "win32";
const defaultElectronName = isWindows ? "electron.cmd" : "electron";
const defaultElectronPath = path.resolve(__dirname, "node_modules", ".bin", defaultElectronName);

let electronPath = !fs.existsSync(pathFile) 
  ? defaultElectronPath 
  : fs.readFileSync(pathFile, "utf8").trim();

if (fs.existsSync(pathFile)) {
  electronPath = path.resolve(__dirname, electronPath);
}

if (!electronPath || !fs.existsSync(electronPath)) {
  console.error("Electron was not found at:");
  console.error(electronPath || "(empty path)");
  process.exit(1);
}

const customArgs = process.argv.slice(2);

const electronProcess = spawn(electronPath, [".", ...customArgs], {
  cwd: __dirname,
  stdio: "inherit",
  // If electronPath is an absolute path to the .exe, Windows does NOT need shell: true.
  // If it's using the "electron.cmd" fallback string, it does.
  shell: electronPath.endsWith('.cmd')
});

electronProcess.on("error", error => {
  console.error("Could not launch Electron:", error);
  process.exit(1);
});

electronProcess.on("exit", code => {
  process.exit(code ?? 1);
});
