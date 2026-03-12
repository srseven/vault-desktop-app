/**
 * Preload Script for VAULT macOS App
 *
 * This script runs in a privileged context and exposes
 * secure APIs to the renderer process via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

console.log('🔌 VAULT Electron preload script LOADED');
console.log('🔌 contextBridge available:', typeof contextBridge);

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Check if running in Electron
  isElectron: true,

  // Get app info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Check if running in Electron (for feature detection)
  checkElectron: () => ipcRenderer.invoke('is-electron'),

  // Platform info
  platform: process.platform,

  // Version
  version: null  // Will be set by main process
});

console.log('✅ window.electron exposed with isElectron:', true);

// Verify it's accessible
setTimeout(() => {
  console.log('🔍 Verifying window.electron...');
}, 1000);

// Expose credential setter
contextBridge.exposeInMainWorld('electronAPI', {
  setRDCredentials: (creds) => ipcRenderer.invoke('set-rd-credentials', creds),
  getRDCredentials: () => ipcRenderer.invoke('get-rd-credentials'),
  reportPerformance: (metrics) => ipcRenderer.invoke('report-performance', metrics),
  // Debug: Get request interception log
  getRequestLog: () => ipcRenderer.invoke('get-request-log')
});
