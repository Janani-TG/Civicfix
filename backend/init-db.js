const bcrypt = require("bcryptjs");
const db = require("./database");

// 1. Create tables if they do not exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'citizen',
        department TEXT,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT,
        image_path TEXT,
        priority TEXT DEFAULT 'Medium',
        status TEXT DEFAULT 'Received',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS complaint_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL,
        staff_id INTEGER,
        status TEXT NOT NULL,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id),
        FOREIGN KEY (staff_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        email TEXT,
        otp TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS upvotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(complaint_id, user_id),
        FOREIGN KEY (complaint_id) REFERENCES complaints(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS complaint_ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        feedback TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`);

// 2. Safely check and add columns if missing on existing users table
const userColumns = db.prepare("PRAGMA table_info(users)").all();
const existingColNames = userColumns.map(col => col.name);

if (!existingColNames.includes("phone")) {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT;");
    console.log("Added 'phone' column to 'users' table.");
}
if (!existingColNames.includes("designation")) {
    db.exec("ALTER TABLE users ADD COLUMN designation TEXT;");
    console.log("Added 'designation' column to 'users' table.");
}
if (!existingColNames.includes("badge_id")) {
    db.exec("ALTER TABLE users ADD COLUMN badge_id TEXT;");
    console.log("Added 'badge_id' column to 'users' table.");
}
if (!existingColNames.includes("is_active")) {
    db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;");
    console.log("Added 'is_active' column to 'users' table.");
}
if (!existingColNames.includes("suspended_until")) {
    db.exec("ALTER TABLE users ADD COLUMN suspended_until DATETIME;");
    console.log("Added 'suspended_until' column to 'users' table.");
}
if (!existingColNames.includes("suspension_reason")) {
    db.exec("ALTER TABLE users ADD COLUMN suspension_reason TEXT;");
    console.log("Added 'suspension_reason' column to 'users' table.");
}
if (!existingColNames.includes("points")) {
    db.exec("ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0;");
    console.log("Added 'points' column to 'users' table.");
}

// 2b. Safely check and add columns if missing on existing complaints table
const compColumns = db.prepare("PRAGMA table_info(complaints)").all();
const existingCompCols = compColumns.map(col => col.name);

if (!existingCompCols.includes("latitude")) {
    db.exec("ALTER TABLE complaints ADD COLUMN latitude REAL;");
    console.log("Added 'latitude' column to 'complaints' table.");
}
if (!existingCompCols.includes("longitude")) {
    db.exec("ALTER TABLE complaints ADD COLUMN longitude REAL;");
    console.log("Added 'longitude' column to 'complaints' table.");
}
if (!existingCompCols.includes("formatted_address")) {
    db.exec("ALTER TABLE complaints ADD COLUMN formatted_address TEXT;");
    console.log("Added 'formatted_address' column to 'complaints' table.");
}
if (!existingCompCols.includes("place_name")) {
    db.exec("ALTER TABLE complaints ADD COLUMN place_name TEXT;");
    console.log("Added 'place_name' column to 'complaints' table.");
}
if (!existingCompCols.includes("resolved_image_path")) {
    db.exec("ALTER TABLE complaints ADD COLUMN resolved_image_path TEXT;");
    console.log("Added 'resolved_image_path' column to 'complaints' table.");
}
if (!existingCompCols.includes("ai_verification_status")) {
    db.exec("ALTER TABLE complaints ADD COLUMN ai_verification_status TEXT;");
    console.log("Added 'ai_verification_status' column to 'complaints' table.");
}
if (!existingCompCols.includes("ai_verification_reason")) {
    db.exec("ALTER TABLE complaints ADD COLUMN ai_verification_reason TEXT;");
    console.log("Added 'ai_verification_reason' column to 'complaints' table.");
}
if (!existingCompCols.includes("ai_confidence")) {
    db.exec("ALTER TABLE complaints ADD COLUMN ai_confidence REAL;");
    console.log("Added 'ai_confidence' column to 'complaints' table.");
}
if (!existingCompCols.includes("verification_status")) {
    db.exec("ALTER TABLE complaints ADD COLUMN verification_status TEXT DEFAULT 'pending';");
    console.log("Added 'verification_status' column to 'complaints' table.");
}
if (!existingCompCols.includes("rejection_reason")) {
    db.exec("ALTER TABLE complaints ADD COLUMN rejection_reason TEXT;");
    console.log("Added 'rejection_reason' column to 'complaints' table.");
}
if (!existingCompCols.includes("rating")) {
    db.exec("ALTER TABLE complaints ADD COLUMN rating INTEGER;");
    console.log("Added 'rating' column to 'complaints' table.");
}
if (!existingCompCols.includes("feedback")) {
    db.exec("ALTER TABLE complaints ADD COLUMN feedback TEXT;");
    console.log("Added 'feedback' column to 'complaints' table.");
}
if (!existingCompCols.includes("upvote_count")) {
    db.exec("ALTER TABLE complaints ADD COLUMN upvote_count INTEGER DEFAULT 0;");
    console.log("Added 'upvote_count' column to 'complaints' table.");
}

// 3. Seed default system accounts if they do not exist
const adminPasswordHash = bcrypt.hashSync("25mx317334", 10);
const existingAdmin = db.prepare("SELECT * FROM users WHERE email = ?").get("admin@civicfix.com");
if (!existingAdmin) {
    db.prepare(`
        INSERT INTO users (name, email, password, role, department, phone, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run("System Administrator", "admin@civicfix.com", adminPasswordHash, "admin", null, null);
    console.log("Seeded admin account: admin@civicfix.com");
} else {
    db.prepare("UPDATE users SET password = ?, role = 'admin' WHERE email = 'admin@civicfix.com'").run(adminPasswordHash);
    console.log("Updated admin account password to fixed credentials.");
}

const existingStaff = db.prepare("SELECT * FROM users WHERE email = ?").get("staff@civicfix.com");
if (!existingStaff) {
    const staffPasswordHash = bcrypt.hashSync("StaffPassword@123", 10);
    db.prepare(`
        INSERT INTO users (name, email, password, role, department, designation, badge_id, phone, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run("Zonal Health Officer", "staff@civicfix.com", staffPasswordHash, "staff", "Sanitation", "Health Officer", "CBE-SN-001", "9876543210");
    console.log("Seeded staff account: staff@civicfix.com");
}

// Seed sample municipal personnel
const samplePersonnel = [
    {
        name: "Test User",
        designation: "Test Officer",
        badge_id: "CBE-EL-197",
        department: "Electrical",
        email: "testbug@civicfix.com"
    },
    {
        name: "Priya Subramaniam",
        designation: "Senior Inspector",
        badge_id: "CBE-RW-001",
        department: "Road Works",
        email: "roadworks@civicfix.com"
    },
    {
        name: "Divya Rajendran",
        designation: "Junior Engineer",
        badge_id: "CBE-EL-002",
        department: "Electrical",
        email: "electrical@civicfix.com"
    }
];

const defaultStaffPassHash = bcrypt.hashSync("StaffPassword@123", 10);
samplePersonnel.forEach(p => {
    const exists = db.prepare("SELECT * FROM users WHERE email = ?").get(p.email);
    if (!exists) {
        db.prepare(`
            INSERT INTO users (name, email, password, role, department, designation, badge_id, phone, is_active)
            VALUES (?, ?, ?, 'staff', ?, ?, ?, ?, 1)
        `).run(p.name, p.email, defaultStaffPassHash, p.department, p.designation, p.badge_id, "9876543212");
        console.log(`Seeded personnel: ${p.name} (${p.email})`);
    }
});

// Update any staff accounts with missing phone numbers
db.prepare("UPDATE users SET phone = '9876543210' WHERE email = 'staff@civicfix.com' AND (phone IS NULL OR phone = '')").run();
db.prepare("UPDATE users SET phone = '9876543212' WHERE email = 'testbug@civicfix.com' AND (phone IS NULL OR phone = '')").run();
db.prepare("UPDATE users SET phone = '9876543213' WHERE email = 'roadworks@civicfix.com' AND (phone IS NULL OR phone = '')").run();
db.prepare("UPDATE users SET phone = '9876543214' WHERE email = 'electrical@civicfix.com' AND (phone IS NULL OR phone = '')").run();

// 4. Update existing user 'Test Citizen' (id 1) with phone '9876543211' if phone is NULL
const testCitizen = db.prepare("SELECT * FROM users WHERE id = 1").get();
if (testCitizen && (testCitizen.phone === null || testCitizen.phone === undefined || testCitizen.phone === "")) {
    db.prepare("UPDATE users SET phone = ? WHERE id = 1").run("9876543211");
    console.log("Updated Test Citizen (id 1) phone to 9876543211.");
}

console.log("CivicFix database initialized and verified successfully.");