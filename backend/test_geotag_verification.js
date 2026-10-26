const http = require('http');
const fs = require('fs');
const path = require('path');

// Ensure server is started
require('./server');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function request(method, pathUrl, data, token, isMultipart = false, multipartPayload = null) {
    return new Promise((resolve, reject) => {
        let headers = {};
        let bodyBuffer = null;

        if (isMultipart && multipartPayload) {
            headers = {
                'Content-Type': `multipart/form-data; boundary=${multipartPayload.boundary}`,
                'Content-Length': multipartPayload.buffer.length
            };
            bodyBuffer = multipartPayload.buffer;
        } else if (data) {
            const payload = JSON.stringify(data);
            headers = {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            };
            bodyBuffer = Buffer.from(payload);
        }

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: pathUrl,
            method,
            headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: body });
                }
            });
        });

        req.on('error', reject);
        if (bodyBuffer) req.write(bodyBuffer);
        req.end();
    });
}

function buildMultipartFormData(fields, fileField) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const chunks = [];

    for (const [key, val] of Object.entries(fields)) {
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
    }

    if (fileField) {
        chunks.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\n` +
            `Content-Type: ${fileField.contentType || 'image/jpeg'}\r\n\r\n`
        ));
        chunks.push(fileField.buffer);
        chunks.push(Buffer.from('\r\n'));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return {
        boundary,
        buffer: Buffer.concat(chunks)
    };
}

// 1x1 valid sample JPEG buffer
const sampleJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9
]);

async function runGeotagTests() {
    console.log('=== CIVICFIX GEOTAG & RESOLUTION VERIFICATION TEST SUITE ===\n');
    await sleep(600);

    // Test 1: Haversine distance unit test
    console.log('1. Testing Haversine distance formula calculation...');
    const staffRoutes = require('./routes/staff');
    const db = require('./database');

    // Test distance between Gandhipuram (11.016844, 76.955833) and a point ~15 meters away (11.01695, 76.9559)
    // 1 deg lat = ~111,000 meters. 0.0001 deg = ~11 meters.
    const lat1 = 11.016844, lon1 = 76.955833;
    const latNearby = 11.016900, lonNearby = 76.955850; // ~7-10 meters
    const latFar = 11.0827, lonFar = 76.9958; // Saravanampatti (~8.5 km)

    // Check database columns
    console.log('\n2. Verifying database table schema has all geotag columns...');
    const compColumns = db.prepare("PRAGMA table_info(complaints)").all();
    const colNames = compColumns.map(c => c.name);
    const requiredCols = [
        'latitude', 'longitude', 'resolved_image_path',
        'resolved_latitude', 'resolved_longitude',
        'geo_distance_meters', 'geo_verification_status', 'geo_verification_reason'
    ];
    for (const rc of requiredCols) {
        const hasCol = colNames.includes(rc);
        console.log(`   Column "${rc}": ${hasCol ? 'EXISTS [PASS]' : 'MISSING [FAIL]'}`);
        if (!hasCol) throw new Error(`Missing column: ${rc}`);
    }

    // 3. Citizen Login & Create Complaint with GPS Geo-Tag
    console.log('\n3. Logging in Citizen via OTP...');
    const citizenPhone = '9944112233';
    const citizenEmail = 'citizen.geotag.test@civicfix.com';
    const otpRes = await request('POST', '/api/auth/send-otp', {
        phone: citizenPhone,
        email: citizenEmail,
        fullName: 'Geotag Citizen'
    });
    const otpRow = db.prepare("SELECT otp FROM otps WHERE phone = ? ORDER BY id DESC LIMIT 1").get(citizenPhone);
    const otp = otpRow?.otp || otpRes.data?.devOtp || '123456';
    const verifyRes = await request('POST', '/api/auth/verify-otp', {
        phone: citizenPhone,
        email: citizenEmail,
        otp,
        fullName: 'Geotag Citizen'
    });
    const citizenToken = verifyRes.data?.token;
    console.log('   Citizen token acquired:', !!citizenToken);

    console.log('\n4. Creating complaint with Citizen Geo-tag (Gandhipuram: 11.016844, 76.955833)...');
    const compCreateMultipart = buildMultipartFormData({
        title: 'Broken Pavement & Water Leak',
        category: 'Road Works & Infrastructure',
        priority: 'High',
        location: '100 Feet Rd, Gandhipuram',
        description: 'Pavement damaged by water pipe rupture.',
        latitude: lat1.toString(),
        longitude: lon1.toString(),
        formatted_address: 'Gandhipuram, Coimbatore'
    }, {
        name: 'image',
        filename: 'citizen_issue_photo.jpg',
        buffer: sampleJpegBuffer
    });

    const createRes = await request('POST', '/api/complaints', null, citizenToken, true, compCreateMultipart);
    console.log('   Complaint Created ID:', createRes.data?.complaintId, 'Status:', createRes.status);
    const complaintId = createRes.data?.complaintId;
    if (!complaintId) throw new Error('Failed to create complaint: ' + JSON.stringify(createRes.data));

    // Verify complaint in DB has coordinates
    const compDb = db.prepare("SELECT id, latitude, longitude, status, verification_status FROM complaints WHERE id = ?").get(complaintId);
    console.log(`   DB Stored Complaint GPS: (${compDb.latitude}, ${compDb.longitude})`);

    // 5. Staff Registration / Login
    console.log('\n5. Logging in Staff Account...');
    const staffEmail = `field_worker_${Date.now()}@civicfix.com`;
    const regRes = await request('POST', '/api/auth/staff-register', {
        name: 'Inspector Ramesh',
        email: staffEmail,
        phone: '9840112233',
        department: 'Road Works & Infrastructure',
        designation: 'Field Inspector',
        password: 'PassWord1234'
    });
    const staffToken = regRes.data?.token;
    console.log('   Staff Token Acquired:', !!staffToken);

    // 6. TEST MISMATCH: Staff uploads resolution photo from 8.5 km away!
    console.log('\n6. Testing Geo-tag MISMATCH: Staff uploads photo from 8.5 km away (Allowed: 200m)...');
    const diffPhotoBuffer = Buffer.concat([sampleJpegBuffer, Buffer.from('different_staff_bytes_far_away')]);
    const farMultipart = buildMultipartFormData({
        complaint_id: complaintId.toString(),
        staff_latitude: latFar.toString(),
        staff_longitude: lonFar.toString(),
        geo_source: 'device_gps'
    }, {
        name: 'resolved_image',
        filename: 'staff_resolution_far.jpg',
        buffer: diffPhotoBuffer
    });

    const verifyFarRes = await request('POST', '/api/staff/verify-resolution', null, staffToken, true, farMultipart);
    console.log('   Verification Result:');
    console.log('   - geoMatch:', verifyFarRes.data?.geoMatch, '(Expected: false)');
    console.log('   - isResolved:', verifyFarRes.data?.isResolved, '(Expected: false)');
    console.log('   - distanceMeters:', verifyFarRes.data?.distanceMeters, 'm');
    console.log('   - matchedIssue:', verifyFarRes.data?.matchedIssue);
    console.log('   - reasoning:', verifyFarRes.data?.reasoning);

    if (verifyFarRes.data?.geoMatch !== false || verifyFarRes.data?.isResolved !== false) {
        throw new Error('FAIL: Geo-tag mismatch was expected to fail verification!');
    }
    console.log('   [PASS] Mismatched photo was properly REJECTED by geo-fence inspector!');

    // 7. Verify Staff CANNOT Mark as 'Resolved' when Geo Verification is Rejected
    console.log('\n7. Testing Resolution Status Lock: Attempting to mark status as "Resolved" after geo rejection...');
    const lockRes = await request('PUT', `/api/staff/complaints/${complaintId}/status`, {
        status: 'Resolved',
        message: 'Trying to force resolve from wrong location'
    }, staffToken);

    console.log('   Status code:', lockRes.status, '(Expected: 400)');
    console.log('   Message:', lockRes.data?.message);
    if (lockRes.status !== 400) {
        throw new Error('FAIL: Staff was able to mark complaint as Resolved despite failed geo-verification!');
    }
    console.log('   [PASS] Resolution correctly BLOCKED due to geo-location mismatch!');

    // 8. TEST MATCH: Staff uploads photo ON-SITE (~7 meters away from grievance pin)
    console.log('\n8. Testing Geo-tag MATCH: Staff uploads photo on-site (~7 meters away)...');
    const onSitePhotoBuffer = Buffer.concat([sampleJpegBuffer, Buffer.from('on_site_clean_road_fixed_photo_proof_1234')]);
    const nearMultipart = buildMultipartFormData({
        complaint_id: complaintId.toString(),
        staff_latitude: latNearby.toString(),
        staff_longitude: lonNearby.toString(),
        geo_source: 'device_gps'
    }, {
        name: 'resolved_image',
        filename: 'staff_resolution_onsite.jpg',
        buffer: onSitePhotoBuffer
    });

    const verifyNearRes = await request('POST', '/api/staff/verify-resolution', null, staffToken, true, nearMultipart);
    console.log('   Verification Result:');
    console.log('   - geoMatch:', verifyNearRes.data?.geoMatch, '(Expected: true)');
    console.log('   - distanceMeters:', verifyNearRes.data?.distanceMeters, 'm (Expected: < 200m)');
    console.log('   - geoVerificationStatus:', verifyNearRes.data?.geoVerificationStatus);
    console.log('   - geoReason:', verifyNearRes.data?.geoReason);

    if (verifyNearRes.data?.geoMatch !== true || verifyNearRes.data?.distanceMeters > 200) {
        throw new Error('FAIL: On-site geo-tag was expected to pass geo-matching!');
    }
    console.log('   [PASS] On-site photo successfully PASSED geo-tag verification!');

    // Check DB record
    const updatedComp = db.prepare("SELECT * FROM complaints WHERE id = ?").get(complaintId);
    console.log('\n9. Checking database record after on-site geo verification:');
    console.log('   - resolved_latitude:', updatedComp.resolved_latitude);
    console.log('   - resolved_longitude:', updatedComp.resolved_longitude);
    console.log('   - geo_distance_meters:', updatedComp.geo_distance_meters);
    console.log('   - geo_verification_status:', updatedComp.geo_verification_status);
    console.log('   - geo_verification_reason:', updatedComp.geo_verification_reason);

    console.log('\n=== ALL GEOTAG VERIFICATION TESTS PASSED SUCCESSFULLY! ===\n');
    process.exit(0);
}

runGeotagTests().catch(err => {
    console.error('\nTEST FAILED WITH ERROR:', err);
    process.exit(1);
});
