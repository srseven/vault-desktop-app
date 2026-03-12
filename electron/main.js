const { app, BrowserWindow, session, ipcMain, protocol } = require('electron');
const path = require('path');

const VAULT_PORT = process.env.VAULT_PORT || 5420;
const VAULT_URL = `http://localhost:${VAULT_PORT}`;

let mainWindow;

// Store RealDebrid credentials (set from settings page)
let rdCredentials = { host: '', user: '', pass: '' };

// Performance metrics
const performanceMetrics = {
  appStartTime: Date.now(),
  windowReadyTime: 0,
  firstFrameTime: 0,
  totalRequests: 0,
  interceptedRequests: 0,
  skippedRequests: 0,
  avgSeekTime: 0,
  seekCount: 0
};

// Request logging for debugging
const requestLog = [];
const MAX_LOG_SIZE = 100;

// Credential cache with expiry
let credentialsExpiry = 0;
const CREDENTIAL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function createWindow() {
  console.log('');
  console.log('========================================');
  console.log('[Electron] Creating VAULT window...');
  console.log('  VAULT URL:', VAULT_URL);
  console.log('  Credentials set:', rdCredentials.host ? '✅ Yes' : '❌ No (waiting for settings)');
  console.log('========================================');
  console.log('');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      webSecurity: false,
      allowRunningInsecureContent: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      experimentalFeatures: true,
      backgroundThrottling: false,  // Prevent video throttling
      offscreen: false,
      sandbox: false,  // Required for some GPU features
      enableBlinkFeatures: 'WebCodecs,VideoTrack'  // Enable modern codec APIs
    },
    backgroundColor: '#0f0f0f',
    show: false,
    frame: true,
    trafficLightPosition: { x: 20, y: 20 },
    paintWhenInitiallyHidden: true,
    visualEffectState: 'active'  // Keep GPU active for transitions
  });

  // Load VAULT with smart caching (cache bust only if needed)
  const shouldBustCache = process.env.VAULT_BUST_CACHE === 'true';
  const cacheBuster = shouldBustCache ? '?t=' + Date.now() : '?v=1';
  
  console.log('[Electron] Loading VAULT:', VAULT_URL + cacheBuster);
  mainWindow.loadURL(VAULT_URL + cacheBuster);
  
  // Show window after load or timeout (whichever comes first)
  let windowShown = false;
  
  const showWindow = () => {
    if (!windowShown && mainWindow) {
      windowShown = true;
      performanceMetrics.windowReadyTime = Date.now();
      const loadTime = performanceMetrics.windowReadyTime - performanceMetrics.appStartTime;
      console.log(`[Performance] Window ready in ${loadTime}ms`);
      mainWindow.show();
      mainWindow.focus();
      // DevTools only in development
      if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
      }
    }
  };
  
  mainWindow.once('ready-to-show', () => {
    console.log('[Electron] ready-to-show event fired');
    showWindow();
  });
  
  // Fallback: show window after 5 seconds even if not ready
  setTimeout(() => {
    if (!windowShown && mainWindow) {
      console.log('[Electron] Timeout reached, forcing window show');
      showWindow();
    }
  }, 5000);
  
  // Handle load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] ❌ Page load failed:', errorDescription);
    console.error('[Electron] Error code:', errorCode);
    console.error('[Electron] Check if VAULT server is running on', VAULT_URL);
    // Still show window so user can see the error
    showWindow();
  });
  
  // Log successful load
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] ✅ Page loaded successfully');
  });

  mainWindow.on('closed', () => {
    logPerformanceMetrics();
    mainWindow = null;
  });

  // ⭐ IPC handler to set RealDebrid credentials (with caching)
  ipcMain.handle('set-rd-credentials', (event, creds) => {
    rdCredentials = creds;
    credentialsExpiry = Date.now() + CREDENTIAL_CACHE_TTL;
    console.log('');
    console.log('========================================');
    console.log('[Electron] ✅ RD credentials cached for 24h');
    console.log('  Host:', creds.host);
    console.log('  User:', creds.user);
    console.log('  Ready to intercept streams!');
    console.log('========================================');
    console.log('');
    return { ok: true, cached: true };
  });

  // ⭐ Get cached credentials (avoid unnecessary IPC)
  ipcMain.handle('get-rd-credentials', () => {
    if (credentialsExpiry > Date.now() && rdCredentials.host) {
      console.log('[Electron] Returning cached credentials');
      return { ok: true, cached: true, credentials: rdCredentials };
    }
    return { ok: false, cached: false };
  });

  // ⭐ Performance monitoring handler
  ipcMain.handle('report-performance', (event, metrics) => {
    Object.assign(performanceMetrics, metrics);
    if (metrics.firstFrameTime) {
      console.log(`[Performance] First frame: ${metrics.firstFrameTime}ms`);
    }
    if (metrics.seekTime) {
      performanceMetrics.seekCount++;
      performanceMetrics.avgSeekTime = ((performanceMetrics.avgSeekTime * (performanceMetrics.seekCount - 1)) + metrics.seekTime) / performanceMetrics.seekCount;
      console.log(`[Performance] Seek: ${metrics.seekTime}ms (avg: ${performanceMetrics.avgSeekTime.toFixed(0)}ms)`);
    }
    return { ok: true };
  });

  // ⭐ Helper: Log request for debugging
  function logRequest(type, url, intercepted) {
    const entry = {
      timestamp: Date.now(),
      type,
      url: url.substring(0, 150),
      intercepted
    };
    requestLog.push(entry);
    if (requestLog.length > MAX_LOG_SIZE) {
      requestLog.shift();
    }
  }

  // ⭐ Helper: Check if URL should be intercepted
  function shouldIntercept(url) {
    // Skip non-HTTP requests
    if (!url.startsWith('http')) return false;

    // Pattern 1: VAULT stream endpoint (with or without webdav)
    if (url.includes('/api/webdav/stream')) return true;
    if (url.includes('/api/stream')) return true;

    // Pattern 2: Stream query parameter (any format)
    if (url.includes('/stream?') || url.includes('/stream/')) return true;

    // Pattern 3: Video file extensions (fallback)
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
    const urlLower = url.toLowerCase();
    for (const ext of videoExtensions) {
      if (urlLower.includes(ext)) return true;
    }

    return false;
  }

  // ⭐ Helper: Build RealDebrid direct URL
  function buildDirectUrl(path) {
    if (!rdCredentials.host || !path) return null;

    const host = rdCredentials.host.replace(/\/$/, '');
    const auth = Buffer.from(`${rdCredentials.user}:${rdCredentials.pass}`).toString('base64');

    // Decode path if it's URL-encoded
    let decodedPath = path;
    try {
      decodedPath = decodeURIComponent(path);
    } catch (e) {
      // Path is not encoded, use as-is
    }

    // Ensure path starts with /
    if (!decodedPath.startsWith('/')) {
      decodedPath = '/' + decodedPath;
    }

    return {
      url: `${host}${decodedPath}`,
      auth: `Basic ${auth}`
    };
  }

  // ⭐ Intercept /api/stream requests and redirect to direct RealDebrid with auth
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    performanceMetrics.totalRequests++;
    
    if (details.url.includes('/api/webdav/stream?path=')) {
      const urlObj = new URL(details.url);
      const path = decodeURIComponent(urlObj.searchParams.get('path') || '');

      if (path && rdCredentials.host) {
        performanceMetrics.interceptedRequests++;
        
        // Build direct URL with credentials
        const host = rdCredentials.host.replace(/\/$/, '');
        const auth = Buffer.from(`${rdCredentials.user}:${rdCredentials.pass}`).toString('base64');
        const directUrl = `${host}${path}`;

        console.log('[Electron] Intercepting stream →', directUrl.substring(0, 60));

        // Redirect to direct URL
        callback({
          redirectURL: directUrl,
          requestHeaders: {
            ...details.requestHeaders,
            'Authorization': `Basic ${auth}`,
            'Connection': 'keep-alive'
          }
        });
        return;
      }
    }
    callback({});
  });

  // ⭐ Add Authorization header to all RealDebrid requests
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.url.includes('dav.real-debrid.com') || details.url.includes('rd-movie.com')) {
      if (rdCredentials.user && rdCredentials.pass) {
        const auth = Buffer.from(`${rdCredentials.user}:${rdCredentials.pass}`).toString('base64');
        details.requestHeaders['Authorization'] = `Basic ${auth}`;
        details.requestHeaders['Connection'] = 'keep-alive';
        console.log('[Electron] Added auth header');
      }
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  // ⭐ DNS Prefetch for RealDebrid CDN domains
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Performance] Adding DNS prefetch for RD CDN domains');
    mainWindow.webContents.executeJavaScript(`
      (function() {
        const dnsPrefetch = [
          'dav.real-debrid.com',
          'rd-movie.com',
          '*.rd-movie.com'
        ];
        dnsPrefetch.forEach(domain => {
          const link = document.createElement('link');
          link.rel = 'dns-prefetch';
          link.href = '//' + domain;
          if (!document.querySelector('link[rel="dns-prefetch"][href="//' + domain + '"]')) {
            document.head.appendChild(link);
          }
        });
        console.log('[Performance] DNS prefetch added');
      })();
    `);
  });

  // ⭐ Expose request log via IPC for debugging
  ipcMain.handle('get-request-log', () => {
    return {
      log: requestLog,
      metrics: {
        total: performanceMetrics.totalRequests,
        intercepted: performanceMetrics.interceptedRequests,
        skipped: performanceMetrics.skippedRequests
      }
    };
  });
}

