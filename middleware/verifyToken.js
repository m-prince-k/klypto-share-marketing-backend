require("dotenv").config();
const jwt = require("jsonwebtoken");

const verifyToken = async (req, res, next) => {
  try {
    // 1️⃣ Get token from header
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return await res.status(401).json({ message: "Unauthorized" });
    }

    // Expected format: Bearer TOKEN
    const token = authHeader.split(" ")[1];
    if (!token) {
      return await res.status(401).json({ message: "Token missing" });
    }

    // 2️⃣ Verify token
    await jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          message: "Invalid or expired token",
        });
      }

      // 3️⃣ Attach user info to request
      req.user = decoded; // { id, email, role, etc }
      next();
    });
  } catch (error) {
    return res.status(500).json({ message: "Token verification failed" });
  }
};

module.exports = {verifyToken};