const http = require('http');

// Boot the server
require('./server');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function request(method, pathUrl, data, token) {
    return new Promise((resolve, reject) => {
        let headers = {};
        let bodyBuffer = null;

        if (data) {
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

async function runAnalyticsTests() {
    console.log('=== CIVICFIX MUNICIPAL ANALYTICS & CHARTS TEST SUITE ===\n');
    await sleep(600);

    // 1. Admin Login
    console.log('1. Logging in as Admin...');
    const adminLoginRes = await request('POST', '/api/auth/admin-login', {
        email: 'admin@civicfix.com',
        password: '25mx317334'
    });
    const adminToken = adminLoginRes.data?.token;
    console.log('   Admin token acquired:', !!adminToken);
    if (!adminToken) throw new Error('Failed to login as admin: ' + JSON.stringify(adminLoginRes.data));

    // 2. Fetch Admin Analytics
    console.log('\n2. Testing GET /api/admin/analytics...');
    const adminAnalyticsRes = await request('GET', '/api/admin/analytics', null, adminToken);
    console.log('   Status code:', adminAnalyticsRes.status);
    const analytics = adminAnalyticsRes.data?.analytics;
    if (!analytics) throw new Error('No analytics data returned in response: ' + JSON.stringify(adminAnalyticsRes.data));

    console.log('\n--- KPI Summary ---');
    console.log('   Total Complaints:', analytics.summary.totalComplaints);
    console.log('   Top Reported Area:', analytics.summary.topReportedArea, `(${analytics.summary.topReportedAreaCount} reports)`);
    console.log('   Top Potential Department:', analytics.summary.topPotentialDept, `(${analytics.summary.topReplyRate}% Reply Rate, Score: ${analytics.summary.topPotentialScore}/100)`);

    // Validate Area Analytics ("Which area is reported the most")
    console.log('\n--- Area Analytics (Which Area is Reported the Most) ---');
    const areas = analytics.areaAnalytics.areas;
    console.log(`   Found ${areas.length} distinct municipal areas:`);
    for (const a of areas.slice(0, 5)) {
        console.log(`   - ${a.area}: ${a.total} reports (${a.percentage}%), Resolved: ${a.resolved} (${a.resolutionRate}%)`);
    }
    if (areas.length === 0) throw new Error('Areas list is empty!');
    if (!analytics.areaAnalytics.chartData.labels || analytics.areaAnalytics.chartData.labels.length === 0) {
        throw new Error('Area chart data labels missing!');
    }
    console.log('   [PASS] Area report frequencies and chart datasets validated!');

    // Validate Department Reply Rate & Potential ("Which department respond to user with full potential")
    console.log('\n--- Department Response & Reply Rate Benchmark ---');
    const depts = analytics.departmentPerformance.departments;
    console.log(`   Benchmarking ${depts.length} municipal departments:`);
    for (const d of depts) {
        console.log(`   - ${d.name}: Total ${d.total}, Reply Rate: ${d.replyRate}%, Resolved: ${d.resolved}, Potential: ${d.potentialScore}/100 [${d.potentialGrade}]`);
    }
    if (depts.length === 0) throw new Error('Departments list is empty!');
    const hasReplyRate = depts.some(d => typeof d.replyRate === 'number');
    if (!hasReplyRate) throw new Error('Reply rates missing from department performance!');
    console.log('   [PASS] Department reply rates and full potential scores validated!');

    // Validate Area vs Department Cross Breakdown ("Which area gets more report and reported to which dept")
    console.log('\n--- Area vs Department Cross Breakdown (Admin Specific) ---');
    const crossMatrix = analytics.areaDepartmentCross.matrix;
    console.log(`   Cross Matrix Breakdown for Top Areas:`);
    for (const m of crossMatrix.slice(0, 4)) {
        console.log(`   - Area "${m.area}" (${m.totalReports} total reports):`);
        console.log(`     Primary Route: ${m.primaryDepartment} (${m.primaryDepartmentCount} issues)`);
        for (const db of m.departmentBreakdown) {
            console.log(`       * ${db.department}: ${db.count} reports (${db.share}%)`);
        }
    }
    if (crossMatrix.length === 0) throw new Error('Area vs Department cross-matrix is empty!');
    if (!analytics.areaDepartmentCross.datasets || analytics.areaDepartmentCross.datasets.length === 0) {
        throw new Error('Stacked bar cross-datasets missing!');
    }
    console.log('   [PASS] Area-to-Department stacked datasets and cross-matrix validated!');

    // 3. Staff Login & Analytics Check
    console.log('\n3. Logging in as Staff Officer...');
    const staffLoginRes = await request('POST', '/api/auth/staff-login', {
        email: 'officer@civicfix.com',
        password: 'Password12'
    });
    let staffToken = staffLoginRes.data?.token;

    // If existing officer login fails, register a temporary test staff officer
    if (!staffToken) {
        const testEmail = `staff_analytics_${Date.now()}@civicfix.com`;
        const regRes = await request('POST', '/api/auth/staff-register', {
            name: 'Analytics Officer',
            email: testEmail,
            phone: '9840223344',
            department: 'Road Works & Infrastructure',
            designation: 'Ward Inspector',
            password: 'Password123'
        });
        staffToken = regRes.data?.token;
    }
    console.log('   Staff token acquired:', !!staffToken);

    console.log('\n4. Testing GET /api/staff/analytics...');
    const staffAnalyticsRes = await request('GET', '/api/staff/analytics', null, staffToken);
    console.log('   Status code:', staffAnalyticsRes.status);
    console.log('   Staff department recognized:', staffAnalyticsRes.data?.staffDepartment);
    console.log('   Staff department performance stats:', {
        name: staffAnalyticsRes.data?.myDeptStats?.name,
        replyRate: staffAnalyticsRes.data?.myDeptStats?.replyRate + '%',
        potentialScore: staffAnalyticsRes.data?.myDeptStats?.potentialScore + '/100',
        grade: staffAnalyticsRes.data?.myDeptStats?.potentialGrade
    });
    console.log('   Citywide area analytics included for staff:', !!staffAnalyticsRes.data?.analytics?.areaAnalytics);
    console.log('   Citywide dept reply rates included for staff:', !!staffAnalyticsRes.data?.analytics?.departmentPerformance);

    if (!staffAnalyticsRes.data?.analytics?.areaAnalytics || !staffAnalyticsRes.data?.analytics?.departmentPerformance) {
        throw new Error('Staff analytics missing municipal charts data!');
    }
    console.log('   [PASS] Staff department analytics and benchmarks successfully validated!');

    console.log('\n=== ALL MUNICIPAL ANALYTICS & CHART TESTS PASSED! ===\n');
    process.exit(0);
}

runAnalyticsTests().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