// ⭐ Log performance metrics on exit
function logPerformanceMetrics() {
  const totalTime = Date.now() - performanceMetrics.appStartTime;
  console.log('\n========== PERFORMANCE METRICS ==========');
  console.log(`Window Ready: ${performanceMetrics.windowReadyTime - performanceMetrics.appStartTime}ms`);
  console.log(`Total Runtime: ${totalTime}ms`);
  console.log(`Total Requests: ${performanceMetrics.totalRequests}`);
  console.log(`Intercepted Requests: ${performanceMetrics.interceptedRequests}`);
  console.log(`Skipped Requests: ${performanceMetrics.skippedRequests}`);
  if (performanceMetrics.totalRequests > 0) {
    console.log(`Intercept Rate: ${((performanceMetrics.interceptedRequests / performanceMetrics.totalRequests) * 100).toFixed(1)}%`);
  }
  if (performanceMetrics.seekCount > 0) {
    console.log(`Average Seek Time: ${performanceMetrics.avgSeekTime.toFixed(0)}ms`);
  }

  // Log recent request patterns
  if (requestLog.length > 0) {
    console.log('\n--- Recent Request Log (last 10) ---');
    requestLog.slice(-10).forEach(entry => {
      const status = entry.intercepted ? '✅' : '⏭️';
      console.log(`${status} [${entry.type}] ${entry.url}`);
    });
  }

  console.log('========================================\n');
}

