const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// Ensure columns exist in users table
function ensureColumnsExist() {
    try {
        const userColumns = db.prepare("PRAGMA table_info(users)").all();
        const existingColNames = userColumns.map(col => col.name);

        if (!existingColNames.includes("designation")) {
            db.exec("ALTER TABLE users ADD COLUMN designation TEXT;");
        }
        if (!existingColNames.includes("badge_id")) {
            db.exec("ALTER TABLE users ADD COLUMN badge_id TEXT;");
        }
        if (!existingColNames.includes("is_active")) {
            db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;");
        }
    } catch (e) {
        console.error("Column check error:", e);
    }
}
ensureColumnsExist();

// ==========================================
// 1. ADMIN METRICS
// ==========================================
router.get("/metrics", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required." });
        }

        const activeStaffCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM users
            WHERE role = 'staff' AND (is_active = 1 OR is_active IS NULL)
        `).get().count;

        const totalReportsCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM complaints
        `).get().count;

        const urgentOpenCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM complaints
            WHERE (priority = 'High' OR priority = 'Urgent') AND status != 'Resolved'
        `).get().count;

        res.json({
            activeStaff: activeStaffCount,
            totalReports: totalReportsCount,
            urgentOpen: urgentOpenCount
        });

    } catch (error) {
        console.error("admin metrics error:", error);
        res.status(500).json({ message: "Failed to fetch admin metrics." });
    }
});

// GET ALL COMPLAINTS FOR ADMIN AUDIT (WITH BEFORE/AFTER PHOTOS & SUMMARY)
router.get("/complaints", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required." });
        }

        const complaints = db.prepare(`
            SELECT
                complaints.*,
                users.name AS citizen_name,
                users.email AS citizen_email,
                users.phone AS citizen_phone
            FROM complaints
            LEFT JOIN users ON complaints.user_id = users.id
            ORDER BY complaints.created_at DESC
        `).all();

        // Calculate Executive Audit Summary
        const totalCount = complaints.length;
        const resolvedCount = complaints.filter(c => c.status === 'Resolved').length;
        const inProgressCount = complaints.filter(c => c.status === 'In Progress').length;
        const receivedCount = complaints.filter(c => c.status === 'Received').length;
        const photoResolvedCount = complaints.filter(c => c.resolved_image_path != null && c.resolved_image_path !== '').length;
        const pendingVerificationCount = complaints.filter(c => c.status === 'Resolved' && (c.verification_status === 'pending' || !c.verification_status)).length;
        const verifiedCount = complaints.filter(c => c.verification_status === 'approved').length;
        const rejectedCount = complaints.filter(c => c.verification_status === 'rejected').length;

        res.json({
            summary: {
                totalCount,
                resolvedCount,
                inProgressCount,
                receivedCount,
                photoResolvedCount,
                pendingVerificationCount,
                verifiedCount,
                rejectedCount
            },
            complaints
        });

    } catch (error) {
        console.error("admin complaints fetch error:", error);
        res.status(500).json({ message: "Failed to fetch complaints for admin." });
    }
});

// ADMIN VERIFY RESOLUTION OR REOPEN TICKET
router.put("/complaints/:id/verify-fix", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required." });
        }

        const complaintId = req.params.id;
        const { action, reason } = req.body; // action: 'approve' | 'reject'

        const complaint = db.prepare("SELECT * FROM complaints WHERE id = ?").get(complaintId);
        if (!complaint) {
            return res.status(404).json({ message: "Complaint not found." });
        }

        if (action === "approve") {
            db.prepare(`
                UPDATE complaints
                SET status = 'Resolved',
                    verification_status = 'approved',
                    rejection_reason = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(complaintId);

            // Record timeline update
            db.prepare(`
                INSERT INTO complaint_updates (complaint_id, staff_id, status, message)
                VALUES (?, NULL, 'Resolved', ?)
            `).run(complaintId, `Resolution audited & officially verified by Municipal Admin (${req.user.name || 'Admin'}). Ticket closed.`);

            return res.json({
                success: true,
                message: "Resolution approved & verified by Admin. Ticket officially closed.",
                verification_status: "approved"
            });

        } else if (action === "reject") {
            if (!reason || !reason.trim()) {
                return res.status(400).json({ message: "Please provide a reason for reopening the complaint." });
            }

            db.prepare(`
                UPDATE complaints
                SET status = 'In Progress',
                    verification_status = 'rejected',
                    rejection_reason = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(reason.trim(), complaintId);

            // Timeline update
            db.prepare(`
                INSERT INTO complaint_updates (complaint_id, staff_id, status, message)
                VALUES (?, NULL, 'In Progress', ?)
            `).run(complaintId, `Reopened by Municipal Admin (${req.user.name || 'Admin'}): ${reason.trim()}`);

            return res.json({
                success: true,
                message: "Complaint resolution rejected & ticket reopened back to In Progress.",
                verification_status: "rejected"
            });

        } else {
            return res.status(400).json({ message: "Invalid action. Expected 'approve' or 'reject'." });
        }

    } catch (error) {
        console.error("admin verify-fix error:", error);
        res.status(500).json({ message: "Failed to process admin verification." });
    }
});

// ==========================================
// 2. STAFF PERSONNEL MANAGEMENT
// ==========================================

// GET ALL STAFF (WITH AUTO-EXPIRY RECOVERY FOR SUSPENSIONS)
router.get("/staff", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required." });
        }

        // Auto-reactivate any staff whose suspension date has elapsed
        db.prepare(`
            UPDATE users
            SET is_active = 1, suspended_until = NULL, suspension_reason = NULL
            WHERE role = 'staff' AND is_active = 0 AND suspended_until IS NOT NULL AND suspended_until <= datetime('now')
        `).run();

        const staffList = db.prepare(`
            SELECT
                id,
                name,
                email,
                role,
                department,
                designation,
                badge_id,
                phone,
                COALESCE(is_active, 1) AS is_active,
                suspended_until,
                suspension_reason,
                created_at
            FROM users
            WHERE role = 'staff'
            ORDER BY id ASC
        `).all();

        res.json(staffList);

    } catch (error) {
        console.error("admin get staff error:", error);
        res.status(500).json({ message: "Failed to fetch staff directory." });
    }
});

// CREATE NEW STAFF (BY ADMIN)
router.post("/staff", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required." });
        }

        const { name, email, department, designation, badge_id, password, phone } = req.body;

        if (!name || !email || !department || !password) {
            return res.status(400).json({
                message: "Name, official email, department, and password are required."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail.endsWith("@civicfix.com")) {
            return res.status(400).json({
                message: "Staff email must end with @civicfix.com"
            });
        }

        if (normalizedEmail === "admin@civicfix.com") {
            return res.status(403).json({
                message: "admin@civicfix.com cannot be registered as staff."
            });
        }

        const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(normalizedEmail);
        if (existing) {
            return res.status(409).json({
                message: "Email is already registered."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const staffBadge = badge_id ? badge_id.trim() : `CBE-${(department || 'GEN').substring(0, 2).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

        const result = db.prepare(`
            INSERT INTO users (name, email, password, role, department, designation, badge_id, phone, is_active)
            VALUES (?, ?, ?, 'staff', ?, ?, ?, ?, 1)
        `).run(
            name.trim(),
            normalizedEmail,
            hashedPassword,
            department.trim(),
            designation ? designation.trim() : 'Municipal Officer',
            staffBadge,
            phone ? phone.trim() : '9876543210'
        );

        res.status(201).json({
            success: true,
            message: "Staff member created successfully.",
            staffId: result.lastInsertRowid
        });

    } catch (error) {
        console.error("admin create staff error:", error);
        res.status(500).json({ message: "Failed to create staff member." });
    }
});

