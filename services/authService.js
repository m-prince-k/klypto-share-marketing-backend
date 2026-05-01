const speakeasy = require("speakeasy");
const smartApi = require("./smartApi");

async function login() {
    const totp = speakeasy.totp({
        secret: "W2VACHHBZMVA6ACTPAJY3TNGFA",
        encoding: "base32"
    });

    try {
        const loginData = await smartApi.generateSession("AAAP423969", "2004", totp);
        console.log("Login Response:", loginData);
        return loginData;
    } catch (err) {
        console.error("Login failed:", err);
    }
}

module.exports = { login };
