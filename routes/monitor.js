const express = require("express");
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const router = express.Router();
router.use(express.json());


module.exports = router;