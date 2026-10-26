const fs = require('fs');
const path = require('path');
const Exporter = require('../frontend/js/report-exporter');
const { getMunicipalAnalytics } = require('./analytics_helper');

async function testReportExports() {
    console.log('=== TESTING REPORT EXPORTS (PRINT/PDF, EXCEL, WORD DOC) ===\n');

    const analytics = getMunicipalAnalytics();
    console.log('1. Acquired municipal analytics data successfully.');

    const adminContext = {
        userRole: 'admin',
        userName: 'Administrator Anand',
        userDepartment: 'Municipal Oversight',
        areaCanvasId: null,
        deptCanvasId: null,
        crossCanvasId: null
    };

    const staffContext = {
        userRole: 'staff',
        userName: 'Inspector Ramesh',
        userDepartment: 'Road Works & Infrastructure',
        areaCanvasId: null,
        deptCanvasId: null
    };

    // Test CSV generation
    console.log('\n2. Testing CSV / Excel generator...');
    let downloadedFilename = '';
    let downloadedContent = '';

    // Mock global Blob and download
    global.Blob = class MockBlob {
        constructor(parts, options) {
            this.content = parts.join('');
            this.type = options?.type;
        }
    };
    global.URL = {
        createObjectURL: (blob) => {
            downloadedContent = blob.content;
            return 'blob://mock-export-url';
        },
        revokeObjectURL: () => {}
    };
    global.document = {
        body: {
            appendChild: () => {},
            removeChild: () => {}
        },
        createElement: (tag) => {
            return {
                click: function() {
                    downloadedFilename = this.download;
                }
            };
        }
    };

    Exporter.exportReport('excel', analytics, adminContext);
    console.log('   Excel/CSV Filename:', downloadedFilename);
    console.log('   Content Length:', downloadedContent.length, 'chars');
    const hasHeader = downloadedContent.includes('COIMBATORE CITY MUNICIPAL CORPORATION');
    const hasAreas = downloadedContent.includes('Gandhipuram');
    const hasDepts = downloadedContent.includes('Road Works & Infrastructure');
    const hasCross = downloadedContent.includes('AREA TO DEPARTMENT CROSS DISTRIBUTION MATRIX');

    console.log('   - Has Header Banner:', hasHeader);
    console.log('   - Has Area Frequency Data:', hasAreas);
    console.log('   - Has Department Reply Rates:', hasDepts);
    console.log('   - Has Cross Matrix Breakdown:', hasCross);

    if (!hasHeader || !hasAreas || !hasDepts || !hasCross) {
        throw new Error('CSV export content validation failed!');
    }
    console.log('   [PASS] CSV / Excel Export generated valid multi-section tabular data!');

    // Test Word Document (.doc) generation
    console.log('\n3. Testing Word Document (.doc) generator...');
    downloadedFilename = '';
    downloadedContent = '';

    Exporter.exportReport('doc', analytics, adminContext);
    console.log('   Doc Filename:', downloadedFilename);
    console.log('   Content Length:', downloadedContent.length, 'chars');
    const hasDocHtml = downloadedContent.includes('xmlns:w="urn:schemas-microsoft-com:office:word"');
    const hasDocTable = downloadedContent.includes('<table class="data-table"');
    const hasDocAreas = downloadedContent.includes('Locality Grievance Density');
    const hasDocDepts = downloadedContent.includes('Department Responsiveness & Full Potential');

    console.log('   - Has MS Word XML Declaration:', hasDocHtml);
    console.log('   - Has Formatted Tables:', hasDocTable);
    console.log('   - Has Area Breakdown Table:', hasDocAreas);
    console.log('   - Has Department Reply Benchmark Table:', hasDocDepts);

    if (!hasDocHtml || !hasDocTable || !hasDocAreas || !hasDocDepts) {
        throw new Error('Word doc export content validation failed!');
    }
    console.log('   [PASS] Word Document Export generated structured, styled document!');

    // Test Print preview window generator
    console.log('\n4. Testing Visual Print / PDF Report generator...');
    let printHtmlContent = '';
    global.window = {
        open: () => {
            return {
                document: {
                    open: () => {},
                    write: (html) => { printHtmlContent += html; },
                    close: () => {}
                },
                focus: () => {}
            };
        }
    };

    Exporter.exportReport('print', analytics, staffContext);
    const hasPrintHeader = printHtmlContent.includes('CivicFix - Official Municipal Analytics Report');
    const hasPrintToolbar = printHtmlContent.includes('btn-print');
    const hasPrintKpi = printHtmlContent.includes('kpi-grid');
    const hasPrintSignatures = printHtmlContent.includes('footer-signatures');

    console.log('   - Has Print Header:', hasPrintHeader);
    console.log('   - Has Floating Action Toolbar:', hasPrintToolbar);
    console.log('   - Has KPI Summary Tiles:', hasPrintKpi);
    console.log('   - Has Municipal Sign-off Blocks:', hasPrintSignatures);

    if (!hasPrintHeader || !hasPrintToolbar || !hasPrintKpi || !hasPrintSignatures) {
        throw new Error('Print report content validation failed!');
    }
    console.log('   [PASS] Visual Print Report generated printable executive document!');

    console.log('\n=== ALL REPORT EXPORT TESTS PASSED SUCCESSFULLY! ===\n');
}

testReportExports().catch(err => {
    console.error('Export test failed:', err);
    process.exit(1);
});
