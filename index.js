// ================================
// Election Management Server
// ================================

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const https = require('https');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 8000;

// ---------------- Database ----------------
const pool = mysql.createPool({
    host: 'tests.cnm0ouk4axh4.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'wataya1993',
    database: 'elections_management',
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0
});

// ---------------- File Upload ----------------
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ---------------- Middleware ----------------
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTPS Options 
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/miwalletmw.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/miwalletmw.com/fullchain.pem'),
};

// ---------------- LOGIN ----------------
app.post('/login',
    body('loginId').notEmpty().trim().escape(),
    body('password').notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Validation failed.', errors: errors.array() });
        }

        const { loginId, password } = req.body;
        let connection;
        try {
            connection = await pool.getConnection();

            // Check credentials
            const [userRows] = await connection.execute(
                `SELECT user_id, password, first_name, last_name
                 FROM users
                 WHERE login_id = ? AND user_level = 'monitor'`,
                [loginId]
            );

            if (userRows.length === 0 || userRows[0].password !== password) {
                return res.status(401).json({ message: 'Invalid Login ID or password.' });
            }

            const user = userRows[0];

            // Fetch monitor profile
            const [monitorRows] = await connection.execute(
                `SELECT m.monitor_id, m.polling_center_id, m.is_checked_in,
                        p.polling_center_name, p.registered_voters,
                        w.ward_id, w.ward_name,
                        c.constituency_id, c.constituency_name,
                        d.district_id, d.district_name
                 FROM monitors m
                 JOIN polling_centers p ON m.polling_center_id = p.polling_center_id
                 JOIN wards w ON p.ward_id = w.ward_id
                 JOIN constituencies c ON w.constituency_id = c.constituency_id
                 JOIN districts d ON c.district_id = d.district_id
                 WHERE m.user_id = ?`,
                [user.user_id]
            );

            if (monitorRows.length === 0) {
                return res.status(404).json({ message: 'Monitor profile not found.' });
            }

            const monitor = monitorRows[0];

            res.status(200).json({
                message: 'Login successful.',
                monitorId: monitor.monitor_id,
                monitorName: `${user.first_name} ${user.last_name}`,
                pollingCenterId: monitor.polling_center_id,
                pollingCenterName: monitor.polling_center_name,
                registeredVoters: monitor.registered_voters,
                wardId: monitor.ward_id,
                wardName: monitor.ward_name,
                constituencyId: monitor.constituency_id,
                constituencyName: monitor.constituency_name,
                districtId: monitor.district_id,
                districtName: monitor.district_name,
                isCheckedIn: !!monitor.is_checked_in
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'Server error. Please try again later.' });
        } finally {
            if (connection) connection.release();
        }
    }
);

// ---------------- CHECK-IN ----------------
app.post('/checkin',
    body('monitorId').notEmpty().trim().escape(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed.', errors: errors.array() });

        const { monitorId } = req.body;
        let connection;
        try {
            connection = await pool.getConnection();
            const [result] = await connection.execute(
                'UPDATE monitors SET is_checked_in = 1 WHERE monitor_id = ?',
                [monitorId]
            );
            if (result.affectedRows === 0) return res.status(404).json({ message: 'Monitor not found.' });
            res.status(200).json({ message: `Monitor ${monitorId} checked in successfully.` });
        } catch (error) {
            console.error('Check-in error:', error);
            res.status(500).json({ message: 'Failed to check in.' });
        } finally {
            if (connection) connection.release();
        }
    }
);

// ---------------- FETCH CANDIDATES ----------------
app.get('/candidates/:pollingCenterId', async (req, res) => {
    const { pollingCenterId } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();

        const [centerRows] = await connection.execute(
            `SELECT p.ward_id, w.constituency_id
             FROM polling_centers p
             JOIN wards w ON p.ward_id = w.ward_id
             WHERE p.polling_center_id = ?`,
            [pollingCenterId]
        );
        if (centerRows.length === 0) return res.status(404).json({ message: 'Polling center not found.' });

        const wardId = centerRows[0].ward_id;
        const constituencyId = centerRows[0].constituency_id;

        const [allCandidates] = await connection.execute(
            `SELECT candidate_id, candidate_name, party, election_type
             FROM candidates WHERE election_type = 'presidential'
             UNION
             SELECT candidate_id, candidate_name, party, election_type
             FROM candidates WHERE election_type = 'parliamentary' AND constituency_id = ?
             UNION
             SELECT candidate_id, candidate_name, party, election_type
             FROM candidates WHERE election_type = 'local_government' AND ward_id = ?`,
            [constituencyId, wardId]
        );

        res.status(200).json(allCandidates);

    } catch (error) {
        console.error('Candidate fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch candidates.' });
    } finally {
        if (connection) connection.release();
    }
});

