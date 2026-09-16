const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
  // Tell the Main process to navigate to a new URL
  goToUrl: (url) => ipcRenderer.send('navigate-to', url),
  onUrlChanged: (callback) => ipcRenderer.on('url-changed', (event, newUrl) => callback(newUrl)),
  onMessageFromMain: (channel, callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  }
});