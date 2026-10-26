/**
 * CivicFix - Staff Complaint Queue & Queries System
 * Coimbatore City Municipal Corporation
 */

// Global State
let currentUser = null;
let authToken = '';
let allComplaints = [];
let filteredComplaints = [];
let currentFilter = 'ALL';
let currentSort = 'newest';
let selectedComplaintId = null;
let selectedStatus = 'Received';
let selectedQueryCategory = 'Bottleneck Situation';
let staffNotifications = [];

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuthGuard()) return;
    initUserInfo();
    loadComplaintsQueue();
    loadStaffQueries();
    loadStaffNotifications();

    // Poll for in-app notifications every 12 seconds
    setInterval(loadStaffNotifications, 12000);

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        const filterBtn = document.getElementById('btn-filter');
        const filterMenu = document.getElementById('filter-dropdown');
        if (filterBtn && filterMenu && !filterBtn.contains(e.target) && !filterMenu.contains(e.target)) {
            filterMenu.classList.add('hidden');
        }

        const sortBtn = document.getElementById('btn-sort');
        const sortMenu = document.getElementById('sort-dropdown');
        if (sortBtn && sortMenu && !sortBtn.contains(e.target) && !sortMenu.contains(e.target)) {
            sortMenu.classList.add('hidden');
        }
    });
});

// ==========================================
// 1. AUTH GUARD & USER INITIALIZATION
// ==========================================
function checkAuthGuard() {
    authToken = localStorage.getItem('civicfix_token') || localStorage.getItem('token');
    const userStr = localStorage.getItem('civicfix_user') || localStorage.getItem('user');

    if (!authToken || !userStr) {
        window.location.replace('/login.html?tab=staff');
        return false;
    }

    try {
        currentUser = JSON.parse(userStr);
    } catch (e) {
        window.location.replace('/login.html?tab=staff');
        return false;
    }

    if (currentUser.role !== 'staff' && currentUser.role !== 'admin') {
        showToast('Access restricted to staff accounts.', 'error');
        setTimeout(() => {
            window.location.replace('/login.html?tab=staff');
        }, 1000);
        return false;
    }

    return true;
}

function initUserInfo() {
    const deptEl = document.getElementById('header-department');
    const avatarEl = document.getElementById('user-avatar');

    if (deptEl) {
        const dept = currentUser.department || 'Road Works';
        deptEl.textContent = `${dept} Department`;
    }

    if (avatarEl && currentUser.name) {
        const parts = currentUser.name.trim().split(' ');
        const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]) : parts[0].substring(0, 2);
        avatarEl.textContent = initials.toUpperCase();
    }
}

// ==========================================
// 2. COMPLAINT QUEUE FETCHING & RENDERING
// ==========================================
async function loadComplaintsQueue() {
    const listEl = document.getElementById('complaints-list');
    const subtitleEl = document.getElementById('queue-subtitle');

    try {
        const response = await fetch('/api/staff/complaints', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.status === 401 || response.status === 403) {
            handleSignOut();
            return;
        }

        if (!response.ok) throw new Error('Failed to load complaint queue.');

        allComplaints = await response.json();
        applyFilterAndSort();

    } catch (err) {
        console.error('Queue load error:', err);
        showToast('Failed to refresh complaints queue.', 'error');
        if (subtitleEl) subtitleEl.textContent = 'Error loading queue';
    }
}

