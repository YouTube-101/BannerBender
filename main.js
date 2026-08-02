const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const save = require("./save.js");
const banner = require("./bannerinterfacer.js");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

const COURSE_CSV_PATH = path.join(__dirname, "sabanci_courses.csv");

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "suis.sabanciuniv.edu"
]);

let mainWindow = null;

let mainWindowDisabled = false;

const mainWindowLocks = new Set();

function applyMainWindowInteractivity() {
  console.log("Applying main window interactivity. Locks:", mainWindowLocks);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const isLocked = mainWindowLocks.size > 0;
  if (mainWindowDisabled === isLocked) return;
  mainWindowDisabled = isLocked;
  mainWindow.setEnabled(!isLocked);
}

function lockMainWindow(reason) {
  console.log(`Locking main window due to: ${reason}`);
  mainWindowLocks.add(reason);
  console.log(mainWindowLocks);
  applyMainWindowInteractivity();
}

function unlockMainWindow(reason) {
  console.log(`Unlocking main window for: ${reason}`);
  mainWindowLocks.delete(reason);
  console.log(mainWindowLocks);
  applyMainWindowInteractivity();
}

function isMainWindowLocked() {
  return mainWindowLocks.size > 0;
}

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

function createLoading(force = false) {
  if (!force || !force.guest) lockMainWindow("loading");
  const win = new BrowserWindow({
    width: 500,
    height: 300,
    titleBarStyle: 'hidden',
    frame: false,
    fullscreenable: false,
    resizable: false,
    movable: false,
    show: false,
    modal: force ? (force.parent ? force.parent : false) : false,
    webPreferences: {
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true
    },
    backgroundColor: '#1e1e1e'
  });
  if (process.platform === 'darwin' && typeof win.setWindowButtonVisibility === "function") win.setWindowButtonVisibility(false);
  win.loadFile(path.join(__dirname, 'loading.html'));
  win.once("close", () => {
    unlockMainWindow("loading");
  });
  win.once('ready-to-show', async () => {
    win.show();
    if (force.signinrequested) force = { parent: force.parent };
    const possiblesessions = force ? force : await banner.initInterface();
    if (possiblesessions.signedIn || possiblesessions.guest) {
      const mainWin = await createMainWindow();
      if (mainWin) activeWindow = mainWin;
      unlockMainWindow("loading");
      win.close();
      if (mainWin) {
        mainWin.maximize();
        mainWin.focus();
        await mainWin.webContents.executeJavaScript(`window.requestAnimationFrame(() => { document.body.classList.remove('invisible'); });`);
      }
    }
    else {
      const setup = await createSetupWindow(possiblesessions.parent);
      activeWindow = setup;
      unlockMainWindow("loading");
      win.close();
      setup.show();
      setup.focus();
      applyMainWindowInteractivity();
      await setup.webContents.executeJavaScript(`window.requestAnimationFrame(() => { document.body.classList.remove('invisible'); LoadPage('login') });`);
    }
  });
}

let csvloaded = false;

async function createSetupWindow(parent) {
  lockMainWindow("setup");
  const win = new BrowserWindow({
    width: 500,
    height: 700,
    titleBarStyle: 'hidden',
    frame: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    show: false,
    resizable: false,
    modal: parent,
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, 'setuppreload.js'),
      nodeIntegration: true,
      contextIsolation: true
    },
    backgroundColor: '#1e1e1e'
  });
  if (process.platform === 'darwin' && typeof win.setWindowButtonPosition === "function") win.setWindowButtonPosition({ x: 19, y: 18 });
  win.loadFile('setup.html');
  //win.webContents.openDevTools();
  win.on("close", (e) => {
    unlockMainWindow("setup");
  });
  return await new Promise((resolve) => { win.once('ready-to-show', () => { resolve(win) }) });
}

async function createMainWindow() {
  // set width and height to 100% of the screen size
  if (mainWindow) {
    console.log("MAIN WINDOW ALREADY EXISTS");
    applyMainWindowInteractivity();
    if (!isMainWindowLocked()) mainWindow.focus();
    return;
  }
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    disableAutoHideCursor: true,
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
      contextIsolation: true,
      zoomToPageWidth: true
    },
    backgroundColor: '#f5f7fb'
  });
  mainWindow = win;
  applyMainWindowInteractivity();
  if (process.platform === 'darwin' && typeof win.setWindowButtonPosition === "function") win.setWindowButtonPosition({ x: 19, y: 18 });

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
  win.on("closed", () => {
    mainWindow = null;
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  while (!csvloaded) await delay(1);
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

ipcMain.handle("openAsGuest", async () => {
  if (!activeWindow) return;
  if (activeWindow && activeWindow !== mainWindow && !activeWindow.isDestroyed()) {
    activeWindow.close();
  }
  createLoading({ guest: true });
});

ipcMain.handle("requestSignIn", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  createLoading({ signinrequested: true, parent: parentWindow });
});

app.on("browser-window-focus", (event, window) => {
  if (!mainWindow || window !== mainWindow || !isMainWindowLocked()) return;
  if (activeWindow && !activeWindow.isDestroyed()) activeWindow.focus();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.whenReady().then(createLoading);