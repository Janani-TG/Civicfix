/**
 * CivicFix - Login Interface Logic
 * Coimbatore City Municipal Corporation
 */

// State Management
let currentTab = 'citizen';
let currentPhone = '';
let currentEmail = '';
let currentFullName = '';
let currentDevOtp = '';
let resendTimerInterval = null;
let resendSecondsLeft = 30;
let isUserNew = false;
let phoneLookupDebounce = null;

// Firebase Phone Auth State
const firebaseConfig = {
    apiKey: "AIzaSyBX1vbm0R2Ll0CKGgFVg2Q8UmsXelK8rLo",
    authDomain: "civicfix-53237.firebaseapp.com",
    projectId: "civicfix-53237",
    storageBucket: "civicfix-53237.firebasestorage.app",
    messagingSenderId: "664634398428",
    appId: "1:664634398428:web:1240cf5200bfa6eca34619",
    measurementId: "G-Z6HN526JGD"
};

let firebaseAuth = null;
let recaptchaVerifier = null;
let confirmationResult = null;

function initFirebaseAuth() {
    try {
        if (typeof firebase !== 'undefined') {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            firebaseAuth = firebase.auth();
            firebaseAuth.useDeviceLanguage();

            const container = document.getElementById('recaptcha-container');
            if (container) {
                if (window.recaptchaVerifier) {
                    try { window.recaptchaVerifier.clear(); } catch(e){}
                }
                window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                    size: 'invisible',
                    callback: (response) => {
                        console.log('✅ Firebase reCAPTCHA verified.');
                    },
                    'expired-callback': () => {
                        console.warn('⚠️ reCAPTCHA expired, renewing...');
                    }
                });
                recaptchaVerifier = window.recaptchaVerifier;
            }
            console.log('🔥 Firebase Phone Auth ready.');
        }
    } catch (e) {
        console.error('Firebase Auth initialization error:', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initOtpInputs();
    initFirebaseAuth();
    
    // Check if redirect tab is in query params (e.g. ?tab=staff or ?tab=admin)
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['citizen', 'staff', 'admin'].includes(tabParam.toLowerCase())) {
        switchTab(tabParam.toLowerCase());
    }
});

// ==========================================
// 1. TAB SWITCHING
// ==========================================
function switchTab(tab) {
    currentTab = tab;
    
    const tabs = ['citizen', 'staff', 'admin'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const view = document.getElementById(`view-${t}`);
        
        if (t === tab) {
            btn.className = 'tab-btn flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 bg-blue-600 text-white shadow-sm';
            if (view) view.classList.remove('hidden');
        } else {
            btn.className = 'tab-btn flex-1 py-2.5 px-3 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all duration-200 flex items-center justify-center gap-1.5';
            if (view) view.classList.add('hidden');
        }
    });
}

// ==========================================
// 2. CITIZEN EMAIL OTP FLOW (WITH PHONE LINK)
// ==========================================

async function handleCitizenPhoneLookup(rawPhone) {
    const clean = (rawPhone || '').replace(/\D/g, '');
    if (clean.length === 10) {
        clearTimeout(phoneLookupDebounce);
        phoneLookupDebounce = setTimeout(async () => {
            try {
                const res = await fetch(`/api/auth/check-user?phone=${clean}`);
                const data = await res.json();
                if (data.exists) {
                    const emailInput = document.getElementById('citizen-email');
                    const nameInput = document.getElementById('citizen-name');
                    if (data.email && emailInput && !emailInput.value.trim()) {
                        emailInput.value = data.email;
                    }
                    if (data.name && nameInput && !nameInput.value.trim()) {
                        nameInput.value = data.name;
                    }
                }
            } catch (e) {
                console.log('Phone check notice:', e);
            }
        }, 250);
    }
}

function openOtpPopup(email, formattedPhone) {
    const modal = document.getElementById('otp-sent-popup-modal');
    const popupEmail = document.getElementById('popup-email');
    const popupPhone = document.getElementById('popup-phone');
    if (popupEmail) popupEmail.textContent = email;
    if (popupPhone) popupPhone.textContent = formattedPhone;
    if (modal) modal.classList.remove('hidden');
}