function renderComplaints() {
    const listEl = document.getElementById('complaints-list');
    const emptyEl = document.getElementById('empty-queue');
    const subtitleEl = document.getElementById('queue-subtitle');

    if (subtitleEl) {
        const count = filteredComplaints.length;
        subtitleEl.textContent = `${count} ${count === 1 ? 'complaint' : 'complaints'} in queue`;
    }

    if (!filteredComplaints || filteredComplaints.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = filteredComplaints.map(comp => createComplaintCardHtml(comp)).join('');
}

function createComplaintCardHtml(comp) {
    const timeText = timeAgo(comp.created_at);
    const refCode = generateRefCode(comp.id);
    const statusBadge = getStatusBadgeHtml(comp.status);
    const departmentName = comp.category || currentUser.department || 'Public Works';
    const locationName = comp.location || 'Sangothipalayam';

    // Citizen verification badge
    let citizenVerifyBadge = '';
    if (comp.status === 'Resolved' && comp.verification_status === 'approved') {
        citizenVerifyBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">✅ Verified by Citizen (⭐ ${comp.rating || 5}/5)</span>`;
    } else if (comp.verification_status === 'rejected') {
        citizenVerifyBadge = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">⚠️ Reopened by Citizen: "${escapeHtml(comp.rejection_reason || 'Fix rejected')}"</span>`;
    }

    // Thumbnail Image or SVG Fallback
    const imageHtml = comp.image_path
        ? `<img src="${comp.image_path}" alt="Complaint" class="w-24 h-24 rounded-xl object-cover bg-slate-900 shrink-0" onerror="this.onerror=null;this.src='/uploads/placeholder.jpg';">`
        : `<div class="w-24 h-24 rounded-xl bg-slate-900 text-slate-300 flex flex-col items-center justify-center shrink-0 p-2 text-center">
            <span class="material-symbols-outlined text-28 text-blue-400">report_problem</span>
            <span class="text-[10px] uppercase font-bold tracking-wider mt-1 text-slate-400">${escapeHtml(comp.category || 'Issue')}</span>
           </div>`;

    return `
        <div onclick="openComplaintDetails(${comp.id})"
            class="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 flex gap-4 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer">
            ${imageHtml}
            <div class="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                    <!-- Top row: Title and Time -->
                    <div class="flex items-start justify-between gap-2">
                        <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide truncate">
                            ${escapeHtml(comp.title || 'CIVIC ISSUE')}
                        </h2>
                        <span class="text-xs text-slate-400 font-medium shrink-0">${timeText}</span>
                    </div>

                    <!-- Middle row: Badges -->
                    <div class="flex flex-wrap items-center gap-2 my-1.5">
                        ${statusBadge}
                        <div class="inline-flex items-center gap-1 text-slate-600 text-xs font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                            <span class="material-symbols-outlined text-xs text-slate-500">folder</span>
                            <span>${escapeHtml(departmentName)}</span>
                        </div>
                        <span class="text-slate-400 font-mono text-xs">${refCode}</span>
                        <span class="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-[10px] flex items-center gap-0.5 border border-amber-200">
                            <span class="material-symbols-outlined text-xs text-amber-500">local_fire_department</span>
                            <span>${comp.upvote_count || 0} Upvotes</span>
                        </span>
                        ${comp.status === 'Resolved' && comp.geo_verification_status === 'verified' ? `
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-0.5">
                                <span class="material-symbols-outlined text-xs text-indigo-500">near_me</span>
                                <span>Geo-Verified (${typeof comp.geo_distance_meters === 'number' ? Math.round(comp.geo_distance_meters) + 'm' : 'On-Site'})</span>
                            </span>
                        ` : ''}
                        ${citizenVerifyBadge}
                    </div>
                </div>

                <!-- Bottom row: Location & Google Maps Navigation -->
                <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 text-xs">
                    <div class="flex items-center gap-1 text-slate-600 font-medium truncate min-w-0">
                        <span class="material-symbols-outlined text-sm text-blue-600 shrink-0">location_on</span>
                        <span class="truncate">${escapeHtml(locationName)}</span>
                    </div>

                    <a href="https://www.google.com/maps/search/?api=1&query=${parseFloat(comp.latitude) || 11.016844},${parseFloat(comp.longitude) || 76.955833}" 
                        target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                        class="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center gap-0.5 border border-blue-200 shrink-0 transition-colors" title="Open in Google Maps">
                        <span class="material-symbols-outlined text-xs">open_in_new</span>
                        <span>Maps</span>
                    </a>
                </div>
            </div>
        </div>
    `;
}

function getStatusBadgeHtml(status) {
    if (status === 'Resolved') {
        return `
            <span class="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/60 font-semibold px-2.5 py-0.5 rounded-full text-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Resolved</span>
            </span>
        `;
    } else if (status === 'In Progress') {
        return `
            <span class="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200/60 font-semibold px-2.5 py-0.5 rounded-full text-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span>In Progress</span>
            </span>
        `;
    } else {
        return `
            <span class="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200/60 font-semibold px-2.5 py-0.5 rounded-full text-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>Received</span>
            </span>
        `;
    }
}

// ==========================================
// 3. FILTERING & SORTING LOGIC
// ==========================================
function toggleFilterDropdown() {
    const menu = document.getElementById('filter-dropdown');
    menu.classList.toggle('hidden');
}

function toggleSortDropdown() {
    const menu = document.getElementById('sort-dropdown');
    menu.classList.toggle('hidden');
}

function applyFilter(status) {
    currentFilter = status;
    document.getElementById('filter-dropdown').classList.add('hidden');

    // Update checkmarks
    ['ALL', 'Received', 'In Progress', 'Resolved'].forEach(s => {
        const check = document.getElementById(`check-${s}`);
        if (check) {
            if (s === status) check.classList.remove('hidden');
            else check.classList.add('hidden');
        }
    });

    const label = document.getElementById('filter-label');
    if (label) label.textContent = status === 'ALL' ? 'Filter' : status;

    applyFilterAndSort();
}

function applySort(sortType) {
    currentSort = sortType;
    document.getElementById('sort-dropdown').classList.add('hidden');
    applyFilterAndSort();
}

function applyFilterAndSort() {
    // 1. Filter
    if (currentFilter === 'ALL') {
        filteredComplaints = [...allComplaints];
    } else {
        filteredComplaints = allComplaints.filter(c => c.status === currentFilter);
    }

    // 2. Sort
    if (currentSort === 'newest') {
        filteredComplaints.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (currentSort === 'oldest') {
        filteredComplaints.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (currentSort === 'priority') {
        const pMap = { 'High': 3, 'Medium': 2, 'Low': 1 };
        filteredComplaints.sort((a, b) => (pMap[b.priority] || 2) - (pMap[a.priority] || 2));
    }

    renderComplaints();
}

// ==========================================
// 4. COMPLAINT STATUS UPDATE MODAL & MAP PREVIEW
// ==========================================
let staffModalMapInstance = null;
let staffModalMarkerInstance = null;

// AI & Geo-Tag Resolution Verification State
let selectedResolvedFile = null;
let verifiedResolvedImagePath = null;
let isAiVerified = false;
let staffGeoLocation = {
    latitude: null,
    longitude: null,
    source: null,
    isMatch: false,
    distanceMeters: null
};

// Haversine formula to compute geodesic distance between two GPS coordinates in meters
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    if (lat1 === null || lat1 === undefined || lon1 === null || lon1 === undefined ||
        lat2 === null || lat2 === undefined || lon2 === null || lon2 === undefined) {
        return null;
    }
    const p1 = parseFloat(lat1);
    const l1 = parseFloat(lon1);
    const p2 = parseFloat(lat2);
    const l2 = parseFloat(lon2);
    if (isNaN(p1) || isNaN(l1) || isNaN(p2) || isNaN(l2)) return null;

    const R = 6371e3; // Earth radius in meters
    const phi1 = (p1 * Math.PI) / 180;
    const phi2 = (p2 * Math.PI) / 180;
    const deltaPhi = ((p2 - p1) * Math.PI) / 180;
    const deltaLambda = ((l2 - l1) * Math.PI) / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c * 10) / 10;
}

function openComplaintDetails(id) {
    const comp = allComplaints.find(c => c.id === id);
    if (!comp) return;

    selectedComplaintId = id;
    selectedStatus = comp.status || 'Received';

    const lat = parseFloat(comp.latitude) || 11.016844;
    const lng = parseFloat(comp.longitude) || 76.955833;

    document.getElementById('modal-ref-id').textContent = generateRefCode(comp.id);
    document.getElementById('modal-title').textContent = comp.title || 'Civic Issue';
    document.getElementById('modal-citizen-name').textContent = comp.citizen_name || 'Citizen';
    document.getElementById('modal-location').textContent = comp.location || comp.formatted_address || `Coimbatore (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    document.getElementById('modal-category').textContent = `${comp.category || 'General'} / Priority: ${comp.priority || 'Medium'}`;
    document.getElementById('modal-description').textContent = comp.description || 'No additional description provided.';
    document.getElementById('status-message').value = '';

    // Set Google Maps turn-by-turn Navigation Link
    const gmapsBtn = document.getElementById('modal-gmaps-direction-btn');
    if (gmapsBtn) {
        gmapsBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }

    resetResolutionAiState(comp);
    selectStatusOption(selectedStatus);
    openModal('modal-update-status');

    // Initialize Staff Modal Map
    setTimeout(() => {
        const mapEl = document.getElementById('staff-modal-map');
        if (!mapEl) return;

        if (staffModalMapInstance) {
            staffModalMapInstance.remove();
            staffModalMapInstance = null;
        }

        staffModalMapInstance = L.map('staff-modal-map', {
            zoomControl: true,
            attributionControl: false
        }).setView([lat, lng], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(staffModalMapInstance);

        const pinIcon = L.divIcon({
            className: 'custom-staff-pin',
            html: `
                <div style="background-color: #dc2626; color: white; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(220,38,38,0.4); border: 2px solid white;">
                    <span class="material-symbols-outlined" style="transform: rotate(45deg); font-size: 16px;">location_on</span>
                </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -30]
        });

        staffModalMarkerInstance = L.marker([lat, lng], { icon: pinIcon }).addTo(staffModalMapInstance);
        staffModalMarkerInstance.bindPopup(`
            <div style="font-size: 11px;">
                <b>${escapeHtml(comp.title)}</b><br>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" style="color: #2563eb; font-weight: bold; text-decoration: underline;">Navigate in Google Maps &rarr;</a>
            </div>
        `).openPopup();

        staffModalMapInstance.invalidateSize();
    }, 250);
}

