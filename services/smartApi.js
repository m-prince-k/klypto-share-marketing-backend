require('dotenv').config();
const { SmartAPI } = require("smartapi-javascript");

const axios = require('axios');
axios.defaults.timeout = 30000; // 30 seconds timeout for all requests

const smartApi = new SmartAPI({
    api_key: "AsZssQ9i" // Should probably be in .env but keeping it as per original code
});

module.exports = smartApi;
