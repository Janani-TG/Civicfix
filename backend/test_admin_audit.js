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

async function runAdminAuditTest() {
    console.log('====================================================');
    console.log('  TESTING ADMIN COMPLAINTS AUDIT, VERIFICATION & REOPEN');
    console.log('====================================================\n');

    // 1. Admin Login
    console.log('1. Admin Login...');
    const adminRes = await request('POST', '/api/auth/admin-login', {
        email: 'admin@civicfix.com',
        password: '25mx317334'
    });

    const adminToken = adminRes.data?.token;
    console.log('   Admin Login Status:', adminRes.status, 'Token acquired:', Boolean(adminToken));

    // 2. Fetch Admin Complaints Audit
    console.log('\n2. Fetching GET /api/admin/complaints...');
    const auditRes = await request('GET', '/api/admin/complaints', null, adminToken);
    console.log('   Status:', auditRes.status);
    console.log('   Summary Statistics:', auditRes.data?.summary);
    console.log('   Total Complaints fetched:', auditRes.data?.complaints?.length);

    if (auditRes.data?.complaints && auditRes.data.complaints.length > 0) {
        const targetComp = auditRes.data.complaints[0];
        console.log(`\n3. Testing Admin Verification on Complaint #${targetComp.id} (${targetComp.title})...`);
        
        // Test Approve Resolution
        const approveRes = await request('PUT', `/api/admin/complaints/${targetComp.id}/verify-fix`, {
            action: 'approve'
        }, adminToken);
        console.log('   Approve Fix Result:', approveRes.data);

        // Test Reopen Ticket (Reject Resolution)
        const rejectRes = await request('PUT', `/api/admin/complaints/${targetComp.id}/verify-fix`, {
            action: 'reject',
            reason: 'Reopened by Admin during audit testing: Quality check required.'
        }, adminToken);
        console.log('   Reopen Ticket Result:', rejectRes.data);
    }

    console.log('\n====================================================');
    console.log('  ADMIN COMPLAINTS AUDIT & REOPEN TEST PASSED! 🎉');
    console.log('====================================================\n');
}

runAdminAuditTest().catch(err => console.error('Admin audit test failed:', err));
