/**
 * CivicFix API Configuration & Interceptor for Mobile/Web
 */
(function () {
    if (window.__apiConfigInitialized) return;
    window.__apiConfigInitialized = true;

    const isMobileHost = window.Capacitor ||
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'file:' ||
        (window.location.hostname === 'localhost' && window.location.port !== '3000') ||
        (window.location.hostname === '127.0.0.1' && window.location.port !== '3000');

    // Default API Base URL for Mobile App (ADB reverse localhost:3000 or Wi-Fi IP)
    const storedApiBase = localStorage.getItem('API_BASE_URL');
    const defaultApiBase = isMobileHost ? (storedApiBase || 'http://localhost:3000') : '';
    window.API_BASE = defaultApiBase;

    // Auto-probe and lock onto reachable server on launch (ADB USB or Wi-Fi)
    if (isMobileHost) {
        (async function autoDetectServer() {
            const candidates = [
                'http://localhost:3000',
                'http://10.181.205.73:3000',
                'http://10.0.2.2:3000'
            ];
            if (storedApiBase && candidates.indexOf(storedApiBase) === -1) {
                candidates.unshift(storedApiBase);
            }
            for (const candidate of candidates) {
                try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 1200);
                    const res = await originalFetch(candidate + '/api', { signal: ctrl.signal });
                    clearTimeout(timer);
                    if (res && res.ok) {
                        window.API_BASE = candidate;
                        localStorage.setItem('API_BASE_URL', candidate);
                        console.log('✅ Connected to CivicFix server at:', candidate);
                        break;
                    }
                } catch (e) {}
            }
        })();
    }

    // Intercept window.fetch to prefix relative /api URLs with fallback handling
    const originalFetch = window.fetch;
    window.fetch = async function (resource, init) {
        let url = resource;
        if (typeof resource === 'string' && resource.startsWith('/api')) {
            const baseUrl = window.API_BASE || (isMobileHost ? 'http://localhost:3000' : '');
            url = baseUrl + resource;
        }

        try {
            return await originalFetch.call(this, url, init);
        } catch (err) {
            // Automatic fallback if current base fails
            if (typeof url === 'string' && isMobileHost) {
                const candidates = [
                    'http://localhost:3000',
                    'http://10.181.205.73:3000',
                    'http://10.0.2.2:3000'
                ];
                for (const candidate of candidates) {
                    if (!url.startsWith(candidate)) {
                        try {
                            const pathOnly = url.replace(/^https?:\/\/[^\/]+/, '');
                            const fallbackUrl = candidate + pathOnly;
                            const res = await originalFetch.call(this, fallbackUrl, init);
                            if (res && res.ok) {
                                window.API_BASE = candidate;
                                localStorage.setItem('API_BASE_URL', candidate);
                                return res;
                            }
                        } catch (fallbackErr) {}
                    }
                }
            }
            throw err;
        }
    };

    // Safely parse JSON responses to prevent 'Unexpected token <' error when server returns HTML
    const originalJson = Response.prototype.json;
    Response.prototype.json = async function () {
        try {
            return await originalJson.call(this);
        } catch (e) {
            if (e instanceof SyntaxError && (e.message.includes('Unexpected token') || e.message.includes('JSON'))) {
                const clone = this.clone();
                const text = await clone.text();
                if (text.trim().startsWith('<')) {
                    throw new Error('Server returned HTML instead of JSON. Ensure backend server is running on port 3000.');
                }
            }
            throw e;
        }
    };
})();
