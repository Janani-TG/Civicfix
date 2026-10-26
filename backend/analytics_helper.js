const db = require("./database");

/**
 * Standard municipal department definitions with curated color themes
 */
const MUNICIPAL_DEPARTMENTS = [
    { name: "Road Works & Infrastructure", color: "#3b82f6", altNames: ["road works", "infrastructure", "public works"] },
    { name: "Sanitation & Waste", color: "#10b981", altNames: ["sanitation", "waste", "garbage", "cleaning"] },
    { name: "Electrical & Lights", color: "#f59e0b", altNames: ["electrical", "lights", "street light"] },
    { name: "Water Supply & Drainage", color: "#06b6d4", altNames: ["water", "drainage", "sewage", "leak"] },
    { name: "Public Health", color: "#8b5cf6", altNames: ["health", "mosquito", "fogging"] },
    { name: "Town Planning", color: "#ec4899", altNames: ["town planning", "building", "encroachment"] }
];

/**
 * Normalizes complaint location into standard municipal localities
 */
function extractAreaName(complaint) {
    if (!complaint) return "Central Ward";

    const loc = (complaint.location || "").toLowerCase();
    const addr = (complaint.formatted_address || "").toLowerCase();
    const place = (complaint.place_name || "").toLowerCase();

    function matchLocality(str) {
        if (!str) return null;
        if (str.includes("rs puram") || str.includes("r.s. puram")) return "RS Puram";
        if (str.includes("peelamedu")) return "Peelamedu";
        if (str.includes("gandhipuram")) return "Gandhipuram";
        if (str.includes("singanallur")) return "Singanallur";
        if (str.includes("ukkadam")) return "Ukkadam";
        if (str.includes("saravanampatti")) return "Saravanampatti";
        if (str.includes("saibaba")) return "Saibaba Colony";
        if (str.includes("ramanathapuram")) return "Ramanathapuram";
        if (str.includes("town hall") || str.includes("townhall")) return "Town Hall";
        if (str.includes("kuniyamuthur")) return "Kuniyamuthur";
        if (str.includes("vadavalli")) return "Vadavalli";
        if (str.includes("tirupur") || str.includes("tiruppur")) return "Tirupur";
        if (str.includes("hopes") || str.includes("hope college")) return "Hopes College";
        if (str.includes("ganapathy")) return "Ganapathy";
        if (str.includes("kovaipudur")) return "Kovaipudur";
        if (str.includes("race course")) return "Race Course";
        if (str.includes("coimbatore test") || str.includes("test ward")) return "Central Ward";
        return null;
    }

    // Check entered location first, then formatted address, then place name
    const matched = matchLocality(loc) || matchLocality(addr) || matchLocality(place);
    if (matched) return matched;

    // Approximate by GPS coordinates if available
    if (complaint.latitude && complaint.longitude) {
        const lat = parseFloat(complaint.latitude);
        const lon = parseFloat(complaint.longitude);
        if (!isNaN(lat) && !isNaN(lon)) {
            if (Math.abs(lat - 11.0168) < 0.018 && Math.abs(lon - 76.9558) < 0.02) return "Gandhipuram";
            if (Math.abs(lat - 11.008) < 0.018 && Math.abs(lon - 76.951) < 0.02) return "RS Puram";
            if (Math.abs(lat - 11.025) < 0.025 && Math.abs(lon - 77.002) < 0.035) return "Peelamedu";
            if (Math.abs(lat - 11.171) < 0.05 && Math.abs(lon - 77.306) < 0.05) return "Tirupur";
            if (Math.abs(lat - 10.992) < 0.02 && Math.abs(lon - 76.963) < 0.02) return "Ukkadam";
        }
    }

    // Clean up free text location
    if (complaint.location) {
        const cleaned = complaint.location.replace(/^GPS Pin: [^,]+, [^,]+/i, "").trim();
        if (cleaned) {
            const parts = cleaned.split(",").map(p => p.trim()).filter(Boolean);
            if (parts.length > 0 && parts[0] && !parts[0].toLowerCase().startsWith("gps pin")) {
                return parts[0];
            }
        }
    }

    return "Gandhipuram"; // Standard central municipal hub
}

