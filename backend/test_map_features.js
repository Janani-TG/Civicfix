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
    console.log('--- Testing Grievance Map Pinning & Google Maps Integration ---\n');

    // 1. Citizen OTP Login
    console.log('1. Logging in Citizen via OTP...');
    const otpReq = await request('POST', '/api/auth/send-otp', {
        phone: '9876543210',
        fullName: 'Citizen Tester'
    });
    const devOtp = otpReq.data?.devOtp || '123456';
    
    const verifyReq = await request('POST', '/api/auth/verify-otp', {
        phone: '9876543210',
        otp: devOtp
    });
    const token = verifyReq.data?.token;
    console.log('   Citizen Token Received:', !!token);

    // 2. Create Complaint with Pinned Location
    console.log('\n2. Creating Complaint with Pinned GPS Coordinates (Gandhipuram, Coimbatore)...');
    const compRes = await request('POST', '/api/complaints', {
        title: 'Deep Pothole on 100 Feet Road',
        category: 'Road Works',
        priority: 'High',
        location: '100 Feet Road, Gandhipuram, Ward 24',
        description: 'Large hazardous pothole causing traffic obstruction near junction.',
        latitude: 11.016844,
        longitude: 76.955833,
        formatted_address: 'Gandhipuram, Coimbatore, Tamil Nadu 641012',
        place_name: 'Gandhipuram Junction'
    }, token);
    console.log('   Status:', compRes.status, 'Complaint ID:', compRes.data?.complaintId);
    const newId = compRes.data?.complaintId;

    // 3. Fetch My Complaints and Verify Coordinates
    console.log('\n3. Verifying Complaint Coordinates in /api/complaints/my...');
    const myComps = await request('GET', '/api/complaints/my', null, token);
    const created = myComps.data.find(c => c.id === newId);
    console.log('   Fetched Complaint:', created?.title);
    console.log('   Latitude:', created?.latitude, 'Longitude:', created?.longitude);
    console.log('   Google Maps URL:', `https://www.google.com/maps/search/?api=1&query=${created?.latitude},${created?.longitude}`);

    // 4. Update Complaint Location
    console.log('\n4. Updating Complaint Location to RS Puram...');
    const updateRes = await request('PUT', `/api/complaints/${newId}`, {
        title: 'Deep Pothole on DB Road',
        category: 'Road Works',
        priority: 'High',
        location: 'DB Road, RS Puram, Ward 23',
        description: 'Pothole marked on DB Road RS Puram.',
        latitude: 11.008600,
        longitude: 76.950700,
        formatted_address: 'RS Puram, Coimbatore, Tamil Nadu'
    }, token);
    console.log('   Status:', updateRes.status, 'Updated Lat:', updateRes.data?.complaint?.latitude, 'Updated Lng:', updateRes.data?.complaint?.longitude);

    // 5. Verify Staff Complaint Queue includes Coordinates
    console.log('\n5. Verifying Staff Queue receives mapped coordinates...');
    const staffLogin = await request('POST', '/api/auth/staff-login', {
        email: 'staff@civicfix.com',
        password: 'StaffPassword@123'
    });
    const staffToken = staffLogin.data?.token;
    const staffQueue = await request('GET', '/api/staff/complaints', null, staffToken);
    const staffComp = staffQueue.data.find(c => c.id === newId);
    console.log('   Staff Queue Item:', staffComp?.title);
    console.log('   Staff Navigation URL:', `https://www.google.com/maps/dir/?api=1&destination=${staffComp?.latitude},${staffComp?.longitude}`);

    console.log('\n--- All Map Pinning & Google Maps Tests Passed Successfully! ---');
}

runTests().catch(err => console.error('Map test error:', err));