function closeOtpPopup() {
    const modal = document.getElementById('otp-sent-popup-modal');
    if (modal) modal.classList.add('hidden');
    const firstOtpInput = document.querySelector('.otp-input');
    if (firstOtpInput) setTimeout(() => firstOtpInput.focus(), 100);
}


async function handleSendOtp(event) {
    event.preventDefault();

    const nameInput = document.getElementById('citizen-name');
    const phoneInput = document.getElementById('citizen-phone');
    const emailInput = document.getElementById('citizen-email');
    const btnSend = document.getElementById('btn-send-otp');

    let phone = phoneInput ? phoneInput.value.trim().replace(/\D/g, '') : '';
    let email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    let fullName = nameInput ? nameInput.value.trim() : '';

    if (phone.length !== 10) {
        showToast('Please enter a valid 10-digit mobile number.', 'error');
        if (phoneInput) phoneInput.focus();
        return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Please enter a valid email address to receive OTP.', 'error');
        if (emailInput) emailInput.focus();
        return;
    }

    currentPhone = phone;
    currentEmail = email;
    currentFullName = fullName;

    setButtonLoading(btnSend, true, 'Sending OTP to Email...');

    try {
        const sendRes = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, email, fullName })
        });
        const sendData = await sendRes.json();

        if (!sendRes.ok || !sendData.success) {
            throw new Error(sendData.message || 'Failed to send OTP to email.');
        }

        isUserNew = !!sendData.isNewUser;
        currentEmail = sendData.email || email;
        const formattedPhone = sendData.formattedPhone || `+91 ${phone.substring(0, 5)} ${phone.substring(5)}`;

        // Transition to OTP verification step
        document.getElementById('citizen-step-phone').classList.add('hidden');
        document.getElementById('citizen-step-otp').classList.remove('hidden');

        // Update display labels in step 2
        const displayPhone = document.getElementById('display-phone');
        const displayEmail = document.getElementById('display-email');
        if (displayPhone) displayPhone.textContent = formattedPhone;
        if (displayEmail) displayEmail.textContent = currentEmail;

        // Show extra fields if new citizen registration
        const newCitizenFields = document.getElementById('new-citizen-fields');
        if (isUserNew && newCitizenFields) {
            newCitizenFields.classList.remove('hidden');
            const regFullName = document.getElementById('reg-fullname');
            const regEmail = document.getElementById('reg-email');
            if (currentFullName && regFullName) regFullName.value = currentFullName;
            if (currentEmail && regEmail) regEmail.value = currentEmail;
        } else if (newCitizenFields) {
            newCitizenFields.classList.add('hidden');
        }

        clearOtpBoxes();
        startResendTimer();

        // 1. Trigger the explicit Popup Modal requested:
        openOtpPopup(currentEmail, formattedPhone);

        // 2. Trigger the Toast Alert with associated mobile number:
        showToast(sendData.message || `OTP is sent to the mail (${currentEmail}) associated with mobile number ${formattedPhone}`, 'success');

    } catch (err) {
        console.error("Send OTP Error:", err);
        showToast(err.message || 'Failed to send OTP.', 'error');
    } finally {
        setButtonLoading(btnSend, false, '<span class="material-symbols-outlined text-lg">mail</span><span>Send OTP to Email</span>');
    }
}