function resetResolutionAiState(comp) {
    selectedResolvedFile = null;
    verifiedResolvedImagePath = null;
    isAiVerified = false;
    staffGeoLocation = { latitude: null, longitude: null, source: null, isMatch: false, distanceMeters: null };

    const fileInput = document.getElementById('resolved-file-input');
    if (fileInput) fileInput.value = '';

    const grid = document.getElementById('image-comparison-grid');
    if (grid) grid.classList.add('hidden');

    const geotagPanel = document.getElementById('staff-geotag-panel');
    if (geotagPanel) geotagPanel.classList.add('hidden');

    const dropzoneContent = document.getElementById('dropzone-empty-content');
    if (dropzoneContent) dropzoneContent.classList.remove('hidden');

    const beforeImg = document.getElementById('before-preview-img');
    if (beforeImg) {
        beforeImg.src = comp.image_path || '/uploads/placeholder.jpg';
    }

    const afterImg = document.getElementById('after-preview-img');
    if (afterImg) afterImg.src = '';

    const btnVerify = document.getElementById('btn-run-ai-verify');
    if (btnVerify) btnVerify.disabled = true;

    const progressBox = document.getElementById('ai-analysis-progress');
    if (progressBox) progressBox.classList.add('hidden');

    const resultCard = document.getElementById('ai-result-card');
    if (resultCard) resultCard.classList.add('hidden');
}

async function handleResolvedFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    selectedResolvedFile = file;
    isAiVerified = false;
    verifiedResolvedImagePath = null;
    staffGeoLocation = { latitude: null, longitude: null, source: null, isMatch: false, distanceMeters: null };

    const afterImg = document.getElementById('after-preview-img');
    if (afterImg) afterImg.src = URL.createObjectURL(file);

    const grid = document.getElementById('image-comparison-grid');
    if (grid) grid.classList.remove('hidden');

    const dropzoneContent = document.getElementById('dropzone-empty-content');
    if (dropzoneContent) dropzoneContent.classList.add('hidden');

    const btnVerify = document.getElementById('btn-run-ai-verify');
    if (btnVerify) btnVerify.disabled = false;

    const resultCard = document.getElementById('ai-result-card');
    if (resultCard) resultCard.classList.add('hidden');

    if (selectedStatus === 'Resolved') {
        const btnSave = document.getElementById('btn-save-status');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    // Inspect Geo-tag from staff photo & device GPS
    const comp = allComplaints.find(c => c.id === selectedComplaintId);
    const compLat = comp && comp.latitude ? parseFloat(comp.latitude) : null;
    const compLng = comp && comp.longitude ? parseFloat(comp.longitude) : null;

    const geotagPanel = document.getElementById('staff-geotag-panel');
    if (geotagPanel) geotagPanel.classList.remove('hidden');

    const compCoordsEl = document.getElementById('staff-geotag-comp-coords');
    if (compCoordsEl) {
        compCoordsEl.textContent = compLat && compLng ? `${compLat.toFixed(5)}, ${compLng.toFixed(5)}` : 'None recorded';
    }

    const photoCoordsEl = document.getElementById('staff-geotag-photo-coords');
    if (photoCoordsEl) {
        photoCoordsEl.textContent = 'Extracting EXIF GPS...';
    }

    let photoGps = null;
    if (window.exifr && typeof window.exifr.gps === 'function') {
        try {
            photoGps = await exifr.gps(file);
        } catch (e) {
            console.warn('EXIF GPS error:', e);
        }
    }

    if (photoGps && typeof photoGps.latitude === 'number' && typeof photoGps.longitude === 'number') {
        staffGeoLocation.latitude = photoGps.latitude;
        staffGeoLocation.longitude = photoGps.longitude;
        staffGeoLocation.source = 'Photo EXIF GPS';
        updateStaffGeoTagUI(compLat, compLng);
    } else if (navigator.geolocation) {
        if (photoCoordsEl) photoCoordsEl.textContent = 'Tagging device GPS...';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                staffGeoLocation.latitude = pos.coords.latitude;
                staffGeoLocation.longitude = pos.coords.longitude;
                staffGeoLocation.source = 'Live Device GPS';
                updateStaffGeoTagUI(compLat, compLng);
            },
            (err) => {
                staffGeoLocation.latitude = null;
                staffGeoLocation.longitude = null;
                staffGeoLocation.source = null;
                updateStaffGeoTagUI(compLat, compLng);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
    } else {
        updateStaffGeoTagUI(compLat, compLng);
    }
}

