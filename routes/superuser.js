const express = require("express");
const session = require("express-session");

require('dotenv').config(); 
const router = express.Router();


// Session middleware configuration
router.use(
    session({
        secret: process.env.SESSION_SECRET || "secret-key",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: true },
    })
);

// POST route for customer login
router.post("/user/signin", async (req, res) => {
    const { identifier, password } = req.body;

    try {
        // Retrieve user from the database based on email or phone
        db.query("SELECT * FROM Customer WHERE email = ? OR phone = ?", [identifier, identifier], async (error, results) => {
            if (error) {
                console.error("Error retrieving user:", error);
                return res.status(500).json({ message: "Internal server error" });
            }

            if (results.length === 0) {
                return res.status(404).json({ message: "User not found" });
            }

            const user = results[0];

            // Compare hashed password
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            // Successful login
            req.session.user = {
                id: user.id,
                account_id:user.account_id,
                email: user.email,
                phone: user.phone,
                first_name: user.first_name,
                last_name: user.last_name,
                points: user.points,
                gender: user.gender,
                nationality: user.nationality,
                status:user.status,
                
            };

            res.status(200).json({ message: "Login successful", user: req.session.user });
            console
        });
    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


module.exports = router;