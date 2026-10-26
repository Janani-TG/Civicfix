const express = require("express");
const path = require("path");
const fs = require("fs");
const exifr = require("exifr");
const db = require("../database");
const upload = require("../middleware/upload");

const router = express.Router();



// CREATE COMPLAINT
router.post("/", (req, res, next) => {
    upload.single("image")(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                message: err.message || "File upload failed. Only JPG, PNG, WEBP images up to 5MB are allowed."
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        const body = req.body || {};
        const { title, category, description, location, priority, latitude, longitude, formatted_address, place_name } = body;

        const image_path = req.file
            ? `/uploads/${req.file.filename}`
            : null;

        if (!title || !category || !description) {
            return res.status(400).json({
                message: "Title, category and description are required."
            });
        }

        let parsedLat = latitude ? parseFloat(latitude) : null;
        let parsedLng = longitude ? parseFloat(longitude) : null;

        // Auto-extract EXIF GPS coordinates from uploaded photo
        if (req.file) {
            try {
                const exifGps = await exifr.gps(req.file.path);
                if (exifGps && typeof exifGps.latitude === 'number' && typeof exifGps.longitude === 'number') {
                    console.log(`[Citizen] Extracted EXIF GPS from complaint image: ${exifGps.latitude}, ${exifGps.longitude}`);
                    if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat === null || parsedLng === null) {
                        parsedLat = exifGps.latitude;
                        parsedLng = exifGps.longitude;
                    }
                }
            } catch (exifErr) {
                console.warn("[Citizen] EXIF extraction notice:", exifErr.message);
            }
        }

        const result = db.prepare(`
            INSERT INTO complaints
            (user_id, title, category, description, location, image_path, priority, latitude, longitude, formatted_address, place_name, verification_status, upvote_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
        `).run(
            req.user.id,
            title,
            category,
            description,
            location || null,
            image_path,
            priority || "Medium",
            !isNaN(parsedLat) ? parsedLat : null,
            !isNaN(parsedLng) ? parsedLng : null,
            formatted_address || null,
            place_name || null
        );

        // Add initial timeline entry
        db.prepare(`
            INSERT INTO complaint_updates
            (complaint_id, staff_id, status, message)
            VALUES (?, ?, ?, ?)
        `).run(
            result.lastInsertRowid,
            null,
            "Received",
            "Complaint registered by citizen."
        );

        res.status(201).json({
            message: "Complaint submitted successfully.",
            complaintId: result.lastInsertRowid
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to create complaint."
        });
    }
});

// GET MY COMPLAINTS
router.get("/my", (req, res) => {
    try {
        const complaints = db.prepare(`
            SELECT *
            FROM complaints
            WHERE user_id = ?
            ORDER BY created_at DESC
        `).all(req.user.id);

        res.json(complaints);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch complaints."
        });
    }
});

// GET MY ACTIVITY STREAM
router.get("/my/activity", (req, res) => {
    try {
        const activities = db.prepare(`
            SELECT
                complaint_updates.id,
                complaint_updates.complaint_id,
                complaint_updates.status,
                complaint_updates.message,
                complaint_updates.created_at,
                complaints.title AS complaint_title,
                complaints.category AS complaint_category,
                users.name AS staff_name
            FROM complaint_updates
            JOIN complaints ON complaint_updates.complaint_id = complaints.id
            LEFT JOIN users ON complaint_updates.staff_id = users.id
            WHERE complaints.user_id = ?
            ORDER BY complaint_updates.created_at DESC
            LIMIT 30
        `).all(req.user.id);

        res.json(activities);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch activity stream."
        });
    }
});