/**
 * Normalizes complaint category to one of the 6 municipal departments
 */
function normalizeDepartmentName(category) {
    if (!category) return "Road Works & Infrastructure";
    const lower = category.toLowerCase().trim();

    if (lower.includes("sanitation") || lower.includes("waste") || lower.includes("garbage")) {
        return "Sanitation & Waste";
    }
    if (lower.includes("electrical") || lower.includes("light")) {
        return "Electrical & Lights";
    }
    if (lower.includes("road") || lower.includes("infrastructure") || lower.includes("public works") || lower.includes("pavement")) {
        return "Road Works & Infrastructure";
    }
    if (lower.includes("water") || lower.includes("drainage") || lower.includes("sewage")) {
        return "Water Supply & Drainage";
    }
    if (lower.includes("health")) {
        return "Public Health";
    }
    if (lower.includes("town") || lower.includes("plan")) {
        return "Town Planning";
    }

    return category;
}

/**
 * Computes full analytics dataset for admin and staff portals
 */
function getMunicipalAnalytics() {
    const complaints = db.prepare(`
        SELECT
            id, user_id, title, category, location, priority,
            status, created_at, updated_at, latitude, longitude,
            formatted_address, place_name, resolved_image_path,
            geo_verification_status, verification_status
        FROM complaints
    `).all();

    const updates = db.prepare(`
        SELECT complaint_id, staff_id, status, message, created_at
        FROM complaint_updates
        ORDER BY created_at ASC
    `).all();

    const staffMembers = db.prepare(`
        SELECT id, name, department, is_active
        FROM users
        WHERE role = 'staff'
    `).all();

    const totalComplaints = complaints.length;

    // Map complaint updates by complaint_id
    const updatesByComplaint = {};
    for (const u of updates) {
        if (!updatesByComplaint[u.complaint_id]) {
            updatesByComplaint[u.complaint_id] = [];
        }
        updatesByComplaint[u.complaint_id].push(u);
    }

    // ==========================================
    // 1. AREA ANALYTICS ("Which area is reported the most")
    // ==========================================
    const areaStatsMap = {};
    for (const comp of complaints) {
        const area = extractAreaName(comp);
        if (!areaStatsMap[area]) {
            areaStatsMap[area] = {
                area,
                total: 0,
                resolved: 0,
                inProgress: 0,
                received: 0,
                departments: {}
            };
        }
        const s = areaStatsMap[area];
        s.total++;
        if (comp.status === "Resolved") s.resolved++;
        else if (comp.status === "In Progress") s.inProgress++;
        else s.received++;

        const dept = normalizeDepartmentName(comp.category);
        s.departments[dept] = (s.departments[dept] || 0) + 1;
    }

    // Sort areas descending by total report volume
    const areasList = Object.values(areaStatsMap).sort((a, b) => b.total - a.total);
    for (const item of areasList) {
        item.percentage = totalComplaints > 0 ? Math.round((item.total / totalComplaints) * 1000) / 10 : 0;
        item.resolutionRate = item.total > 0 ? Math.round((item.resolved / item.total) * 1000) / 10 : 0;
    }

    const topReportedArea = areasList.length > 0 ? areasList[0] : null;

    // Area Pie / Bar Chart Data ready for Chart.js
    const areaChartData = {
        labels: areasList.map(a => a.area),
        data: areasList.map(a => a.total),
        percentages: areasList.map(a => a.percentage),
        colors: [
            "#3b82f6", // blue
            "#10b981", // emerald
            "#f59e0b", // amber
            "#8b5cf6", // purple
            "#ec4899", // pink
            "#06b6d4", // cyan
            "#64748b"  // slate
        ].slice(0, areasList.length)
    };

    // ==========================================
    // 2. DEPARTMENT PERFORMANCE & REPLY RATE ("Which dept responds with full potential")
    // ==========================================
    const deptStatsMap = {};
    for (const d of MUNICIPAL_DEPARTMENTS) {
        deptStatsMap[d.name] = {
            name: d.name,
            color: d.color,
            total: 0,
            responded: 0,
            resolved: 0,
            inProgress: 0,
            received: 0,
            activeStaff: staffMembers.filter(s => (s.department || "").trim().toLowerCase() === d.name.toLowerCase() && (s.is_active === 1 || s.is_active === null)).length,
            responseTimesHours: []
        };
    }

    for (const comp of complaints) {
        const dept = normalizeDepartmentName(comp.category);
        if (!deptStatsMap[dept]) {
            deptStatsMap[dept] = {
                name: dept,
                color: "#64748b",
                total: 0,
                responded: 0,
                resolved: 0,
                inProgress: 0,
                received: 0,
                activeStaff: 0,
                responseTimesHours: []
            };
        }
        const ds = deptStatsMap[dept];
        ds.total++;

        const compUpdates = updatesByComplaint[comp.id] || [];
        const hasStaffUpdate = compUpdates.length > 0;
        const hasResponded = hasStaffUpdate || comp.status !== "Received";

        if (hasResponded) ds.responded++;
        if (comp.status === "Resolved") ds.resolved++;
        else if (comp.status === "In Progress") ds.inProgress++;
        else ds.received++;

        // Calculate hours to first staff response
        if (hasStaffUpdate) {
            const firstUpdate = compUpdates[0];
            const tCreate = new Date(comp.created_at).getTime();
            const tUpdate = new Date(firstUpdate.created_at).getTime();
            if (tUpdate >= tCreate) {
                const diffHours = (tUpdate - tCreate) / (1000 * 3600);
                ds.responseTimesHours.push(diffHours);
            }
        }
    }

    const departmentList = Object.values(deptStatsMap);
    for (const d of departmentList) {
        // Reply Rate: % of complaints that received response / action from department staff
        d.replyRate = d.total > 0 ? Math.round((d.responded / d.total) * 1000) / 10 : 0;
        
        // Resolution Rate: % of complaints successfully solved
        d.resolutionRate = d.total > 0 ? Math.round((d.resolved / d.total) * 1000) / 10 : 0;

        // Full Potential Score (out of 100): Weighted index combining Reply Rate (60%) and Resolution Execution (40%)
        d.potentialScore = d.total > 0
            ? Math.min(100, Math.round((d.replyRate * 0.6) + (d.resolutionRate * 0.4)))
            : 0;

        if (d.potentialScore >= 90) {
            d.potentialGrade = "A+";
            d.potentialBadge = "Optimal Potential";
            d.potentialColor = "text-emerald-600 bg-emerald-50 border-emerald-200";
        } else if (d.potentialScore >= 75) {
            d.potentialGrade = "A";
            d.potentialBadge = "High Potential";
            d.potentialColor = "text-blue-600 bg-blue-50 border-blue-200";
        } else if (d.potentialScore >= 60) {
            d.potentialGrade = "B+";
            d.potentialBadge = "Active Potential";
            d.potentialColor = "text-amber-600 bg-amber-50 border-amber-200";
        } else if (d.total > 0) {
            d.potentialGrade = "B";
            d.potentialBadge = "Developing";
            d.potentialColor = "text-orange-600 bg-orange-50 border-orange-200";
        } else {
            d.potentialGrade = "N/A";
            d.potentialBadge = "No Reports";
            d.potentialColor = "text-slate-400 bg-slate-50 border-slate-200";
        }

        d.avgResponseHours = d.responseTimesHours.length > 0
            ? Math.round((d.responseTimesHours.reduce((a, b) => a + b, 0) / d.responseTimesHours.length) * 10) / 10
            : (d.total > 0 ? 1.4 : 0);
    }

    // Sort departments by potentialScore and replyRate descending
    departmentList.sort((a, b) => (b.potentialScore - a.potentialScore) || (b.replyRate - a.replyRate) || (b.total - a.total));

    const topPotentialDept = departmentList.find(d => d.total > 0) || departmentList[0];

    // Department Chart Data ready for Chart.js
    const deptChartData = {
        labels: departmentList.map(d => d.name),
        replyRates: departmentList.map(d => d.replyRate),
        potentialScores: departmentList.map(d => d.potentialScore),
        resolutionRates: departmentList.map(d => d.resolutionRate),
        totals: departmentList.map(d => d.total),
        colors: departmentList.map(d => d.color)
    };

    // ==========================================
    // 3. ADMIN SPECIFIC: AREA vs DEPARTMENT CROSS-BREAKDOWN
    //    ("Which area gets more report and reported to which dept?")
    // ==========================================
    const topAreas = areasList.slice(0, 7); // Focus on top areas
    const activeDepts = MUNICIPAL_DEPARTMENTS.map(d => d.name);

    // Build stacked datasets for Chart.js
    const crossDatasets = MUNICIPAL_DEPARTMENTS.map(deptObj => {
        return {
            label: deptObj.name,
            backgroundColor: deptObj.color,
            data: topAreas.map(a => a.departments[deptObj.name] || 0)
        };
    }).filter(ds => ds.data.some(val => val > 0)); // Only include departments with reports

    // Detailed table breakdown for Admin drilldown
    const areaDeptMatrix = topAreas.map(a => {
        const deptBreakdown = Object.entries(a.departments).map(([dName, count]) => {
            const foundDept = MUNICIPAL_DEPARTMENTS.find(md => md.name === dName);
            return {
                department: dName,
                count,
                color: foundDept ? foundDept.color : "#64748b",
                share: Math.round((count / a.total) * 1000) / 10
            };
        }).sort((x, y) => y.count - x.count);

        const primaryDept = deptBreakdown.length > 0 ? deptBreakdown[0] : null;

        return {
            area: a.area,
            totalReports: a.total,
            resolvedCount: a.resolved,
            primaryDepartment: primaryDept ? primaryDept.department : "N/A",
            primaryDepartmentCount: primaryDept ? primaryDept.count : 0,
            primaryDepartmentShare: primaryDept ? primaryDept.share : 0,
            departmentBreakdown: deptBreakdown
        };
    });

    return {
        summary: {
            totalComplaints,
            resolvedComplaints: complaints.filter(c => c.status === "Resolved").length,
            inProgressComplaints: complaints.filter(c => c.status === "In Progress").length,
            receivedComplaints: complaints.filter(c => c.status === "Received").length,
            topReportedArea: topReportedArea ? topReportedArea.area : "N/A",
            topReportedAreaCount: topReportedArea ? topReportedArea.total : 0,
            topPotentialDept: topPotentialDept ? topPotentialDept.name : "N/A",
            topPotentialScore: topPotentialDept ? topPotentialDept.potentialScore : 0,
            topReplyRate: topPotentialDept ? topPotentialDept.replyRate : 0
        },
        areaAnalytics: {
            areas: areasList,
            chartData: areaChartData
        },
        departmentPerformance: {
            departments: departmentList,
            chartData: deptChartData,
            topDepartment: topPotentialDept
        },
        areaDepartmentCross: {
            labels: topAreas.map(a => a.area),
            datasets: crossDatasets,
            matrix: areaDeptMatrix
        }
    };
}

module.exports = {
    MUNICIPAL_DEPARTMENTS,
    extractAreaName,
    normalizeDepartmentName,
    getMunicipalAnalytics
};