// ---------------- SUBMIT RESULTS ----------------
// ---------------- SUBMIT RESULTS ----------------
// ---------------- SUBMIT RESULTS ----------------
app.post('/submit-results',
    upload.any(),
    body('monitorId').notEmpty().trim().escape(),
    body('pollingCenterId').notEmpty().trim().escape(),
    body('electionType').notEmpty().trim().escape(),
    body('totalVotesCast').isInt({ min: 0 }),
    body('invalidVotes').isInt({ min: 0 }),
    body('unusedBallots').isInt({ min: 0 }),
    body('votes').isJSON(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ message: 'Validation failed.', errors: errors.array() });

        const { monitorId, pollingCenterId, electionType, totalVotesCast, invalidVotes, unusedBallots, votes } = req.body;
        const votesJson = JSON.parse(votes);
        let connection;

        try {
            const imageFieldName = `${electionType}-image`;
            const imageFile = req.files.find(f => f.fieldname === imageFieldName);
            if (!imageFile) return res.status(400).json({ message: 'Result sheet image is required.' });

            connection = await pool.getConnection();
            await connection.beginTransaction();

            // Find or create submission session
            const [sessionRows] = await connection.execute(
                'SELECT session_id FROM submission_sessions WHERE monitor_id = ? AND polling_center_id = ?',
                [monitorId, pollingCenterId]
            );

            let sessionId;
            if (sessionRows.length > 0) {
                sessionId = sessionRows[0].session_id;
            } else {
                const [sessionResult] = await connection.execute(
                    'INSERT INTO submission_sessions (monitor_id, polling_center_id, submission_time) VALUES (?, ?, NOW())',
                    [monitorId, pollingCenterId]
                );
                sessionId = sessionResult.insertId;
            }

            // Check if this election type has already been submitted
            const [existingResult] = await connection.execute(
                'SELECT result_id FROM election_results WHERE session_id = ? AND election_type = ?',
                [sessionId, electionType]
            );
            if (existingResult.length > 0) {
                throw new Error(`Results for ${electionType} have already been submitted and cannot be changed.`);
            }

            // Insert election result
            const [result] = await connection.execute(
                `INSERT INTO election_results
                 (session_id, election_type, paper_result_image_base64, total_votes_cast, invalid_votes, unused_ballots, total_registered_voters)
                 VALUES (?, ?, ?, ?, ?, ?, (SELECT registered_voters FROM polling_centers WHERE polling_center_id = ?))`,
                [sessionId, electionType, imageFile.buffer.toString('base64'), totalVotesCast, invalidVotes, unusedBallots, pollingCenterId]
            );

            const resultId = result.insertId;

            // Insert votes
            const voteEntries = Object.keys(votesJson).map(key => [resultId, key, votesJson[key], votesJson[key]]);
            if (voteEntries.length > 0) {
                await connection.query(
                    'INSERT INTO votes (result_id, candidate_id, votes_count, original_votes_count) VALUES ?',
                    [voteEntries]
                );
            }

            // Check if monitor has submitted all three election types
            const [submittedResults] = await connection.execute(
                'SELECT COUNT(DISTINCT election_type) AS total_submitted FROM election_results WHERE session_id = ?',
                [sessionId]
            );

            if (submittedResults[0].total_submitted >= 3) {
                // Lock monitor by changing password
                await connection.execute(
                    "UPDATE users u JOIN monitors m ON u.user_id = m.user_id SET u.password = 'GGG' WHERE m.monitor_id = ?",
                    [monitorId]
                );
            }

            await connection.commit();
            res.status(200).json({ message: `${electionType} results submitted successfully!`, submissionId: sessionId });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error('Submission transaction failed:', error);
            res.status(500).json({ message: error.message || 'Submission failed.' });
        } finally {
            if (connection) connection.release();
        }
    }
);


// ---------------- SUBMISSION HISTORY ----------------
app.get('/submissions/:monitorId', async (req, res) => {
    const { monitorId } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();

        const [rows] = await connection.execute(
            `SELECT
                ss.session_id,
                DATE_FORMAT(ss.submission_time, '%Y-%m-%d %H:%i:%s') AS submission_time,
                MAX(er.is_verified) AS is_verified
             FROM submission_sessions ss
             JOIN election_results er ON ss.session_id = er.session_id
             WHERE ss.monitor_id = ?
             GROUP BY ss.session_id
             ORDER BY ss.submission_time DESC`,
            [monitorId]
        );

        const formatted = rows.map(row => ({
            sessionId: row.session_id,
            election: 'Malawi Elections 2025',
            timestamp: row.submission_time,
            status: row.is_verified == 1 ? 'Approved' : 'Pending Review'
        }));

        res.status(200).json(formatted);

    } catch (error) {
        console.error('Submission history fetch error:', error);
        res.status(500).json({ message: 'Server error. Could not fetch submissions.' });
    } finally {
        if (connection) connection.release();
    }
});

// ---------------- START SERVER ----------------
/*
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
*/
// Start HTTPS server

https.createServer(options, app)
    .listen(PORT, () => {
        console.log(`HTTPS Server running on port ${PORT}`);
    })
    .on('error', (error) => {
        console.error('HTTPS server error:', error);
    });