async function handleVerifyOtp(event) {
    event.preventDefault();

    const btnVerify = document.getElementById('btn-verify-otp');
    const otp = getEnteredOtp();

    if (otp.length !== 6) {
        showToast('Please enter the 6-digit OTP code sent to your email.', 'error');
        return;
    }

    setButtonLoading(btnVerify, true, 'Verifying OTP...');

    try {
        const regFullName = document.getElementById('reg-fullname') ? document.getElementById('reg-fullname').value.trim() : currentFullName;
        const regEmail = document.getElementById('reg-email') ? document.getElementById('reg-email').value.trim() : currentEmail;
        const regPassword = document.getElementById('reg-password') ? document.getElementById('reg-password').value : '';

        const response = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: currentPhone,
                email: currentEmail || regEmail,
                otp: otp,
                fullName: regFullName || currentFullName,
                password: regPassword
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'OTP verification failed.');
        }

        saveSession(data.token, data.user);
        showToast('Login successful! Redirecting...', 'success');

        setTimeout(() => {
            window.location.href = '/citizen/index.html';
        }, 800);

    } catch (err) {
        console.error('Verify OTP Error:', err);
        showToast(err.message || 'Verification failed. Please check your OTP and try again.', 'error');
    } finally {
        setButtonLoading(btnVerify, false, '<span class="material-symbols-outlined text-lg">check_circle</span><span>Verify & Login</span>');
    }
}

function editCitizenPhone() {
    clearInterval(resendTimerInterval);
    closeOtpPopup();
    document.getElementById('citizen-step-otp').classList.add('hidden');
    document.getElementById('citizen-step-phone').classList.remove('hidden');
    const phoneInput = document.getElementById('citizen-phone');
    if (phoneInput) phoneInput.focus();
}

async function handleResendOtp() {
    if (resendSecondsLeft > 0) return;

    const btnResend = document.getElementById('btn-resend-otp');
    btnResend.disabled = true;
    btnResend.textContent = 'Resending Email...';

    try {
        const response = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: currentPhone, email: currentEmail, fullName: currentFullName })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to resend OTP.');
        }

        clearOtpBoxes();
        startResendTimer();

        const formattedPhone = data.formattedPhone || `+91 ${currentPhone}`;
        openOtpPopup(currentEmail, formattedPhone);
        showToast(data.message || `OTP is sent to the mail (${currentEmail}) associated with mobile number ${formattedPhone}`, 'success');

    } catch (err) {
        console.error('Resend OTP Error:', err);
        showToast(err.message || 'Failed to resend OTP.', 'error');
        btnResend.disabled = false;
        btnResend.textContent = 'Resend OTP';
    }
}

function startResendTimer() {
    clearInterval(resendTimerInterval);
    resendSecondsLeft = 30;

    const btnResend = document.getElementById('btn-resend-otp');
    btnResend.disabled = true;
    btnResend.className = 'text-slate-400 font-semibold cursor-not-allowed transition-colors';

    function updateTimerText() {
        const formatted = String(resendSecondsLeft).padStart(2, '0');
        btnResend.innerHTML = `Resend OTP in <span id="resend-timer" class="font-mono">00:${formatted}</span>`;
    }

    updateTimerText();

    resendTimerInterval = setInterval(() => {
        resendSecondsLeft--;
        if (resendSecondsLeft <= 0) {
            clearInterval(resendTimerInterval);
            btnResend.disabled = false;
            btnResend.className = 'text-blue-600 hover:text-blue-800 font-semibold cursor-pointer transition-colors';
            btnResend.textContent = 'Resend OTP';
        } else {
            updateTimerText();
        }
    }, 1000);
}


// ==========================================
// 3. STAFF PORTAL AUTHENTICATION & MANAGEMENT
// ==========================================

let staffCurrentResetPhone = '';
let staffCurrentResetEmail = '';

