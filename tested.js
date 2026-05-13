
const express = require("express");
const axios = require("axios");
const { SMA } = require("technicalindicators");
const { Candle } = require('./models');
const { Op } = require('sequelize');

const app = express();

app.use(express.json());

const CONFIG = {
    apiKey: "YOUR_API_KEY",
    clientCode: "YOUR_CLIENT_CODE",
    password: "YOUR_PASSWORD",
    totp: "YOUR_TOTP",

    // Example NIFTY
    exchange: "NSE",
    symboltoken: "26000",

    // ONE_MINUTE / FIVE_MINUTE etc
    interval: "ONE_MINUTE"
};

/**
 * ----------------------------------------------------
 * LOGIN
 * ----------------------------------------------------
 */

async function angelLogin() {

    try {

        const response = await axios.post(
            "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword",
            {
                clientcode: CONFIG.clientCode,
                password: CONFIG.password,
                totp: CONFIG.totp
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-UserType": "USER",
                    "X-SourceID": "WEB",
                    "X-ClientLocalIP": "127.0.0.1",
                    "X-ClientPublicIP": "127.0.0.1",
                    "X-MACAddress": "00:00:00:00:00:00",
                    "X-PrivateKey": CONFIG.apiKey
                }
            }
        );

        return response.data.data.jwtToken;

    } catch (error) {

        console.log("LOGIN ERROR");

        console.log(
            error.response?.data || error.message
        );

        return null;
    }
}

/**
 * ----------------------------------------------------
 * FETCH 200 CANDLES
 * ----------------------------------------------------
 */

async function fetchCandles(jwtToken) {

    try {

        const now = new Date();

        const fromDate = new Date(
            now.getTime() - (200 * 60 * 1000)
        );

        const response = await axios.post(
            "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData",
            {
                exchange: CONFIG.exchange,
                symboltoken: CONFIG.symboltoken,
                interval: CONFIG.interval,

                fromdate: formatDate(fromDate),
                todate: formatDate(now)
            },
            {
                headers: {
                    Authorization: `Bearer ${jwtToken}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-UserType": "USER",
                    "X-SourceID": "WEB",
                    "X-ClientLocalIP": "127.0.0.1",
                    "X-ClientPublicIP": "127.0.0.1",
                    "X-MACAddress": "00:00:00:00:00:00",
                    "X-PrivateKey": CONFIG.apiKey
                }
            }
        );

        const candles = response.data.data;

        /**
         * Angel Candle Format:
         * [
         *   time,
         *   open,
         *   high,
         *   low,
         *   close,
         *   volume
         * ]
         */

        return candles.map(c => ({
            time: c[0],
            open: Number(c[1]),
            high: Number(c[2]),
            low: Number(c[3]),
            close: Number(c[4]),
            volume: Number(c[5])
        }));

    } catch (error) {

        console.log("CANDLE ERROR");

        console.log(
            error.response?.data || error.message
        );

        return [];
    }
}

/**
 * ----------------------------------------------------
 * DATE FORMAT
 * ----------------------------------------------------
 */

function formatDate(date) {

    const pad = (n) => String(n).padStart(2, "0");

    return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate()) +
        " " +
        pad(date.getHours()) +
        ":" +
        pad(date.getMinutes())
    );
}

/**
 * ----------------------------------------------------
 * ADD SMA
 * ----------------------------------------------------
 */

function addSMA(candles) {

    const closes = candles.map(c => c.close);

    const sma20 = SMA.calculate({
        period: 20,
        values: closes
    });

    const sma50 = SMA.calculate({
        period: 50,
        values: closes
    });

    const sma100 = SMA.calculate({
        period: 100,
        values: closes
    });

    const sma200 = SMA.calculate({
        period: 200,
        values: closes
    });

    return candles.map((candle, index) => ({

        ...candle,

        SMA_20:
            index >= 19
                ? sma20[index - 19]
                : null,

        SMA_50:
            index >= 49
                ? sma50[index - 49]
                : null,

        SMA_100:
            index >= 99
                ? sma100[index - 99]
                : null,

        SMA_200:
            index >= 199
                ? sma200[index - 199]
                : null
    }));
}

/**
 * ----------------------------------------------------
 * CHECK SMA CONDITIONS
 * ----------------------------------------------------
 */

function checkSmaConditions(df, lookback = 3) {

    if (!df || df.length < 200) {

        return {
            trend: null,
            setup: null
        };
    }

    const validDf = df.filter(
        x =>
            x.SMA_20 &&
            x.SMA_50 &&
            x.SMA_100 &&
            x.SMA_200
    );

    const row = validDf[validDf.length - 1];

    const o = row.open;
    const c = row.close;

    const smas = [
        row.SMA_20,
        row.SMA_50,
        row.SMA_100,
        row.SMA_200
    ];

    const maxSma = Math.max(...smas);
    const minSma = Math.min(...smas);

    const aboveAll = c > maxSma;

    const belowAll = c < minSma;

    const crossLastUp =
        o <= maxSma && c >= maxSma;

    const crossLastDown =
        c <= minSma && o >= minSma;

    if (
        !(
            aboveAll ||
            crossLastUp ||
            belowAll ||
            crossLastDown
        )
    ) {

        return {
            trend: null,
            setup: null
        };
    }

    const last3 = validDf.slice(
        -(lookback + 1),
        -1
    );

    let belowAllCnt = 0;

    let aboveAllCnt = 0;

    let crossAny = false;

    for (const prev of last3) {

        const pc = prev.close;

        const prevSmas = [
            prev.SMA_20,
            prev.SMA_50,
            prev.SMA_100,
            prev.SMA_200
        ];

        const pmax = Math.max(...prevSmas);

        const pmin = Math.min(...prevSmas);

        if (pc < pmin) {

            belowAllCnt++;

        } else if (pc > pmax) {

            aboveAllCnt++;

        } else {

            crossAny = true;
        }
    }

    if (aboveAll || crossLastUp) {

        if (crossAny) {

            return {
                trend: "UP",
                setup: "CROSS_CONTINUATION"
            };
        }

        if (belowAllCnt === lookback) {

            return {
                trend: "UP",
                setup: "REVERSAL"
            };
        }
    }

    if (belowAll || crossLastDown) {

        if (crossAny) {

            return {
                trend: "DOWN",
                setup: "CROSS_CONTINUATION"
            };
        }

        if (aboveAllCnt === lookback) {

            return {
                trend: "DOWN",
                setup: "REVERSAL"
            };
        }
    }

    return {
        trend: null,
        setup: null
    };
}

/**
 * ----------------------------------------------------
 * API
 * ----------------------------------------------------
 */

app.get("/signal", async (req, res) => {

    try {

        const jwtToken = await angelLogin();

        if (!jwtToken) {

            return res.json({
                success: false,
                message: "Login failed"
            });
        }

        const candles = await Candle.findAll({

            where: {

                candle_time: {
                    [Op.lte]: now
                },

                symbol: "NIFTY",

                interval: "ONE_MINUTE"
            },

            order: [
                ["candle_time", "DESC"]
            ],

            limit: 200,

            raw: true
        });

        candles = addSMA(candles);

        const signal =
            checkSmaConditions(candles);

        res.json({

            success: true,

            totalCandles: candles.length,

            latestCandle:
                candles[candles.length - 1],

            signal
        });

    } catch (error) {

        console.log(error);

        res.json({
            success: false,
            error: error.message
        });
    }
});

/**
 * ----------------------------------------------------
 * START SERVER
 * ----------------------------------------------------
 */

app.listen(3000, () => {

    console.log(
        "SERVER RUNNING http://localhost:3000"
    );
});