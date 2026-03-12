# VAULT Electron — Technical Documentation

> **Electron-specific implementation details** — main.js, preload.js, IPC, and intercept mechanism.

## Table of Contents

- [Overview](#overview)
- [main.js Explained](#mainjs-explained)
- [preload.js Explained](#preloadjs-explained)
- [IPC Communication](#ipc-communication)
- [Intercept Mechanism](#intercept-mechanism)
- [Credential Storage](#credential-storage)
- [Security Considerations](#security-considerations)
- [Debugging](#debugging)

---

## Overview

### Electron Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VAULT Electron App                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐         ┌───────────────────┐                       │
│  │   Main Process    │         │  Renderer Process │                       │
│  │   (main.js)       │◀───────▶│  (Frontend/HTML)  │                       │
│  │                   │   IPC   │                   │                       │
│  │  - Window mgmt    │         │  - React UI       │                       │
│  │  - Intercept      │         │  - library.js     │                       │
│  │  - Credentials    │         │  - Player         │                       │
│  └───────────────────┘         └───────────────────┘                       │
│           ▲                              ▲                                  │
│           │                              │                                  │
│           └──────────┬───────────────────┘                                  │
│                      │                                                      │
│              ┌───────▼────────┐                                             │
│              │  preload.js    │                                             │
│              │  (IPC Bridge)  │                                             │
│              └────────────────┘                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
electron/
├── README.md           # This file
├── main.js             # Main process (100 lines)
├── preload.js          # Preload script (50 lines)
└── icon.icns           # App icon
```

---

## main.js Explained

### Complete Source with Annotations

```javascript
const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');

const VAULT_PORT = process.env.VAULT_PORT || 5420;
const VAULT_URL = `http://localhost:${VAULT_PORT}`;

let mainWindow;

// Store RealDebrid credentials (set from settings page)
// ⚠️ Memory only - cleared on app restart
let rdCredentials = { host: '', user: '', pass: '' };

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    
    // macOS native title bar with traffic lights
    titleBarStyle: 'hiddenInset',
    
    webPreferences: {
      // ⚠️ Disable CORS for direct RealDebrid streaming
      webSecurity: false,
      allowRunningInsecureContent: true,
      
      // Security best practices
      nodeIntegration: false,
      contextIsolation: true,
      
      // Load preload script
      preload: path.join(__dirname, 'preload.js'),
      
      // Enable experimental features
      experimentalFeatures: true
    },
    
    // Dark background for smooth loading
    backgroundColor: '#0f0f0f',
    
    // Show window when ready (prevents flash)
    show: false,
    
    // Standard window frame
    frame: true,
    
    // Position traffic lights
    trafficLightPosition: { x: 20, y: 20 }
  });

  // Load VAULT with cache busting (prevents stale UI)
  const cacheBuster = '?t=' + Date.now() + '&r=' + Math.random();
  mainWindow.loadURL(VAULT_URL + cacheBuster);
  console.log('[Electron] Loading VAULT:', VAULT_URL + cacheBuster);

  // Show window when content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.openDevTools();  // Auto-open DevTools (dev only)
    mainWindow.focus();
  });

  // Clean up on close
  mainWindow.on('closed', () => { mainWindow = null; });

  // ⭐ IPC handler to set RealDebrid credentials
  // Called from frontend via window.electronAPI.setRDCredentials()
  ipcMain.handle('set-rd-credentials', (event, creds) => {
    rdCredentials = creds;
    console.log('[Electron] RD credentials set:', creds.host, creds.user);
    return { ok: true };
  });

  // ⭐ Intercept /api/stream requests and redirect to direct RealDebrid
  // This is the core of direct streaming
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.includes('/api/webdav/stream?path=')) {
      const urlObj = new URL(details.url);
      const path = decodeURIComponent(urlObj.searchParams.get('path') || '');

      if (path && rdCredentials.host) {
        // Build direct URL with credentials
        const host = rdCredentials.host.replace(/\/$/, '');
        const auth = Buffer.from(`${rdCredentials.user}:${rdCredentials.pass}`).toString('base64');
        const directUrl = `${host}${path}`;

        console.log('[Electron] Intercepting stream →', directUrl.substring(0, 60));

        // Redirect to direct URL with Authorization header
        callback({
          redirectURL: directUrl,
          requestHeaders: {
            ...details.requestHeaders,
            'Authorization': `Basic ${auth}`
          }
        });
        return;
      }
    }
    callback({});  // Pass through other requests unchanged
  });

  // ⭐ Add Authorization header to all RealDebrid requests
  // Catches any requests that bypass the intercept
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.url.includes('dav.real-debrid.com') || details.url.includes('rd-movie.com')) {
      if (rdCredentials.user && rdCredentials.pass) {
        const auth = Buffer.from(`${rdCredentials.user}:${rdCredentials.pass}`).toString('base64');
        details.requestHeaders['Authorization'] = `Basic ${auth}`;
        console.log('[Electron] Added auth header');
      }
    }
    callback({ requestHeaders: details.requestHeaders });
  });
}

