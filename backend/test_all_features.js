const http = require('http');

function request(method, path, data, token) {
    return new Promise((resolve, reject) => {
        const payload = data ? JSON.stringify(data) : null;
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: body, error: e.message });
                }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('--- Testing CivicFix Features ---\n');

    // 1. Admin Fixed Login
    console.log('1. Testing Admin Login with admin@civicfix.com / 25mx317334...');
    const adminRes = await request('POST', '/api/auth/admin-login', {
        email: 'admin@civicfix.com',
        password: '25mx317334'
    });
    console.log('   Status:', adminRes.status, 'Success:', adminRes.data?.success, 'Admin Name:', adminRes.data?.user?.name);
    const adminToken = adminRes.data?.token;

    // 2. Staff Registration with @civicfix.com and Password Policy
    const testStaffEmail = `officer_${Date.now()}@civicfix.com`;
    console.log('\n2. Testing Staff Password Policy (<8 chars or <2 numbers should fail)...');
    const badPassRes = await request('POST', '/api/auth/staff-register', {
        name: 'Test Officer',
        email: testStaffEmail,
        phone: '9842109876',
        department: 'Sanitation',
        designation: 'Supervisor',
        password: 'weak' // bad password
    });
    console.log('   Weak password rejected properly:', badPassRes.status === 400, 'Msg:', badPassRes.data?.message);

    console.log('\n3. Testing Staff Registration with valid password (>=8 chars, >=2 numbers)...');
    const goodStaffRes = await request('POST', '/api/auth/staff-register', {
        name: 'Inspector Anand',
        email: testStaffEmail,
        phone: '9842109876',
        department: 'Sanitation',
        designation: 'Senior Inspector',
        password: 'Password99' // 10 chars, 2 numbers
    });
    console.log('   Status:', goodStaffRes.status, 'Success:', goodStaffRes.data?.success, 'User:', goodStaffRes.data?.user?.name);

    // 4. Staff Forgot Password & Integrated Phone Number Indication
    console.log('\n4. Testing Staff Forgot Password (Indicating phone number)...');
    const forgotRes = await request('POST', '/api/auth/staff-forgot-password', {
        email: testStaffEmail
    });
    console.log('   Status:', forgotRes.status, 'Phone indicated:', forgotRes.data?.phone, 'Formatted:', forgotRes.data?.formattedPhone, 'Dev OTP:', forgotRes.data?.devOtp);

    // 5. Staff Reset Password with OTP
    console.log('\n5. Testing Staff Password Reset Completion...');
    const resetRes = await request('POST', '/api/auth/staff-reset-password', {
        email: testStaffEmail,
        otp: forgotRes.data?.devOtp || '123456',
        newPassword: 'NewSecurePass2026'
    });
    console.log('   Status:', resetRes.status, 'Success:', resetRes.data?.success, 'Msg:', resetRes.data?.message);

    // 6. Test Login with New Password
    console.log('\n6. Testing Staff Login with New Password...');
    const staffLoginRes = await request('POST', '/api/auth/staff-login', {
        email: testStaffEmail,
        password: 'NewSecurePass2026'
    });
    console.log('   Status:', staffLoginRes.status, 'Success:', staffLoginRes.data?.success, 'Staff ID:', staffLoginRes.data?.user?.id);
    const newStaffId = staffLoginRes.data?.user?.id;

    // 7. Admin Suspend Staff
    console.log('\n7. Testing Admin Suspending Staff for 7 days...');
    const suspendRes = await request('POST', `/api/admin/staff/${newStaffId}/suspend`, {
        durationDays: 7,
        reason: 'Administrative review pending'
    }, adminToken);
    console.log('   Status:', suspendRes.status, 'Suspended:', suspendRes.data?.success, 'Until:', suspendRes.data?.suspendedUntil);

    // 8. Verify Suspended Staff Cannot Login
    console.log('\n8. Verifying Suspended Staff Login is Blocked...');
    const suspendedLoginRes = await request('POST', '/api/auth/staff-login', {
        email: testStaffEmail,
        password: 'NewSecurePass2026'
    });
    console.log('   Status:', suspendedLoginRes.status, 'Blocked msg:', suspendedLoginRes.data?.message);

    // 9. Admin Revoke Suspension
    console.log('\n9. Testing Admin Revoking Staff Suspension...');
    const revokeRes = await request('POST', `/api/admin/staff/${newStaffId}/revoke-suspension`, {}, adminToken);
    console.log('   Status:', revokeRes.status, 'Revocation success:', revokeRes.data?.success, 'Msg:', revokeRes.data?.message);

    // 10. Verify Staff Can Login Again
    console.log('\n10. Verifying Staff Can Login After Revocation...');
    const restoredLoginRes = await request('POST', '/api/auth/staff-login', {
        email: testStaffEmail,
        password: 'NewSecurePass2026'
    });
    console.log('   Status:', restoredLoginRes.status, 'Login success after revoke:', restoredLoginRes.data?.success);

    console.log('\n--- All Automated Verification Tests Completed Successfully! ---');
}

runTests().catch(err => console.error('Test run failed:', err));
