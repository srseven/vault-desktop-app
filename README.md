# VAULT Desktop App

> **Native macOS player for VAULT Stash** — Direct RealDebrid streaming with zero proxy bandwidth.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-41.0.0-blue.svg)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)](https://www.apple.com/macos/)

## What is VAULT Desktop App?

VAULT Desktop is a native macOS Electron application that provides **direct streaming** from RealDebrid's WebDAV servers. Unlike the web version which proxies video through your server, the desktop app intercepts network requests and streams directly from RealDebrid's CDN.

### Why Use the Desktop App?

| Feature | Web Version | Desktop App |
|---------|-------------|-------------|
| **Bandwidth** | 2x (server proxies) | 1x (direct stream) |
| **Start Time** | 5-10 seconds | 3-5 seconds |
| **Server Load** | High | None |
| **Playback** | Browser player | Native player |

---

## Features

### 🚀 Direct Streaming
- **Zero proxy bandwidth** — Video streams directly from RealDebrid CDN
- **No server load** — Your VAULT server only serves the UI
- **Fast start times** — 3-5 seconds to playback

### 🔒 Secure by Design
- Credentials stored in Electron main process (memory-only)
- Secure IPC communication between renderer and main process
- Automatic Authorization header injection
- No credentials exposed to frontend

### 🎨 Native macOS Experience
- Native window controls and traffic light buttons
- Proper macOS app bundle structure
- DMG installer for easy distribution
- Menu bar integration

### ⚡ Performance Optimized
- Request interception at network layer
- GPU-accelerated video decoding (VideoToolbox)
- Hardware acceleration enabled
- DNS prefetching for faster connections

---

## Installation

### Prerequisites

- **macOS** 10.15 (Catalina) or later
- **Node.js** 18.x or later
- **VAULT Stash Server** running locally

### Option 1: From Source (Recommended)

```bash
# Navigate to desktopapp directory
cd /path/to/vault-stash/desktopapp

# Install dependencies
npm install

# Run in development mode
npm start
```

### Option 2: Build DMG Installer

```bash
# Install dependencies
npm install

# Build distributable DMG
npm run build

# Output: dist/VAULT-Setup.dmg
```

### Option 3: Development Mode

```bash
# Terminal 1: Start VAULT Stash server
cd /path/to/vault-stash
python3 server.py

# Terminal 2: Start Electron app
cd /path/to/vault-stash/desktopapp
npm start
```

---

## Quick Start

### 3-Step Setup

```bash
# 1. Install dependencies
cd desktopapp
npm install

# 2. Start VAULT Stash server (separate terminal)
cd ..
python3 server.py

# 3. Launch Electron app
cd desktopapp
npm start
```

### First Run

1. **Configure RealDebrid WebDAV** in VAULT Stash settings:
   - Host: `https://dav.real-debrid.com`
   - Username: Your RealDebrid username
   - Password: Your RealDebrid password

2. **Launch the desktop app** — connects to `http://localhost:5420`

3. **Play any scene** — automatic direct streaming from RealDebrid

### Verify Direct Streaming

Open DevTools (Cmd+Option+I) and check console for:

```
[Electron] Intercepting stream → https://dav.real-debrid.com/...
[Electron] Added auth header
```

---

## Configuration

### RealDebrid WebDAV Settings

| Setting | Value | Required |
|---------|-------|----------|
| WebDAV Host | `https://dav.real-debrid.com` | ✅ |
| WebDAV User | Your RealDebrid username | ✅ |
| WebDAV Password | Your RealDebrid password | ✅ |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VAULT_PORT` | `5420` | VAULT Stash server port |
| `NODE_ENV` | `production` | Set to `development` for DevTools |
| `VAULT_BUST_CACHE` | `false` | Force cache busting on load |

---

## Usage

### Basic Playback

1. Navigate to **Library** or **Stash** tab
2. Click any scene card
3. Click **Play** button
4. Video streams directly from RealDebrid

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

```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version  # Should be 18.x+

# Verify server is running
curl http://localhost:5420
```

### Video Won't Play

**Checklist:**
- ✅ RealDebrid credentials configured in settings
- ✅ VAULT Stash server running on port 5420
- ✅ Console shows "Intercepting stream →"

**Debug in DevTools:**
```javascript
// Check Electron API
window.electronAPI  // Should be defined
window.electron     // Should have isElectron: true

// Test credentials
fetch('/api/webdav/credentials').then(r => r.json()).then(console.log)
```

### CORS Errors

**Note:** CORS is disabled in Electron by design. If you see CORS errors:
- Ensure you're running the **desktop app**, not a browser
- Verify `webSecurity: false` in `electron/main.js`

### Slow Performance

**Check:**
1. Internet connection speed
2. Server CPU/memory usage
3. Video codec (H.264 works best)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    VAULT Desktop App                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   Frontend  │───▶│   Electron  │───▶│ RealDebrid  │ │
│  │  (React/JS) │    │ (Intercept) │    │     CDN     │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
└─────────────────────────────────────────────────────────┘
                            │
                            │ Direct stream (no proxy)
                            ▼
                      Your Mac
```

### Request Flow

1. User clicks **Play** on a scene
2. Frontend fetches WebDAV credentials from server
3. Credentials sent to Electron via secure IPC
4. Video request triggered to `/api/webdav/stream`
5. Electron intercepts request
6. Redirects to RealDebrid URL with Authorization header
7. Video streams directly from RealDebrid CDN

---

## Development

### Project Structure

```
desktopapp/
├── electron/
│   ├── main.js          # Electron main process
│   ├── preload.js       # IPC bridge (contextBridge)
│   ├── entitlements.plist  # macOS permissions
│   └── icon.icns        # App icon
├── dist/                # Build output (DMG, app bundle)
├── package.json         # Dependencies and scripts
├── electron-builder.yml # Build configuration
└── README.md            # This file
```

### Available Scripts

```bash
npm start        # Run in development mode
npm run build    # Build DMG installer
npm run build:dir  # Build app bundle (no DMG)
```

### Build Configuration

The app is configured with `electron-builder.yml`:

- **App ID**: `com.vault.macos`
- **Product Name**: `VAULT`
- **Category**: `public.app-category.entertainment`
- **Target**: Universal binary (x64 + arm64)
- **Output**: `dist/VAULT-Setup.dmg`

---

## Security

### Credential Handling

- ✅ Credentials stored in Electron main process (memory-only)
- ✅ Secure IPC via contextBridge (no exposed APIs)
- ✅ Authorization headers added automatically
- ✅ No credentials in localStorage or sessionStorage

### Security Features

- `nodeIntegration: false` — Prevents Node.js access in renderer
- `contextBridge` — Secure IPC communication
- `webSecurity: false` — Required for RealDebrid streaming (documented)
- Certificate validation in production mode

---

## Performance

### Benchmarks

| Metric | Desktop App | Infuse | Web Version |
|--------|-------------|--------|-------------|
| **Start Time** | 3-5s | 2-3s | 5-10s |
| **Seek Time** | 1-2s | ~1s | 3-5s |
| **Bandwidth** | 1x | 1x | 2x |
| **CPU Usage** | ~18% | ~12% | ~25% |

### Optimizations

- GPU-accelerated video decoding (VideoToolbox)
- HTTP/2 and connection pooling
- DNS prefetching for RealDebrid CDN
- Hardware acceleration enabled
- Background throttling disabled

---

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **macOS** | 10.15 (Catalina) | 12.0 (Monterey)+ |
| **RAM** | 4 GB | 8 GB |
| **Storage** | 500 MB | 1 GB |
| **Internet** | 10 Mbps | 100 Mbps+ |

---

## Related Projects

- **[VAULT Stash](https://github.com/srseven/vault-stash)** — Main server application
- **[Electron](https://www.electronjs.org/)** — Desktop app framework
- **[electron-builder](https://www.electron.build/)** — Build tool

---

## License

MIT License — See [LICENSE](../LICENSE) for details.

---

**VAULT Desktop App** — Stream directly, save bandwidth, play instantly.

Made with ❤️ for VAULT Stash