// ⭐ Performance optimizations
app.whenReady().then(() => {
  // Enable HTTP/2 and connection pooling
  app.commandLine.appendSwitch('enable-features',
    'HTTP2,ParallelDownloading,VideoDecodePipeline,WebCodecs,HardwareVideoEncoder,HardwareVideoDecoder');

  // Enable GPU acceleration for video decoding (macOS Metal)
  app.commandLine.appendSwitch('use-angle', 'metal');  // Force Metal backend
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-accelerated-video-decode');
  app.commandLine.appendSwitch('enable-accelerated-mjpeg-decode');
  app.commandLine.appendSwitch('enable-gpu-memory-buffer-video-frames');
  app.commandLine.appendSwitch('enable-parallel-video-decode');  // Multi-threaded video decode

  // macOS-specific: Force hardware video decoding pipeline
  if (process.platform === 'darwin') {
    app.commandLine.appendSwitch('enable-video-decode-pipeline');
    console.log('[GPU] macOS detected - VideoToolbox hardware decoding enabled');
  }

  // Optimize network stack
  app.commandLine.appendSwitch('enable-quic');
  app.commandLine.appendSwitch('enable-tcp-fast-open');

  // DNS optimization
  app.commandLine.appendSwitch('host-rules', [
    'MAP dav.real-debrid.com:443 <notfound>',  // Force IPv4
  ].join('; '));

  // Create window
  createWindow();

  // Periodic performance logging
  setInterval(() => {
    const rate = performanceMetrics.totalRequests > 0
      ? ((performanceMetrics.interceptedRequests / performanceMetrics.totalRequests) * 100).toFixed(1)
      : 0;
    console.log('[Performance] Active - Requests:', performanceMetrics.totalRequests,
                'Intercepted:', performanceMetrics.interceptedRequests,
                `Rate: ${rate}%`);
  }, 60000); // Log every minute

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

// ⭐ GPU crash recovery
app.on('gpu-process-crashed', (event, killed) => {
  console.error('[GPU] GPU process crashed:', killed ? 'killed' : 'crashed');
  // Try to recover by reloading the window
  if (mainWindow) {
    console.log('[GPU] Attempting to recover by reloading...');
    mainWindow.reload();
  }
});

// ⭐ GPU process information
app.on('child-process-gone', (event, details) => {
  if (details.type === 'GPU') {
    console.error(`[GPU] GPU process gone: ${details.reason}, exitCode: ${details.exitCode}`);
  }
});

app.on('quit', () => {
  logPerformanceMetrics();
});

console.log('🎬 VAULT Electron starting with performance optimizations...');