function switchStaffSubView(subview) {
    const loginView = document.getElementById('staff-subview-login');
    const registerView = document.getElementById('staff-subview-register');
    const resetView = document.getElementById('staff-subview-reset');
    const tabSignIn = document.getElementById('tab-staff-signin');
    const tabRegister = document.getElementById('tab-staff-register');
    const modeTabs = document.getElementById('staff-mode-tabs');

    if (!loginView || !registerView || !resetView) return;

    // Reset views
    loginView.classList.add('hidden');
    registerView.classList.add('hidden');
    resetView.classList.add('hidden');

    if (subview === 'login') {
        loginView.classList.remove('hidden');
        if (modeTabs) modeTabs.classList.remove('hidden');
        if (tabSignIn && tabRegister) {
            tabSignIn.className = 'flex-1 py-1.5 px-3 rounded-lg bg-white text-blue-600 shadow-sm transition-all text-center';
            tabRegister.className = 'flex-1 py-1.5 px-3 rounded-lg text-slate-600 hover:text-slate-900 transition-all text-center';
        }
    } else if (subview === 'register') {
        registerView.classList.remove('hidden');
        if (modeTabs) modeTabs.classList.remove('hidden');
        if (tabSignIn && tabRegister) {
            tabSignIn.className = 'flex-1 py-1.5 px-3 rounded-lg text-slate-600 hover:text-slate-900 transition-all text-center';
            tabRegister.className = 'flex-1 py-1.5 px-3 rounded-lg bg-white text-blue-600 shadow-sm transition-all text-center';
        }
    } else if (subview === 'reset') {
        resetView.classList.remove('hidden');
        if (modeTabs) modeTabs.classList.add('hidden'); // hide tabs in reset flow
        
        // If email was already filled in login, prefill in reset
        const staffLoginEmail = document.getElementById('staff-email')?.value.trim();
        const resetEmailInput = document.getElementById('staff-reset-email');
        if (staffLoginEmail && resetEmailInput && !resetEmailInput.value) {
            resetEmailInput.value = staffLoginEmail;
        }

        // Return to step 1
        const stepEmail = document.getElementById('staff-reset-step-email');
        const stepOtp = document.getElementById('staff-reset-step-otp');
        if (stepEmail && stepOtp) {
            stepEmail.classList.remove('hidden');
            stepOtp.classList.add('hidden');
        }
    }
}

/**
 * Checks password strength against rules:
 * 1. Minimum 8 characters
 * 2. At least 2 numbers (0-9)
 */
function checkStaffPasswordRequirements(val, lenRuleId, numsRuleId) {
    const lenEl = document.getElementById(lenRuleId);
    const numsEl = document.getElementById(numsRuleId);

    const isLenValid = val && val.length >= 8;
    const digitCount = (val.match(/\d/g) || []).length;
    const isNumsValid = digitCount >= 2;

    if (lenEl) {
        if (isLenValid) {
            lenEl.className = 'flex items-center gap-1.5 text-emerald-600 font-semibold';
            lenEl.querySelector('.material-symbols-outlined').textContent = 'check_circle';
            lenEl.querySelector('.material-symbols-outlined').className = 'material-symbols-outlined text-sm text-emerald-600';
        } else {
            lenEl.className = 'flex items-center gap-1.5 text-slate-500 font-medium';
            lenEl.querySelector('.material-symbols-outlined').textContent = 'cancel';
            lenEl.querySelector('.material-symbols-outlined').className = 'material-symbols-outlined text-sm text-slate-400';
        }
    }

    if (numsEl) {
        if (isNumsValid) {
            numsEl.className = 'flex items-center gap-1.5 text-emerald-600 font-semibold';
            numsEl.querySelector('.material-symbols-outlined').textContent = 'check_circle';
            numsEl.querySelector('.material-symbols-outlined').className = 'material-symbols-outlined text-sm text-emerald-600';
        } else {
            numsEl.className = 'flex items-center gap-1.5 text-slate-500 font-medium';
            numsEl.querySelector('.material-symbols-outlined').textContent = 'cancel';
            numsEl.querySelector('.material-symbols-outlined').className = 'material-symbols-outlined text-sm text-slate-400';
        }
    }

    return isLenValid && isNumsValid;
}

