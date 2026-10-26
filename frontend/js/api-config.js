/**
 * CivicFix API Configuration & Interceptor for Mobile/Web
 */
(function () {
    if (window.__apiConfigInitialized) return;
    window.__apiConfigInitialized = true;

    // Detect if running in an isolated container/app (Capacitor/Cordova/file://) or different port
    const isStandaloneApp = !!(window.Capacitor ||
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'file:');

    const isDifferentHost = window.location.protocol.startsWith('http') && window.location.port !== '3000';
    const isMobileHost = isStandaloneApp || isDifferentHost;

    window.isMobileHost = isMobileHost;

    // Current PC Wi-Fi IP and candidates
    const CURRENT_PC_IP = '192.168.1.131';
    const KNOWN_SERVERS = [
        `http://${CURRENT_PC_IP}:3000`,
        'http://localhost:3000',
        'http://10.0.2.2:3000'
    ];

    // Only add window.location.origin if it is specifically running on backend port 3000
    // (Never add plain 'http://localhost' from Capacitor's internal WebView server)
    if (window.location.port === '3000' && window.location.protocol.startsWith('http')) {
        const originClean = window.location.origin.replace(/\/+$/, '');
        if (!KNOWN_SERVERS.includes(originClean)) {
            KNOWN_SERVERS.unshift(originClean);
        }
    }

    // Sanitize stored API base (ignore invalid or port-less localhost)
    let storedApiBase = localStorage.getItem('API_BASE_URL');
    if (storedApiBase) {
        storedApiBase = storedApiBase.trim().replace(/\/+$/, '');
        if (storedApiBase === 'http://localhost' || storedApiBase === 'https://localhost' || !storedApiBase.includes(':3000')) {
            // Invalid local origin stored from old bug
            localStorage.removeItem('API_BASE_URL');
            storedApiBase = null;
        }
    }

    window.API_BASE = storedApiBase || (isMobileHost ? `http://${CURRENT_PC_IP}:3000` : '');

    const originalFetch = window.fetch;

    // Helper to probe a candidate: must return 200 OK AND application/json with CivicFix status
    async function probeServer(candidate, timeoutMs = 2000) {
        const cleanCandidate = (candidate || '').replace(/\/+$/, '');
        if (!cleanCandidate.startsWith('http://') && !cleanCandidate.startsWith('https://')) {
            throw new Error('Invalid URL');
        }

        // Never probe port-less localhost/127.0.0.1 (Capacitor's internal static file server)
        try {
            const parsed = new URL(cleanCandidate);
            if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && !parsed.port) {
                throw new Error('Skipping internal WebView server');
            }
        } catch (e) {
            throw e;
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await originalFetch(cleanCandidate + '/api', { 
                signal: ctrl.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timer);
            if (res && res.ok) {
                const contentType = res.headers.get('content-type') || '';
                // Must be JSON, NOT HTML from a 404 or SPA fallback
                if (!contentType.includes('application/json')) {
                    throw new Error('Not a JSON API endpoint');
                }
                const data = await res.json();
                if (data && (data.status === 'operational' || (data.message && data.message.includes('CivicFix')))) {
                    return cleanCandidate;
                }
            }
        } catch (e) {
            clearTimeout(timer);
        }
        throw new Error('Unreachable: ' + cleanCandidate);
    }

    // Fast probe across valid candidates
    window.detectActiveServer = async function () {
        const candidates = [...KNOWN_SERVERS];
        const currentStored = localStorage.getItem('API_BASE_URL');
        if (currentStored && currentStored.includes(':3000') && !candidates.includes(currentStored)) {
            candidates.unshift(currentStored.replace(/\/+$/, ''));
        }

        try {
            const winner = await Promise.any(candidates.map(c => probeServer(c)));
            window.API_BASE = winner;
            localStorage.setItem('API_BASE_URL', winner);
            console.log('✅ Connected to CivicFix server at:', winner);
            updateServerStatusUI(winner, true);
            return winner;
        } catch (e) {
            console.warn('⚠️ No candidate server responded during auto-probe.');
            const fallback = `http://${CURRENT_PC_IP}:3000`;
            window.API_BASE = fallback;
            updateServerStatusUI(fallback, false);
            return null;
        }
    };

    // Manual server override
    window.setServerAddress = async function (inputUrl) {
        let formatted = (inputUrl || '').trim();
        if (!formatted) throw new Error('Please enter a server address.');
        if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
            formatted = 'http://' + formatted;
        }
        // If no port specified and looks like an IP address, add :3000
        try {
            const parsed = new URL(formatted);
            if (!parsed.port && parsed.hostname !== 'localhost') {
                formatted = `${parsed.protocol}//${parsed.hostname}:3000`;
            }
        } catch (e) {}

        formatted = formatted.replace(/\/+$/, '');

        // Test connection
        try {
            await probeServer(formatted, 2500);
            window.API_BASE = formatted;
            localStorage.setItem('API_BASE_URL', formatted);
            updateServerStatusUI(formatted, true);
            return { success: true, url: formatted };
        } catch (err) {
            window.API_BASE = formatted;
            localStorage.setItem('API_BASE_URL', formatted);
            updateServerStatusUI(formatted, false);
            throw new Error(`Server did not respond at ${formatted}/api. Please check your PC IP and ensure backend is running.`);
        }
    };

    function updateServerStatusUI(serverUrl, isReachable) {
        const dot = document.getElementById('server-status-dot');
        const label = document.getElementById('server-status-label');
        const input = document.getElementById('server-ip-input');
        const bar = document.getElementById('mobile-server-bar');
        if (bar) {
            bar.classList.remove('hidden');
        }
        if (dot) {
            dot.className = isReachable 
                ? 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse' 
                : 'w-2 h-2 rounded-full bg-rose-500';
        }
        if (label) {
            try {
                const u = new URL(serverUrl);
                label.textContent = `Server: ${u.host}`;
            } catch (e) {
                label.textContent = `Server: ${serverUrl || 'Offline'}`;
            }
        }
        if (input && serverUrl) {
            input.value = serverUrl;
        }
    }

    // Auto-probe on launch if mobile or app
    if (isMobileHost) {
        window.detectActiveServer();
    }

    // Setup UI on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        updateServerStatusUI(window.API_BASE || `http://${CURRENT_PC_IP}:3000`, false);
        const bar = document.getElementById('mobile-server-bar');
        if (bar && isMobileHost) {
            bar.classList.remove('hidden');
        }
    });

    // Intercept window.fetch to prefix relative /api URLs cleanly without double slashes
    window.fetch = async function (resource, init) {
        let url = resource;
        if (typeof resource === 'string' && resource.startsWith('/api')) {
            let base = window.API_BASE;
            if (!base || (isMobileHost && (base === 'http://localhost' || !base.includes(':3000')))) {
                base = `http://${CURRENT_PC_IP}:3000`;
            }
            base = base.replace(/\/+$/, '');
            url = base + resource;
        }

        try {
            return await originalFetch.call(this, url, init);
        } catch (err) {
            // Automatic fallback if current base fails
            if (typeof url === 'string' && isMobileHost) {
                const candidates = [
                    `http://${CURRENT_PC_IP}:3000`,
                    'http://localhost:3000',
                    'http://10.0.2.2:3000'
                ];
                for (const candidate of candidates) {
                    if (!url.startsWith(candidate)) {
                        try {
                            const pathOnly = url.replace(/^https?:\/\/[^\/]+/, '');
                            const fallbackUrl = candidate.replace(/\/+$/, '') + pathOnly;
                            const res = await originalFetch.call(this, fallbackUrl, init);
                            if (res && res.ok) {
                                window.API_BASE = candidate;
                                localStorage.setItem('API_BASE_URL', candidate);
                                updateServerStatusUI(candidate, true);
                                return res;
                            }
                        } catch (fallbackErr) {}
                    }
                }
            }
            throw err;
        }
    };

    // Safely parse JSON responses using text() first — NEVER call clone() on a consumed response
    const originalJson = Response.prototype.json;
    Response.prototype.json = async function () {
        let text = '';
        try {
            text = await this.text();
        } catch (readErr) {
            return await originalJson.call(this);
        }

        const trimmed = (text || '').trim();
        try {
            return JSON.parse(trimmed || '{}');
        } catch (e) {
            if (trimmed.startsWith('<')) {
                throw new Error(`Connected to a web page instead of CivicFix API (${window.API_BASE || 'server'}). Please check your Wi-Fi or tap Server at the bottom to configure http://${CURRENT_PC_IP}:3000.`);
            }
            if (!trimmed) {
                return {};
            }
            throw new Error(`Server returned non-JSON response: ${trimmed.substring(0, 100)}`);
        }
    };
})();
