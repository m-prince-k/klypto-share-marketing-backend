// utils/blackScholes.js

// Standard normal cumulative distribution function
function CND(x) {
    const a1 = 0.31938153;
    const a2 = -0.356563782;
    const a3 = 1.781477937;
    const a4 = -1.821255978;
    const a5 = 1.330274429;
    
    const L = Math.abs(x);
    const K = 1.0 / (1.0 + 0.2316419 * L);
    const w = 1.0 - 1.0 / Math.sqrt(2 * Math.PI) * Math.exp(-L * L / 2) * (a1 * K + a2 * K * K + a3 * Math.pow(K, 3) + a4 * Math.pow(K, 4) + a5 * Math.pow(K, 5));
    
    if (x < 0) {
        return 1.0 - w;
    }
    return w;
}

// Standard normal probability density function
function ND(x) {
    return (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Calculates the theoretical price of an option using Black-Scholes formula
 */
function blackScholesPrice(S, K, T, r, v, type) {
    const d1 = (Math.log(S / K) + (r + (v * v) / 2) * T) / (v * Math.sqrt(T));
    const d2 = d1 - v * Math.sqrt(T);

    if (type === 'CE') {
        return S * CND(d1) - K * Math.exp(-r * T) * CND(d2);
    } else { // 'PE'
        return K * Math.exp(-r * T) * CND(-d2) - S * CND(-d1);
    }
}

/**
 * Calculates the Vega of an option
 */
function vega(S, K, T, r, v) {
    const d1 = (Math.log(S / K) + (r + (v * v) / 2) * T) / (v * Math.sqrt(T));
    return S * ND(d1) * Math.sqrt(T);
}

/**
 * Calculates Implied Volatility using the Newton-Raphson method
 * @param {Number} targetPrice The current market price of the option
 * @param {Number} S Spot price of the underlying
 * @param {Number} K Strike price
 * @param {Number} T Time to expiration in years
 * @param {Number} r Risk-free interest rate (e.g., 0.10 for 10%)
 * @param {String} type Option type: 'CE' or 'PE'
 * @returns {Number} The implied volatility (as a decimal, e.g., 0.25 for 25%)
 */
function calculateIV(targetPrice, S, K, T, r, type) {
    // If intrinsic value is extremely close to target price, IV is effectively 0
    let intrinsic = 0;
    if (type === 'CE') intrinsic = Math.max(0, S - K);
    else intrinsic = Math.max(0, K - S);
    
    if (targetPrice <= intrinsic) {
        return 0.00; 
    }
    if (T <= 0) return 0.00;

    const MAX_ITERATIONS = 100;
    const PRECISION = 1.0e-5;
    
    // Initial guess
    let v = 0.5;
    
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const price = blackScholesPrice(S, K, T, r, v, type);
        const diff = targetPrice - price;
        
        if (Math.abs(diff) < PRECISION) {
            return v;
        }
        
        const vg = vega(S, K, T, r, v);
        if (vg < 1.0e-8) {
            // Vega is too small, Newton-Raphson won't work well here.
            // Bisection fallback or just return current guess.
            break;
        }
        
        v = v + diff / vg;
    }
    
    // Return max 500% to avoid absurd values
    if (v > 5) return 5.0; 
    if (v < 0) return 0.0;
    return v;
}

/**
 * Calculates the Option Greeks (Delta, Gamma, Theta, Vega)
 */
function calculateGreeks(S, K, T, r, v, type) {
    if (T <= 0 || v <= 0) {
        return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    }

    const d1 = (Math.log(S / K) + (r + (v * v) / 2) * T) / (v * Math.sqrt(T));
    const d2 = d1 - v * Math.sqrt(T);

    const Nd1 = CND(d1);
    const Nd2 = CND(d2);
    const N_d1 = ND(d1);

    let delta = 0;
    let theta = 0;

    const gamma = N_d1 / (S * v * Math.sqrt(T));
    const vegaVal = S * N_d1 * Math.sqrt(T) / 100; // per 1% change

    if (type === 'CE') {
        delta = Nd1;
        theta = (- (S * N_d1 * v) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2) / 365;
    } else {
        delta = Nd1 - 1;
        theta = (- (S * N_d1 * v) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * CND(-d2)) / 365;
    }

    return {
        delta: delta,
        gamma: gamma,
        theta: theta,
        vega: vegaVal
    };
}

module.exports = {
    calculateIV,
    blackScholesPrice,
    calculateGreeks
};
