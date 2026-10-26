const fs = require("fs");
const path = require("path");

// Load .env file if present
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    envConfig.split("\n").forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
            const [key, ...values] = trimmed.split("=");
            if (key && values.length > 0) {
                process.env[key.trim()] = values.join("=").trim();
            }
        }
    });
}

const express = require("express");
const cors = require("cors");
const db = require("./database");
const authRoutes = require("./routes/auth");
const complaintRoutes = require("./routes/complaints");
const authenticateToken = require("./middleware/auth");
const staffRoutes = require("./routes/staff");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = 3000;

// Middleware
app.use((req, res, next) => {
    if (req.url.startsWith("//")) {
        req.url = req.url.replace(/^\/+/, "/");
    }
    next();
});
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "../frontend")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/complaints", authenticateToken, complaintRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/admin", adminRoutes);

// Direct Page Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// API Health Test route
app.get("/api", (req, res) => {
    res.json({
        message: "CivicFix Backend API is running!",
        status: "operational"
    });
});

// Start server on all network interfaces
const os = require("os");
const { exec } = require("child_process");

function getLocalIp() {
    const ifaces = os.networkInterfaces();
    // Prioritize Wi-Fi or Wireless adapters
    for (const dev in ifaces) {
        if (/wi-?fi|wlan/i.test(dev)) {
            for (const details of ifaces[dev]) {
                if (details.family === "IPv4" && !details.internal) {
                    return details.address;
                }
            }
        }
    }
    // Fallback to any non-internal IPv4
    for (const dev in ifaces) {
        for (const details of ifaces[dev]) {
            if (details.family === "IPv4" && !details.internal) {
                return details.address;
            }
        }
    }
    return "127.0.0.1";
}

function tryAdbReverse() {
    const defaultAdb = "C:\\Users\\SHRI\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
    const adbCmd = fs.existsSync(defaultAdb) ? `"${defaultAdb}"` : "adb";
    exec(`${adbCmd} reverse tcp:3000 tcp:3000`, (err, stdout) => {
        if (!err) {
            console.log(`  USB/ADB: http://localhost:${PORT}/login.html (Active on connected USB phone)`);
        }
    });
}

app.listen(PORT, "0.0.0.0", () => {
    const localIp = getLocalIp();
    console.log(`\n==============================================`);
    console.log(`🚀 CivicFix Server Active:`);
    console.log(`  Local PC: http://localhost:${PORT}/login.html`);
    console.log(`  Phone Wi-Fi: http://${localIp}:${PORT}/login.html`);
    console.log(`==============================================`);
    tryAdbReverse();
});