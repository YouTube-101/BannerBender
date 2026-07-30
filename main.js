const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
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
        const mainWin = createMainWindow();
        win.close();
        activeWindow = mainWin;
      }
      else {
        const mainWin = await createSetupWindow();
        mainWin.show();
        win.close();
        activeWindow = mainWin;
      }
    }, 1000);
  });
}
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
  win.setWindowButtonPosition({ x: 18, y: 18 });
  win.loadFile('setup.html');
  //win.webContents.openDevTools();
  win.on('close', (e) => {
    win.hide(); 
  });
  return await new Promise((resolve) => {win.once('ready-to-show', () => {resolve(win)})});
}
function createMainWindow() {
  // set width and height to 100% of the screen size
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: width,
    height: height,
    titleBarStyle: 'hidden',
    fullscreenable: false,
    webPreferences: {
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false // Simplifies direct IPC communication
    },
    backgroundColor: '#1e1e1e'
  });
  win.loadFile('index.html');
  win.setWindowButtonPosition({ x: 18, y: 18 });
  //win.webContents.openDevTools();
  win.on('close', (e) => {
    win.hide(); 
  });
  return win;
}
app.whenReady().then(createLoading);