const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('irsdk', {
  platform: process.platform,
  hasSim: process.platform === 'win32',
  // Replay control
  replayJump: (sessionTime) => ipcRenderer.invoke('irsdk:replay:jump', sessionTime),
  replaySpeed: (speed) => ipcRenderer.invoke('irsdk:replay:speed', speed),
  replayCamera: (carIdx, camGroup) => ipcRenderer.invoke('irsdk:replay:camera', carIdx, camGroup),
  replaySearch: (mode) => ipcRenderer.invoke('irsdk:replay:search', mode),
  getStatus: () => ipcRenderer.invoke('irsdk:status'),

  replayTime: (sessionNum, sessionTime) => ipcRenderer.invoke('irsdk:replay:time', sessionNum, sessionTime),

  // Admin commands (requires admin login in iRacing session)
  adminChat: (message) => ipcRenderer.invoke('irsdk:admin:chat', message),

  // Race Control v2 field feed (this PC's iRacing -> server)
  feedStart: (hz) => ipcRenderer.invoke('irsdk:feed:start', hz),
  feedStop: () => ipcRenderer.invoke('irsdk:feed:stop'),
  onFeed: (cb) => {
    const handler = (_event, obj) => cb(obj);
    ipcRenderer.on('irsdk:feed', handler);
    return () => ipcRenderer.removeListener('irsdk:feed', handler);
  },
});
