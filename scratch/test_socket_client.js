const io = require("socket.io-client");

console.log("Connecting to WebSocket on http://localhost:7000...");
const socket = io("http://localhost:7000");

socket.on("connect", () => {
    console.log("✅ Socket Connected! ID:", socket.id);
});

socket.on("goldUpdate", (payload) => {
    console.log("🔔 Received goldUpdate event!");
    console.log("Success:", payload.success);
    if (payload.data && payload.data.length > 0) {
        console.log(`Received data for ${payload.data.length} contracts.`);
        console.log("Sample Data (First Contract):", payload.data[0].name);
        console.log("Candles count:", payload.data[0].data.length);
    } else {
        console.log("No data array found or empty.");
    }
});

socket.on("connect_error", (err) => {
    console.error("❌ Connection Error:", err.message);
});

socket.on("disconnect", () => {
    console.log("⚠️ Socket Disconnected.");
});

// Keep running for 70 seconds to catch at least one broadcast (interval is 60s)
setTimeout(() => {
    console.log("Test finished.");
    process.exit(0);
}, 70000);
