const jwt = require("jsonwebtoken");

const JWT_SECRET = "civicfix_secret_key";

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Access token required."
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Invalid authorization format."
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = decoded;

        next();
    } catch (error) {
        return res.status(403).json({
            message: "Invalid or expired token."
        });
    }
}

module.exports = authenticateToken;