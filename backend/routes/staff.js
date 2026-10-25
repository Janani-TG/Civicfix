const express = require("express");
const db = require("../database");
const authenticateToken = require("../middleware/auth");
const upload = require("../middleware/upload");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Helper to read image as base64 for Gemini Vision API (Cross-platform Windows & Linux compatible)
function getImageBase64(imagePath) {
    if (!imagePath) return null;

    // Normalize path across Windows and Linux
    let cleanPath = imagePath.replace(/\\/g, '/');
    if (cleanPath.startsWith('/')) {
        cleanPath = cleanPath.slice(1);
    }

    let fullPath = path.join(__dirname, '..', cleanPath);

    if (!fs.existsSync(fullPath)) {
        const uploadName = path.basename(cleanPath);
        const altPath = path.join(__dirname, '..', 'uploads', uploadName);
        if (fs.existsSync(altPath)) {
            fullPath = altPath;
        } else {
            const cwdPath = path.join(process.cwd(), cleanPath);
            if (fs.existsSync(cwdPath)) {
                fullPath = cwdPath;
            } else {
                console.error("Image file not found on disk:", imagePath, "-> tried:", fullPath);
                return null;
            }
        }
    }

    try {
        const buffer = fs.readFileSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';

        return {
            mimeType,
            data: buffer.toString('base64')
        };
    } catch (e) {
        console.error("Base64 read error for:", fullPath, e.message);
        return null;
    }
}

// Call Gemini Multimodal API to inspect and compare before and after photos
async function analyzeResolutionWithGemini({ apiKey, complaint, beforeImageData, afterImageData }) {
    if (!apiKey) return null;

    const hasBothImages = Boolean(beforeImageData && afterImageData);

    const promptText = `You are an expert AI Civic Infrastructure Inspector for municipal complaints.
Complaint Reference: #${complaint.id}
Complaint Category: "${complaint.category || 'General'}"
Complaint Title: "${complaint.title || ''}"
Complaint Description: "${complaint.description || ''}"

TASK:
Inspect the visual contents of the provided image(s) to determine whether the civic defect or problem has been genuinely CLEARED and RESOLVED.

${hasBothImages ? `IMAGE GUIDE:
- Image 1: The citizen's BEFORE photo showing the reported civic problem (e.g. garbage mound, pothole, overflowing drain, debris, damaged asset).
- Image 2: The staff's AFTER photo submitted as proof of resolution.` : `IMAGE GUIDE:
- Image 1: The staff's AFTER photo submitted as proof that the reported civic issue is resolved.`}

EVALUATION RULES:
1. "isResolved" MUST BE TRUE if and only if the image clearly demonstrates that the reported problem is physically CLEARED, cleaned, fixed, or repaired:
   - Garbage/Waste: All waste is cleared and the ground/street is clean.
   - Pothole/Road: The hole is completely filled, patched, or paved over.
   - Street Light / Electrical: The fixture is visibly repaired, upright, or replaced.
   - Drainage / Water: Blockages/flooding cleared and flow restored.
2. "isResolved" MUST BE FALSE if:
   - The civic problem is still visible (garbage remains, pothole is still unfilled, damage is still present).
   - The after-photo is identical or virtually identical to the before-photo without work done.
   - The after-photo is irrelevant (e.g., photo of a desk, wall, vehicle dashboard, unrelated object, person, pet).
   - The photo is too dark, blurry, or obstructed to confirm clearance.

CONFIDENCE SCORE RULES (Resolution Match Percentage):
- When "isResolved" is TRUE: Set "confidence" to the resolution match score between 80 and 99.
- When "isResolved" is FALSE: Set "confidence" to a low match score strictly between 0 and 10 (e.g., 0, 2, 5, or 8). NEVER return a high confidence number like 80-99 for failed verification because it represents the resolution match percentage.

Return STRICTLY raw JSON format (no markdown tags, no backticks):
{
  "isResolved": false,
  "confidence": 3,
  "reasoning": "Cleared: [1-2 sentences explaining why the area is clear/fixed] OR Not Cleared: [1-2 sentences explaining what problem is still visible]",
  "matchedIssue": "Cleared - [Brief summary] OR Not Cleared - [Brief summary]"
}`;

    const parts = [{ text: promptText }];
    if (beforeImageData) {
        parts.push({
            inline_data: {
                mime_type: beforeImageData.mimeType,
                data: beforeImageData.data
            }
        });
    }
    if (afterImageData) {
        parts.push({
            inline_data: {
                mime_type: afterImageData.mimeType,
                data: afterImageData.data
            }
        });
    }

    const models = [
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash',
        'gemini-3.6-flash'
    ];
    let lastError = null;

    for (const model of models) {
        try {
            console.log(`[Gemini Vision] Evaluating resolution photos using model: ${model}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(20000),
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        temperature: 0.1,
                        response_mime_type: 'application/json'
                    }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                lastError = new Error(`Gemini API error (${model} - HTTP ${response.status}): ${errText}`);
                console.warn(`[Gemini Vision] ${model} returned HTTP ${response.status}, trying fallback model...`);
                continue;
            }

            const data = await response.json();
            const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textContent) continue;

            const cleanJsonStr = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJsonStr);

            const isResolved = Boolean(parsed.isResolved);
            let rawConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : (isResolved ? 90 : 3);
            if (rawConfidence <= 1 && rawConfidence > 0) {
                rawConfidence = Math.round(rawConfidence * 100);
            }
            let confidence = rawConfidence;

            if (!isResolved) {
                // When verification fails, resolution match MUST be 0-10%
                if (confidence > 10) {
                    confidence = Math.max(0, Math.min(10, Math.round((100 - confidence) / 10)));
                } else {
                    confidence = Math.max(0, Math.min(10, Math.round(confidence)));
                }
            } else {
                // When resolved, ensure resolution match score is between 80% and 99%
                if (confidence < 60) {
                    confidence = 88;
                } else {
                    confidence = Math.max(60, Math.min(99, Math.round(confidence)));
                }
            }

            console.log(`[Gemini Vision] Verification successful with ${model}! isResolved: ${isResolved}, confidence: ${confidence}%`);

            return {
                isResolved,
                confidence,
                reasoning: parsed.reasoning || (isResolved ? "Cleared: Resolution verified by Gemini Vision AI." : "Not Cleared: Issue does not appear resolved in photo."),
                matchedIssue: parsed.matchedIssue || (isResolved ? "Cleared - Issue Resolved" : "Not Cleared - Unresolved"),
                modelUsed: model
            };
        } catch (err) {
            console.warn(`[Gemini Vision] ${model} attempt failed (${err.message}), trying next model...`);
            lastError = err;
        }
    }

    if (lastError) {
        console.error("Gemini API Error:", lastError.message);
        throw lastError;
    }

    return null;
}

