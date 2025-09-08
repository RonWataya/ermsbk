/*

//http
const express = require("express");
const cors = require("cors");
require('dotenv').config();
const https = require('https');
const fs = require('fs');

const registrationRoute = require('./routes/business_registration');
const accountsRoute = require('./routes/account_management');
const managementRoute = require('./routes/data_management');
const loginRoute = require('./routes/login');
const categoryRoute = require('./routes/categories');
const itemsRoute = require('./routes/items');
const posRoute = require('./routes/pos');
const profileRoute = require('./routes/profile');
const reportsRoute = require('./routes/reports');
const businessRoute = require('./routes/business');
const usersRoute = require('./routes/users');

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
app.use(registrationRoute);
app.use(accountsRoute);
app.use(managementRoute);
app.use(loginRoute);
app.use(categoryRoute);
app.use(itemsRoute);
app.use(posRoute);
app.use(profileRoute);
app.use(reportsRoute);
app.use(businessRoute);
app.use(usersRoute);

const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`Server is running.`);
});

// Graceful error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection:', reason, promise);
});


//https
/* const express = require("express");
const cors = require("cors");
require('dotenv').config();
const https = require('https');
const fs = require('fs');

const registrationRoute = require('./routes/business_registration');
const accountsRoute = require('./routes/account_management');
const managementRoute = require('./routes/data_management');
const loginRoute = require('./routes/login');
const categoryRoute = require('./routes/categories');
const itemsRoute = require('./routes/items');
const posRoute = require('./routes/pos');
const profileRoute = require('./routes/profile');
const reportsRoute = require('./routes/reports');
const businessRoute = require('./routes/business');
const usersRoute = require('./routes/users');

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
app.use(registrationRoute);
app.use(accountsRoute);
app.use(managementRoute);
app.use(loginRoute);
app.use(categoryRoute);
app.use(itemsRoute);
app.use(posRoute);
app.use(profileRoute);
app.use(reportsRoute);
app.use(businessRoute);
app.use(usersRoute);

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

// Graceful error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection:', reason, promise);
});
*/