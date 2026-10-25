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
function getLocalIp() {
    const ifaces = os.networkInterfaces();
    for (const dev in ifaces) {
        for (const details of ifaces[dev]) {
            if (details.family === "IPv4" && !details.internal) {
                return details.address;
            }
        }
    }
    return "127.0.0.1";
}

app.listen(PORT, "0.0.0.0", () => {
    const localIp = getLocalIp();
    console.log(`CivicFix server running at:`);
    console.log(`  Local:   http://localhost:${PORT}/login.html`);
    console.log(`  Network: http://${localIp}:${PORT}/login.html (Open on your phone)`);
});