// Helper to detect if uploaded resolution image is a duplicate or near-identical copy of original complaint photo
function checkImageDuplicate(beforeImageData, afterImageData) {
    if (!beforeImageData || !afterImageData || !beforeImageData.data || !afterImageData.data) {
        return false;
    }

    // 1. Direct Base64 string equality
    if (beforeImageData.data === afterImageData.data) return true;

    try {
        const b1 = Buffer.from(beforeImageData.data, 'base64');
        const b2 = Buffer.from(afterImageData.data, 'base64');

        // 2. Direct Buffer equality
        if (b1.equals(b2)) return true;

        // 3. Exact byte length equality
        if (b1.length === b2.length) return true;

        // 4. Sampled byte similarity for re-saved or re-compressed images
        const samples = 100;
        const step1 = Math.floor(b1.length / samples);
        const step2 = Math.floor(b2.length / samples);
        let matches = 0;
        for (let i = 0; i < samples; i++) {
            if (b1[i * step1] === b2[i * step2]) matches++;
        }
        const similarity = matches / samples;
        const sizeDiff = Math.abs(b1.length - b2.length) / Math.max(b1.length, b2.length);

        if (sizeDiff < 0.05 && similarity > 0.80) {
            return true;
        }
    } catch (e) {
        console.error("Duplicate image check error:", e.message);
    }

    return false;
}