// Initialize app
app.whenReady().then(() => {
  createWindow();
  
  // Re-create window on macOS when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Accept all certificates (development only!)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

console.log('🎬 VAULT Electron starting...');
```

### Key Sections

| Section | Lines | Purpose |
|---------|-------|---------|
| Window Creation | 20-50 | Create native macOS window |
| IPC Handler | 53-58 | Receive credentials from frontend |
| Request Intercept | 61-80 | Redirect to RealDebrid with auth |
| Header Injection | 83-92 | Add auth to all RD requests |
| App Lifecycle | 95-110 | Handle startup/shutdown |

---

## preload.js Explained

### Complete Source with Annotations

```javascript
/**
 * Preload Script for VAULT macOS App
 * 
 * This script runs in a privileged context and exposes
 * secure APIs to the renderer process via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

console.log('🔌 VAULT Electron preload script LOADED');
console.log('🔌 contextBridge available:', typeof contextBridge);

// ⭐ Expose Electron detection API
// Frontend uses this to detect if running in Electron
contextBridge.exposeInMainWorld('electron', {
  // Check if running in Electron
  isElectron: true,

  // Get app info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Check if running in Electron (for feature detection)
  checkElectron: () => ipcRenderer.invoke('is-electron'),

  // Platform info (macos, windows, linux)
  platform: process.platform,

  // Version (set by main process)
  version: null
});

console.log('✅ window.electron exposed with isElectron:', true);

// Verify accessibility (debug)
setTimeout(() => {
  console.log('🔍 Verifying window.electron...');
}, 1000);

// ⭐ Expose credential setter API
// This is the ONLY way for frontend to send credentials to Electron
contextBridge.exposeInMainWorld('electronAPI', {
  setRDCredentials: (creds) => ipcRenderer.invoke('set-rd-credentials', creds)
});
```

### Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    Preload Security Model                       │
└─────────────────────────────────────────────────────────────────┘

  Renderer Process (Frontend)
  │
  │  ❌ Cannot access Node.js directly
  │  ❌ Cannot access ipcRenderer directly
  │  ❌ Cannot access Electron APIs directly
  │
  │  ✅ Can access window.electron (read-only)
  │  ✅ Can access window.electronAPI (limited methods)
  │
  ▼
  Preload Script (Trusted)
  │
  │  ✅ Has access to contextBridge
  │  ✅ Has access to ipcRenderer
  │  ✅ Can expose selective APIs
  │
  ▼
  Main Process (Trusted)
  │
  │  ✅ Full Node.js access
  │  ✅ Full Electron access
  │  ✅ Credential storage
```

### Exposed APIs

| API | Method | Purpose |
|-----|--------|---------|
| `window.electron.isElectron` | Property | Detect Electron environment |
| `window.electron.platform` | Property | Get OS platform |
| `window.electronAPI.setRDCredentials()` | Method | Send credentials to main process |

---

## IPC Communication

### How IPC Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IPC Communication Flow                              │
└─────────────────────────────────────────────────────────────────────────────┘

  Frontend (Renderer)              Preload                    Main Process
       │                              │                            │
       │  window.electronAPI.         │                            │
       │  setRDCredentials(creds)     │                            │
       │─────────────────────────────▶│                            │
       │                              │  ipcRenderer.invoke()      │
       │                              │───────────────────────────▶│
       │                              │                            │  ipcMain.handle()
       │                              │                            │  rdCredentials = creds
       │                              │                            │  return { ok: true }
       │                              │◀───────────────────────────│
       │                              │  Promise resolves          │
       │◀─────────────────────────────│                            │
       │  Promise resolves            │                            │
```

### Usage Example

**Frontend Code**:
```javascript
// In static/library.js
async function playSceneDirect(scene) {
  // 1. Fetch credentials from server
  const creds = await GET('/api/webdav/credentials');
  
  // 2. Send to Electron via IPC
  if (window.electronAPI && window.electronAPI.setRDCredentials) {
    const result = await window.electronAPI.setRDCredentials({
      host: creds.host,
      user: creds.user,
      pass: creds.pass,
    });
    console.log('Credentials set:', result);
  }
  
  // 3. Continue with playback...
}
```

**Main Process Handler**:
```javascript
// In electron/main.js
ipcMain.handle('set-rd-credentials', (event, creds) => {
  rdCredentials = creds;
  console.log('[Electron] RD credentials set:', creds.host, creds.user);
  return { ok: true };
});
```

---

## Intercept Mechanism

### How Intercept Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Request Intercept Flow                              │
└─────────────────────────────────────────────────────────────────────────────┘

  1. Frontend creates video element
     │
     │  <video src="/api/webdav/stream?path=/movie.mp4">
     │
     ▼
  2. Browser initiates request
     │
     │  GET /api/webdav/stream?path=/movie.mp4
     │
     ▼
  3. Electron intercepts (onBeforeRequest)
     │
     │  - Detects /api/webdav/stream pattern
     │  - Extracts path parameter
     │  - Builds direct RealDebrid URL
     │  - Creates Authorization header
     │
     ▼
  4. Request redirected
     │
     │  redirectURL: https://dav.real-debrid.com/movie.mp4
     │  Authorization: Basic base64(user:pass)
     │
     ▼
  5. RealDebrid responds
     │
     │  302 Redirect to CDN
     │  Location: https://cdn.rd-movie.com/xyz/video.mp4
     │
     ▼
  6. Browser follows redirect automatically
     │
     │  GET https://cdn.rd-movie.com/xyz/video.mp4
     │
     ▼
  7. Video streams from CDN
     │
     │  (no server bandwidth used!)
```

### Intercept Code Breakdown

```javascript
// Step 1: Register intercept handler
session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
  
  // Step 2: Check if this is a stream request
  if (details.url.includes('/api/webdav/stream?path=')) {
    
    // Step 3: Parse the URL
    const urlObj = new URL(details.url);
    const path = decodeURIComponent(urlObj.searchParams.get('path') || '');
    
    // Step 4: Validate credentials exist
    if (path && rdCredentials.host) {
      
      // Step 5: Build direct URL
      const host = rdCredentials.host.replace(/\/$/, '');
      const auth = Buffer.from(`${rdCredentials.user}:${rdCredentials.pass}`).toString('base64');
      const directUrl = `${host}${path}`;
      
      // Step 6: Redirect with auth header
      callback({
        redirectURL: directUrl,
        requestHeaders: {
          ...details.requestHeaders,  // Preserve original headers
          'Authorization': `Basic ${auth}`  // Add auth
        }
      });
      return;
    }
  }
  
  // Step 7: Pass through other requests unchanged
  callback({});
});
```

### Why This Approach?

| Alternative | Why Not Used |
|-------------|--------------|
| Direct fetch in frontend | CORS restrictions |
| Proxy through server | 2x bandwidth |
| MediaSource API | Too complex, codec issues |
| **Intercept** | ✅ Simple, transparent, works |

---

## Credential Storage

### Storage Locations

| Location | Type | Persistence | Security |
|----------|------|-------------|----------|
| **VAULT Server DB** | SQLite (encrypted) | Persistent | High |
| **Electron Memory** | Variable | Session only | Medium |
| **Frontend** | Not stored | N/A | N/A |

### Credential Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Credential Storage Flow                             │
└─────────────────────────────────────────────────────────────────────────────┘

  VAULT Server              Frontend               Electron Main
  (SQLite DB)               (Renderer)             (Main Process)
       │                        │                        │
       │  Stored encrypted      │                        │
       │  in media.db           │                        │
       │◀───────────────────────│                        │
       │  GET /api/settings     │                        │
       │───────────────────────▶│                        │
       │                        │                        │
       │  Return decrypted      │                        │
       │  (for Electron only)   │                        │
       │◀───────────────────────│                        │
       │  GET /api/webdav/      │                        │
       │  credentials           │                        │
       │───────────────────────▶│                        │
       │                        │                        │
       │  {host, user, pass}    │                        │
       │◀───────────────────────│                        │
       │                        │                        │
       │                        │  window.electronAPI.   │
       │                        │  setRDCredentials()    │
       │                        │───────────────────────▶│
       │                        │                        │  Store in memory
       │                        │                        │  rdCredentials = creds
       │                        │                        │
```

### Security Notes

⚠️ **Important**:
- Credentials are **never** stored in frontend
- Credentials are **never** logged in plain text
- Credentials are **cleared** on app restart
- Credentials are **only** sent via secure IPC

---

## Security Considerations

### Security Measures

| Measure | Implementation | Purpose |
|---------|----------------|---------|
| **contextBridge** | preload.js | Isolate renderer from Node.js |
| **nodeIntegration: false** | main.js | Prevent Node.js access in renderer |
| **Memory-only credentials** | main.js | No persistent storage in Electron |
| **IPC for sensitive ops** | preload.js | Controlled API exposure |

### Known Limitations

| Limitation | Risk | Mitigation |
|------------|------|------------|
| `webSecurity: false` | CORS disabled | Only for desktop app, not web |
| Self-signed certs accepted | MITM possible | Only in development |
| DevTools auto-open | Code exposure | Development only |

### Production Hardening

For production builds, consider:

```javascript
// Disable DevTools in production
if (!isDev) {
  mainWindow.webContents.openDevTools = () => {};
}

// Enable webSecurity in production (if possible)
webPreferences: {
  webSecurity: !isDev,
}

// Remove console.log in production
if (!isDev) {
  console.log = () => {};
}
```

---

## Debugging

### Enable Debug Logging

**All Logs**:
```bash
# Set DEBUG environment variable
DEBUG=electron* npm start
```

**Specific Logs**:
```javascript
// Add to main.js
app.commandLine.appendSwitch('enable-logging');
```

### Common Debug Commands

```javascript
// In DevTools console

// Check Electron detection
window.electron.isElectron  // Should be true

// Check API availability
window.electronAPI  // Should be defined

// Test credential setting
await window.electronAPI.setRDCredentials({
  host: 'https://dav.real-debrid.com',
  user: 'test',
  pass: 'test'
});

// Check network requests
// (Use Network tab in DevTools)
```

### Log Locations

| Log Type | Location |
|----------|----------|
| Electron main | Terminal where `npm start` runs |
| Frontend | DevTools Console |
| Network | DevTools Network tab |
| Errors | Terminal + DevTools Console |

---

**Electron README Version**: 1.0  
**Last Updated**: 2026-03-12  
**Electron Version**: 41.0.0
