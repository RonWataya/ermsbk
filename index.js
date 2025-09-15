const express = require("express");
const cors = require("cors");
require('dotenv').config();
const https = require('https');
const fs = require('fs');
//const PORT = 8000;

const auditor = require('./routes/auditor');
const monitor = require('./routes/monitor');


const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('public/uploads'));
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(cors({ origin: '*' }));

// Routes
app.use(monitor);
app.use(auditor);



// HTTPS Options - Replace with OmniPOS cert path

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/miwalletmw.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/miwalletmw.com/fullchain.pem'),
};

// Start HTTPS server
const PORT = process.env.PORT || 443;
https.createServer(options, app)
    .listen(PORT, () => {
        console.log(`HTTPS Server running on port ${PORT}`);
    })
    .on('error', (error) => {
        console.error('HTTPS server error:', error);
    });

//app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// Graceful error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection:', reason, promise);
});