// 1. STAFF REGISTRATION HANDLER
async function handleStaffRegister(event) {
    event.preventDefault();

    const nameInput = document.getElementById('staff-reg-name');
    const emailInput = document.getElementById('staff-reg-email');
    const phoneInput = document.getElementById('staff-reg-phone');
    const deptInput = document.getElementById('staff-reg-department');
    const desigInput = document.getElementById('staff-reg-designation');
    const passInput = document.getElementById('staff-reg-password');
    const confPassInput = document.getElementById('staff-reg-confirm-password');
    const btnSubmit = document.getElementById('btn-staff-register');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim().replace(/\D/g, '');
    const department = deptInput.value;
    const designation = desigInput.value.trim();
    const password = passInput.value;
    const confirmPassword = confPassInput.value;

    if (!email.toLowerCase().endsWith('@civicfix.com')) {
        showToast('Official staff email must end with @civicfix.com', 'error');
        emailInput.focus();
        return;
    }

    if (phone.length !== 10) {
        showToast('Please enter a valid 10-digit mobile number.', 'error');
        phoneInput.focus();
        return;
    }

    if (password.length < 8) {
        showToast('Password must be at least 8 characters in length.', 'error');
        passInput.focus();
        return;
    }

    const digitCount = (password.match(/\d/g) || []).length;
    if (digitCount < 2) {
        showToast('Password must include at least 2 numbers.', 'error');
        passInput.focus();
        return;
    }

    if (password !== confirmPassword) {
        showToast('Passwords do not match. Please verify.', 'error');
        confPassInput.focus();
        return;
    }

    setButtonLoading(btnSubmit, true, 'Registering Staff...');

    try {
        const response = await fetch('/api/auth/staff-register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                email,
                phone,
                department,
                designation,
                password
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Staff registration failed.');
        }

        saveSession(data.token, data.user);
        showToast('Staff registration successful! Loading portal...', 'success');

        setTimeout(() => {
            window.location.href = '/staff/staff_complaint_queue/code.html';
        }, 800);

    } catch (err) {
        console.error('Staff Register Error:', err);
        showToast(err.message || 'Registration failed. Please try again.', 'error');
    } finally {
        setButtonLoading(btnSubmit, false, '<span class="material-symbols-outlined text-lg">how_to_reg</span><span>Register Staff Account</span>');
    }
}

// 2. STAFF LOGIN HANDLER
async function handleStaffLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById('staff-email');
    const passwordInput = document.getElementById('staff-password');
    const btnSubmit = document.getElementById('btn-staff-login');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email.toLowerCase().endsWith('@civicfix.com')) {
        showToast('Official staff email must end with @civicfix.com', 'error');
        emailInput.focus();
        return;
    }

    if (!password) {
        showToast('Please enter your password.', 'error');
        passwordInput.focus();
        return;
    }

    setButtonLoading(btnSubmit, true, 'Authenticating...');

    try {
        const response = await fetch('/api/auth/staff-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Staff login failed.');
        }

        saveSession(data.token, data.user);
        showToast('Staff login successful! Loading portal...', 'success');

        setTimeout(() => {
            window.location.href = '/staff/staff_complaint_queue/code.html';
        }, 800);

    } catch (err) {
        console.error('Staff Login Error:', err);
        showToast(err.message || 'Authentication failed. Please check your credentials.', 'error');
    } finally {
        setButtonLoading(btnSubmit, false, '<span class="material-symbols-outlined text-lg">login</span><span>Sign In</span>');
    }
}

