const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 8000;

// Database connection pool setup
const pool = mysql.createPool({
    host: 'tests.cnm0ouk4axh4.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'wataya1993', // Your MySQL password
    database: 'elections_management',
    port: 3306, // <-- specify port here (as number)
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0
});


// Configure Multer to store uploaded files in memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTPS Options
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/miwalletmw.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/miwalletmw.com/fullchain.pem'),
};

// --- API Endpoints ---

// Login
app.post('/login', async (req, res) => {
    const { loginId, password } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();

        // Fetch user
        const [userRows] = await connection.execute(
            'SELECT user_id, first_name, last_name, password FROM users WHERE login_id = ? AND user_level = "monitor"',
            [loginId]
        );

        if (userRows.length === 0 || userRows[0].password !== password) {
            return res.status(401).json({ message: 'Invalid Login ID or password.' });
        }

        const user = userRows[0];
        const fullName = `${user.first_name} ${user.last_name}`;

        // Fetch monitor profile including polling center, constituency, and district
        const [monitorRows] = await connection.execute(
            `SELECT 
                m.monitor_id, 
                m.polling_center_id, 
                p.polling_center_name,
                c.constituency_id,
                c.constituency_name,
                d.district_id,
                d.district_name
            FROM monitors m
            JOIN polling_centers p ON m.polling_center_id = p.polling_center_id
            JOIN constituencies c ON p.constituency_id = c.constituency_id
            JOIN districts d ON c.district_id = d.district_id
            WHERE m.user_id = ?`,
            [user.user_id]
        );

        if (monitorRows.length === 0) {
            return res.status(404).json({ message: 'Monitor profile not found.' });
        }

        const {
            monitor_id,
            polling_center_id,
            polling_center_name,
            constituency_id,
            constituency_name,
            district_id,
            district_name
        } = monitorRows[0];

        res.status(200).json({
            message: 'Login successful.',
            monitorId: monitor_id,
            monitorName: fullName,
            pollingCenterId: polling_center_id,
            pollingCenterName: polling_center_name,
            constituencyId: constituency_id,
            constituencyName: constituency_name,
            districtId: district_id,
            districtName: district_name
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error. Please try again later.' });
    } finally {
        if (connection) connection.release();
    }
});


// Check-in
app.post('/checkin', async (req, res) => {
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
});

// Fetch candidates
app.get('/candidates/:pollingCenterId', async (req, res) => {
    const { pollingCenterId } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();
        const [centerRows] = await connection.execute(
            'SELECT constituency_id FROM polling_centers WHERE polling_center_id = ?',
            [pollingCenterId]
        );

        if (centerRows.length === 0) return res.status(404).json({ message: 'Polling center not found.' });

        const constituencyId = centerRows[0].constituency_id;

        const [presidentialCandidates] = await connection.execute(
            'SELECT candidate_id, candidate_name, party, election_type FROM candidates WHERE election_type = "presidential"'
        );

        const [localCandidates] = await connection.execute(
            'SELECT candidate_id, candidate_name, party, election_type FROM candidates WHERE constituency_id = ? AND (election_type = "parliamentary" OR election_type = "local_government")',
            [constituencyId]
        );

        res.status(200).json([...presidentialCandidates, ...localCandidates]);
    } catch (error) {
        console.error('Candidate fetch error:', error);
        res.status(500).json({ message: 'Failed to fetch candidates.' });
    } finally {
        if (connection) connection.release();
    }
});

// Submit results (fixed for duplicate sessions and verified lock)
app.post('/submit-results', upload.any(), async (req, res) => {
    const { monitorId, pollingCenterId, registeredVoters, invalidVotes, votes } = req.body;
    const votesJson = JSON.parse(votes);
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check for existing session
        const [existingSession] = await connection.execute(
            `SELECT s.session_id, MAX(er.is_verified) AS is_verified
             FROM submission_sessions s
             LEFT JOIN election_results er ON s.session_id = er.session_id
             WHERE s.monitor_id = ? AND s.polling_center_id = ?
             GROUP BY s.session_id`,
            [monitorId, pollingCenterId]
        );

        let sessionId;
        if (existingSession.length > 0) {
            if (existingSession[0].is_verified == 1) {
                throw new Error('Submission is verified and cannot be updated.');
            }
            sessionId = existingSession[0].session_id;

            // Delete old results and votes
            await connection.execute(
                'DELETE FROM votes WHERE result_id IN (SELECT result_id FROM election_results WHERE session_id = ?)',
                [sessionId]
            );
            await connection.execute('DELETE FROM election_results WHERE session_id = ?', [sessionId]);
        } else {
            const [sessionResult] = await connection.execute(
                'INSERT INTO submission_sessions (monitor_id, polling_center_id, submission_time) VALUES (?, ?, NOW())',
                [monitorId, pollingCenterId]
            );
            sessionId = sessionResult.insertId;
        }

        // Map files
        const fileMap = new Map(req.files.map(file => [file.fieldname, file]));

        // Insert results
        const resultTypes = ['presidential', 'parliamentary', 'local_government'];
        const resultIds = {};

        for (const type of resultTypes) {
            const [result] = await connection.execute(
                `INSERT INTO election_results
                 (session_id, election_type, paper_result_image_base64, invalid_votes, total_registered_voters)
                 VALUES (?, ?, ?, ?, ?)`,
                [sessionId, type, fileMap.has(`${type}Image`) ? fileMap.get(`${type}Image`).buffer.toString('base64') : null, invalidVotes, registeredVoters]
            );
            resultIds[type] = result.insertId;
        }

        // Insert votes
        const voteEntries = [];
        for (const key in votesJson) {
            const [type, candidateId] = key.split('-');
            if (!resultIds[type]) continue;
            voteEntries.push([resultIds[type], candidateId, votesJson[key], votesJson[key]]);
        }

        if (voteEntries.length > 0) {
            await connection.query(
                'INSERT INTO votes (result_id, candidate_id, votes_count, original_votes_count) VALUES ?',
                [voteEntries]
            );
        }

        await connection.commit();
        res.status(200).json({ message: 'Submission successful!', submissionId: sessionId });
    } catch (error) {
        await connection.rollback();
        console.error('Submission transaction failed:', error);
        res.status(500).json({ message: error.message || 'Submission failed. Please try again.' });
    } finally {
        if (connection) connection.release();
    }
});

// Fetch submission history
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
            election: 'Malawi Elections 2025',   // hardcoded
            timestamp: row.submission_time,      // submission timestamp
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


// Start the server
// Start HTTPS server

https.createServer(options, app)
    .listen(PORT, () => {
        console.log(`HTTPS Server running on port ${PORT}`);
    })
    .on('error', (error) => {
        console.error('HTTPS server error:', error);
    });

