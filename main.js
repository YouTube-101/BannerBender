const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');

const COURSE_CSV_PATH = path.join(__dirname, "sabanci_courses.csv");

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "suis.sabanciuniv.edu"
]);

let mainWindow = null;

function isAllowedExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    return (
      url.protocol === "https:" &&
      ALLOWED_EXTERNAL_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

app.commandLine.appendSwitch('enable-features', 'MacFullscreenInlineWindowControls');

let activeWindow = null;
const saveData = path.join(app.getPath('userData'), 'save.json');

function getSaveData(key) {
  if (!fs.existsSync(saveData)) {
    fs.writeFileSync(saveData, JSON.stringify({}));
  }
  const save = JSON.parse(fs.readFileSync(saveData, 'utf8'));
  return save[key];
}
function setSaveData(key, data) {
  if (!fs.existsSync(saveData)) {
    fs.writeFileSync(saveData, JSON.stringify({}));
  }
  const save = JSON.parse(fs.readFileSync(saveData, 'utf8'));
  save[key] = data;
  fs.writeFileSync(saveData, JSON.stringify(save));
}
function deleteSaveData(key) {
  if (!fs.existsSync(saveData)) {
    fs.writeFileSync(saveData, JSON.stringify({}));
  }
  const save = JSON.parse(fs.readFileSync(saveData, 'utf8'));
  delete save[key];
  fs.writeFileSync(saveData, JSON.stringify(save));
}
function createLoading() {
  const win = new BrowserWindow({
    width: 500,
    height: 300,
    titleBarStyle: 'hidden',
    frame: false,
    fullscreenable: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false // Simplifies direct IPC communication
    },
    backgroundColor: '#1e1e1e'
  });
  win.setWindowButtonVisibility(false);
  win.loadFile('loading.html');
  win.on('close', (e) => {
    win.hide();
  });
  win.once('ready-to-show', () => {
    win.show();
    if (!fs.existsSync(saveData)) {
      fs.writeFileSync(saveData, JSON.stringify({}));
    }
    setTimeout(async () => {
      if (getSaveData('setupComplete') === 'true' || true) {
        const mainWin = await createMainWindow();
        mainWin.show();
        win.close();
        activeWindow = mainWin;
      }
      else {
        const mainWin = await createSetupWindow();
        mainWin.show();
        win.close();
        activeWindow = mainWin;
      }
    }, 1);
  });
}
let csvloaded = false;
async function createSetupWindow() {
  console.log('Creating setup window...');
  const win = new BrowserWindow({
    width: 500,
    height: 700,
    titleBarStyle: 'hidden',
    frame: false,
    fullscreenable: false,
    maximizable: false,
    show: false,
    resizable: false,
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false // Simplifies direct IPC communication
    },
    backgroundColor: '#1e1e1e'
  });
  win.setWindowButtonPosition({ x: 19, y: 18 });
  win.loadFile('setup.html');
  //win.webContents.openDevTools();
  win.on('close', (e) => {
    win.hide();
  });
  return await new Promise((resolve) => { win.once('ready-to-show', () => { resolve(win) }) });
}
async function createMainWindow() {
  // set width and height to 100% of the screen size
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: width,
    height: height,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0e1b3d',
      symbolColor: '#ffffff',
      height: 50
    },
    autoHideMenuBar: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#1e1e1e'
  });
  win.setWindowButtonPosition({ x: 19, y: 18 });

  //win.webContents.openDevTools();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();

      if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url);
      }
    }
  });
  csvloaded = false;
  win.on('close', (e) => {
    win.hide();
  });
  win.loadFile('index.html');

  await new Promise((resolve) => { win.once('ready-to-show', () => { resolve() }) });
  while (!csvloaded) {
    await new Promise((resolve) => { setTimeout(resolve, 1) });
  }
  return win;
}


ipcMain.handle("courses:load-default", async () => {
  console.log("Trying to load CSV from:");
  console.log(COURSE_CSV_PATH);

  try {
    const text = await fsp.readFile(COURSE_CSV_PATH, "utf8");

    console.log("CSV loaded successfully.");
    console.log("CSV characters:", text.length);

    if (!text.trim()) {
      throw new Error("The local CSV file is empty.");
    }
    return {
      text,
      source: "Using local sabanci_courses.csv"
    };
  } catch (error) {
    console.error("Could not read course CSV:", error);

    throw new Error(
      `sabanci_courses.csv could not be loaded from ${COURSE_CSV_PATH}`
    );
  }
});
ipcMain.handle("loadfinished", async () => {
  csvloaded = true;
});

app.on("window-all-closed", () => {
  app.quit();
});

app.whenReady().then(createLoading);