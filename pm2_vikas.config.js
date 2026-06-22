module.exports = {
  apps: [
    {
      name: "vikas-cron-job",
      script: "./scratch/run_vikas.js",
      // Runs every day at 12:00 AM (Midnight)
      cron_restart: "0 0 * * *",
      autorestart: false, // Prevents it from looping constantly
      watch: false
    }
  ]
};
