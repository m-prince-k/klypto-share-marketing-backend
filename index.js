const {
  subscribeStock,
  getAllTicks,
  getTickByStock
} = require("./services/breeze-connect");

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const { getData, getAllStocks } = require("./historicalData");

const cors=require("cors");


const PORT = 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// app.use("/api");

app.get("/testing", async (req, res) => {
    return await res.send("safasf")
});

app.post("/subscribe", async (req, res) => {
  try {
    const result = await subscribeStock(req.body);
   return await res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || String(error)
    });
  }
});


app.get("/ticks", async (req, res) => {
  return await res.json(getAllTicks());
});

app.get("/ticks/:stockCode", async (req, res) => {
  return await res.json(getTickByStock(req.params.stockCode));
});

function formatOHLCV(response) {
  // ✅ Step 1: extract Success
  const data = response?.Success || [];

  // ✅ Step 2: map to OHLCV
  return data.map(item => ({
    time: Math.floor(new Date(item.datetime).getTime() / 1000), // ⚠️ IMPORTANT
    datetime: item.datetime,
    expiry_date:item.expiry_date,
    count:item.count,
    stockCode:item.stock_code,
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    volume: Number(item.volume),
    openInterest: Number(item.open_interest)
  }));
}


app.get("/getBreezeHistoricalData",async (req,res) => {
    try {
        const {interval,symbol,from_date,to_date}=req.query;
        let object={
            interval:interval,
            symbol:symbol,
            from_date:from_date,
            to_date:to_date
        }
        const data = await getData(object);
        console.log(data,"________---8978643")
        return await res.json({data:formatOHLCV(data)});
    } catch (error) {
        console.log(error);
    }
})

app.get("/getAllStockss",async (req,res) => {
    const output = await getAllStocks();
    return output;
});


app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});