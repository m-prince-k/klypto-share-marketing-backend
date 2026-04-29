# 🚀 Crypto Share Marketing Backend (Node.js)

## 📌 Overview

यह backend एक crypto share/marketplace application के लिए बनाया गया है, जिसमें users:

* Register/Login कर सकते हैं
* Crypto assets देख सकते हैं
* Buy/Sell orders कर सकते हैं
* Wallet manage कर सकते हैं

Backend Node.js + Express पर आधारित है।

---

## 🛠️ Tech Stack

* Node.js
* Express.js
* MongoDB (Mongoose)
* JWT Authentication
* WebSocket (Real-time price updates)
* dotenv (Environment config)

---

## 📁 Project Structure

```
/project-root
│── /config         # DB & environment configs
│── /controllers    # Business logic
│── /models         # Mongoose schemas
│── /routes         # API routes
│── /middlewares    # Auth & error handling
│── /services       # External APIs / trading logic
│── /utils          # Helper functions
│── server.js       # Entry point
```

---

## ⚙️ Installation

```bash
git clone <repo-url>
cd project
npm install
```

---

## 🔐 Environment Variables

`.env` file बनाओ:

```
PORT=5000
MONGO_URI=your_mongodb_connection
JWT_SECRET=your_secret_key
API_KEY=crypto_api_key
```

---

## ▶️ Run Server

```bash
npm run dev
```

या

```bash
node server.js
```

---

## 🔑 Authentication APIs

### Register User

```
POST /api/auth/register
```

### Login User

```
POST /api/auth/login
```

JWT token return होगा जो protected routes में use होगा।

---

## 💰 Wallet APIs

### Get Balance

```
GET /api/wallet
```

### Deposit

```
POST /api/wallet/deposit
```

### Withdraw

```
POST /api/wallet/withdraw
```

---

## 📊 Crypto Market APIs

### Get All Coins

```
GET /api/market
```

### Get Single Coin

```
GET /api/market/:id
```

---

## 🔄 Trading APIs

### Buy Crypto

```
POST /api/trade/buy
```

### Sell Crypto

```
POST /api/trade/sell
```

---

## 🔒 Middleware

* Auth Middleware (JWT verify)
* Error Handling Middleware
* Rate Limiter (optional for security)

---

## 📡 Real-Time Price Updates

WebSocket setup:

```js
io.on("connection", (socket) => {
  console.log("User connected");

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});
```

---

## 🧠 Backend Logic Flow

1. User login → JWT generate
2. Wallet balance fetch
3. Market price API से crypto data
4. Buy/Sell request validate
5. Database update (wallet + transactions)

---

## 🔐 Security Best Practices

* Password hashing (bcrypt)
* JWT expiry set करो
* Input validation (Joi / express-validator)
* Rate limiting
* HTTPS use करो

---

## 📦 Future Improvements

* Admin panel
* KYC verification
* Payment gateway integration
* Advanced trading charts
* AI-based price prediction

---

## 👨‍💻 Author Notes

* Clean architecture follow करो
* Controllers को lean रखो
* Business logic services में लिखो
* हमेशा validation और error handling add करो

---

## 📬 Support

अगर issue आए:

* Logs check करो
* MongoDB connection verify करो
* Environment variables validate करो

---

Happy Coding 🚀
