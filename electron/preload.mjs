import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    restore: () => ipcRenderer.invoke("window:restore"),
    close: () => ipcRenderer.invoke("window:close"),
    fullscreen: () => ipcRenderer.invoke("window:fullscreen"),
    isFullscreen: () => ipcRenderer.invoke("window:is-fullscreen"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizedChanged: (callback) => {
      const listener = (_, value) => callback(Boolean(value));
      ipcRenderer.on("window:maximized-changed", listener);
      return () => ipcRenderer.removeListener("window:maximized-changed", listener);
    },
    onFullscreenChanged: (callback) => {
      const listener = (_, value) => callback(Boolean(value));
      ipcRenderer.on("window:fullscreen-changed", listener);
      return () => ipcRenderer.removeListener("window:fullscreen-changed", listener);
    }
  },
  library: {
    readMetadata: (filePath) => ipcRenderer.invoke("library:read-metadata", filePath),
    importFolder: () => ipcRenderer.invoke("library:import-folder"),
    importPaths: (paths) => ipcRenderer.invoke("library:import-paths", paths),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    loadState: () => ipcRenderer.invoke("library:load-state"),
    saveState: (state) => ipcRenderer.invoke("library:save-state", state)
  },
  desktopLyrics: {
    setOpen: (open) => ipcRenderer.invoke("desktop-lyrics:set-open", open),
    update: (payload) => ipcRenderer.invoke("desktop-lyrics:update", payload),
    setLocked: (locked) => ipcRenderer.invoke("desktop-lyrics:set-locked", locked),
    sendCommand: (command) => ipcRenderer.send("desktop-lyrics:command", command),
    onData: (callback) => {
      const listener = (_, value) => callback(value);
      ipcRenderer.on("desktop-lyrics:data", listener);
      return () => ipcRenderer.removeListener("desktop-lyrics:data", listener);
    }
  },
  player: {
    update: (state) => ipcRenderer.invoke("player:update", state),
    onCommand: (callback) => {
      const listener = (_, command) => callback(command);
      ipcRenderer.on("player:command", listener);
      return () => ipcRenderer.removeListener("player:command", listener);
    }
  }
});
