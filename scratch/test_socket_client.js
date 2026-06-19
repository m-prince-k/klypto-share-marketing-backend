
const { io } = require("socket.io-client");

const socket = io("http://localhost:7000");

socket.on("connect", () => {
    console.log("Connected to server via WebSocket! ID:", socket.id);
    
    // Test historical data request
    socket.emit("getManualHistoricalData", {
        symbol: "TCS",
        interval: "ONE_DAY",
        fromDate: "2026-05-01",
        toDate: "2026-05-05"
    });
});

socket.on("msg", (data) => {
    console.log("Received 'msg':", data);
});

socket.on("stocks", (data) => {
    console.log("Received 'stocks' list, count:", data.length);
});

socket.on("historicalDataResponse", (data) => {
    console.log("Received historical data response for:", data.symbol);
    console.log("Data count:", data.count);
    process.exit(0);
});

socket.on("historicalDataError", (err) => {
    console.error("Error received from socket:", err);
    process.exit(1);
});

socket.on("connect_error", (err) => {
    console.error("Connection error:", err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error("Timeout waiting for socket response");
    process.exit(1);
}, 10000);
