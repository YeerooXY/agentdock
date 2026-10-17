'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dock', {
  call: (method, payload) => ipcRenderer.invoke('dock:call', method, payload),
  onState: callback => { const handler = (_, value) => callback(value); ipcRenderer.on('dock:state', handler); return () => ipcRenderer.removeListener('dock:state', handler); },
  onOutput: callback => { const handler = (_, value) => callback(value); ipcRenderer.on('dock:output', handler); return () => ipcRenderer.removeListener('dock:output', handler); },
  onSelect: callback => { const handler = (_, value) => callback(value); ipcRenderer.on('dock:select', handler); return () => ipcRenderer.removeListener('dock:select', handler); },
  onNotice: callback => { const handler = (_, value) => callback(value); ipcRenderer.on('dock:notice', handler); return () => ipcRenderer.removeListener('dock:notice', handler); }
});
