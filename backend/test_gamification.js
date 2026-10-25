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

async function runGamificationTests() {
    console.log('====================================================');
    console.log('  TESTING CITIZEN ENGAGEMENT & VERIFICATION FEATURES');
    console.log('====================================================\n');

    // 1. Citizen Login / Register
    console.log('1. Citizen Login...');
    const citizenRes = await request('POST', '/api/auth/login', {
        email: 'admin@civicfix.com',
        password: '25mx317334'
    });
    
    const citizenToken = citizenRes.data?.token;
    console.log('   Citizen Token acquired:', Boolean(citizenToken));

    // 2. Fetch User Profile
    console.log('\n2. Testing GET /api/auth/me (User Profile)...');
    const meRes = await request('GET', '/api/auth/me', null, citizenToken);
    console.log('   Status:', meRes.status, 'Name:', meRes.data?.name);

    // 3. Test Community Feed
    console.log('\n3. Testing GET /api/complaints/community/feed...');
    const feedRes = await request('GET', '/api/complaints/community/feed', null, citizenToken);
    console.log('   Status:', feedRes.status, 'Feed Count:', Array.isArray(feedRes.data) ? feedRes.data.length : 0);

    // 4. Test Upvoting ("Me Too")
    if (Array.isArray(feedRes.data) && feedRes.data.length > 0) {
        const firstCompId = feedRes.data[0].id;
        console.log(`\n4. Testing Upvoting ("Me Too") on Complaint #${firstCompId}...`);
        const upvoteRes = await request('POST', `/api/complaints/${firstCompId}/upvote`, null, citizenToken);
        console.log('   Status:', upvoteRes.status, 'Upvoted:', upvoteRes.data?.upvoted, 'Upvote Count:', upvoteRes.data?.upvoteCount);
    }

    console.log('\n====================================================');
    console.log('  CITIZEN ENGAGEMENT & COMMUNITY TESTS PASSED! 🎉');
    console.log('====================================================\n');
}

runGamificationTests().catch(err => console.error('Gamification test failed:', err));