// SUSPEND STAFF FOR A PERIOD OF TIME
router.post("/staff/:id/suspend", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required." });
        }

        const staffId = req.params.id;
        const { durationDays, untilDate, reason } = req.body;

        const staff = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(staffId);
        if (!staff) {
            return res.status(404).json({ message: "Staff member not found." });
        }

        let calculatedUntil = null;
        if (durationDays && Number(durationDays) > 0) {
            const d = new Date();
            d.setDate(d.getDate() + Number(durationDays));
            calculatedUntil = d.toISOString();
        } else if (untilDate) {
            calculatedUntil = new Date(untilDate).toISOString();
        }

        const suspensionReason = reason ? reason.trim() : "Administrative suspension";

        db.prepare(`
            UPDATE users
            SET is_active = 0, suspended_until = ?, suspension_reason = ?
            WHERE id = ?
        `).run(calculatedUntil, suspensionReason, staffId);

        let durationMessage = "indefinitely";
        if (calculatedUntil) {
            const formatted = new Date(calculatedUntil).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
            durationMessage = `until ${formatted}`;
        }

        res.json({
            success: true,
            message: `Staff member ${staff.name} suspended ${durationMessage}.`,
            suspendedUntil: calculatedUntil,
            reason: suspensionReason
        });

    } catch (error) {
        console.error("admin suspend staff error:", error);
        res.status(500).json({ message: "Failed to suspend staff member." });
    }
});

