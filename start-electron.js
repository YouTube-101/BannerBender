"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const pathFile = path.join(__dirname, ".electron-path");


const electronPath = !fs.existsSync(pathFile) ? "./node_modules/.bin/electron" : fs.readFileSync(pathFile, "utf8").trim();

if (!electronPath || !fs.existsSync(electronPath)) {
  console.error("Electron was not found at:");
  console.error(electronPath || "(empty path)");
  process.exit(1);
}

const electronProcess = spawn(electronPath, ["."], {
  cwd: __dirname,
  stdio: "inherit"
});

electronProcess.on("error", error => {
  console.error("Could not launch Electron:", error);
  process.exit(1);
});

electronProcess.on("exit", code => {
  process.exit(code ?? 1);
});