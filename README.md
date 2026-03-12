# VAULT Desktop App

> **Native macOS application for direct RealDebrid streaming** — Zero proxy bandwidth, instant playback, Electron-based.

## Table of Contents

- [What is VAULT Desktop App](#what-is-vault-desktop-app)
- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage Instructions](#usage-instructions)
- [Troubleshooting](#troubleshooting)
- [Performance Comparison](#performance-comparison)
- [Documentation Links](#documentation-links)

---

## What is VAULT Desktop App

VAULT Desktop App is a native macOS Electron application that provides **direct streaming** from RealDebrid's WebDAV servers. Unlike the web version which proxies video through your server, the desktop app intercepts network requests and streams directly from RealDebrid's CDN.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VAULT Desktop App                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Frontend  │───▶│   Electron  │───▶│  RealDebrid CDN     │ │
│  │  (React/JS) │    │   (IPC +    │    │  (Direct Stream)    │ │
│  │             │    │  Intercept) │    │                     │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ No server bandwidth used!
                              ▼
                        Your Mac
```

### Why Desktop App?

| Web Version | Desktop App |
|-------------|-------------|
| Video proxies through server | Direct from RealDebrid |
| 2x bandwidth (upload + download) | 1x bandwidth (download only) |
| Slower start times | Fast as Infuse |
| Browser CORS restrictions | No CORS (Electron) |

---

## Key Features

### 🚀 Direct Streaming
- **Zero proxy bandwidth** — Video streams directly from RealDebrid CDN to your Mac
- **No server load** — Your VAULT server only serves the UI, not video data
- **Instant playback** — Start times of 3-5 seconds, similar to Infuse

### 🔒 Secure Credential Handling
- Credentials stored in Electron main process (not exposed to renderer)
- IPC (Inter-Process Communication) for secure credential transfer
- Authorization headers added automatically to RealDebrid requests

### 🎨 Native macOS Experience
- Native window controls (traffic light buttons)
- Proper macOS app bundle structure
- DMG installer for easy distribution
- Menu bar integration

### ⚡ Performance Optimized
- Request interception at network layer
- Automatic Authorization header injection
- No MediaSource complexity — simple `<video>` element
- Cache-busted app loading

---

## Installation

### Prerequisites

- **macOS** 10.15 (Catalina) or later
- **Node.js** 18.x or later
- **VAULT Server** running locally (see [DEVELOPMENT.md](../DEVELOPMENT.md))

### Option 1: From DMG (Recommended)

1. Download `VAULT-Setup.dmg` from releases
2. Open DMG and drag VAULT to Applications folder
3. Launch from Applications

### Option 2: From Source

```bash
# Clone or navigate to desktopapp directory
cd /path/to/desktopapp

# Install dependencies
npm install

# Run in development mode
npm start

# Or build distributable
npm run build
```

### Option 3: Development Mode

```bash
# Terminal 1: Start VAULT server
cd /path/to/vault
./run_server.sh

# Terminal 2: Start Electron app
cd /path/to/desktopapp
npm start
```

---

## Quick Start

### 3-Step Setup

```bash
# 1. Install dependencies
cd desktopapp
npm install

# 2. Start VAULT server (in separate terminal)
cd ..
./run_server.sh

# 3. Launch Electron app
cd desktopapp
npm start
```

### First Run

1. **Configure RealDebrid WebDAV** in VAULT settings:
   - Host: `https://dav.real-debrid.com`
   - Username: Your RealDebrid username
   - Password: Your RealDebrid password (or app password)

2. **Launch the desktop app** — it will connect to `http://localhost:5420`

3. **Play any scene** — the app automatically:
   - Fetches credentials from `/api/webdav/credentials`
   - Sends credentials to Electron via IPC
   - Intercepts stream requests
   - Adds Authorization headers
   - Streams directly from RealDebrid

### Verify Direct Streaming

Open DevTools (enabled by default) and look for:

```
🎬 [DIRECT] Starting direct stream for: /path/to/video.mp4
🎬 [DIRECT] ✅ Credentials sent to Electron
🎬 [DIRECT] Using proxy URL (Electron will intercept): /api/webdav/stream?path=...
[Electron] RD credentials set: https://dav.real-debrid.com user
[Electron] Intercepting stream → https://dav.real-debrid.com/path/to/video.mp4
[Electron] Added auth header
```

---

## Usage Instructions

### Basic Playback

1. Navigate to **Library** or **Stash** tab
2. Click any scene card
3. Click **Play** button
4. Video loads directly from RealDebrid CDN

### Settings Configuration

The desktop app uses the same settings as the web version:

| Setting | Value | Required |
|---------|-------|----------|
| WebDAV Host | `https://dav.real-debrid.com` | ✅ |
| WebDAV User | Your RealDebrid username | ✅ |
| WebDAV Password | Your RealDebrid password | ✅ |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+R` | Refresh page |
| `Cmd+Option+I` | Open DevTools |
| `Cmd+Q` | Quit app |
| `Cmd+W` | Close window |

---

## Troubleshooting

### App Won't Start

**Problem**: `npm start` fails with errors

**Solutions**:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be 18.x or later

# Check if server is running
curl http://localhost:5420/api/health
```

### Video Won't Play

**Problem**: Clicking play shows loading spinner forever

**Checklist**:
1. ✅ RealDebrid credentials configured in settings
2. ✅ VAULT server running on port 5420
3. ✅ Console shows "Credentials sent to Electron"
4. ✅ Console shows "Intercepting stream →"

**Debug Steps**:
```javascript
// In DevTools console, check:
window.electronAPI  // Should be defined
window.electron     // Should have isElectron: true

// Test credentials endpoint
fetch('/api/webdav/credentials').then(r => r.json()).then(console.log)
```

### Credentials Not Saving

**Problem**: Credentials reset after restart

**Solution**: Ensure credentials are saved in VAULT settings:
1. Go to Settings → RealDebrid WebDAV
2. Enter host, username, password
3. Click **Save**
4. Restart desktop app

### CORS Errors

**Problem**: `Access-Control-Allow-Origin` errors in console

**Note**: CORS is **disabled** in Electron by design. If you see CORS errors:
- Check you're running the **desktop app**, not browser
- Verify `webSecurity: false` in `electron/main.js`

### Black Screen / No Video

**Problem**: Player loads but shows black screen

**Possible Causes**:
1. **Invalid WebDAV path** — Check RealDebrid file exists
2. **Expired credentials** — Re-enter RealDebrid password
3. **Network issue** — Check internet connection

**Debug**:
```javascript
// In DevTools console
const creds = await fetch('/api/webdav/credentials').then(r => r.json());
console.log('Credentials:', creds);

// Test direct URL (will fail in browser, work in Electron)
fetch('/api/webdav/stream?path=/your/video.mp4')
  .then(r => console.log('Response:', r.status, r.url));
```

### App Crashes on Launch

**Problem**: App opens then immediately closes

**Solutions**:
```bash
# Check Electron logs
npm start 2>&1 | tee electron.log

# Look for errors like:
# - Port already in use
# - Certificate errors
# - Missing files

# Reset Electron cache
rm -rf ~/Library/Application\ Support/VAULT
```

### Slow Performance

**Problem**: Video takes >10 seconds to start

**Checklist**:
1. Internet connection speed (RealDebrid requires good bandwidth)
2. Server not overloaded (check CPU/memory)
3. Video codec compatibility (H.264 works best)

---

## Performance Comparison

### Bandwidth Usage

| Method | Bandwidth | Description |
|--------|-----------|-------------|
| **Web (Proxy)** | 2x | Server downloads + uploads to you |
| **Desktop (Direct)** | 1x | You download directly from RealDebrid |
| **Infuse** | 1x | Direct from RealDebrid |

### Start Time

| Method | Average Start Time |
|--------|-------------------|
| **Infuse** | ~2-3 seconds |
| **Desktop** | ~3-5 seconds |
| **Web (Proxy)** | ~5-10 seconds |

### Seeking Performance

| Method | Seek Time |
|--------|-----------|
| **Infuse** | ~1 second |
| **Desktop** | ~1-2 seconds |
| **Web (Proxy)** | ~3-5 seconds |

### Why Desktop Matches Infuse

Both use the **same approach**:
1. Direct connection to RealDebrid WebDAV
2. Authorization headers on every request
3. No intermediate proxy
4. Native video player (HTML5 vs AVPlayer)

---

## Documentation Links

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture and flow diagrams |
| [PERFORMANCE.md](./PERFORMANCE.md) | Performance optimization history |
| [QUICKSTART.md](./QUICKSTART.md) | Quick start guide |
| [CHANGELOG.md](./CHANGELOG.md) | Development history |
| [electron/README.md](./electron/README.md) | Electron-specific documentation |

---

## Support

- **Issues**: Report on GitHub
- **Discussions**: VAULT community
- **Documentation**: See `/memory` folder

---

**VAULT Desktop App** — Stream directly, save bandwidth, play instantly.
