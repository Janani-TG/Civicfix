const http = require('http');
const db = require('./database');
const app = require('./server'); // Note: backend/server.js starts listen on port 3000

async function request(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const payload = data ? JSON.stringify(data) : null;
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch(e) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('--- Testing Citizen Email OTP Flow ---');

    // 1. Check existing user phone
    console.log('\nTest 1: Check existing user phone (7358804319)');
    const checkRes = await request('/api/auth/check-user?phone=7358804319');
    console.log('Result:', checkRes.data);
    if (!checkRes.data.exists || !checkRes.data.email) {
        throw new Error('Check user phone failed!');
    }
    console.log('✅ Test 1 Passed: Associated email found:', checkRes.data.email);

    // 2. Send OTP
    console.log('\nTest 2: Send OTP to email associated with phone');
    const sendRes = await request('/api/auth/send-otp', 'POST', {
        phone: '7358804319',
        email: 'shrijanani07@gmail.com',
        fullName: 'Janani'
    });
    console.log('Result:', sendRes.data);
    if (!sendRes.data.success) {
        throw new Error('Send OTP failed!');
    }
    console.log('✅ Test 2 Passed: Message returned:', sendRes.data.message);
    const dbOtp = db.prepare("SELECT otp FROM otps WHERE phone = ? ORDER BY id DESC LIMIT 1").get('7358804319');
    const validOtp = dbOtp.otp;

    // 3. Verify Invalid OTP
    console.log('\nTest 3: Verify with WRONG OTP (000000)');
    const wrongVerify = await request('/api/auth/verify-otp', 'POST', {
        phone: '7358804319',
        email: 'shrijanani07@gmail.com',
        otp: '000000'
    });
    console.log('Result (expect 400):', wrongVerify.status, wrongVerify.data);
    if (wrongVerify.status !== 400 || wrongVerify.data.success) {
        throw new Error('Wrong OTP should have failed!');
    }
    console.log('✅ Test 3 Passed: Correctly rejected invalid OTP.');

    // 4. Verify Correct OTP
    console.log(`\nTest 4: Verify with CORRECT OTP (${validOtp})`);
    const correctVerify = await request('/api/auth/verify-otp', 'POST', {
        phone: '7358804319',
        email: 'shrijanani07@gmail.com',
        otp: validOtp
    });
    console.log('Result (expect 200):', correctVerify.status, correctVerify.data);
    if (correctVerify.status !== 200 || !correctVerify.data.token) {
        throw new Error('Correct OTP verification failed!');
    }
    console.log('✅ Test 4 Passed: Login successful with JWT token!');

    // 5. Test New Citizen Registration via Email OTP
    console.log('\nTest 5: New citizen registration with email OTP');
    const newPhone = '98765' + Math.floor(10000 + Math.random() * 90000);
    const newEmail = `citizen_${Date.now()}@testcivic.com`;
    const newSend = await request('/api/auth/send-otp', 'POST', {
        phone: newPhone,
        email: newEmail,
        fullName: 'New Test Citizen'
    });
    console.log('New User Send OTP:', newSend.data);
    const newDbOtp = db.prepare("SELECT otp FROM otps WHERE phone = ? ORDER BY id DESC LIMIT 1").get(newPhone);
    const newOtp = newDbOtp.otp;

    const newVerify = await request('/api/auth/verify-otp', 'POST', {
        phone: newPhone,
        email: newEmail,
        otp: newOtp,
        fullName: 'New Test Citizen'
    });
    console.log('New User Verify OTP:', newVerify.status, newVerify.data);
    if (newVerify.status !== 200 && newVerify.status !== 201) {
        throw new Error('New citizen verification failed!');
    }
    console.log('✅ Test 5 Passed: New citizen registered and authenticated successfully!');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);
}

// Wait a bit for server to listen if needed, then run
setTimeout(runTests, 1000);
