const speakeasy = require("speakeasy");
const smartApi = require("./smartApi");

const fs = require('fs');
const path = require('path');
const TOKEN_FILE = path.join(__dirname, '../angel_token.json');

async function login(force = false) {
    if (fs.existsSync(TOKEN_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            const now = Date.now();
            
            // DO NOT force a new login IF the token in the file is both FRESH AND DIFFERENT from our current token.
            // If it's the exact same token we already have, it means it just failed, so we MUST generate a new one!
            const isFreshToken = (now - data.timestamp) < 60000;
            const isDifferentToken = smartApi.access_token !== data.jwtToken;

            if ((!force || (isFreshToken && isDifferentToken)) && (now - data.timestamp < 12 * 60 * 60 * 1000)) {
                smartApi.setAccessToken(data.jwtToken);
                return { status: true, message: 'SUCCESS', data: data };
            }
        } catch (e) {
            console.error("Error reading token file:", e.message);
        }
    }

    const totp = speakeasy.totp({
        secret: "W2VACHHBZMVA6ACTPAJY3TNGFA",
        encoding: "base32"
    });

    try {
        console.log("Generating fresh Angel One session...");
        const loginData = await smartApi.generateSession("AAAP423969", "2004", totp);
        
        if (loginData && loginData.status && loginData.data && loginData.data.jwtToken) {
            loginData.data.timestamp = Date.now();
            fs.writeFileSync(TOKEN_FILE, JSON.stringify(loginData.data));
            console.log("Saved new Angel One token to file.");
        }
        
        return loginData;
    } catch (err) {
        console.error("Login failed:", err);
    }
}

module.exports = { login };
