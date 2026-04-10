const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {

  // --- App info ---
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // --- Settings ---
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  isFirstRun: () => ipcRenderer.invoke('settings:is-first-run'),
  completeSetup: () => ipcRenderer.invoke('settings:complete-setup'),

  // --- Dialogs ---
  getDefaultPath: (purpose) => ipcRenderer.invoke('settings:default-path', purpose),
  chooseDirectory: (purpose) => ipcRenderer.invoke('dialog:choose-directory', purpose),
  openFile: () => ipcRenderer.invoke('dialog:open-file'),

  // --- Models ---
  getModels: () => ipcRenderer.invoke('models:list'),
  downloadModel: (name) => ipcRenderer.invoke('models:download', name),
  deleteModel: (name) => ipcRenderer.invoke('models:delete', name),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('models:download-progress', (event, data) => callback(data));
  },

  // --- Transcription ---
  transcribe: (options) => ipcRenderer.invoke('transcribe:start', options),
  onTranscribeProgress: (callback) => {
    ipcRenderer.on('transcribe:progress', (event, data) => callback(data));
  },

  // --- History ---
  getHistory: (options) => ipcRenderer.invoke('history:search', options),
  getTranscription: (id) => ipcRenderer.invoke('history:get', id),
  updateName: (id, filename) => ipcRenderer.invoke('history:update-name', { id, filename }),
  updateWords: (id, words) => ipcRenderer.invoke('history:update-words', { id, words }),
  deleteTranscription: (id) => ipcRenderer.invoke('history:delete', id),
  exportTxt: (id) => ipcRenderer.invoke('history:export-txt', id),
  exportSrt: (id) => ipcRenderer.invoke('history:export-srt', id),

  // --- Changelog ---
  shouldShowChangelog: () => ipcRenderer.invoke('app:should-show-changelog'),
  changelogSeen: () => ipcRenderer.invoke('app:changelog-seen'),

  // --- Updates ---
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  downloadUpdate: (url) => ipcRenderer.invoke('app:download-update', url),
  installUpdate: (path) => ipcRenderer.invoke('app:install-update', path),

  // --- Recording ---
  saveRecording: (buffer, ext) => ipcRenderer.invoke('recording:save', { buffer, ext }),

  // --- Utility ---
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getMediaUrl: (filePath) => `media://${encodeURIComponent(filePath)}`,
  getPathForFile: (file) => webUtils.getPathForFile(file),
  readFileBuffer: (filePath) => ipcRenderer.invoke('file:read-buffer', filePath)
});
