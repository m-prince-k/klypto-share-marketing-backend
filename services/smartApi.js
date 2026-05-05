require('dotenv').config();
const { SmartAPI } = require("smartapi-javascript");

const smartApi = new SmartAPI({
    api_key: "AsZssQ9i" // Should probably be in .env but keeping it as per original code
});

module.exports = smartApi;
