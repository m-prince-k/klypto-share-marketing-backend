const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const {
  connectSocket,
  getIO,
  startGoldBroadcast,
} = require("./services/socket");
const { sequelize } = require("./models");
const store = require("./services/marketStore");
const { login } = require("./services/authService");
const {
  fetchTop200Stocks,
  syncLivePrices,
} = require("./services/stockService");
const {
  startWebSocketConnection,
  manageWebSocket,
} = require("./services/webSocketService");
const {
  startSchedulers,
  runInitialHistoricalLoad,
} = require("./services/schedulerService");

const cors = require("cors");

const stockRoutes = require("./routes/stockRoutes");
const optionsRoutes = require("./routes/optionsRoutes");
const futuresRoutes = require("./routes/futuresRoutes");
const authRoutes = require("./routes/authRoutes");
const alertRoutes = require("./routes/alertRoutes");
const indicatorRoutes = require("./routes/indicatorRoutes");
const backtestRoutes = require("./routes/backtestRoutes");
const tradeRoutes = require("./routes/tradeRoutes");
const strategyRoutes = require("./routes/strategyRoutes");

const app = express();
const server = http.createServer(app);

//init socket
connectSocket(server);
const io = getIO();

const alertService = require("./services/alertService");
alertService.init(io);

const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  // Production
  "https://klypto.in",
  "https://www.klypto.in",

  // Local development
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",

  // Other domains you own
  "https://klypto.app",
  "https://www.klypto.app",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors(corsOptions));
// Handle preflight requests
app.options(/.*/, cors(corsOptions));

app.use(express.static(__dirname + "/public")); // Serve only public/ folder, not entire project root
// Routes
app.use("/auth", authRoutes);
app.use("/equity", stockRoutes);
app.use("/options", optionsRoutes);
app.use("/futures", futuresRoutes);
app.use("/alerts", alertRoutes);
app.use("/api/indicator", indicatorRoutes);
app.use("/api/backtest", backtestRoutes);
app.use("/api/trades", tradeRoutes);
app.use("/api/strategy", strategyRoutes);

app.get("/", (req, res) => {
  res.send("Klypto backend is running");
});

// Socket logic is now managed in services/socket.js

async function bootstrap() {
  try {
    console.log("Synchronizing Database...");
    await sequelize.sync();

    server.listen(PORT, () => {
      console.log(`\n=================================================`);
      console.log(`🚀 SERVER RUNNING AT: http://localhost:${PORT}`);
      console.log(`-------------------------------------------------`);
      console.log(`📈 EQUITY:   http://localhost:${PORT}/equity/stocks`);
      console.log(`📊 EQUITY LIVE:      http://localhost:${PORT}/equity/live`);
      console.log(`📉 OPTIONS LIVE:     http://localhost:${PORT}/options/live`);
      console.log(`🔮 FUTURES LIVE:     http://localhost:${PORT}/futures/live`);
      console.log(`=================================================\n`);
    });

    // Run slow startup tasks after the HTTP server is already accepting requests.
    (async () => {
      try {
        console.log("[Startup] Loading stock master data in background...");
        await fetchTop200Stocks();

        console.log("[Startup] Logging into Angel One in background...");
        const loginData = await login();
        if (!loginData || !loginData.status) {
          console.error("Critical Error: Angel One login failed.");
          return;
        }

        store.loginData = loginData.data;

        await manageWebSocket(loginData, io);
        startSchedulers();

        // Non-blocking: sync LTP after startup so server is never stalled waiting for Angel One
        setTimeout(() => {
          console.log("[Startup] Running background LTP sync (non-blocking)...");
          syncLivePrices().catch((e) =>
            console.error("[Startup] LTP sync error:", e.message),
          );
        }, 5000);
      } catch (err) {
        console.error("[Startup] Background initialization error:", err);
      }
    })();
  } catch (err) {
    console.error("Bootstrap error:", err);
  }
}

bootstrap();
