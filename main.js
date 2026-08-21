const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const save = require("./save.js");
const banner = require("./bannerinterfacer.js");
const scraper = require("./coursescraper.js");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

const COURSE_CSV_PATH = path.join(__dirname, "scrapeResults/courses.csv");

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "suis.sabanciuniv.edu"
]);

let mainWindow = null;

let mainWindowDisabled = false;

const mainWindowLocks = new Set();

function applyMainWindowInteractivity() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const isLocked = mainWindowLocks.size > 0;
  if (mainWindowDisabled === isLocked) return;
  mainWindowDisabled = isLocked;
  mainWindow.setEnabled(!isLocked);
}

function lockMainWindow(reason) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindowLocks.add(reason);
    applyMainWindowInteractivity();
  }
}

function unlockMainWindow(reason) {
  mainWindowLocks.delete(reason);
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
    width: 550,
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
      preload: path.join(__dirname, 'loadingpreload.js'),
      nodeIntegration: true,
      contextIsolation: true
    },
    backgroundColor: '#1e1e1e'
  });
  const startWithScraping = process.argv.includes("scrape");
  const showOnlyBG = (process.argv.includes("pause") && false);
  if (process.platform === 'darwin' && typeof win.setWindowButtonVisibility === "function") win.setWindowButtonVisibility(false);
  win.once('ready-to-show', async () => {
    win.show();
    await win.webContents.executeJavaScript(`window.requestAnimationFrame(() => { document.body.classList.remove('invisible'); });`);
    if (startWithScraping) {
      win.webContents.send("scraper-information", { h: "Starting scraper...", t: "Initializing..." });
      await scraper.generateCSV();
      win.close();
      return;
    }
    if (showOnlyBG) {
      win.webContents.openDevTools();
      return;
    }
    if (force.signinrequested) force = { parent: force.parent };
    if (force.signinprocess && !force.brute) {
      await banner.getInformation(true);
      if ((await banner.getSessionDetails()).signedIn) force.signedIn = true;
    }
    const possiblesessions = force ? force : await banner.initInterface();
    if (possiblesessions.signedIn || possiblesessions.guest || possiblesessions.brute) {
      const mainWin = await createMainWindow();
      if (mainWin) activeWindow = mainWin;
      if (force.brute) banner.printAllAttempts();
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
  win.loadFile(path.join(__dirname, 'loading.html'));
  win.once("close", () => {
    unlockMainWindow("loading");
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r') || (input.meta && input.key.toLowerCase() === 'r')) {
      event.preventDefault();
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
    //frame: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    type: 'panel',
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
  win.on("close", (e) => {
    unlockMainWindow("setup");
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r') || (input.meta && input.key.toLowerCase() === 'r')) {
      event.preventDefault();
    }
  });
  return await new Promise((resolve) => { win.once('ready-to-show', () => { resolve(win) }) });
}

async function createMainWindow() {
  // set width and height to 100% of the screen size
  if (mainWindow) {
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

  win.webContents.openDevTools();

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
  await new Promise(async (resolve) => {
    const bannerSession = await banner.getSessionDetails();
    if (bannerSession.signedIn) {
      if (bannerSession.user.pfp) {
        await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
          const img = new Image();

          img.onload = () => resolve();
          img.onerror = (err) => reject(new Error('Failed to load background image'));

          img.src = "${bannerSession.user.pfp}";
          if (img.complete) {
            resolve();
          }
        });`);
      }
      win.webContents.send("login-details", { status: "active", signedin: true, process: null, user: { name: bannerSession.user.name, image: bannerSession.user.pfp, schedule: bannerSession.user.actualschedule } });
    }
    resolve();
  });
  return win;
}

ipcMain.handle("courses:load-default", async () => {
  try {
    const text = await fsp.readFile(COURSE_CSV_PATH, "utf8");
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

ipcMain.handle("signIn", async (event, form) => {
  if (!activeWindow) return;
  const currentSession = await banner.getSessionDetails();
  if (!currentSession.sessionExists) {
    console.log("No session exists, creating a new one...");
    if (form.rushing) {
      setTimeout(async () => {
        if (activeWindow && activeWindow !== mainWindow && !activeWindow.isDestroyed()) {
          activeWindow.close();
        }
        createLoading({ signinprocess: true, brute: true });
        await banner.getBannerSession(true);
        const result = await banner.signIn(form);
        if (!result.s) {
          createLoading({ signinrequested: true, parent: mainWindow, error: result.d });
        }
        else {
          await banner.getInformation(true);
          const bannerSession = await banner.getSessionDetails();
          if (bannerSession.signedIn) mainWindow.webContents.send("login-details", { status: "active", signedin: true, process: null, user: { name: bannerSession.user.name, image: bannerSession.user.pfp, schedule: bannerSession.user.actualschedule } });
          else createLoading({ signinrequested: true, parent: mainWindow, error: "Failed to sign in. Please try again." });
        }
      }, 20);
      return { s: false, w: true, d: "SESSIONGRABBING" };
    }
    else {
      const result = await banner.getBannerSession();
      if (!result.s) {
        result.d = result.e;
        result.w = false;
        return result;
      }
    }
  }
  const result = await banner.signIn(form);

  if (result.w) {
    if (activeWindow && activeWindow !== mainWindow && !activeWindow.isDestroyed()) {
      activeWindow.close();
    }
    createLoading({ signinprocess: true });
  }
  else return result;
});


ipcMain.handle("scrapeCourses", async (event, form) => {
  await scraper.generateCSV();
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