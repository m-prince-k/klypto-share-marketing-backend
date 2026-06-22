const speakeasy = require("speakeasy");
const smartApi = require("../services/smartApi");

const angelAuthMiddleware = async (req, res, next) => {
    const totp = speakeasy.totp({
        secret: "W2VACHHBZMVA6ACTPAJY3TNGFA",
        encoding: "base32"
    });

    try {
        const loginData = await smartApi.generateSession("AAAP423969", "2004", totp);
        if (!loginData?.data) {
            return res.send({ message: "Angel login failed" });
        }

        const authToken = loginData.data.jwtToken;
        const refreshToken = loginData.data.refreshToken;
        // 📡 Feed Token
        const feedToken = loginData.data.feedToken;

        // 👤 Profile
        const profile = await smartApi.getProfile(refreshToken);

        // ✅ Attach to request
        req.angel = {
            smartApi,
            authToken,
            refreshToken,
            feedToken,
            profile: profile.data
        };
        next();
    } catch (err) {
        console.error("Login failed:", err);
        return res.status(500).json({
            success: false,
            message: "Angel authentication failed",
            error: err.message
        });
    }
}
module.exports = angelAuthMiddleware;