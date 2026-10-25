const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "civicfix.db");
const db = new Database(dbPath);

// Ensure essential tables and columns exist
db.exec(`
    CREATE TABLE IF NOT EXISTS staff_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        subject TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT DEFAULT 'Open' CHECK(status IN ('Open', 'Closed')),
        admin_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'query_reply',
        reference_id INTEGER,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`);

function ensureComplaintColumns() {
    try {
        const compColumns = db.prepare("PRAGMA table_info(complaints)").all();
        const existingNames = compColumns.map(col => col.name);

        if (!existingNames.includes("latitude")) {
            db.exec("ALTER TABLE complaints ADD COLUMN latitude REAL;");
        }
        if (!existingNames.includes("longitude")) {
            db.exec("ALTER TABLE complaints ADD COLUMN longitude REAL;");
        }
        if (!existingNames.includes("formatted_address")) {
            db.exec("ALTER TABLE complaints ADD COLUMN formatted_address TEXT;");
        }
        if (!existingNames.includes("place_name")) {
            db.exec("ALTER TABLE complaints ADD COLUMN place_name TEXT;");
        }
        if (!existingNames.includes("resolved_image_path")) {
            db.exec("ALTER TABLE complaints ADD COLUMN resolved_image_path TEXT;");
        }
        if (!existingNames.includes("ai_verification_status")) {
            db.exec("ALTER TABLE complaints ADD COLUMN ai_verification_status TEXT;");
        }
        if (!existingNames.includes("ai_verification_reason")) {
            db.exec("ALTER TABLE complaints ADD COLUMN ai_verification_reason TEXT;");
        }
        if (!existingNames.includes("ai_confidence")) {
            db.exec("ALTER TABLE complaints ADD COLUMN ai_confidence REAL;");
        }
    } catch (e) {
        console.error("Complaint columns migration notice:", e.message);
    }
}
ensureComplaintColumns();

function ensureOtpColumns() {
    try {
        const otpColumns = db.prepare("PRAGMA table_info(otps)").all();
        const existingNames = otpColumns.map(col => col.name);
        if (!existingNames.includes("email")) {
            db.exec("ALTER TABLE otps ADD COLUMN email TEXT;");
        }
    } catch (e) {
        console.error("OTP columns migration notice:", e.message);
    }
}
ensureOtpColumns();

function migrateDepartmentNames() {
    try {
        const mappings = [
            { old: ["Sanitation", "Waste Mgmt", "Waste Management", "Sanitation & Waste Management"], newName: "Sanitation & Waste" },
            { old: ["Electrical", "Lights", "Electrical & Lights"], newName: "Electrical & Lights" },
            { old: ["Road Works", "Infrastructure", "Infra & Rec", "Road Works & Infrastructure"], newName: "Road Works & Infrastructure" },
            { old: ["Water Supply", "Drainage", "Water Supply & Drainage"], newName: "Water Supply & Drainage" },
            { old: ["Public Health"], newName: "Public Health" },
            { old: ["Town Planning"], newName: "Town Planning" }
        ];

        for (const item of mappings) {
            for (const oldVal of item.old) {
                if (oldVal !== item.newName) {
                    db.prepare("UPDATE users SET department = ? WHERE department = ?").run(item.newName, oldVal);
                    db.prepare("UPDATE complaints SET category = ? WHERE category = ?").run(item.newName, oldVal);
                }
            }
        }
        console.log("Department and category names standardized successfully.");
    } catch (e) {
        console.error("Department migration notice:", e.message);
    }
}
migrateDepartmentNames();

console.log("CivicFix SQLite database connected successfully.");

module.exports = db;