function updateStaffGeoTagUI(compLat, compLng) {
    const photoCoordsEl = document.getElementById('staff-geotag-photo-coords');
    const badge = document.getElementById('staff-geotag-badge');
    const statusBox = document.getElementById('staff-geotag-distance-status');
    const statusIcon = document.getElementById('staff-geotag-distance-icon');
    const statusText = document.getElementById('staff-geotag-distance-text');

    if (staffGeoLocation.latitude && staffGeoLocation.longitude) {
        const sourceLabel = staffGeoLocation.source === 'Photo EXIF GPS' ? 'EXIF' : 'GPS';
        if (photoCoordsEl) {
            photoCoordsEl.textContent = `${staffGeoLocation.latitude.toFixed(5)}, ${staffGeoLocation.longitude.toFixed(5)} (${sourceLabel})`;
        }

        if (compLat && compLng) {
            const dist = calculateDistanceMeters(compLat, compLng, staffGeoLocation.latitude, staffGeoLocation.longitude);
            staffGeoLocation.distanceMeters = dist;
            const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} meters`;

            if (dist <= 200) {
                staffGeoLocation.isMatch = true;
                if (badge) {
                    badge.textContent = `MATCHED (${Math.round(dist)}m)`;
                    badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
                }
                if (statusBox) {
                    statusBox.className = 'p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 bg-emerald-950/40 border-emerald-500/40 text-emerald-300';
                }
                if (statusIcon) {
                    statusIcon.textContent = 'verified';
                    statusIcon.className = 'material-symbols-outlined text-base text-emerald-400';
                }
                if (statusText) {
                    statusText.textContent = `On-site Geo Match: Photo is ${distStr} from grievance site (Within 200m radius)`;
                }
            } else {
                staffGeoLocation.isMatch = false;
                if (badge) {
                    badge.textContent = `MISMATCH (${distStr})`;
                    badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40';
                }
                if (statusBox) {
                    statusBox.className = 'p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 bg-rose-950/40 border-rose-500/40 text-rose-300';
                }
                if (statusIcon) {
                    statusIcon.textContent = 'error';
                    statusIcon.className = 'material-symbols-outlined text-base text-rose-400';
                }
                if (statusText) {
                    statusText.textContent = `Location Mismatch: Photo is ${distStr} away from grievance site (Max allowed: 200m). Verification will fail.`;
                }
            }
        } else {
            staffGeoLocation.isMatch = true;
            if (badge) {
                badge.textContent = 'TAGGED';
                badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40';
            }
            if (statusBox) {
                statusBox.className = 'p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 bg-blue-950/40 border-blue-500/40 text-blue-300';
            }
            if (statusIcon) statusIcon.textContent = 'info';
            if (statusText) statusText.textContent = `Photo tagged with coordinates. Grievance had no recorded pin.`;
        }
    } else {
        if (photoCoordsEl) photoCoordsEl.textContent = 'No GPS found';
        if (badge) {
            badge.textContent = 'NO GPS';
            badge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
        }
        if (statusBox) {
            statusBox.className = 'p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 bg-amber-950/40 border-amber-500/40 text-amber-300';
        }
        if (statusIcon) statusIcon.textContent = 'warning';
        if (statusText) statusText.textContent = `No GPS geo-tag detected. Please take photo with GPS location enabled on device.`;
    }
}

function selectStatusOption(status) {
    selectedStatus = status;
    ['Received', 'In Progress', 'Resolved'].forEach(s => {
        const btn = document.getElementById(`status-opt-${s}`);
        if (!btn) return;
        if (s === status) {
            btn.className = 'status-btn py-2.5 px-3 rounded-xl border-2 border-blue-600 bg-blue-50 text-blue-800 text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs';
        } else {
            btn.className = 'status-btn py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5';
        }
    });

    const aiContainer = document.getElementById('resolution-ai-container');
    const btnSave = document.getElementById('btn-save-status');

    if (status === 'Resolved') {
        if (aiContainer) aiContainer.classList.remove('hidden');
        if (!isAiVerified) {
            if (btnSave) {
                btnSave.disabled = true;
                btnSave.classList.add('opacity-50', 'cursor-not-allowed');
            }
        } else {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    } else {
        if (aiContainer) aiContainer.classList.add('hidden');
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

async function startAiVerificationProcess() {
    if (!selectedResolvedFile || !selectedComplaintId) {
        showToast('Please select a resolution photo first.', 'error');
        return;
    }

    const progressBox = document.getElementById('ai-analysis-progress');
    const progressBar = document.getElementById('ai-progress-bar');
    const stepText = document.getElementById('ai-step-text');
    const btnVerify = document.getElementById('btn-run-ai-verify');
    const resultCard = document.getElementById('ai-result-card');

    if (btnVerify) btnVerify.disabled = true;
    if (resultCard) resultCard.classList.add('hidden');
    if (progressBox) progressBox.classList.remove('hidden');

    const steps = [
        { pct: 20, text: 'Extracting and verifying photo geo-tag...' },
        { pct: 45, text: 'Comparing location against grievance pin (200m radius)...' },
        { pct: 75, text: 'Inspecting visual clearance with Gemini Vision AI...' },
        { pct: 90, text: 'Finalizing dual-layer verification assessment...' }
    ];

    let currentStep = 0;
    if (progressBar) progressBar.style.width = '20%';
    if (stepText) stepText.textContent = steps[0].text;

    const interval = setInterval(() => {
        currentStep++;
        if (currentStep < steps.length) {
            const s = steps[currentStep];
            if (progressBar) progressBar.style.width = `${s.pct}%`;
            if (stepText) stepText.textContent = s.text;
        }
    }, 400);

    const formData = new FormData();
    formData.append('complaint_id', selectedComplaintId);
    formData.append('resolved_image', selectedResolvedFile);
    if (staffGeoLocation.latitude) formData.append('staff_latitude', staffGeoLocation.latitude);
    if (staffGeoLocation.longitude) formData.append('staff_longitude', staffGeoLocation.longitude);
    if (staffGeoLocation.source) formData.append('geo_source', staffGeoLocation.source);

    try {
        const response = await fetch('/api/staff/verify-resolution', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const data = await response.json();
        clearInterval(interval);
        if (progressBar) progressBar.style.width = '100%';
        if (stepText) stepText.textContent = 'Verification Complete!';

        setTimeout(() => {
            if (progressBox) progressBox.classList.add('hidden');
            if (btnVerify) btnVerify.disabled = false;

            if (!response.ok || !data) {
                showToast(data?.message || 'Verification failed. Please try again.', 'error');
                return;
            }

            renderAiVerificationResult(data);
        }, 200);

    } catch (err) {
        clearInterval(interval);
        if (progressBox) progressBox.classList.add('hidden');
        if (btnVerify) btnVerify.disabled = false;
        console.error("Verification request failed:", err);
        showToast(err.message || 'Verification service error. Please try again.', 'error');
    }
}

function renderAiVerificationResult(data) {
    const card = document.getElementById('ai-result-card');
    const icon = document.getElementById('ai-result-icon');
    const title = document.getElementById('ai-result-title');
    const pill = document.getElementById('ai-confidence-pill');
    const reasonText = document.getElementById('ai-reasoning-text');
    const modelTag = document.getElementById('ai-model-tag');
    const btnSave = document.getElementById('btn-save-status');

    if (!card) return;

    card.classList.remove('hidden');

    if (data.isResolved) {
        isAiVerified = true;
        verifiedResolvedImagePath = data.resolvedImagePath;

        card.className = 'p-3.5 rounded-xl border bg-emerald-950/40 border-emerald-500/50 text-emerald-300 space-y-2';
        if (icon) {
            icon.textContent = 'verified';
            icon.className = 'material-symbols-outlined text-lg text-emerald-400';
        }
        if (title) title.textContent = 'AI & Geo-Tag Verification Passed';
        if (pill) {
            let passConfidence = typeof data.confidence === 'number' ? data.confidence : 90;
            if (passConfidence <= 1 && passConfidence > 0) passConfidence = Math.round(passConfidence * 100);
            pill.textContent = `${passConfidence}% Match`;
            pill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        }
        if (reasonText) reasonText.textContent = data.reasoning;
        if (modelTag) {
            const distInfo = typeof data.distanceMeters === 'number' ? ` • Distance: ${Math.round(data.distanceMeters)}m` : '';
            modelTag.textContent = `Model: ${data.modelUsed || 'Gemini Vision AI'}${distInfo}`;
        }

        if (btnSave && selectedStatus === 'Resolved') {
            btnSave.disabled = false;
            btnSave.classList.remove('opacity-50', 'cursor-not-allowed');
        }

        showToast('Verified: Geo-tag matched on-site & issue clearance confirmed! You may now save status update.', 'success');
    } else {
        isAiVerified = false;
        verifiedResolvedImagePath = null;

        card.className = 'p-3.5 rounded-xl border bg-rose-950/40 border-rose-500/50 text-rose-300 space-y-2';
        if (icon) {
            icon.textContent = 'warning';
            icon.className = 'material-symbols-outlined text-lg text-rose-400';
        }
        if (title) {
            title.textContent = data.geoMatch === false ? 'Geo-Location Mismatch Failed' : 'AI Verification Failed';
        }
        if (pill) {
            let failConfidence = typeof data.confidence === 'number' ? data.confidence : 0;
            if (failConfidence <= 1 && failConfidence > 0) failConfidence = Math.round(failConfidence * 100);
            if (failConfidence > 10) {
                failConfidence = Math.max(0, Math.min(10, Math.round((100 - failConfidence) / 10)));
            }
            pill.textContent = data.geoMatch === false ? 'Geo-Failed' : `${failConfidence}% Match`;
            pill.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40';
        }
        if (reasonText) reasonText.textContent = data.reasoning;
        if (modelTag) {
            const distInfo = typeof data.distanceMeters === 'number' ? ` • Distance: ${data.distanceMeters >= 1000 ? (data.distanceMeters/1000).toFixed(2) + 'km' : Math.round(data.distanceMeters) + 'm'}` : '';
            modelTag.textContent = `Inspector: ${data.modelUsed || 'CivicFix Inspector'}${distInfo}`;
        }

        if (btnSave && selectedStatus === 'Resolved') {
            btnSave.disabled = true;
            btnSave.classList.add('opacity-50', 'cursor-not-allowed');
        }

        showToast(data.reasoning || 'Verification failed. Resolution photo does not meet requirements.', 'error');
    }
}

async function handleSaveStatusUpdate() {
    if (!selectedComplaintId) return;

    if (selectedStatus === 'Resolved' && !isAiVerified) {
        showToast('You must upload a resolution photo and pass AI verification before setting status to Resolved.', 'error');
        return;
    }

    const btnSave = document.getElementById('btn-save-status');
    const message = document.getElementById('status-message').value.trim();

    setButtonLoading(btnSave, true, 'Updating...');

    try {
        const response = await fetch(`/api/staff/complaints/${selectedComplaintId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                status: selectedStatus,
                message: message || `Status updated to ${selectedStatus}`,
                resolved_image_path: verifiedResolvedImagePath
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to update status.');
        }

        showToast('Complaint status updated successfully!', 'success');
        closeModal('modal-update-status');
        loadComplaintsQueue();

    } catch (err) {
        console.error('Update status error:', err);
        showToast(err.message || 'Error updating status.', 'error');
    } finally {
        setButtonLoading(btnSave, false, '<span class="material-symbols-outlined text-lg">save</span><span>Save Status Update</span>');
    }
}

