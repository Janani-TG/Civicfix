/**
 * CivicFix - Municipal Report Exporter
 * Supports high-definition Visual Print/PDF, Excel (CSV), and Word Document (.doc) formats.
 * Designed for Coimbatore City Municipal Corporation (CCMC)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CivicFixReportExporter = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    function getFormattedDate() {
        return new Date().toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getReportId() {
        return 'CF-REP-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    }

    function getCanvasBase64(canvasId) {
        if (!canvasId) return null;
        try {
            const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
            if (canvas && typeof canvas.toDataURL === 'function') {
                return canvas.toDataURL('image/png', 1.0);
            }
        } catch (e) {
            console.warn('Canvas toDataURL warning:', e);
        }
        return null;
    }

    function escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function escapeCsv(field) {
        if (field === null || field === undefined) return '""';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return '"' + str + '"';
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 300);
    }

    // ========================================================
    // 1. PRINT / PDF VISUALIZATION REPORT
    // ========================================================
    function generatePrintReport(analytics, context) {
        if (!analytics) return;

        const summary = analytics.summary || {};
        const areas = (analytics.areaAnalytics && analytics.areaAnalytics.areas) || [];
        const depts = (analytics.departmentPerformance && analytics.departmentPerformance.departments) || [];
        const crossMatrix = (analytics.areaDepartmentCross && analytics.areaDepartmentCross.matrix) || [];
        const isAdmin = context.userRole === 'admin';

        const areaChartImg = getCanvasBase64(context.areaCanvasId);
        const deptChartImg = getCanvasBase64(context.deptCanvasId);
        const crossChartImg = isAdmin ? getCanvasBase64(context.crossCanvasId) : null;

        const reportDate = getFormattedDate();
        const reportCode = getReportId();
        const officerName = context.userName || (isAdmin ? 'Municipal Administrator' : 'Staff Officer');
        const officerRole = isAdmin ? 'Civil Oversight / Administrator' : (context.userDepartment || 'Municipal Personnel');

        const resolutionRate = summary.totalComplaints > 0
            ? Math.round((summary.resolvedComplaints / summary.totalComplaints) * 100)
            : 0;

        const activeDepts = depts.filter(d => d.total > 0);
        const avgReplyRate = activeDepts.length > 0
            ? Math.round(activeDepts.reduce((acc, d) => acc + d.replyRate, 0) / activeDepts.length)
            : 100;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>CivicFix - Official Municipal Analytics Report (${reportCode})</title>
    <style>
        @page {
            size: A4;
            margin: 14mm 12mm;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 24px;
            font-size: 13px;
            line-height: 1.5;
        }
        .report-page {
            max-width: 860px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 32px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
        }
        .header-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 20px;
            border-bottom: 3px double #cbd5e1;
            margin-bottom: 24px;
        }
        .header-left {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .emblem-badge {
            width: 52px;
            height: 52px;
            border-radius: 12px;
            background: linear-gradient(135deg, #1d4ed8, #2563eb);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            font-weight: 800;
        }
        .header-title h1 {
            font-size: 19px;
            font-weight: 800;
            margin: 0;
            color: #0f172a;
            letter-spacing: -0.3px;
        }
        .header-title p {
            font-size: 11px;
            color: #64748b;
            margin: 3px 0 0;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .report-meta {
            text-align: right;
            font-size: 11px;
            color: #475569;
        }
        .report-meta strong {
            color: #0f172a;
            display: block;
            font-size: 12px;
        }
        .report-badge {
            display: inline-block;
            background: #eff6ff;
            color: #1d4ed8;
            font-weight: 700;
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 6px;
            margin-bottom: 4px;
            border: 1px solid #bfdbfe;
            text-transform: uppercase;
        }
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 28px;
        }
        .kpi-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px;
        }
        .kpi-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 4px;
            display: block;
        }
        .kpi-val {
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.2;
        }
        .kpi-sub {
            font-size: 11px;
            color: #64748b;
            margin-top: 3px;
            display: block;
        }
        .section-box {
            margin-bottom: 28px;
            page-break-inside: avoid;
        }
        .section-title {
            font-size: 14px;
            font-weight: 800;
            color: #0f172a;
            border-left: 4px solid #2563eb;
            padding-left: 10px;
            margin: 0 0 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .section-desc {
            font-size: 11px;
            color: #64748b;
            font-weight: 400;
        }
        .chart-img-container {
            text-align: center;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px;
            margin-bottom: 14px;
        }
        .chart-img-container img {
            max-width: 100%;
            height: auto;
            max-height: 220px;
            object-fit: contain;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            overflow: hidden;
        }
        th {
            background: #f1f5f9;
            color: #475569;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.5px;
            padding: 8px 12px;
            border-bottom: 1px solid #cbd5e1;
            text-align: left;
        }
        td {
            padding: 8px 12px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
        }
        tr:last-child td {
            border-bottom: none;
        }
        .pill {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 9999px;
            font-size: 10px;
            font-weight: 700;
        }
        .pill-green { background: #dcfce7; color: #15803d; }
        .pill-blue { background: #dbeafe; color: #1d4ed8; }
        .pill-purple { background: #f3e8ff; color: #7e22ce; }
        .pill-amber { background: #fef3c7; color: #b45309; }
        .pill-rose { background: #ffe4e6; color: #be123c; }

        .footer-signatures {
            margin-top: 36px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
        }
        .sig-box {
            width: 30%;
            text-align: center;
        }
        .sig-line {
            border-bottom: 1px solid #94a3b8;
            height: 36px;
            margin-bottom: 6px;
        }
        .sig-title {
            font-size: 11px;
            font-weight: 700;
            color: #334155;
        }
        .sig-dept {
            font-size: 10px;
            color: #64748b;
        }
        .no-print {
            position: fixed;
            top: 14px;
            right: 14px;
            z-index: 9999;
            display: flex;
            gap: 10px;
            background: rgba(15, 23, 42, 0.85);
            padding: 10px 14px;
            border-radius: 12px;
            backdrop-filter: blur(8px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }
        .btn-print {
            background: #2563eb;
            color: #ffffff;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .btn-close {
            background: rgba(255, 255, 255, 0.15);
            color: #ffffff;
            border: none;
            padding: 8px 14px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
        }
        @media print {
            body {
                background: #ffffff;
                padding: 0;
            }
            .report-page {
                border: none;
                box-shadow: none;
                padding: 0;
                max-width: 100%;
            }
            .no-print {
                display: none !important;
            }
        }
    </style>
</head>
<body>

    <!-- Floating Action Toolbar -->
    <div class="no-print">
        <button class="btn-print" onclick="window.print()">
            <span>🖨️ Print / Save PDF</span>
        </button>
        <button class="btn-close" onclick="window.close()">✕ Close</button>
    </div>

    <div class="report-page">
        
        <!-- Header -->
        <div class="header-bar">
            <div class="header-left">
                <div class="emblem-badge">🏛️</div>
                <div class="header-title">
                    <h1>COIMBATORE CITY MUNICIPAL CORPORATION</h1>
                    <p>CivicFix Municipal Grievance Redressal & Intelligence Portal</p>
                </div>
            </div>
            <div class="report-meta">
                <span class="report-badge">Official Audit Report</span>
                <strong>Ref: ${reportCode}</strong>
                <div>Generated: ${reportDate}</div>
                <div>Authorized: ${escapeXml(officerName)} (${escapeXml(officerRole)})</div>
            </div>
        </div>

        <!-- 4 KPI Summary Cards -->
        <div class="kpi-grid">
            <div class="kpi-card">
                <span class="kpi-label">Total Grievances</span>
                <div class="kpi-val" style="color:#2563eb;">${summary.totalComplaints || 0}</div>
                <span class="kpi-sub">${summary.resolvedComplaints || 0} Resolved (${resolutionRate}%)</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Most Reported Area</span>
                <div class="kpi-val" style="color:#e11d48;">${escapeXml(summary.topReportedArea || 'Gandhipuram')}</div>
                <span class="kpi-sub">${summary.topReportedAreaCount || 0} reports (${summary.totalComplaints > 0 ? Math.round((summary.topReportedAreaCount / summary.totalComplaints) * 100) : 0}% share)</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Top Potential Dept</span>
                <div class="kpi-val" style="color:#059669;">${escapeXml(summary.topPotentialDept || 'Electrical')}</div>
                <span class="kpi-sub">${summary.topReplyRate || 100}% Reply (Score: ${summary.topPotentialScore || 100}/100)</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Avg City Reply Rate</span>
                <div class="kpi-val" style="color:#7c3aed;">${avgReplyRate}%</div>
                <span class="kpi-sub">Prompt civic action</span>
            </div>
        </div>

        <!-- SECTION 1: WHICH AREA IS REPORTED THE MOST -->
        <div class="section-box">
            <div class="section-title">
                <span>1. Grievance Density by Municipal Locality (Top Reported Areas)</span>
                <span class="section-desc">Identifies city areas generating the highest civic complaints</span>
            </div>
            
            ${areaChartImg ? `
            <div class="chart-img-container">
                <img src="${areaChartImg}" alt="Area Report Density Visualization">
            </div>
            ` : ''}

            <table>
                <thead>
                    <tr>
                        <th style="width: 50px;">Rank</th>
                        <th>Municipal Area / Locality</th>
                        <th style="text-align: right;">Total Reports</th>
                        <th style="text-align: right;">City Share (%)</th>
                        <th style="text-align: right;">Resolved</th>
                        <th style="text-align: right;">Resolution Rate</th>
                    </tr>
                </thead>
                <tbody>
                    ${areas.map((a, i) => `
                        <tr>
                            <td style="font-weight: 700; color: #64748b;">#${i + 1}</td>
                            <td style="font-weight: 700; color: #0f172a;">${escapeXml(a.area)}</td>
                            <td style="text-align: right; font-weight: 800; font-family: monospace;">${a.total}</td>
                            <td style="text-align: right; font-weight: 700; color: #2563eb;">${a.percentage}%</td>
                            <td style="text-align: right; font-weight: 700; color: #16a34a;">${a.resolved}</td>
                            <td style="text-align: right;">
                                <span class="pill ${a.resolutionRate >= 70 ? 'pill-green' : a.resolutionRate >= 40 ? 'pill-blue' : 'pill-amber'}">
                                    ${a.resolutionRate}%
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- SECTION 2: WHICH DEPARTMENT RESPONDS WITH FULL POTENTIAL -->
        <div class="section-box">
            <div class="section-title">
                <span>2. Department Responsiveness & Full Potential (Reply Rate Benchmark)</span>
                <span class="section-desc">Reply Rate (60%) + Verified Resolution Rate (40%)</span>
            </div>

            ${deptChartImg ? `
            <div class="chart-img-container">
                <img src="${deptChartImg}" alt="Department Potential and Reply Rate Visualization">
            </div>
            ` : ''}

            <table>
                <thead>
                    <tr>
                        <th>Department</th>
                        <th style="text-align: right;">Total Assigned</th>
                        <th style="text-align: right;">Replied / Action</th>
                        <th style="text-align: right;">Reply Rate (%)</th>
                        <th style="text-align: right;">Resolved</th>
                        <th style="text-align: right;">Potential Score</th>
                        <th>Rating Level</th>
                    </tr>
                </thead>
                <tbody>
                    ${depts.map(d => `
                        <tr>
                            <td style="font-weight: 700; color: #0f172a;">${escapeXml(d.name)}</td>
                            <td style="text-align: right; font-family: monospace;">${d.total}</td>
                            <td style="text-align: right; font-family: monospace;">${d.responded}</td>
                            <td style="text-align: right; font-weight: 800; color: #2563eb;">${d.replyRate}%</td>
                            <td style="text-align: right; font-weight: 700; color: #16a34a;">${d.resolved}</td>
                            <td style="text-align: right; font-weight: 800; color: #7c3aed;">${d.potentialScore}/100</td>
                            <td>
                                <span class="pill ${d.potentialScore >= 80 ? 'pill-green' : d.potentialScore >= 60 ? 'pill-blue' : d.potentialScore > 0 ? 'pill-amber' : 'pill-rose'}">
                                    ${d.potentialGrade} ${escapeXml(d.potentialBadge)}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- SECTION 3: AREA vs DEPT CROSS BREAKDOWN (ADMIN ONLY) -->
        ${isAdmin && crossMatrix.length > 0 ? `
        <div class="section-box">
            <div class="section-title">
                <span>3. Area &rarr; Department Cross-Distribution Matrix</span>
                <span class="section-desc">Identifies which areas generate complaints and to which departments they route</span>
            </div>

            ${crossChartImg ? `
            <div class="chart-img-container">
                <img src="${crossChartImg}" alt="Area to Department Distribution Visualization">
            </div>
            ` : ''}

            <table>
                <thead>
                    <tr>
                        <th>Area / Locality</th>
                        <th style="text-align: right;">Total Reports</th>
                        <th>Primary Routed Department</th>
                        <th>Complete Department Breakdown</th>
                    </tr>
                </thead>
                <tbody>
                    ${crossMatrix.map(m => {
                        const breakdownStr = m.departmentBreakdown.map(db => 
                            `<span class="pill pill-blue" style="margin-right: 4px; margin-bottom: 2px;">${escapeXml(db.department)}: <strong>${db.count}</strong> (${db.share}%)</span>`
                        ).join('');

                        return `
                        <tr>
                            <td style="font-weight: 700; color: #0f172a;">${escapeXml(m.area)}</td>
                            <td style="text-align: right; font-weight: 800; font-family: monospace;">${m.totalReports}</td>
                            <td>
                                <strong style="color: #1d4ed8;">${escapeXml(m.primaryDepartment)}</strong>
                                <span style="color: #64748b; font-size: 10px;">(${m.primaryDepartmentCount} issues)</span>
                            </td>
                            <td>${breakdownStr}</td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <!-- Official Certification Footer -->
        <div class="footer-signatures">
            <div class="sig-box">
                <div class="sig-line"></div>
                <div class="sig-title">Grievance Audit Officer</div>
                <div class="sig-dept">City Operations Room</div>
            </div>
            <div class="sig-box">
                <div class="sig-line"></div>
                <div class="sig-title">Zonal Executive Engineer</div>
                <div class="sig-dept">Department Oversight</div>
            </div>
            <div class="sig-box">
                <div class="sig-line"></div>
                <div class="sig-title">Municipal Commissioner</div>
                <div class="sig-dept">Coimbatore City Municipal Corp.</div>
            </div>
        </div>

    </div>

</body>
</html>`;

        const printWindow = window.open('', '_blank', 'width=950,height=850');
        if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
        } else {
            alert('Please allow popups to open the printable municipal report.');
        }
    }

    // ========================================================
    // 2. EXCEL / CSV REPORT GENERATOR (.csv)
    // ========================================================
    function generateCsvReport(analytics, context) {
        if (!analytics) return;

        const summary = analytics.summary || {};
        const areas = (analytics.areaAnalytics && analytics.areaAnalytics.areas) || [];
        const depts = (analytics.departmentPerformance && analytics.departmentPerformance.departments) || [];
        const crossMatrix = (analytics.areaDepartmentCross && analytics.areaDepartmentCross.matrix) || [];
        const isAdmin = context.userRole === 'admin';

        const lines = [];

        // Header Title Banner
        lines.push('COIMBATORE CITY MUNICIPAL CORPORATION - CIVICFIX MUNICIPAL INTELLIGENCE REPORT');
        lines.push(`Report Reference: ${getReportId()},Generated On: ${getFormattedDate()}`);
        lines.push(`Authorized User: ${context.userName || 'Municipal Personnel'},Role: ${context.userRole || 'Staff'}`);
        lines.push('');

        // Section 1: Executive KPI Summary
        lines.push('SECTION 1: EXECUTIVE KPI SUMMARY');
        lines.push('Metric,Value,Note');
        lines.push(`Total Grievances,${summary.totalComplaints || 0},All municipal categories`);
        lines.push(`Resolved Complaints,${summary.resolvedComplaints || 0},Tickets verified closed`);
        lines.push(`In Progress Complaints,${summary.inProgressComplaints || 0},Under active execution`);
        lines.push(`Received Complaints,${summary.receivedComplaints || 0},Awaiting initial resolution`);
        lines.push(`Most Reported Area,${escapeCsv(summary.topReportedArea || 'Gandhipuram')},${summary.topReportedAreaCount || 0} reports`);
        lines.push(`Highest Potential Department,${escapeCsv(summary.topPotentialDept || 'N/A')},Score: ${summary.topPotentialScore || 100}/100 (${summary.topReplyRate || 100}% Reply Rate)`);
        lines.push('');

        // Section 2: Area Grievance Density
        lines.push('SECTION 2: GRIEVANCE DENSITY BY MUNICIPAL LOCALITY (WHICH AREA IS REPORTED MOST)');
        lines.push('Rank,Locality / Ward,Total Grievances Reported,Share of City Total (%),Resolved Complaints,Resolution Rate (%)');
        areas.forEach((a, idx) => {
            lines.push([
                `#${idx + 1}`,
                escapeCsv(a.area),
                a.total,
                `${a.percentage}%`,
                a.resolved,
                `${a.resolutionRate}%`
            ].join(','));
        });
        lines.push('');

        // Section 3: Department Responsiveness & Reply Rate Benchmark
        lines.push('SECTION 3: DEPARTMENT RESPONSIVENESS & FULL POTENTIAL BENCHMARK');
        lines.push('Department Name,Total Assigned Complaints,Responded / Acted,Reply Rate (%),Resolved Count,Resolution Rate (%),Full Potential Score (0-100),Performance Rating,Active Personnel,Avg Response Hours');
        depts.forEach(d => {
            lines.push([
                escapeCsv(d.name),
                d.total,
                d.responded,
                `${d.replyRate}%`,
                d.resolved,
                `${d.resolutionRate}%`,
                `${d.potentialScore}/100`,
                escapeCsv(`${d.potentialGrade} ${d.potentialBadge}`),
                d.activeStaff,
                d.avgResponseHours
            ].join(','));
        });
        lines.push('');

        // Section 4 (Admin): Area to Department Cross Distribution
        if (isAdmin && crossMatrix.length > 0) {
            lines.push('SECTION 4: AREA TO DEPARTMENT CROSS DISTRIBUTION MATRIX');
            lines.push('Locality / Ward,Total Reports,Primary Routing Department,Primary Route Count,Department Breakdown Details');
            crossMatrix.forEach(m => {
                const breakdownSummary = m.departmentBreakdown.map(db => `${db.department}: ${db.count} (${db.share}%)`).join('; ');
                lines.push([
                    escapeCsv(m.area),
                    m.totalReports,
                    escapeCsv(m.primaryDepartment),
                    m.primaryDepartmentCount,
                    escapeCsv(breakdownSummary)
                ].join(','));
            });
            lines.push('');
        }

        const csvContent = lines.join('\r\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const filename = `CivicFix_Municipal_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        downloadBlob(blob, filename);
    }

    // ========================================================
    // 3. WORD DOCUMENT REPORT GENERATOR (.doc)
    // ========================================================
    function generateDocReport(analytics, context) {
        if (!analytics) return;

        const summary = analytics.summary || {};
        const areas = (analytics.areaAnalytics && analytics.areaAnalytics.areas) || [];
        const depts = (analytics.departmentPerformance && analytics.departmentPerformance.departments) || [];
        const crossMatrix = (analytics.areaDepartmentCross && analytics.areaDepartmentCross.matrix) || [];
        const isAdmin = context.userRole === 'admin';

        const areaChartImg = getCanvasBase64(context.areaCanvasId);
        const deptChartImg = getCanvasBase64(context.deptCanvasId);
        const crossChartImg = isAdmin ? getCanvasBase64(context.crossCanvasId) : null;

        const reportDate = getFormattedDate();
        const reportCode = getReportId();
        const officerName = context.userName || (isAdmin ? 'Municipal Administrator' : 'Staff Officer');
        const officerRole = isAdmin ? 'Civil Oversight / Administrator' : (context.userDepartment || 'Municipal Personnel');

        const resolutionRate = summary.totalComplaints > 0
            ? Math.round((summary.resolvedComplaints / summary.totalComplaints) * 100)
            : 0;

        const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <title>CivicFix Municipal Performance Document</title>
    <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.4; }
        h1 { font-size: 16pt; color: #1e3a8a; margin: 0 0 4pt; }
        h2 { font-size: 13pt; color: #1d4ed8; margin: 16pt 0 6pt; border-bottom: 2pt solid #bfdbfe; padding-bottom: 3pt; }
        .meta-table { width: 100%; border: none; margin-bottom: 14pt; }
        .meta-table td { border: none; padding: 2pt 0; font-size: 10pt; color: #475569; }
        .data-table { width: 100%; border-collapse: collapse; margin-top: 6pt; margin-bottom: 14pt; }
        .data-table th { background-color: #f1f5f9; color: #1e293b; font-weight: bold; border: 1pt solid #cbd5e1; padding: 6pt 8pt; text-align: left; font-size: 10pt; }
        .data-table td { border: 1pt solid #e2e8f0; padding: 5pt 8pt; font-size: 10pt; color: #334155; }
        .badge { background: #dbeafe; color: #1d4ed8; font-weight: bold; padding: 2pt 6pt; border-radius: 4pt; }
        .center { text-align: center; }
        .right { text-align: right; }
    </style>
</head>
<body>
    <h1>COIMBATORE CITY MUNICIPAL CORPORATION</h1>
    <div style="color: #64748b; font-size: 10pt; font-weight: bold; margin-bottom: 12pt;">
        CIVICFIX MUNICIPAL GRIEVANCE REDRESSAL & INTELLIGENCE PORTAL
    </div>

    <table class="meta-table">
        <tr>
            <td><strong>Document Ref:</strong> ${reportCode}</td>
            <td class="right"><strong>Generated:</strong> ${reportDate}</td>
        </tr>
        <tr>
            <td><strong>Authorized User:</strong> ${escapeXml(officerName)}</td>
            <td class="right"><strong>Role / Dept:</strong> ${escapeXml(officerRole)}</td>
        </tr>
    </table>

    <table class="data-table" style="background-color: #f8fafc; margin-bottom: 16pt;">
        <tr>
            <td><strong>Total Complaints:</strong> ${summary.totalComplaints || 0}</td>
            <td><strong>Resolved Tickets:</strong> ${summary.resolvedComplaints || 0} (${resolutionRate}%)</td>
            <td><strong>Most Reported Area:</strong> ${escapeXml(summary.topReportedArea || 'Gandhipuram')}</td>
            <td><strong>Top Potential Dept:</strong> ${escapeXml(summary.topPotentialDept || 'N/A')} (${summary.topReplyRate || 100}%)</td>
        </tr>
    </table>

    <h2>1. Locality Grievance Density (Which Area is Reported the Most)</h2>
    ${areaChartImg ? `<p class="center"><img src="${areaChartImg}" width="600" style="max-width: 100%; height: auto;"></p>` : ''}
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 40pt;">Rank</th>
                <th>Municipal Area / Locality</th>
                <th class="right">Total Reports</th>
                <th class="right">Share (%)</th>
                <th class="right">Resolved</th>
                <th class="right">Resolution Rate</th>
            </tr>
        </thead>
        <tbody>
            ${areas.map((a, i) => `
                <tr>
                    <td>#${i + 1}</td>
                    <td><strong>${escapeXml(a.area)}</strong></td>
                    <td class="right">${a.total}</td>
                    <td class="right">${a.percentage}%</td>
                    <td class="right">${a.resolved}</td>
                    <td class="right">${a.resolutionRate}%</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <h2>2. Department Responsiveness & Full Potential (Reply Rate Benchmark)</h2>
    ${deptChartImg ? `<p class="center"><img src="${deptChartImg}" width="600" style="max-width: 100%; height: auto;"></p>` : ''}
    <table class="data-table">
        <thead>
            <tr>
                <th>Department</th>
                <th class="right">Total Reports</th>
                <th class="right">Responded</th>
                <th class="right">Reply Rate (%)</th>
                <th class="right">Resolved</th>
                <th class="right">Potential Score</th>
                <th>Rating</th>
            </tr>
        </thead>
        <tbody>
            ${depts.map(d => `
                <tr>
                    <td><strong>${escapeXml(d.name)}</strong></td>
                    <td class="right">${d.total}</td>
                    <td class="right">${d.responded}</td>
                    <td class="right"><strong>${d.replyRate}%</strong></td>
                    <td class="right">${d.resolved}</td>
                    <td class="right"><strong>${d.potentialScore}/100</strong></td>
                    <td>${d.potentialGrade} ${escapeXml(d.potentialBadge)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    ${isAdmin && crossMatrix.length > 0 ? `
    <h2>3. Area to Department Cross-Distribution Matrix</h2>
    ${crossChartImg ? `<p class="center"><img src="${crossChartImg}" width="600" style="max-width: 100%; height: auto;"></p>` : ''}
    <table class="data-table">
        <thead>
            <tr>
                <th>Locality / Ward</th>
                <th class="right">Total Reports</th>
                <th>Primary Routed Department</th>
                <th>Complete Department Breakdown</th>
            </tr>
        </thead>
        <tbody>
            ${crossMatrix.map(m => {
                const breakdownSummary = m.departmentBreakdown.map(db => `${db.department}: ${db.count} (${db.share}%)`).join('; ');
                return `
                <tr>
                    <td><strong>${escapeXml(m.area)}</strong></td>
                    <td class="right">${m.totalReports}</td>
                    <td>${escapeXml(m.primaryDepartment)} (${m.primaryDepartmentCount})</td>
                    <td>${escapeXml(breakdownSummary)}</td>
                </tr>
                `;
            }).join('')}
        </tbody>
    </table>
    ` : ''}

    <br><br>
    <table style="width: 100%; border: none; margin-top: 30pt;">
        <tr>
            <td class="center" style="border: none; width: 33%;">
                ___________________________<br>
                <strong>Grievance Audit Officer</strong><br>
                <span style="font-size: 9pt; color: #64748b;">City Redressal Desk</span>
            </td>
            <td class="center" style="border: none; width: 33%;">
                ___________________________<br>
                <strong>Zonal Executive Engineer</strong><br>
                <span style="font-size: 9pt; color: #64748b;">Department Oversight</span>
            </td>
            <td class="center" style="border: none; width: 33%;">
                ___________________________<br>
                <strong>Municipal Commissioner</strong><br>
                <span style="font-size: 9pt; color: #64748b;">CCMC Coimbatore</span>
            </td>
        </tr>
    </table>
</body>
</html>`;

        const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
        const filename = `CivicFix_Municipal_Report_${new Date().toISOString().slice(0, 10)}.doc`;
        downloadBlob(blob, filename);
    }

    return {
        generatePrintReport,
        generateCsvReport,
        generateDocReport,
        exportReport: function (format, analytics, context) {
            if (format === 'excel' || format === 'csv') {
                return generateCsvReport(analytics, context);
            } else if (format === 'doc' || format === 'word') {
                return generateDocReport(analytics, context);
            } else {
                return generatePrintReport(analytics, context);
            }
        }
    };
}));
