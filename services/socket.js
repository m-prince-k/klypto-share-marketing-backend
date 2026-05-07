// socket.js
let io;

const connectSocket = (server) => {
    const { Server } = require("socket.io");


    io = new Server(server, {
        cors: {
            origin: "*"
        },
        maxHttpBufferSize: 1e7 // Increase to 10MB for large historical data
    });



    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        // Historical Data via Socket
        socket.on("getManualHistoricalData", async (payload) => {
            try {
                const { fetchManualHistoricalData } = require('./historicalService');
                console.log(`[Socket] Historical request for ${payload.symbol}`);
                const result = await fetchManualHistoricalData(payload);
                socket.emit("historicalDataResponse", result);
            } catch (err) {
                console.error("[Socket] Historical Error:", err.message);
                socket.emit("historicalDataError", { success: false, error: err.message });
            }
        });

        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
        });
    });

};

const startGoldBroadcast = () => {
    const { fetchGoldHistory } = require('./commodityService');

    console.log("[Socket] Initializing Gold Real-time Broadcast...");

    const broadcast = async () => {
        if (!io) {
            console.log("[Socket] io not initialized yet, skipping broadcast.");
            return;
        }

        try {
            console.log("[Socket] Fetching fresh Gold data for broadcast...");
            const data = await fetchGoldHistory("1m", 1); // Just last 1 day for broadcast efficiency
            if (data && data.length > 0) {
                io.emit("goldUpdate", {
                    success: true,
                    timestamp: new Date().toISOString(),
                    data: data
                });
                console.log(`[Socket] Broadcasted Gold Update (${data.length} contracts) to all clients.`);
            } else {
                console.log("[Socket] No Gold data found to broadcast.");
            }
        } catch (err) {
            console.error("[Socket] Gold Broadcast Error:", err.message);
        }
    };

    // Run immediately on start
    broadcast();

    // Then run every 60 seconds
    setInterval(broadcast, 10000);
};

// export io getter
const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

module.exports = { connectSocket, getIO, startGoldBroadcast };