// POST VERIFY RESOLUTION PHOTO WITH AI
router.post("/verify-resolution", authenticateToken, upload.single("resolved_image"), async (req, res) => {
    try {
        if (req.user.role !== "staff" && req.user.role !== "admin") {
            return res.status(403).json({ message: "Staff access required." });
        }

        const complaintId = req.body.complaint_id;
        if (!complaintId) {
            return res.status(400).json({ message: "Complaint ID is required." });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Resolution photo is required." });
        }

        const complaint = db.prepare("SELECT * FROM complaints WHERE id = ?").get(complaintId);
        if (!complaint) {
            return res.status(404).json({ message: "Complaint not found." });
        }

        const resolvedImagePath = "/uploads/" + req.file.filename;

        // Base64 of before image & after image
        const beforeImageData = getImageBase64(complaint.image_path);
        const afterImageData = getImageBase64(resolvedImagePath);

        // 1. HARDENED DUPLICATE IMAGE CHECK
        // If the uploaded resolution photo is identical or a re-saved copy of the original issue photo:
        const isDuplicateImage = checkImageDuplicate(beforeImageData, afterImageData);

        if (isDuplicateImage) {
            const reasoning = "AI Verification Rejected: The uploaded resolution photo is identical to the original complaint photo. Please upload a genuine photo of the completed repair work.";
            
            db.prepare(`
                UPDATE complaints
                SET resolved_image_path = ?,
                    ai_verification_status = 'rejected',
                    ai_verification_reason = ?,
                    ai_confidence = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(resolvedImagePath, reasoning, complaintId);

            return res.json({
                success: true,
                isResolved: false,
                confidence: 0,
                reasoning,
                matchedIssue: "Duplicate Photo Uploaded",
                modelUsed: "CivicFix Image Comparator",
                resolvedImagePath
            });
        }

        // 2. LIVE GEMINI VISION AI VERIFICATION (Visual Clearance Inspection)
        const apiKey = process.env.GEMINI_API_KEY || req.body.gemini_api_key || req.headers["x-gemini-api-key"];

        let aiResult = null;
        if (apiKey && apiKey.trim() !== "") {
            try {
                aiResult = await analyzeResolutionWithGemini({
                    apiKey: apiKey.trim(),
                    complaint,
                    beforeImageData,
                    afterImageData
                });
            } catch (geminiErr) {
                console.error("Gemini Vision AI verification failed:", geminiErr.message);
            }
        }

        // 3. FALLBACK IF VISION SERVICE UNREACHABLE
        if (!aiResult) {
            aiResult = {
                isResolved: false,
                confidence: 0,
                reasoning: "Not Cleared: Unable to complete AI image inspection. Please check your network connection and retry.",
                matchedIssue: "Vision Service Unavailable",
                modelUsed: "CivicFix AI Vision"
            };
        }

        // Save AI verification details into complaints table
        db.prepare(`
            UPDATE complaints
            SET resolved_image_path = ?,
                ai_verification_status = ?,
                ai_verification_reason = ?,
                ai_confidence = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            resolvedImagePath,
            aiResult.isResolved ? 'verified' : 'rejected',
            aiResult.reasoning,
            aiResult.confidence,
            complaintId
        );

        res.json({
            success: true,
            isResolved: aiResult.isResolved,
            confidence: aiResult.confidence,
            reasoning: aiResult.reasoning,
            matchedIssue: aiResult.matchedIssue,
            modelUsed: aiResult.modelUsed,
            resolvedImagePath
        });

    } catch (error) {
        console.error("Verify resolution error:", error);
        res.status(500).json({ message: "Failed to perform AI resolution verification: " + error.message });
    }
});

// STAFF DASHBOARD
router.get("/dashboard", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "staff") {
            return res.status(403).json({
                message: "Staff access required."
            });
        }

        const total = db.prepare(`
            SELECT COUNT(*) AS count
            FROM complaints
        `).get();

        const received = db.prepare(`
            SELECT COUNT(*) AS count
            FROM complaints
            WHERE status = 'Received'
        `).get();

        const inProgress = db.prepare(`
            SELECT COUNT(*) AS count
            FROM complaints
            WHERE status = 'In Progress'
        `).get();

        const resolved = db.prepare(`
            SELECT COUNT(*) AS count
            FROM complaints
            WHERE status = 'Resolved'
        `).get();

        res.json({
            total: total.count,
            received: received.count,
            inProgress: inProgress.count,
            resolved: resolved.count
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to load staff dashboard."
        });
    }
});

// GET COMPLAINT QUEUE
router.get("/complaints", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "staff") {
            return res.status(403).json({
                message: "Staff access required."
            });
        }

        const staff = db.prepare(`
            SELECT department
            FROM users
            WHERE id = ?
        `).get(req.user.id);

        let complaints = [];
        if (staff && staff.department && staff.department !== "All") {
            const deptStr = staff.department.trim();
            const firstWord = deptStr.split(' ')[0];
            complaints = db.prepare(`
                SELECT
                    complaints.*,
                    users.name AS citizen_name,
                    users.email AS citizen_email,
                    users.phone AS citizen_phone
                FROM complaints
                JOIN users ON complaints.user_id = users.id
                WHERE complaints.category = ? 
                   OR complaints.category LIKE ? 
                   OR ? LIKE '%' || complaints.category || '%'
                   OR complaints.category LIKE ?
                ORDER BY complaints.created_at DESC
            `).all(deptStr, `%${deptStr}%`, deptStr, `%${firstWord}%`);

            if (complaints.length === 0) {
                complaints = db.prepare(`
                    SELECT
                        complaints.*,
                        users.name AS citizen_name,
                        users.email AS citizen_email,
                        users.phone AS citizen_phone
                    FROM complaints
                    JOIN users ON complaints.user_id = users.id
                    ORDER BY complaints.created_at DESC
                `).all();
            }
        } else {
            complaints = db.prepare(`
                SELECT
                    complaints.*,
                    users.name AS citizen_name,
                    users.email AS citizen_email,
                    users.phone AS citizen_phone
                FROM complaints
                JOIN users ON complaints.user_id = users.id
                ORDER BY complaints.created_at DESC
            `).all();
        }

        res.json(complaints);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch complaint queue."
        });
    }
});