// 3. STAFF FORGOT PASSWORD TRIGGER (INDICATES INTEGRATED PHONE)
async function handleStaffForgotRequest(event, isResend = false) {
    if (event) event.preventDefault();

    const emailInput = document.getElementById('staff-reset-email');
    const btnSubmit = document.getElementById('btn-staff-trigger-reset');

    const email = emailInput.value.trim();

    if (!email.toLowerCase().endsWith('@civicfix.com')) {
        showToast('Staff email must end with @civicfix.com', 'error');
        emailInput.focus();
        return;
    }

    if (!isResend) {
        setButtonLoading(btnSubmit, true, 'Locating Account & Phone...');
    }

    try {
        const response = await fetch('/api/auth/staff-forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Could not initiate password reset.');
        }

        staffCurrentResetEmail = email;
        staffCurrentResetPhone = data.phone;

        // Reveal the integrated phone number in the UI
        const displayPhoneEl = document.getElementById('staff-reset-display-phone');
        if (displayPhoneEl) {
            displayPhoneEl.textContent = data.formattedPhone || `+91 ${data.phone}`;
        }

        // Show Dev OTP banner if applicable
        const devOtpBanner = document.getElementById('staff-reset-dev-otp-banner');
        const devOtpCode = document.getElementById('staff-reset-dev-otp-code');
        const otpInput = document.getElementById('staff-reset-otp-input');

        if (data.devOtp) {
            if (devOtpBanner) devOtpBanner.classList.remove('hidden');
            if (devOtpCode) devOtpCode.textContent = data.devOtp;
            if (otpInput) otpInput.value = data.devOtp;
        } else {
            if (devOtpBanner) devOtpBanner.classList.add('hidden');
            if (otpInput) otpInput.value = '';
        }

        // Update SMS notice text
        const smsNoticeEl = document.getElementById('staff-sms-dispatch-text');
        if (smsNoticeEl) {
            smsNoticeEl.textContent = `Verification OTP dispatched via SMS to concern phone number ${data.formattedPhone || data.phone}. Please check your phone SMS.`;
        }

        // Switch to OTP and new password step
        document.getElementById('staff-reset-step-email').classList.add('hidden');
        document.getElementById('staff-reset-step-otp').classList.remove('hidden');

        showToast(`SMS OTP sent to concern mobile number ${data.formattedPhone || data.phone}`, 'success');

        if (!data.devOtp && otpInput) {
            setTimeout(() => otpInput.focus(), 150);
        }

    } catch (err) {
        console.error('Staff Forgot Password Error:', err);
        showToast(err.message || 'Failed to process request.', 'error');
    } finally {
        if (!isResend) {
            setButtonLoading(btnSubmit, false, '<span class="material-symbols-outlined text-lg">send_to_mobile</span><span>Find Account & Send Reset OTP</span>');
        }
    }
}

// 4. STAFF COMPLETE PASSWORD RESET
async function handleStaffCompleteReset(event) {
    event.preventDefault();

    const otpInput = document.getElementById('staff-reset-otp-input');
    const newPassInput = document.getElementById('staff-reset-new-password');
    const confPassInput = document.getElementById('staff-reset-confirm-password');
    const btnSubmit = document.getElementById('btn-staff-submit-reset');

    const otp = otpInput.value.trim();
    const newPassword = newPassInput.value;
    const confirmPassword = confPassInput.value;

    if (otp.length !== 6) {
        showToast('Please enter the full 6-digit OTP sent to your integrated phone.', 'error');
        otpInput.focus();
        return;
    }

    if (newPassword.length < 8) {
        showToast('New password must be at least 8 characters in length.', 'error');
        newPassInput.focus();
        return;
    }

    const digitCount = (newPassword.match(/\d/g) || []).length;
    if (digitCount < 2) {
        showToast('New password must include at least 2 numbers.', 'error');
        newPassInput.focus();
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match. Please verify.', 'error');
        confPassInput.focus();
        return;
    }

    setButtonLoading(btnSubmit, true, 'Updating Password...');

    try {
        const response = await fetch('/api/auth/staff-reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: staffCurrentResetEmail,
                otp: otp,
                newPassword: newPassword
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Password reset failed.');
        }

        showToast('Password reset successfully! Please sign in with your new credentials.', 'success');

        // Switch to login subview and prefill email
        switchStaffSubView('login');
        const loginEmailInput = document.getElementById('staff-email');
        const loginPasswordInput = document.getElementById('staff-password');
        if (loginEmailInput) loginEmailInput.value = staffCurrentResetEmail;
        if (loginPasswordInput) loginPasswordInput.value = newPassword;

    } catch (err) {
        console.error('Staff Reset Password Error:', err);
        showToast(err.message || 'Password reset failed.', 'error');
    } finally {
        setButtonLoading(btnSubmit, false, '<span class="material-symbols-outlined text-lg">task_alt</span><span>Set New Password</span>');
    }
}