// ==========================================
// 5. STAFF QUERIES SYSTEM & IN-APP NOTIFICATIONS
// ==========================================

async function loadStaffNotifications() {
    try {
        const response = await fetch('/api/staff/notifications', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) return;

        const data = await response.json();
        staffNotifications = data.notifications || [];
        const unreadCount = data.unreadCount || 0;

        // Update header notification bell badge
        const badge = document.getElementById('notif-badge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        // Update bottom nav queries tab badge if unread query replies exist
        const queriesBadge = document.getElementById('queries-badge');
        if (queriesBadge) {
            const hasUnreadReply = staffNotifications.some(n => n.type === 'query_reply' && n.is_read === 0);
            if (hasUnreadReply) {
                queriesBadge.classList.remove('hidden');
            } else {
                queriesBadge.classList.add('hidden');
            }
        }

        renderStaffNotifications();

    } catch (err) {
        console.error('Fetch notifications error:', err);
    }
}

function renderStaffNotifications() {
    const container = document.getElementById('staff-notifications-list');
    if (!container) return;

    if (!staffNotifications || staffNotifications.length === 0) {
        container.innerHTML = `
            <div class="py-10 text-center text-slate-400 text-xs">
                <span class="material-symbols-outlined text-3xl mb-1 text-slate-300">notifications_off</span>
                <p>No notifications yet.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = staffNotifications.map(n => {
        const isUnread = n.is_read === 0;
        const timeStr = timeAgo(n.created_at);

        return `
            <div onclick="handleNotificationClick(${n.id})"
                class="p-3.5 rounded-2xl border ${isUnread ? 'bg-blue-50/80 border-blue-200' : 'bg-white border-slate-200/80'} shadow-xs hover:border-blue-400 transition-all cursor-pointer">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-base ${isUnread ? 'text-blue-600' : 'text-slate-400'}">mark_email_unread</span>
                        <h4 class="text-xs font-bold text-slate-900 leading-tight">${escapeHtml(n.title)}</h4>
                    </div>
                    <span class="text-[10px] text-slate-400 font-medium shrink-0">${timeStr}</span>
                </div>
                <p class="text-xs text-slate-700 mt-1 leading-relaxed">${escapeHtml(n.message)}</p>
            </div>
        `;
    }).join('');
}

function openStaffNotificationsModal() {
    loadStaffNotifications();
    openModal('modal-staff-notifications');
}

async function handleMarkAllNotificationsRead() {
    try {
        await fetch('/api/staff/notifications/read-all', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        loadStaffNotifications();
        showToast('All notifications marked as read', 'success');
    } catch (err) {
        console.error('Mark read-all error:', err);
    }
}

async function handleNotificationClick(notifId) {
    try {
        await fetch(`/api/staff/notifications/${notifId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
    } catch (e) {}

    closeModal('modal-staff-notifications');
    openMyQueriesModal();
}

async function loadStaffQueries() {
    try {
        const response = await fetch('/api/staff/queries', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) return;

        const queries = await response.json();
        renderMyQueries(queries);

        const badge = document.getElementById('queries-badge');
        if (badge) {
            const hasOpen = queries.some(q => q.status === 'Open');
            const hasUnreadNotif = staffNotifications.some(n => n.type === 'query_reply' && n.is_read === 0);
            if (hasOpen || hasUnreadNotif) badge.classList.remove('hidden');
            else badge.classList.add('hidden');
        }

    } catch (err) {
        console.error('Queries load error:', err);
    }
}

function renderMyQueries(queries) {
    const container = document.getElementById('queries-list-container');
    if (!container) return;

    if (!queries || queries.length === 0) {
        container.innerHTML = `
            <div class="py-12 text-center text-slate-400 text-xs">
                <span class="material-symbols-outlined text-3xl mb-1 text-slate-300">chat_bubble_outline</span>
                <p>You have not raised any queries or bottleneck reports yet.</p>
                <p class="text-[11px] text-slate-400 mt-0.5">Click '+ New Query' below to send a request to admin.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = queries.map(q => {
        const timeStr = timeAgo(q.created_at);
        const isOpen = q.status === 'Open';

        let statusBadge = isOpen
            ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>Awaiting Admin</span></span>`
            : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span><span>Admin Replied</span></span>`;

        let catBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
        if (q.category === 'Bottleneck Situation') {
            catBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
        } else if (q.category === 'Resource Needed') {
            catBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200 font-bold';
        } else if (q.category === 'Urgent Escalation') {
            catBadgeClass = 'bg-rose-100 text-rose-900 border-rose-300 font-bold';
        }

        const adminResponseBox = q.admin_response ? `
            <div class="bg-emerald-50/90 border border-emerald-200 rounded-xl p-3.5 mt-2.5 text-xs shadow-xs">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm text-emerald-600">admin_panel_settings</span>
                        <span>ADMIN RESPONSE & RESOLUTION</span>
                    </span>
                    <span class="text-[10px] text-slate-500 font-medium">${timeAgo(q.updated_at)}</span>
                </div>
                <p class="text-slate-900 font-semibold leading-relaxed">${escapeHtml(q.admin_response)}</p>
            </div>
        ` : `
            <p class="text-[11px] italic text-slate-400 mt-2 flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                Awaiting executive admin response...
            </p>
        `;

        return `
            <div class="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
                <div class="flex items-start justify-between gap-2 mb-1">
                    <div>
                        <span class="inline-block px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider border ${catBadgeClass} mb-1">${escapeHtml(q.category || 'General')}</span>
                        <h3 class="text-sm font-bold text-slate-900 leading-tight">${escapeHtml(q.subject)}</h3>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0">
                        ${statusBadge}
                        <span class="text-[10px] text-slate-400 font-medium">${timeStr}</span>
                    </div>
                </div>

                <p class="text-xs text-slate-600 leading-relaxed mt-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">${escapeHtml(q.details)}</p>

                ${adminResponseBox}
            </div>
        `;
    }).join('');
}

function openMyQueriesModal() {
    loadStaffQueries();
    openModal('modal-my-queries');
}

function openRaiseQueryModal() {
    closeModal('modal-my-queries');
    document.getElementById('form-raise-query').reset();
    document.getElementById('char-counter').textContent = '0/500';
    selectQueryCategory('Bottleneck Situation', document.querySelector('.query-chip'));
    openModal('modal-raise-query');
}

function selectQueryCategory(cat, btnEl) {
    selectedQueryCategory = cat;
    document.querySelectorAll('.query-chip').forEach(b => {
        b.className = 'query-chip px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all flex items-center gap-1';
    });
    if (btnEl) {
        btnEl.className = 'query-chip px-3 py-1.5 rounded-full text-xs font-bold border border-amber-600 bg-amber-600 text-white transition-all shadow-xs flex items-center gap-1';
    }
}

async function handleSubmitQuery(event) {
    event.preventDefault();

    const subject = document.getElementById('query-subject').value.trim();
    const details = document.getElementById('query-details').value.trim();
    const btnSubmit = document.getElementById('btn-submit-query');

    if (!subject || !details) {
        showToast('Please fill in both subject and details.', 'error');
        return;
    }

    setButtonLoading(btnSubmit, true, 'Sending...');

    try {
        const response = await fetch('/api/staff/queries', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                category: selectedQueryCategory,
                subject,
                details
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to submit query.');
        }

        showToast('Query submitted to admin successfully!', 'success');
        closeModal('modal-raise-query');
        openMyQueriesModal();

    } catch (err) {
        console.error('Submit query error:', err);
        showToast(err.message || 'Failed to submit query.', 'error');
    } finally {
        setButtonLoading(btnSubmit, false, '<span class="material-symbols-outlined text-lg">send</span><span>Send Query</span>');
    }
}

// ==========================================
// 7. NAVIGATION & LOGOUT
// ==========================================
function switchNavTab(tab) {
    const navQueue = document.getElementById('nav-queue');
    const navAnalytics = document.getElementById('nav-analytics');
    const navQueries = document.getElementById('nav-queries');

    const queueSection = document.getElementById('section-staff-queue');
    const analyticsSection = document.getElementById('section-staff-analytics');

    const activeNavClass = 'flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl bg-blue-50 text-blue-700 font-semibold transition-all';
    const inactiveNavClass = 'flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl text-slate-500 hover:text-slate-800 transition-all';

    if (navQueue) navQueue.className = inactiveNavClass;
    if (navAnalytics) navAnalytics.className = inactiveNavClass;
    if (navQueries) navQueries.className = inactiveNavClass;

    if (tab === 'analytics') {
        if (navAnalytics) navAnalytics.className = activeNavClass;
        if (queueSection) queueSection.classList.add('hidden');
        if (analyticsSection) analyticsSection.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        loadStaffAnalytics();
    } else {
        // Default: 'queue'
        if (navQueue) navQueue.className = activeNavClass;
        if (analyticsSection) analyticsSection.classList.add('hidden');
        if (queueSection) queueSection.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function handleSignOut() {
    localStorage.removeItem('civicfix_token');
    localStorage.removeItem('token');
    localStorage.removeItem('civicfix_user');
    localStorage.removeItem('user');
    window.location.replace('/login.html?tab=staff');
}

// ==========================================
// 8. MODAL & HELPER UTILITIES
// ==========================================
function openModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

function generateRefCode(id) {
    const hex = (id * 997 + 0x298E).toString(16).toUpperCase().padStart(4, '0');
    return `#${hex.slice(0, 4)}-88${(id % 90 + 10)}`;
}

function timeAgo(dateString) {
    if (!dateString) return 'recently';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return 'Just now';
    const diffMins = Math.floor(diffSeconds / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setButtonLoading(btnEl, isLoading, textContent) {
    if (!btnEl) return;
    if (isLoading) {
        btnEl.disabled = true;
        btnEl.dataset.originalHtml = btnEl.innerHTML;
        btnEl.innerHTML = `
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>${textContent}</span>
        `;
    } else {
        btnEl.disabled = false;
        btnEl.innerHTML = textContent || btnEl.dataset.originalHtml || 'Submit';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-lg border text-sm transition-all transform duration-300 translate-y-2 opacity-0';

    let icon = 'info';
    if (type === 'success') {
        icon = 'check_circle';
        toast.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-900');
    } else if (type === 'error') {
        icon = 'error';
        toast.classList.add('bg-rose-50', 'border-rose-200', 'text-rose-900');
    } else if (type === 'warning') {
        icon = 'warning';
        toast.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-900');
    } else {
        icon = 'info';
        toast.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-900');
    }

    toast.innerHTML = `
        <span class="material-symbols-outlined text-xl shrink-0">${icon}</span>
        <div class="flex-1 font-medium">${message}</div>
        <button type="button" class="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer" onclick="this.parentElement.remove()">
            <span class="material-symbols-outlined text-base">close</span>
        </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==========================================
// 9. STAFF MUNICIPAL & DEPARTMENT ANALYTICS
// ==========================================
let currentStaffAnalyticsData = null;
let currentStaffAreaChartType = 'bar';
let staffAreaChartInstance = null;
let staffDeptChartInstance = null;

async function loadStaffAnalytics(forceRefresh = false) {
    if (!authToken) return;
    try {
        const response = await fetch('/api/staff/analytics', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Failed to fetch staff analytics.');

        const result = await response.json();
        currentStaffAnalyticsData = result;

        renderStaffDeptSpotlight(result.staffDepartment, result.myDeptStats, result.analytics);
        renderStaffAreaChart(result.analytics.areaAnalytics);
        renderStaffAreaRanking(result.analytics.areaAnalytics.areas);
        renderStaffDeptChart(result.analytics.departmentPerformance, result.staffDepartment);
        renderStaffDeptTable(result.analytics.departmentPerformance.departments, result.staffDepartment);

        if (forceRefresh) {
            showToast('Department analytics refreshed.', 'success');
        }
    } catch (err) {
        console.error('Staff analytics load error:', err);
        showToast('Failed to load department analytics: ' + err.message, 'error');
    }
}

function renderStaffDeptSpotlight(deptName, myStats, fullAnalytics) {
    const titleEl = document.getElementById('staff-analytics-dept-title');
    const replyEl = document.getElementById('staff-analytics-my-reply');
    const scoreEl = document.getElementById('staff-analytics-my-score');
    const badgeEl = document.getElementById('staff-analytics-dept-badge');

    if (titleEl) titleEl.textContent = deptName || 'Municipal Personnel';

    if (myStats) {
        if (replyEl) replyEl.textContent = `${myStats.replyRate}%`;
        if (scoreEl) scoreEl.textContent = `${myStats.potentialScore}/100`;
        if (badgeEl) badgeEl.textContent = `${myStats.potentialGrade} ${myStats.potentialBadge}`;
    } else if (fullAnalytics && fullAnalytics.departmentPerformance && fullAnalytics.departmentPerformance.topDepartment) {
        const topD = fullAnalytics.departmentPerformance.topDepartment;
        if (replyEl) replyEl.textContent = `${topD.replyRate}%`;
        if (scoreEl) scoreEl.textContent = `${topD.potentialScore}/100`;
    }
}

function setStaffAreaChartType(type) {
    currentStaffAreaChartType = type;
    const btnBar = document.getElementById('btn-staff-area-bar');
    const btnPie = document.getElementById('btn-staff-area-pie');

    if (type === 'bar') {
        if (btnBar) btnBar.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-xs transition-all';
        if (btnPie) btnPie.className = 'px-3 py-1 text-xs font-medium rounded-lg text-slate-500 hover:text-slate-800 transition-all';
    } else {
        if (btnPie) btnPie.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-xs transition-all';
        if (btnBar) btnBar.className = 'px-3 py-1 text-xs font-medium rounded-lg text-slate-500 hover:text-slate-800 transition-all';
    }

    if (currentStaffAnalyticsData && currentStaffAnalyticsData.analytics) {
        renderStaffAreaChart(currentStaffAnalyticsData.analytics.areaAnalytics);
    }
}

function renderStaffAreaChart(areaData) {
    const canvas = document.getElementById('staff-area-chart');
    if (!canvas || !window.Chart || !areaData) return;

    if (staffAreaChartInstance) {
        staffAreaChartInstance.destroy();
    }

    const labels = areaData.chartData.labels;
    const data = areaData.chartData.data;
    const colors = areaData.chartData.colors;

    if (currentStaffAreaChartType === 'pie') {
        staffAreaChartInstance = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            padding: 12,
                            font: { family: '"Public Sans", sans-serif', size: 11, weight: '600' }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const val = ctx.raw || 0;
                                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return ` ${ctx.label}: ${val} complaints (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    } else {
        staffAreaChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Complaints Reported',
                    data: data,
                    backgroundColor: colors,
                    borderRadius: 8,
                    maxBarThickness: 34
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const val = ctx.raw || 0;
                                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return ` Reports: ${val} (${pct}% of city total)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: '"Public Sans", sans-serif', size: 11, weight: '500' } }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: { family: '"Public Sans", sans-serif', size: 11 }
                        },
                        grid: { color: '#f1f5f9' }
                    }
                }
            }
        });
    }
}

function renderStaffAreaRanking(areas) {
    const listEl = document.getElementById('staff-area-ranking-list');
    if (!listEl || !areas) return;

    if (areas.length === 0) {
        listEl.innerHTML = '<div class="text-xs text-slate-400 py-3">No area complaint data available.</div>';
        return;
    }

    const maxCount = Math.max(...areas.map(a => a.total), 1);

    listEl.innerHTML = areas.map((a, idx) => {
        const pctWidth = Math.round((a.total / maxCount) * 100);
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;

        return `
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 transition-all">
                <div class="flex items-center justify-between text-xs mb-1.5">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-bold text-slate-500 w-5">${medal}</span>
                        <span class="font-bold text-slate-900">${escapeHtml(a.area)}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-mono font-bold text-slate-900">${a.total} reports</span>
                        <span class="text-[10px] font-semibold text-slate-400">(${a.percentage}%)</span>
                    </div>
                </div>
                <div class="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500" style="width: ${pctWidth}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderStaffDeptChart(deptData, myDeptName) {
    const canvas = document.getElementById('staff-dept-chart');
    if (!canvas || !window.Chart || !deptData) return;

    if (staffDeptChartInstance) {
        staffDeptChartInstance.destroy();
    }

    const labels = deptData.chartData.labels;
    const replyRates = deptData.chartData.replyRates;
    const potentialScores = deptData.chartData.potentialScores;

    staffDeptChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Reply Rate (%)',
                    data: replyRates,
                    backgroundColor: '#2563eb',
                    borderRadius: 6,
                    maxBarThickness: 22
                },
                {
                    label: 'Full Potential Score (0-100)',
                    data: potentialScores,
                    backgroundColor: '#8b5cf6',
                    borderRadius: 6,
                    maxBarThickness: 22
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 12,
                        font: { family: '"Public Sans", sans-serif', size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            return ` ${ctx.dataset.label}: ${ctx.raw}${ctx.datasetIndex === 0 ? '%' : '/100'}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: '"Public Sans", sans-serif', size: 10, weight: '500' },
                        maxRotation: 20
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        callback: val => `${val}%`,
                        font: { family: '"Public Sans", sans-serif', size: 11 }
                    },
                    grid: { color: '#f1f5f9' }
                }
            }
        }
    });
}

function renderStaffDeptTable(departments, myDeptName) {
    const tbody = document.getElementById('staff-dept-table-body');
    if (!tbody || !departments) return;

    tbody.innerHTML = departments.map(d => {
        const isMyDept = myDeptName && d.name.toLowerCase() === myDeptName.toLowerCase();
        const highlightClass = isMyDept ? 'bg-blue-50/70 font-semibold border-l-4 border-blue-600' : 'hover:bg-slate-50/80';

        return `
            <tr class="${highlightClass} transition-colors">
                <td class="py-2.5 px-3">
                    <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${d.color};"></span>
                        <span class="font-bold ${isMyDept ? 'text-blue-900' : 'text-slate-900'}">${escapeHtml(d.name)}</span>
                        ${isMyDept ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white ml-1">YOU</span>' : ''}
                    </div>
                </td>
                <td class="py-2.5 px-3 font-mono font-semibold text-slate-800">${d.total}</td>
                <td class="py-2.5 px-3">
                    <span class="font-mono font-bold text-blue-600">${d.replyRate}%</span>
                </td>
                <td class="py-2.5 px-3">
                    <span class="font-mono font-bold text-emerald-600">${d.resolved}</span>
                    <span class="text-[10px] text-slate-400 font-normal">(${d.resolutionRate}%)</span>
                </td>
                <td class="py-2.5 px-3">
                    <span class="font-mono font-extrabold text-purple-700">${d.potentialScore}/100</span>
                </td>
                <td class="py-2.5 px-3">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${d.potentialColor}">
                        ${d.potentialGrade} ${d.potentialBadge}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

function handleStaffExportReport(format) {
    if (!currentStaffAnalyticsData || !currentStaffAnalyticsData.analytics) {
        showToast('Department analytics not loaded yet. Please wait.', 'warning');
        return;
    }
    if (!window.CivicFixReportExporter) {
        showToast('Report exporter is initializing. Please try again.', 'error');
        return;
    }

    const context = {
        userRole: 'staff',
        userName: (currentUser && currentUser.name) ? currentUser.name : 'Municipal Staff Officer',
        userDepartment: currentStaffAnalyticsData.staffDepartment || (currentUser && currentUser.department) || 'Municipal Department',
        areaCanvasId: 'staff-area-chart',
        deptCanvasId: 'staff-dept-chart'
    };

    window.CivicFixReportExporter.exportReport(format, currentStaffAnalyticsData.analytics, context);
}