// EDIT / UPDATE COMPLAINT
router.put("/:id", (req, res, next) => {
    upload.single("image")(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                message: err.message || "File upload failed. Only JPG, PNG, WEBP images up to 5MB are allowed."
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { title, category, description, location, priority, latitude, longitude, formatted_address, place_name, remove_image } = req.body;
        const complaintId = req.params.id;

        const existing = db.prepare(`
            SELECT * FROM complaints
            WHERE id = ? AND user_id = ?
        `).get(complaintId, req.user.id);

        if (!existing) {
            return res.status(404).json({
                message: "Complaint not found or you don't have permission to edit it."
            });
        }

        if (!title || !category || !description) {
            return res.status(400).json({
                message: "Title, category, and description are required."
            });
        }

        let updatedImagePath = existing.image_path;
        let parsedLat = latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : existing.latitude;
        let parsedLng = longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : existing.longitude;

        if (req.file) {
            // Remove previous image file if it exists
            if (existing.image_path) {
                const oldFilePath = path.join(__dirname, "..", existing.image_path);
                if (fs.existsSync(oldFilePath)) {
                    try { fs.unlinkSync(oldFilePath); } catch (e) {}
                }
            }
            updatedImagePath = `/uploads/${req.file.filename}`;

            try {
                const exifGps = await exifr.gps(req.file.path);
                if (exifGps && typeof exifGps.latitude === 'number' && typeof exifGps.longitude === 'number') {
                    if (latitude === undefined || latitude === null || latitude === '') {
                        parsedLat = exifGps.latitude;
                        parsedLng = exifGps.longitude;
                    }
                }
            } catch (exifErr) {
                console.warn("[Citizen Edit] EXIF extraction notice:", exifErr.message);
            }
        } else if (remove_image === 'true') {
            if (existing.image_path) {
                const oldFilePath = path.join(__dirname, "..", existing.image_path);
                if (fs.existsSync(oldFilePath)) {
                    try { fs.unlinkSync(oldFilePath); } catch (e) {}
                }
            }
            updatedImagePath = null;
        }

        db.prepare(`
            UPDATE complaints
            SET title = ?, category = ?, description = ?, location = ?, priority = ?, image_path = ?,
                latitude = ?, longitude = ?, formatted_address = ?, place_name = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(
            title,
            category,
            description,
            location || null,
            priority || existing.priority,
            updatedImagePath,
            !isNaN(parsedLat) ? parsedLat : null,
            !isNaN(parsedLng) ? parsedLng : null,
            formatted_address !== undefined ? formatted_address : existing.formatted_address,
            place_name !== undefined ? place_name : existing.place_name,
            complaintId,
            req.user.id
        );

        // Add timeline update entry
        db.prepare(`
            INSERT INTO complaint_updates
            (complaint_id, staff_id, status, message)
            VALUES (?, ?, ?, ?)
        `).run(
            complaintId,
            null,
            existing.status,
            "Complaint details edited by citizen."
        );

        const updated = db.prepare("SELECT * FROM complaints WHERE id = ?").get(complaintId);

        res.json({
            message: "Complaint updated successfully.",
            complaint: updated
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to update complaint."
        });
    }
});

// DELETE COMPLAINT
router.delete("/:id", (req, res) => {
    try {
        const complaintId = req.params.id;

        const existing = db.prepare(`
            SELECT * FROM complaints
            WHERE id = ? AND user_id = ?
        `).get(complaintId, req.user.id);

        if (!existing) {
            return res.status(404).json({
                message: "Complaint not found or you don't have permission to delete it."
            });
        }

        // Remove image file if exists
        if (existing.image_path) {
            const filePath = path.join(__dirname, "..", existing.image_path);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) {}
            }
        }

        // Delete timeline updates
        db.prepare("DELETE FROM complaint_updates WHERE complaint_id = ?").run(complaintId);

        // Delete complaint
        db.prepare("DELETE FROM complaints WHERE id = ?").run(complaintId);

        res.json({
            message: "Complaint deleted successfully."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to delete complaint."
        });
    }
});

// GET COMPLAINT TIMELINE
router.get("/:id/timeline", (req, res) => {
    try {
        const complaint = db.prepare(`
            SELECT id
            FROM complaints
            WHERE id = ? AND user_id = ?
        `).get(req.params.id, req.user.id);

        if (!complaint) {
            return res.status(404).json({
                message: "Complaint not found."
            });
        }

        const timeline = db.prepare(`
            SELECT
                complaint_updates.id,
                complaint_updates.status,
                complaint_updates.message,
                complaint_updates.created_at,
                users.name AS staff_name
            FROM complaint_updates
            LEFT JOIN users
                ON complaint_updates.staff_id = users.id
            WHERE complaint_updates.complaint_id = ?
            ORDER BY complaint_updates.created_at ASC
        `).all(req.params.id);

        res.json(timeline);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch complaint timeline."
        });
    }
});

// GET COMMUNITY COMPLAINTS FEED
router.get("/community/feed", (req, res) => {
    try {
        const complaints = db.prepare(`
            SELECT
                complaints.*,
                users.name AS citizen_name,
                (SELECT COUNT(*) FROM upvotes WHERE upvotes.complaint_id = complaints.id AND upvotes.user_id = ?) AS is_upvoted
            FROM complaints
            JOIN users ON complaints.user_id = users.id
            ORDER BY complaints.upvote_count DESC, complaints.created_at DESC
            LIMIT 50
        `).all(req.user.id);

        res.json(complaints);
    } catch (error) {
        console.error("Community feed error:", error);
        res.status(500).json({ message: "Failed to fetch community feed." });
    }
});

// TOGGLE UPVOTE ON COMPLAINT ("ME TOO")
router.post("/:id/upvote", (req, res) => {
    try {
        const complaintId = req.params.id;
        const userId = req.user.id;

        const complaint = db.prepare("SELECT * FROM complaints WHERE id = ?").get(complaintId);
        if (!complaint) {
            return res.status(404).json({ message: "Complaint not found." });
        }

        const existingUpvote = db.prepare(`
            SELECT id FROM upvotes WHERE complaint_id = ? AND user_id = ?
        `).get(complaintId, userId);

        let upvoted = false;
        let pointsEarned = 0;

        if (existingUpvote) {
            // Remove upvote
            db.prepare("DELETE FROM upvotes WHERE complaint_id = ? AND user_id = ?").run(complaintId, userId);
            db.prepare("UPDATE complaints SET upvote_count = MAX(0, COALESCE(upvote_count, 1) - 1) WHERE id = ?").run(complaintId);
            upvoted = false;
        } else {
            // Add upvote
            db.prepare("INSERT INTO upvotes (complaint_id, user_id) VALUES (?, ?)").run(complaintId, userId);
            db.prepare("UPDATE complaints SET upvote_count = COALESCE(upvote_count, 0) + 1 WHERE id = ?").run(complaintId);
            upvoted = true;
        }

        // Get fresh upvote count
        const updatedComplaint = db.prepare("SELECT upvote_count, priority FROM complaints WHERE id = ?").get(complaintId);
        let currentUpvotes = updatedComplaint.upvote_count || 0;
        let currentPriority = updatedComplaint.priority;

        // Auto-Priority Escalation Rule
        if (currentUpvotes >= 10 && currentPriority !== "Critical") {
            db.prepare("UPDATE complaints SET priority = 'Critical', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(complaintId);
            db.prepare(`
                INSERT INTO complaint_updates (complaint_id, staff_id, status, message)
                VALUES (?, NULL, ?, ?)
            `).run(complaintId, complaint.status, `Priority escalated to Critical due to high community upvotes (${currentUpvotes}+ citizens impacted).`);
        } else if (currentUpvotes >= 5 && (currentPriority === "Low" || currentPriority === "Medium")) {
            db.prepare("UPDATE complaints SET priority = 'High', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(complaintId);
            db.prepare(`
                INSERT INTO complaint_updates (complaint_id, staff_id, status, message)
                VALUES (?, NULL, ?, ?)
            `).run(complaintId, complaint.status, `Priority escalated to High due to community upvotes (${currentUpvotes}+ citizens impacted).`);
        }

        res.json({
            message: upvoted ? "Complaint upvoted successfully." : "Upvote removed.",
            upvoted,
            upvoteCount: currentUpvotes
        });

    } catch (error) {
        console.error("Upvote error:", error);
        res.status(500).json({ message: "Failed to process upvote." });
    }
});

// VERIFY RESOLUTION (APPROVE OR REJECT)
router.put("/:id/verify-fix", (req, res) => {
    try {
        const complaintId = req.params.id;
        const { action, reason, rating, feedback } = req.body; // action: 'approve' | 'reject'

        const complaint = db.prepare("SELECT * FROM complaints WHERE id = ? AND user_id = ?").get(complaintId, req.user.id);
        if (!complaint) {
            return res.status(404).json({ message: "Complaint not found or unauthorized." });
        }

        if (complaint.status !== "Resolved") {
            return res.status(400).json({ message: "Only resolved complaints can be verified." });
        }

        if (action === "approve") {
            db.prepare(`
                UPDATE complaints
                SET verification_status = 'approved',
                    rating = COALESCE(?, rating),
                    feedback = COALESCE(?, feedback),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(rating || null, feedback || null, complaintId);

            // Add optional rating row
            if (rating) {
                db.prepare(`
                    INSERT OR REPLACE INTO complaint_ratings (complaint_id, user_id, rating, feedback)
                    VALUES (?, ?, ?, ?)
                `).run(complaintId, req.user.id, rating, feedback || null);
            }

            // Record timeline update
            db.prepare(`
                INSERT INTO complaint_updates (complaint_id, staff_id, status, message)
                VALUES (?, NULL, 'Resolved', ?)
            `).run(complaintId, "Resolution approved & verified by citizen. Ticket officially closed.");

            res.json({
                message: "Fix approved and ticket officially closed.",
                verification_status: "approved"
            });

        } else if (action === "reject") {
            if (!reason || !reason.trim()) {
                return res.status(400).json({ message: "Please provide a reason for rejecting the resolution." });
            }

            // Reopen complaint back to "In Progress"
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
            `).run(complaintId, `Fix rejected by citizen: "${reason.trim()}". Reopened for staff inspection.`);

            res.json({
                message: "Feedback submitted. Complaint reopened and sent back to staff for re-inspection.",
                verification_status: "rejected",
                status: "In Progress"
            });

        } else {
            res.status(400).json({ message: "Invalid action. Expected 'approve' or 'reject'." });
        }

    } catch (error) {
        console.error("Verify fix error:", error);
        res.status(500).json({ message: "Failed to update verification status." });
    }
});

// SUBMIT RATING & FEEDBACK
router.post("/:id/rate", (req, res) => {
    try {
        const complaintId = req.params.id;
        const { rating, feedback } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: "Rating must be between 1 and 5 stars." });
        }

        const complaint = db.prepare("SELECT * FROM complaints WHERE id = ? AND user_id = ?").get(complaintId, req.user.id);
        if (!complaint) {
            return res.status(404).json({ message: "Complaint not found or unauthorized." });
        }

        db.prepare(`
            UPDATE complaints
            SET rating = ?, feedback = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(rating, feedback || null, complaintId);

        db.prepare(`
            INSERT OR REPLACE INTO complaint_ratings (complaint_id, user_id, rating, feedback)
            VALUES (?, ?, ?, ?)
        `).run(complaintId, req.user.id, rating, feedback || null);

        res.json({
            message: "Rating and feedback submitted successfully.",
            rating,
            feedback
        });

    } catch (error) {
        console.error("Rate complaint error:", error);
        res.status(500).json({ message: "Failed to submit rating." });
    }
});

module.exports = router;