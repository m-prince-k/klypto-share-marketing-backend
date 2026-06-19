module.exports = {
  apps: [
    {
      name: "klypto-share-marketing-backend",
      script: "./index.js",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      }
    },
    {
      name: "klypto-daily-fetcher",
      script: "./workers/daily_5month_fetcher.js",
      // Runs every day at 00:05 (Midnight + 5 minutes)
      cron_restart: "5 0 * * *",
      autorestart: false,
      watch: false
    },
    {
      name: "klypto-live-scanner",
      script: "./workers/live_5min_scanner.js",
      // Runs every 5 minutes from 09:15 to 15:30 on weekdays
      cron_restart: "*/5 9-15 * * 1-5",
      autorestart: false,
      watch: false
    }
  ]
};
