/**
 * CivicFix - Administrator Portal Logic
 * Coimbatore City Municipal Corporation
 */

// Global State
let currentUser = null;
let authToken = '';
let allStaff = [];
let filteredStaff = [];
let currentDepartmentFilter = 'ALL';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
    if (!checkAdminAuthGuard()) return;
    loadAdminMetrics();
    loadStaffDirectory();
    loadAdminQueriesCount();
});

// ==========================================
// 1. AUTH GUARD
// ==========================================
function checkAdminAuthGuard() {
    authToken = localStorage.getItem('civicfix_token') || localStorage.getItem('token');
    const userStr = localStorage.getItem('civicfix_user') || localStorage.getItem('user');

    if (!authToken || !userStr) {
        window.location.replace('/login.html?tab=admin');
        return false;
    }

    try {
        currentUser = JSON.parse(userStr);
    } catch (e) {
        window.location.replace('/login.html?tab=admin');
        return false;
    }

    if (currentUser.role !== 'admin') {
        showToast('Access restricted to administrators.', 'error');
        setTimeout(() => {
            window.location.replace('/login.html?tab=admin');
        }, 1000);
        return false;
    }

    return true;
}

// ==========================================
// 2. METRICS
// ==========================================
async function loadAdminMetrics() {
    try {
        const response = await fetch('/api/admin/metrics', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.status === 401 || response.status === 403) {
            handleSignOut();
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        document.getElementById('metric-active').textContent = data.activeStaff ?? 0;
        document.getElementById('metric-reports').textContent = data.totalReports ?? 0;
        document.getElementById('metric-urgent').textContent = data.urgentOpen ?? 0;

    } catch (err) {
        console.error('Metrics load error:', err);
    }
}

// ==========================================
// 3. STAFF DIRECTORY FETCHING & RENDERING
// ==========================================
async function loadStaffDirectory() {
    try {
        const response = await fetch('/api/admin/staff', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Failed to fetch staff directory.');

        allStaff = await response.json();
        applyFilterAndSearch();

    } catch (err) {
        console.error('Staff directory error:', err);
        showToast('Failed to load municipal personnel directory.', 'error');
    }
}

function renderStaffList() {
    const listEl = document.getElementById('staff-list');
    const emptyEl = document.getElementById('empty-staff');

    if (!filteredStaff || filteredStaff.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');

    listEl.innerHTML = filteredStaff.map(s => {
        const initials = getInitials(s.name);
        const designation = s.designation || 'Municipal Staff';
        const badgeId = s.badge_id || `CBE-ST-${String(s.id).padStart(3, '0')}`;
        const department = s.department || 'General Services';
        const phone = s.phone || 'Not provided';
        const isActive = s.is_active !== 0;

        let statusBadge = '';
        let actionButtons = '';
        let suspensionBanner = '';

        if (isActive) {
            statusBadge = `
                <span class="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200/80 font-semibold px-2.5 py-1 rounded-full text-xs">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Active</span>
                </span>
            `;
            actionButtons = `
                <button type="button" onclick="openSuspendModal(${s.id})"
                    class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition-all cursor-pointer shadow-xs">
                    <span class="material-symbols-outlined text-sm text-amber-600">pause_circle</span>
                    <span>Suspend</span>
                </button>
            `;
        } else {
            let untilDisplay = 'Indefinite';
            if (s.suspended_until) {
                const untilDate = new Date(s.suspended_until);
                untilDisplay = `Until ${untilDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
            }

            statusBadge = `
                <span class="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 border border-rose-200/80 font-semibold px-2.5 py-1 rounded-full text-xs">
                    <span class="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>Suspended</span>
                </span>
            `;

            suspensionBanner = `
                <div class="mt-2.5 p-2 rounded-xl bg-rose-50/70 border border-rose-100 flex items-center justify-between text-xs text-rose-800">
                    <div class="flex items-center gap-1.5 truncate">
                        <span class="material-symbols-outlined text-sm text-rose-600 shrink-0">info</span>
                        <span class="font-semibold">${untilDisplay}</span>
                        ${s.suspension_reason ? `<span class="text-slate-500 truncate">• ${escapeHtml(s.suspension_reason)}</span>` : ''}
                    </div>
                </div>
            `;

            actionButtons = `
                <button type="button" onclick="handleRevokeSuspension(${s.id})"
                    class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-all cursor-pointer shadow-xs">
                    <span class="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
                    <span>Revoke Suspension</span>
                </button>
            `;
        }

        return `
            <div class="bg-white rounded-2xl border ${isActive ? 'border-slate-200/90' : 'border-rose-200/80 bg-slate-50/30'} shadow-xs p-4 flex flex-col justify-between gap-3 hover:shadow-md hover:border-slate-300 transition-all">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-start sm:items-center gap-3.5">
                        <!-- Initials Avatar -->
                        <div class="w-11 h-11 rounded-xl ${isActive ? 'bg-blue-50 border border-blue-100 text-blue-700' : 'bg-slate-100 border border-slate-200 text-slate-500'} font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                            ${initials}
                        </div>

                        <!-- Details -->
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <h3 class="text-sm font-bold text-slate-900 leading-tight truncate">${escapeHtml(s.name)}</h3>
                                <span class="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">Staff</span>
                            </div>
                            <p class="text-xs text-slate-500 font-medium mt-0.5">${escapeHtml(designation)}</p>

                            <!-- Contact & ID Row -->
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                                <span class="inline-flex items-center gap-1 text-slate-600">
                                    <span class="material-symbols-outlined text-sm text-slate-400">mail</span>
                                    <span>${escapeHtml(s.email)}</span>
                                </span>
                                <span class="inline-flex items-center gap-1 text-slate-600">
                                    <span class="material-symbols-outlined text-sm text-slate-400">phone</span>
                                    <span>${escapeHtml(phone)}</span>
                                </span>
                                <span class="inline-flex items-center gap-1 text-slate-600 font-mono text-[11px]">
                                    <span class="material-symbols-outlined text-sm text-slate-400">badge</span>
                                    <span>${escapeHtml(badgeId)}</span>
                                </span>
                                <span class="bg-slate-100 text-slate-700 font-medium text-[11px] px-2 py-0.5 rounded-md">
                                    ${escapeHtml(department)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Status & Actions -->
                    <div class="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        ${statusBadge}
                        ${actionButtons}
                    </div>
                </div>

                ${suspensionBanner}
            </div>
        `;
    }).join('');
}

// ==========================================
// 4. FILTER & SEARCH
// ==========================================
function filterDepartment(dept, btnEl) {
    currentDepartmentFilter = dept;

    document.querySelectorAll('.dept-chip').forEach(b => {
        b.className = 'dept-chip whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all';
    });

    if (btnEl) {
        btnEl.className = 'dept-chip whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-blue-600 bg-blue-600 text-white shadow-xs transition-all';
    }

    applyFilterAndSearch();
}

function handleSearch(val) {
    searchQuery = (val || '').trim().toLowerCase();
    applyFilterAndSearch();
}

function applyFilterAndSearch() {
    filteredStaff = allStaff.filter(s => {
        // Department check
        const matchDept = (currentDepartmentFilter === 'ALL') ||
            (s.department && s.department.toLowerCase() === currentDepartmentFilter.toLowerCase());

        // Search check
        const matchSearch = !searchQuery ||
            (s.name && s.name.toLowerCase().includes(searchQuery)) ||
            (s.email && s.email.toLowerCase().includes(searchQuery)) ||
            (s.badge_id && s.badge_id.toLowerCase().includes(searchQuery)) ||
            (s.phone && s.phone.includes(searchQuery)) ||
            (s.designation && s.designation.toLowerCase().includes(searchQuery));

        return matchDept && matchSearch;
    });

    renderStaffList();
}

// ==========================================
// 5. ADD STAFF FORM (POST /api/admin/staff)
// ==========================================
function openAddStaffModal() {
    document.getElementById('form-add-staff').reset();
    document.getElementById('new-staff-password').value = 'StaffPassword@123';
    openModal('modal-add-staff');
}

async function handleCreateStaff(event) {
    event.preventDefault();

    const name = document.getElementById('new-staff-name').value.trim();
    const email = document.getElementById('new-staff-email').value.trim().toLowerCase();
    const department = document.getElementById('new-staff-dept').value;
    const designation = document.getElementById('new-staff-designation').value.trim();
    const badge_id = document.getElementById('new-staff-badge').value.trim();
    const phone = document.getElementById('new-staff-phone').value.trim();
    const password = document.getElementById('new-staff-password').value;

    const btnSubmit = document.getElementById('btn-save-staff');

    if (!email.endsWith('@civicfix.com')) {
        showToast('Official staff email must end with @civicfix.com', 'error');
        return;
    }

    if (password.length < 8) {
        showToast('Password must be at least 8 characters.', 'error');
        return;
    }

    const digitCount = (password.match(/\d/g) || []).length;
    if (digitCount < 2) {
        showToast('Password must contain at least 2 numbers.', 'error');
        return;
    }

    setButtonLoading(btnSubmit, true, 'Creating Staff Account...');

    try {
        const response = await fetch('/api/admin/staff', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name,
                email,
                department,
                designation,
                badge_id,
                phone,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to create staff account.');
        }

        showToast('Municipal personnel registered successfully!', 'success');
        closeModal('modal-add-staff');
        loadStaffDirectory();
        loadAdminMetrics();

    } catch (err) {
        console.error('Create staff error:', err);
        showToast(err.message || 'Failed to add staff member.', 'error');
    } finally {
        setButtonLoading(btnSubmit, false, '<span class="material-symbols-outlined text-lg">check</span><span>Add Staff Member</span>');
    }
}

// ==========================================
// 6. SUSPENSION & REVOCATION SYSTEM
// ==========================================

function openSuspendModal(staffId) {
    const staff = allStaff.find(s => s.id === staffId);
    if (!staff) return;

    document.getElementById('suspend-staff-id').value = staff.id;
    document.getElementById('suspend-staff-name').textContent = staff.name;
    document.getElementById('suspend-avatar').textContent = getInitials(staff.name);
    document.getElementById('suspend-staff-badge').textContent = staff.badge_id || `CBE-ST-${staff.id}`;
    document.getElementById('suspend-staff-dept').textContent = staff.department || 'General';
    document.getElementById('suspend-duration-select').value = '7';
    document.getElementById('suspend-reason').value = '';
    toggleCustomSuspendDate('7');

    openModal('modal-suspend-staff');
}

function toggleCustomSuspendDate(val) {
    const container = document.getElementById('suspend-custom-date-container');
    const customInput = document.getElementById('suspend-custom-date');
    if (val === 'custom') {
        container.classList.remove('hidden');
        customInput.required = true;
        // set default to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        customInput.value = tomorrow.toISOString().split('T')[0];
    } else {
        container.classList.add('hidden');
        customInput.required = false;
    }
}

async function handleConfirmSuspend(event) {
    event.preventDefault();

    const staffId = document.getElementById('suspend-staff-id').value;
    const durationSelect = document.getElementById('suspend-duration-select').value;
    const customDate = document.getElementById('suspend-custom-date').value;
    const reason = document.getElementById('suspend-reason').value.trim();
    const btnSubmit = document.getElementById('btn-confirm-suspend');

    let payload = { reason };
    if (durationSelect === 'custom') {
        payload.untilDate = customDate;
    } else if (durationSelect === 'indefinite') {
        payload.durationDays = null;
    } else {
        payload.durationDays = Number(durationSelect);
    }

    setButtonLoading(btnSubmit, true, 'Applying Suspension...');

    try {
        const response = await fetch(`/api/admin/staff/${staffId}/suspend`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to suspend staff member.');
        }

        showToast(data.message || 'Staff member suspended.', 'warning');
        closeModal('modal-suspend-staff');
        loadStaffDirectory();
        loadAdminMetrics();

    } catch (err) {
        console.error('Suspend error:', err);
        showToast(err.message || 'Suspension failed.', 'error');
    } finally {
        setButtonLoading(btnSubmit, false, '<span class="material-symbols-outlined text-base">pause</span><span>Confirm Suspension</span>');
    }
}

async function handleRevokeSuspension(staffId) {
    const staff = allStaff.find(s => s.id === staffId);
    const staffName = staff ? staff.name : 'this staff member';
    if (!confirm(`Are you sure you want to revoke the suspension for ${staffName} and restore their full portal access?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/staff/${staffId}/revoke-suspension`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to revoke suspension.');
        }

        showToast(data.message || 'Staff suspension revoked successfully!', 'success');
        loadStaffDirectory();
        loadAdminMetrics();

    } catch (err) {
        console.error('Revoke suspension error:', err);
        showToast(err.message || 'Failed to revoke suspension.', 'error');
    }
}


// ==========================================
// 6. STAFF QUERIES MANAGEMENT (Admin View)
// ==========================================
let allAdminQueries = [];
let currentAdminQueryFilter = 'ALL';

async function loadAdminQueriesCount() {
    try {
        const response = await fetch('/api/admin/queries', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) return;

        const queries = await response.json();
        allAdminQueries = queries || [];

        const badge = document.getElementById('admin-queries-badge');
        if (badge) {
            const openCount = allAdminQueries.filter(q => q.status === 'Open').length;
            if (openCount > 0) {
                badge.textContent = openCount > 9 ? '9+' : openCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (e) {}
}

async function openAdminQueriesModal() {
    openModal('modal-admin-queries');
    const container = document.getElementById('admin-queries-list');
    container.innerHTML = `
        <div class="animate-pulse space-y-3">
            <div class="bg-slate-50 rounded-2xl h-24"></div>
            <div class="bg-slate-50 rounded-2xl h-24"></div>
        </div>
    `;

    try {
        const response = await fetch('/api/admin/queries', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Failed to load queries.');

        allAdminQueries = await response.json();
        renderAdminQueries();

    } catch (err) {
        console.error('Admin queries error:', err);
        container.innerHTML = `<p class="text-xs text-rose-500 py-6 text-center">Failed to load staff queries.</p>`;
    }
}

function filterAdminQueries(filter, btnEl) {
    currentAdminQueryFilter = filter;

    document.querySelectorAll('.admin-query-filter-chip').forEach(b => {
        b.className = 'admin-query-filter-chip px-3 py-1 rounded-full font-medium border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all';
    });

    if (btnEl) {
        btnEl.className = 'admin-query-filter-chip px-3 py-1 rounded-full font-semibold border border-blue-600 bg-blue-600 text-white shadow-xs transition-all';
    }

    renderAdminQueries();
}

function renderAdminQueries() {
    const container = document.getElementById('admin-queries-list');

    let filtered = allAdminQueries;
    if (currentAdminQueryFilter === 'Open') {
        filtered = allAdminQueries.filter(q => q.status === 'Open');
    } else if (currentAdminQueryFilter !== 'ALL') {
        filtered = allAdminQueries.filter(q => (q.category || '').toLowerCase() === currentAdminQueryFilter.toLowerCase());
    }

    if (!filtered || filtered.length === 0) {
        container.innerHTML = `
            <div class="py-12 text-center text-slate-400 text-xs">
                <span class="material-symbols-outlined text-3xl mb-1 text-slate-300">forum</span>
                <p>No staff queries match the selected filter.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(q => {
        const isOpen = q.status === 'Open';
        const statusBadge = isOpen
            ? `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">Open / Pending</span>`
            : `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">Closed / Replied</span>`;

        let catBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
        if (q.category === 'Bottleneck Situation') {
            catBadgeClass = 'bg-rose-50 text-rose-800 border-rose-300 font-bold';
        } else if (q.category === 'Resource Needed') {
            catBadgeClass = 'bg-amber-50 text-amber-900 border-amber-300 font-bold';
        } else if (q.category === 'Urgent Escalation') {
            catBadgeClass = 'bg-rose-100 text-rose-950 border-rose-400 font-bold';
        }

        const badgeIdDisplay = q.staff_badge_id ? `<span class="font-mono text-[11px] font-semibold text-slate-600">(${escapeHtml(q.staff_badge_id)})</span>` : '';
        const phoneDisplay = q.staff_phone ? `📞 ${escapeHtml(q.staff_phone)}` : '';

        return `
            <div class="bg-slate-50/80 rounded-2xl border border-slate-200/90 p-4 space-y-3 shadow-xs">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <div class="flex flex-wrap items-center gap-1.5 mb-1">
                            <span class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border ${catBadgeClass}">${escapeHtml(q.category || 'General')}</span>
                            <span class="text-xs text-slate-500 font-medium">
                                From: <strong class="text-slate-900 font-bold">${escapeHtml(q.staff_name || 'Staff')}</strong> ${badgeIdDisplay}
                            </span>
                        </div>
                        <h4 class="text-sm font-bold text-slate-900 leading-tight">${escapeHtml(q.subject)}</h4>
                        <p class="text-[11px] text-slate-500 font-medium mt-0.5">${escapeHtml(q.staff_department || 'Department')} • ${phoneDisplay}</p>
                    </div>
                    ${statusBadge}
                </div>

                <div class="bg-white p-3 rounded-xl border border-slate-200/80 text-xs text-slate-800 leading-relaxed font-normal">
                    ${escapeHtml(q.details)}
                </div>

                ${q.admin_response ? `
                    <div class="bg-blue-50/80 border border-blue-100 rounded-xl p-3 text-xs">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-blue-700 block mb-0.5">CURRENT ADMIN RESPONSE</span>
                        <p class="text-slate-900 font-medium">${escapeHtml(q.admin_response)}</p>
                    </div>
                ` : ''}

                <!-- Inline Reply Form -->
                <div class="pt-2 border-t border-slate-200/70">
                    <label class="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        ${q.admin_response ? 'Update Response' : 'Reply & Notify Staff'}
                    </label>
                    <div class="space-y-2">
                        <textarea id="reply-text-${q.id}" rows="2" placeholder="Provide instructions, approval, or resolution for staff..."
                            class="w-full p-2.5 text-xs bg-white rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100">${q.admin_response ? escapeHtml(q.admin_response) : ''}</textarea>
                        
                        <div class="flex items-center justify-between gap-2">
                            <select id="reply-status-${q.id}" class="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium">
                                <option value="Closed" ${q.status === 'Closed' ? 'selected' : ''}>Mark as Resolved / Closed</option>
                                <option value="Open" ${q.status === 'Open' ? 'selected' : ''}>Keep as Open</option>
                            </select>

                            <button type="button" onclick="submitAdminReply(${q.id})"
                                class="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5">
                                <span class="material-symbols-outlined text-sm">send</span>
                                <span>Save Reply & Notify</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function submitAdminReply(queryId) {
    const textEl = document.getElementById(`reply-text-${queryId}`);
    const statusEl = document.getElementById(`reply-status-${queryId}`);
    const responseText = textEl.value.trim();
    const status = statusEl.value;

    if (!responseText) {
        showToast('Please enter a response before saving.', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/admin/queries/${queryId}/reply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                response: responseText,
                status
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to submit reply.');
        }

        showToast('Administrative reply sent & staff notified in-app!', 'success');
        openAdminQueriesModal();
        loadAdminQueriesCount();

    } catch (err) {
        console.error('Submit reply error:', err);
        showToast(err.message || 'Failed to record response.', 'error');
    }
}

// ==========================================
// 7. BOTTOM NAVIGATION & SIGNOUT
// ==========================================
function switchBottomNav(tab) {
    if (tab === 'home') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function handleSignOut() {
    localStorage.removeItem('civicfix_token');
    localStorage.removeItem('token');
    localStorage.removeItem('civicfix_user');
    localStorage.removeItem('user');
    window.location.replace('/login.html?tab=admin');
}

// ==========================================
// 8. HELPERS & MODALS
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

function getInitials(name) {
    if (!name) return 'ST';
    const parts = name.trim().split(' ');
    if (parts.length > 1) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
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
// 9. ADMIN COMPLAINTS & BEFORE/AFTER AUDIT
// ==========================================
let adminComplaintsList = [];
let currentAdminCompFilter = 'ALL';

function switchAdminMainTab(tab) {
    const navStaff = document.getElementById('nav-staff');
    const navComplaints = document.getElementById('nav-complaints');
    
    // We can use a container toggle or scroll if on single page
    const staffSection = document.getElementById('staff-list')?.parentElement;
    const complaintsSection = document.getElementById('section-admin-complaints');

    const activeNavClass = 'flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl bg-blue-50 text-blue-700 font-semibold transition-all';
    const inactiveNavClass = 'flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl text-slate-500 hover:text-slate-800 font-medium transition-all relative';

    if (tab === 'complaints') {
        if (navStaff) navStaff.className = inactiveNavClass;
        if (navComplaints) navComplaints.className = activeNavClass;
        
        // Hide staff list section elements
        document.getElementById('staff-list')?.classList.add('hidden');
        document.getElementById('empty-staff')?.classList.add('hidden');
        document.getElementById('dept-filter-container')?.classList.add('hidden');
        document.querySelector('main > div.grid')?.classList.add('hidden');
        document.querySelector('main > div.space-y-3')?.classList.add('hidden');

        if (complaintsSection) complaintsSection.classList.remove('hidden');
        loadAdminComplaintsAudit();
    } else {
        if (navStaff) navStaff.className = activeNavClass;
        if (navComplaints) navComplaints.className = inactiveNavClass;

        document.getElementById('staff-list')?.classList.remove('hidden');
        document.getElementById('dept-filter-container')?.classList.remove('hidden');
        document.querySelector('main > div.grid')?.classList.remove('hidden');
        document.querySelector('main > div.space-y-3')?.classList.remove('hidden');

        if (complaintsSection) complaintsSection.classList.add('hidden');
    }
}

async function loadAdminComplaintsAudit() {
    const listEl = document.getElementById('admin-complaints-list');
    try {
        const response = await fetch('/api/admin/complaints', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Failed to fetch admin complaints.');
        const data = await response.json();

        // Update executive summary statistics
        if (data.summary) {
            document.getElementById('audit-stat-total').textContent = data.summary.totalCount || 0;
            document.getElementById('audit-stat-photos').textContent = data.summary.photoResolvedCount || 0;
            document.getElementById('audit-stat-verified').textContent = data.summary.verifiedCount || 0;
            document.getElementById('audit-stat-reopened').textContent = data.summary.rejectedCount || 0;
        }

        adminComplaintsList = data.complaints || [];
        renderAdminComplaints();

    } catch (err) {
        console.error('Admin complaints audit load error:', err);
        showToast('Failed to load admin complaints audit data.', 'error');
    }
}

function filterAdminComplaints(filter, btnEl) {
    currentAdminCompFilter = filter;
    
    // Update chip styling
    const buttons = document.querySelectorAll('.admin-comp-filter');
    buttons.forEach(b => {
        b.className = 'admin-comp-filter px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50';
    });
    if (btnEl) {
        btnEl.className = 'admin-comp-filter px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-xs';
    }

    renderAdminComplaints();
}

function renderAdminComplaints() {
    const listEl = document.getElementById('admin-complaints-list');
    const emptyEl = document.getElementById('empty-admin-complaints');

    const filtered = adminComplaintsList.filter(c => {
        if (currentAdminCompFilter === 'ALL') return true;
        if (currentAdminCompFilter === 'WITH_PROOF') return c.resolved_image_path != null && c.resolved_image_path !== '';
        return c.status === currentAdminCompFilter;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = filtered.map(c => {
        const refCode = `#CF-${String(c.id).padStart(4, '0')}`;
        
        let statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Received</span>`;
        if (c.status === 'In Progress') {
            statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">In Progress</span>`;
        } else if (c.status === 'Resolved') {
            statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Resolved</span>`;
        }

        // Verification Badge
        let verifyPill = '';
        if (c.verification_status === 'approved') {
            verifyPill = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">✅ Citizen Verified (⭐ ${c.rating || 5}/5)</span>`;
        } else if (c.verification_status === 'rejected') {
            verifyPill = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">⚠️ Reopened by Citizen</span>`;
        } else if (c.resolved_image_path) {
            verifyPill = `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">📸 After Photo Uploaded</span>`;
        }

        // Side-by-Side Before & After Thumbnails Grid
        let photosHtml = '';
        if (c.resolved_image_path) {
            photosHtml = `
                <div class="flex items-center gap-1.5 shrink-0">
                    <div class="relative w-16 h-20 rounded-xl overflow-hidden bg-slate-900 border border-slate-300" title="Before Photo (Citizen)">
                        <img src="${c.image_path || '/uploads/placeholder.jpg'}" class="w-full h-full object-cover">
                        <span class="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8px] font-bold text-center py-0.5">BEFORE</span>
                    </div>
                    <div class="relative w-16 h-20 rounded-xl overflow-hidden bg-emerald-900 border border-emerald-400 shadow-xs" title="After Photo (Staff)">
                        <img src="${c.resolved_image_path}" class="w-full h-full object-cover">
                        <span class="absolute bottom-0 inset-x-0 bg-emerald-700 text-white text-[8px] font-extrabold text-center py-0.5">AFTER</span>
                    </div>
                </div>
            `;
        } else if (c.image_path) {
            photosHtml = `
                <div class="relative w-16 h-20 rounded-xl overflow-hidden bg-slate-900 border border-slate-300 shrink-0" title="Reported Issue Photo">
                    <img src="${c.image_path}" class="w-full h-full object-cover">
                    <span class="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8px] font-bold text-center py-0.5">BEFORE</span>
                </div>
            `;
        } else {
            photosHtml = `
                <div class="w-16 h-20 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 flex flex-col items-center justify-center shrink-0 p-1 text-center">
                    <span class="material-symbols-outlined text-xl">no_photography</span>
                    <span class="text-[8px] font-bold uppercase mt-0.5">No Photo</span>
                </div>
            `;
        }

        return `
            <div class="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row gap-3.5 items-start sm:items-center justify-between">
                <div class="flex items-start gap-3.5 min-w-0 flex-1">
                    ${photosHtml}
                    
                    <div class="min-w-0 flex-1 space-y-1">
                        <div class="flex items-start justify-between gap-2">
                            <h3 class="text-sm font-bold text-slate-900 leading-tight">${escapeHtml(c.title)}</h3>
                            <div class="shrink-0 sm:hidden">${statusPill}</div>
                        </div>

                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">${escapeHtml(c.category)}</span>
                            <span class="font-mono text-slate-400 text-[10px]">${refCode}</span>
                            <span class="text-slate-600 font-medium text-[11px] flex items-center gap-0.5">
                                <span class="material-symbols-outlined text-xs text-blue-600">person</span>
                                <span>${escapeHtml(c.citizen_name || 'Citizen')}</span>
                            </span>
                            <span class="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200">🔥 ${c.upvote_count || 0} Upvotes</span>
                            ${verifyPill}
                        </div>

                        <p class="text-xs text-slate-600 line-clamp-1">${escapeHtml(c.description)}</p>

                        <div class="flex items-center gap-2 text-[11px] text-slate-500 pt-1 font-medium">
                            <span class="flex items-center gap-0.5 text-blue-700">
                                <span class="material-symbols-outlined text-xs">location_on</span>
                                <span>${escapeHtml(c.location || 'Coimbatore')}</span>
                            </span>
                        </div>
                    </div>
                </div>

                <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div class="hidden sm:block">${statusPill}</div>
                    
                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <button type="button" onclick="deleteAdminComplaint(${c.id})" class="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors" title="Delete Complaint (Admin Only)">
                            <span class="material-symbols-outlined text-base">delete</span>
                            <span class="hidden md:inline">Delete</span>
                        </button>
                        <button type="button" onclick="openAdminComplaintAuditModal(${c.id})" class="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                            <span class="material-symbols-outlined text-base">visibility</span>
                            <span>Audit Proof</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openAdminComplaintAuditModal(complaintId) {
    const comp = adminComplaintsList.find(c => c.id === complaintId);
    if (!comp) return;

    document.getElementById('admin-audit-complaint-id').value = comp.id;
    document.getElementById('admin-audit-ref').textContent = `#CF-${String(comp.id).padStart(4, '0')} • ${comp.category || 'Grievance'}`;
    document.getElementById('admin-audit-title').textContent = comp.title || 'Civic Issue';
    document.getElementById('admin-audit-description').textContent = comp.description || 'No description available.';
    document.getElementById('admin-audit-citizen-name').textContent = comp.citizen_name || 'Anonymous Citizen';
    document.getElementById('admin-audit-citizen-contact').textContent = `${comp.citizen_email || ''} ${comp.citizen_phone ? '• +91 ' + comp.citizen_phone : ''}`;
    document.getElementById('admin-audit-location').textContent = comp.location || comp.formatted_address || 'Coimbatore';

    const lat = parseFloat(comp.latitude) || 11.016844;
    const lng = parseFloat(comp.longitude) || 76.955833;
    document.getElementById('admin-audit-gmaps-link').href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    // Set Before & After images
    const beforeImg = document.getElementById('admin-audit-before-img');
    const afterImg = document.getElementById('admin-audit-after-img');

    beforeImg.src = comp.image_path || '/uploads/placeholder.jpg';
    afterImg.src = comp.resolved_image_path || '/uploads/placeholder.jpg';

    // Status Pill
    const statusPill = document.getElementById('admin-audit-status-pill');
    statusPill.textContent = comp.status;
    statusPill.className = `px-2.5 py-0.5 rounded-full text-[10px] font-bold ${comp.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`;

    // Admin Verification Badge
    const auditBadge = document.getElementById('admin-audit-status-badge');
    const reopenReasonInput = document.getElementById('admin-audit-reopen-reason');
    if (reopenReasonInput) reopenReasonInput.value = comp.rejection_reason || '';

    if (auditBadge) {
        if (comp.verification_status === 'approved') {
            auditBadge.textContent = '✅ Verified & Approved by Admin';
            auditBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200';
        } else if (comp.verification_status === 'rejected') {
            auditBadge.textContent = '⚠️ Reopened by Admin';
            auditBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200';
        } else {
            auditBadge.textContent = '⏳ Pending Admin Audit';
            auditBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200';
        }
    }

    // Citizen rating / feedback box
    const feedbackBox = document.getElementById('admin-audit-feedback-box');
    if (comp.feedback || comp.rating) {
        feedbackBox.classList.remove('hidden');
        document.getElementById('admin-audit-rating-stars').textContent = `⭐ ${comp.rating || 5}/5`;
        document.getElementById('admin-audit-feedback-text').textContent = `"${comp.feedback || 'No comments left.'}"`;
    } else {
        feedbackBox.classList.add('hidden');
    }

    openModal('modal-admin-complaint-audit');
}

async function handleAdminVerifyAction(action) {
    const complaintId = document.getElementById('admin-audit-complaint-id').value;
    const reason = document.getElementById('admin-audit-reopen-reason').value.trim();

    if (!complaintId) return;

    if (action === 'reject' && !reason) {
        showToast('Please enter a reason for reopening the complaint.', 'error');
        document.getElementById('admin-audit-reopen-reason').focus();
        return;
    }

    const btnApprove = document.getElementById('btn-admin-approve-fix');
    const btnReopen = document.getElementById('btn-admin-reopen-ticket');

    if (btnApprove) btnApprove.disabled = true;
    if (btnReopen) btnReopen.disabled = true;

    try {
        const response = await fetch(`/api/admin/complaints/${complaintId}/verify-fix`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ action, reason })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to update verification status.');

        showToast(data.message, action === 'approve' ? 'success' : 'warning');
        closeModal('modal-admin-complaint-audit');
        loadAdminComplaintsAudit();
        loadAdminMetrics();

    } catch (err) {
        console.error('Admin verify action error:', err);
        showToast(err.message || 'Failed to process admin verification.', 'error');
    } finally {
        if (btnApprove) btnApprove.disabled = false;
        if (btnReopen) btnReopen.disabled = false;
    }
}

async function deleteAdminComplaint(complaintId) {
    if (!complaintId) return;
    const refCode = `#CF-${String(complaintId).padStart(4, '0')}`;
    const confirmed = confirm(`Are you sure you want to permanently delete complaint ${refCode}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/admin/complaints/${complaintId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to delete complaint.');

        showToast(data.message || 'Complaint deleted successfully.', 'success');
        closeModal('modal-admin-complaint-audit');
        loadAdminComplaintsAudit();
        loadAdminMetrics();

    } catch (err) {
        console.error('Delete complaint error:', err);
        showToast(err.message || 'Failed to delete complaint.', 'error');
    }
}

function deleteAdminComplaintFromModal() {
    const complaintId = document.getElementById('admin-audit-complaint-id').value;
    if (complaintId) {
        deleteAdminComplaint(complaintId);
    }
}