// ==========================================
// 4. ADMIN PORTAL LOGIN
// ==========================================
async function handleAdminLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const btnSubmit = document.getElementById('btn-admin-login');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email.toLowerCase().endsWith('@civicfix.com')) {
        showToast('Official admin email must end with @civicfix.com', 'error');
        emailInput.focus();
        return;
    }

    setButtonLoading(btnSubmit, true, 'Verifying Admin Access...');

    try {
        const response = await fetch('/api/auth/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Admin login failed.');
        }

        saveSession(data.token, data.user);
        showToast('Admin authorization verified! Loading dashboard...', 'success');

        setTimeout(() => {
            window.location.href = '/admin/home/index.html';
        }, 800);

    } catch (err) {
        console.error('Admin Login Error:', err);
        showToast(err.message || 'Access denied. Please check your admin credentials.', 'error');
    } finally {
        setButtonLoading(btnSubmit, false, '<span class="material-symbols-outlined text-lg">security</span><span>Sign In</span>');
    }
}

// ==========================================
// 5. HELPER & UTILITY FUNCTIONS
// ==========================================

function validateStaffDomain(inputEl, warningId) {
    const warning = document.getElementById(warningId);
    if (!warning) return;

    const val = inputEl.value.trim().toLowerCase();
    if (val.length > 5 && !val.endsWith('@civicfix.com')) {
        warning.classList.remove('hidden');
    } else {
        warning.classList.add('hidden');
    }
}

function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    const icon = btnEl.querySelector('.material-symbols-outlined');
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        if (icon) icon.textContent = 'visibility';
    }
}

function saveSession(token, user) {
    localStorage.setItem('civicfix_token', token);
    localStorage.setItem('token', token);
    if (user) {
        localStorage.setItem('civicfix_user', JSON.stringify(user));
        localStorage.setItem('user', JSON.stringify(user));
    }
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

// 6-digit OTP Box Handlers
function initOtpInputs() {
    const inputs = document.querySelectorAll('.otp-input');
    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val ? val[0] : '';

            if (val && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if (!input.value && index > 0) {
                    inputs[index - 1].focus();
                }
            } else if (e.key === 'ArrowLeft' && index > 0) {
                inputs[index - 1].focus();
            } else if (e.key === 'ArrowRight' && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim().replace(/\D/g, '');
            if (pasteData) {
                fillOtpBoxes(pasteData);
            }
        });
    });
}

function fillOtpBoxes(code) {
    const inputs = document.querySelectorAll('.otp-input');
    const digits = String(code).replace(/\D/g, '').split('').slice(0, 6);
    inputs.forEach((inp, i) => {
        inp.value = digits[i] || '';
    });
    if (digits.length === 6) {
        inputs[5].focus();
    } else if (digits.length > 0) {
        inputs[Math.min(digits.length, 5)].focus();
    }
}

function clearOtpBoxes() {
    const inputs = document.querySelectorAll('.otp-input');
    inputs.forEach(inp => inp.value = '');
}

function getEnteredOtp() {
    const inputs = document.querySelectorAll('.otp-input');
    let otp = '';
    inputs.forEach(inp => otp += inp.value);
    return otp;
}

// Toast Alert System
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    if (typeof message === 'string' && message.toLowerCase().includes('failed to fetch')) {
        const activeHost = window.API_BASE || 'http://192.168.1.131:3000';
        message = `Unable to connect to server (${activeHost}). Ensure your phone and PC are on the same Wi-Fi, or tap "Server" at the bottom to configure.`;
        type = 'error';
        const modal = document.getElementById('server-config-modal');
        if (modal) {
            setTimeout(() => modal.classList.remove('hidden'), 500);
        }
    }

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
        <div class="flex-1 font-medium leading-snug">${message}</div>
        <button type="button" class="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer" onclick="this.parentElement.remove()">
            <span class="material-symbols-outlined text-base">close</span>
        </button>
    `;

    container.appendChild(toast);

    // Animate In
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    // Auto dismiss after 6 seconds
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 6000);
}