// UPDATE COMPLAINT STATUS
router.put("/complaints/:id/status", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "staff") {
            return res.status(403).json({
                message: "Staff access required."
            });
        }

        const { status, message, resolved_image_path } = req.body;

        const validStatuses = [
            "Received",
            "In Progress",
            "Resolved"
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                message: "Invalid complaint status."
            });
        }

        const complaint = db.prepare(`
            SELECT id, status, resolved_image_path, ai_verification_status
            FROM complaints
            WHERE id = ?
        `).get(req.params.id);

        if (!complaint) {
            return res.status(404).json({
                message: "Complaint not found."
            });
        }

        if (status === 'Resolved') {
            const finalResolvedPath = resolved_image_path || complaint.resolved_image_path;
            if (!finalResolvedPath) {
                return res.status(400).json({
                    message: "Cannot mark status as Resolved without uploading and AI-verifying a resolution photo."
                });
            }

            if (complaint.ai_verification_status === 'rejected') {
                return res.status(400).json({
                    message: "Cannot mark status as Resolved: AI vision inspection determined that the issue is not cleared."
                });
            }
        }

        db.prepare(`
            UPDATE complaints
            SET status = ?, 
                resolved_image_path = COALESCE(?, resolved_image_path),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(status, resolved_image_path || null, req.params.id);

        db.prepare(`
            INSERT INTO complaint_updates
            (complaint_id, staff_id, status, message)
            VALUES (?, ?, ?, ?)
        `).run(
            req.params.id,
            req.user.id,
            status,
            message || null
        );

        res.json({
            message: "Complaint status updated successfully."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to update complaint status."
        });
    }
});

// SUBMIT STAFF QUERY
router.post("/queries", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "staff" && req.user.role !== "admin") {
            return res.status(403).json({
                message: "Staff access required."
            });
        }

        const { category, subject, details } = req.body;

        if (!category || !subject || !details) {
            return res.status(400).json({
                message: "Category, subject, and details are required."
            });
        }

        const result = db.prepare(`
            INSERT INTO staff_queries (staff_id, category, subject, details, status)
            VALUES (?, ?, ?, ?, 'Open')
        `).run(req.user.id, category.trim(), subject.trim(), details.trim());

        res.status(201).json({
            message: "Query submitted successfully.",
            queryId: result.lastInsertRowid
        });

    } catch (error) {
        console.error("submit query error:", error);
        res.status(500).json({
            message: "Failed to submit query."
        });
    }
});

// GET STAFF QUERIES
router.get("/queries", authenticateToken, (req, res) => {
    try {
        if (req.user.role !== "staff" && req.user.role !== "admin") {
            return res.status(403).json({
                message: "Staff access required."
            });
        }

        const queries = db.prepare(`
            SELECT *
            FROM staff_queries
            WHERE staff_id = ?
            ORDER BY created_at DESC
        `).all(req.user.id);

        res.json(queries);

    } catch (error) {
        console.error("fetch staff queries error:", error);
        res.status(500).json({
            message: "Failed to fetch queries."
        });
    }
});

// GET STAFF NOTIFICATIONS
router.get("/notifications", authenticateToken, (req, res) => {
    try {
        const notifications = db.prepare(`
            SELECT *
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `).all(req.user.id);

        const unreadCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM notifications
            WHERE user_id = ? AND is_read = 0
        `).get(req.user.id).count;

        res.json({
            notifications,
            unreadCount
        });
    } catch (error) {
        console.error("fetch notifications error:", error);
        res.status(500).json({
            message: "Failed to fetch notifications."
        });
    }
});

// MARK ALL NOTIFICATIONS AS READ
router.put("/notifications/read-all", authenticateToken, (req, res) => {
    try {
        db.prepare(`
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = ?
        `).run(req.user.id);

        res.json({ message: "All notifications marked as read." });
    } catch (error) {
        console.error("read all notifications error:", error);
        res.status(500).json({ message: "Failed to mark notifications as read." });
    }
});

// MARK SINGLE NOTIFICATION AS READ
router.put("/notifications/:id/read", authenticateToken, (req, res) => {
    try {
        db.prepare(`
            UPDATE notifications
            SET is_read = 1
            WHERE id = ? AND user_id = ?
        `).run(req.params.id, req.user.id);

        res.json({ message: "Notification marked as read." });
    } catch (error) {
        console.error("read notification error:", error);
        res.status(500).json({ message: "Failed to mark notification as read." });
    }
});

module.exports = router;