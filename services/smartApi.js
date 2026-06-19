require('dotenv').config();
const { SmartAPI } = require("smartapi-javascript");

const axios = require('axios');
axios.defaults.timeout = 30000; // 30 seconds timeout for all requests

let smartApiInstance = null;

function getSmartApiInstance() {
    if (!smartApiInstance) {
        smartApiInstance = new SmartAPI({
            api_key: process.env.SMART_API_KEY || "AsZssQ9i", // Preserve original fallback while allowing env configuration
        });
    }

    return smartApiInstance;
}

module.exports = new Proxy({}, {
    get(_target, prop) {
        const instance = getSmartApiInstance();
        const value = instance[prop];
        return typeof value === "function" ? value.bind(instance) : value;
    },
    set(_target, prop, value) {
        const instance = getSmartApiInstance();
        instance[prop] = value;
        return true;
    },
    has(_target, prop) {
        return prop in getSmartApiInstance();
    },
    ownKeys() {
        return Reflect.ownKeys(getSmartApiInstance());
    },
    getOwnPropertyDescriptor(_target, prop) {
        const descriptor = Object.getOwnPropertyDescriptor(getSmartApiInstance(), prop);

        if (descriptor) {
            return descriptor;
        }

        return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: undefined,
        };
    },
});