// REVOKE STAFF SUSPENSION / REACTIVATE
router.post("/staff/:id/revoke-suspension", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access required." });
        }

        const staffId = req.params.id;
        const staff = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'staff'").get(staffId);
        if (!staff) {
            return res.status(404).json({ message: "Staff member not found." });
        }

        db.prepare(`
            UPDATE users
            SET is_active = 1, suspended_until = NULL, suspension_reason = NULL
            WHERE id = ?
        `).run(staffId);

        res.json({
            success: true,
            message: `Suspension revoked for ${staff.name}. Staff member is now active.`
        });

    } catch (error) {
        console.error("admin revoke suspension error:", error);
        res.status(500).json({ message: "Failed to revoke staff suspension." });
    }
});

// ==========================================
// 3. STAFF QUERIES MANAGEMENT
// ==========================================

// GET ALL STAFF QUERIES
router.get("/queries", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                message: "Admin access required."
            });
        }

        const queries = db.prepare(`
            SELECT
                staff_queries.*,
                users.name AS staff_name,
                users.email AS staff_email,
                users.department AS staff_department,
                users.phone AS staff_phone,
                users.badge_id AS staff_badge_id
            FROM staff_queries
            JOIN users ON staff_queries.staff_id = users.id
            ORDER BY staff_queries.created_at DESC
        `).all();

        res.json(queries);

    } catch (error) {
        console.error("admin get queries error:", error);
        res.status(500).json({
            message: "Failed to fetch staff queries."
        });
    }
});

// REPLY TO A STAFF QUERY
router.post("/queries/:id/reply", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                message: "Admin access required."
            });
        }

        const { response, status = "Closed" } = req.body;

        if (status && !["Open", "Closed"].includes(status)) {
            return res.status(400).json({
                message: "Invalid query status. Must be 'Open' or 'Closed'."
            });
        }

        const query = db.prepare(`
            SELECT * FROM staff_queries WHERE id = ?
        `).get(req.params.id);

        if (!query) {
            return res.status(404).json({
                message: "Query not found."
            });
        }

        db.prepare(`
            UPDATE staff_queries
            SET admin_response = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(response || null, status, req.params.id);

        // Create in-app notification for the staff member
        if (query.staff_id) {
            const shortResponse = (response || "Admin updated query status").trim();
            const notifTitle = `Admin Replied: ${query.subject || "Staff Query"}`;
            const notifMessage = `Admin response: "${shortResponse.substring(0, 120)}${shortResponse.length > 120 ? '...' : ''}"`;

            db.prepare(`
                INSERT INTO notifications (user_id, title, message, type, reference_id, is_read)
                VALUES (?, ?, ?, 'query_reply', ?, 0)
            `).run(query.staff_id, notifTitle, notifMessage, query.id);
        }

        res.json({
            message: "Query response recorded and staff notified successfully."
        });

    } catch (error) {
        console.error("admin reply query error:", error);
        res.status(500).json({
            message: "Failed to record query response."
        });
    }
});

// ==========================================
// 4. DELETE COMPLAINT (ADMIN ONLY)
// ==========================================
router.delete("/complaints/:id", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                message: "Admin access required. Only admins can delete complaints."
            });
        }

        const complaintId = req.params.id;
        const complaint = db.prepare("SELECT * FROM complaints WHERE id = ?").get(complaintId);

        if (!complaint) {
            return res.status(404).json({
                message: "Complaint not found."
            });
        }

        // Delete child dependent records to maintain foreign key integrity
        try { db.prepare("DELETE FROM complaint_updates WHERE complaint_id = ?").run(complaintId); } catch (e) {}
        try { db.prepare("DELETE FROM upvotes WHERE complaint_id = ?").run(complaintId); } catch (e) {}
        try { db.prepare("DELETE FROM complaint_ratings WHERE complaint_id = ?").run(complaintId); } catch (e) {}
        try { db.prepare("DELETE FROM complaint_upvotes WHERE complaint_id = ?").run(complaintId); } catch (e) {}

        // Delete complaint from database
        db.prepare("DELETE FROM complaints WHERE id = ?").run(complaintId);

        res.json({
            message: `Complaint #CF-${String(complaintId).padStart(4, '0')} deleted successfully.`
        });

    } catch (error) {
        console.error("admin delete complaint error:", error);
        res.status(500).json({
            message: "Failed to delete complaint."
        });
    }
});

module.exports = router;
