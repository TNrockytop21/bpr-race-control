const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('irsdk', {
  // Replay control
  replayJump: (sessionTime) => ipcRenderer.invoke('irsdk:replay:jump', sessionTime),
  replaySpeed: (speed) => ipcRenderer.invoke('irsdk:replay:speed', speed),
  replayCamera: (carIdx, camGroup) => ipcRenderer.invoke('irsdk:replay:camera', carIdx, camGroup),
  replaySearch: (mode) => ipcRenderer.invoke('irsdk:replay:search', mode),
  getStatus: () => ipcRenderer.invoke('irsdk:status'),
});
