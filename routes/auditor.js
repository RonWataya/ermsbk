const express = require("express");
const db = require("../config/db.js");
const multer = require("multer");
const path = require("path");
const router = express.Router();

// Set up Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/logos');
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Route to register a business
router.post("/api/business/register", upload.single('logo'), (req, res) => {
  const { name, email, phone, address } = req.body;
  const logo_url = req.file ? `/uploads/logos/${req.file.filename}` : null;

  const sql = `
    INSERT INTO businesses (name, email, phone, address, logo_url)
    VALUES (?, ?, ?, ?, ?)`;

  db.query(sql, [name, email, phone, address, logo_url], (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ message: "Error registering business" });
    }

    res.status(200).json({ message: "Business registered successfully", businessId: results.insertId });
  });
});

module.exports = router;
