const express = require("express");
const mysql = require('mysql2/promise');
const router = express.Router();

router.use(express.json({ limit: '50mb' }));

const pool = mysql.createPool({
    host: 'tests.cnm0ouk4axh4.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'wataya1993',
    database: 'elections_management',
    waitForConnections: true,
    connectionLimit: 50
});
/*const pool = mysql.createPool({
    host: 'tests.cnm0ouk4axh4.us-east-1.rds.amazonaws.com',
    user: 'admin',
    password: 'wataya1993',
    database: 'elections_management',
    waitForConnections: true,
    connectionLimit: 50
});*/

// --- API Endpoints for Filters ---

// Get all districts
router.get('/api/districts', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT district_id, district_name FROM districts ORDER BY district_name`);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching districts' });
    }
});

// Get constituencies by district
router.get('/api/constituencies', async (req, res) => {
    try {
        const { districtId } = req.query;
        let sql = `SELECT constituency_id, constituency_name FROM constituencies`;
        const params = [];
        if (districtId) {
            sql += ` WHERE district_id = ?`;
            params.push(districtId);
        }
        sql += ` ORDER BY constituency_name`;
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching constituencies' });
    }
});

// Get wards by constituency
router.get('/api/wards', async (req, res) => {
    try {
        const { constituencyId } = req.query;
        let sql = `SELECT ward_id, ward_name FROM wards`;
        const params = [];
        if (constituencyId) {
            sql += ` WHERE constituency_id = ?`;
            params.push(constituencyId);
        }
        sql += ` ORDER BY ward_name`;
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching wards' });
    }
});

// Get polling centers by ward
router.get('/api/polling_centers', async (req, res) => {
    try {
        const { wardId } = req.query;
        let sql = `SELECT polling_center_id, polling_center_name FROM polling_centers`;
        const params = [];
        if (wardId) {
            sql += ` WHERE ward_id = ?`;
            params.push(wardId);
        }
        sql += ` ORDER BY polling_center_name`;
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching polling centers' });
    }
});

// --- Get filtered submissions with status ---
router.get('/api/submissions', async (req, res) => {
    try {
        const { districtId, constituencyId, wardId, pollingCenterId, status } = req.query;
        let sql = `
    SELECT 
        ss.session_id, 
        pc.polling_center_name, 
        CONCAT(u.first_name, ' ', u.last_name) AS monitor_name, 
        d.district_name,
        c.constituency_name,
        ss.submission_time,
        (SELECT COUNT(*) FROM election_results er WHERE er.session_id = ss.session_id AND er.is_verified = 1) AS verified_count,
        (SELECT COUNT(*) FROM election_results er WHERE er.session_id = ss.session_id AND er.is_verified = 0) AS unverified_count,
        (SELECT COUNT(*) FROM election_results er WHERE er.session_id = ss.session_id AND er.is_verified = 2) AS rejected_count,
        (SELECT COUNT(*) FROM election_results er WHERE er.session_id = ss.session_id) AS total_elections
    FROM submission_sessions ss
    JOIN monitors m ON ss.monitor_id = m.monitor_id
    JOIN users u ON m.user_id = u.user_id
    JOIN polling_centers pc ON ss.polling_center_id = pc.polling_center_id
    JOIN wards w ON pc.ward_id = w.ward_id
    JOIN constituencies c ON w.constituency_id = c.constituency_id
    JOIN districts d ON c.district_id = d.district_id
    WHERE 1=1
`;


        const params = [];
        if (districtId) { sql += ` AND d.district_id = ?`; params.push(districtId); }
        if (constituencyId) { sql += ` AND c.constituency_id = ?`; params.push(constituencyId); }
        if (wardId) { sql += ` AND w.ward_id = ?`; params.push(wardId); }
        if (pollingCenterId) { sql += ` AND pc.polling_center_id = ?`; params.push(pollingCenterId); }

        sql += ` GROUP BY ss.session_id ORDER BY ss.submission_time DESC`;

        const [rows] = await pool.query(sql, params);

        const filteredRows = rows.filter(row => {
            if (status === 'unverified') return row.unverified_count > 0 && row.verified_count === 0 && row.rejected_count === 0;
            if (status === 'verified') return row.verified_count === row.total_elections;
            if (status === 'rejected') return row.rejected_count > 0;
            return true; // All Statuses
        });

        res.json(filteredRows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching submissions' });
    }
});

// --- Get submission details by session (all elections) ---
router.get('/api/submissions/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const [results] = await pool.query(`
            SELECT 
                er.*, 
                ss.session_id,
                CONCAT(u.first_name, ' ', u.last_name) AS monitor_name,
                pc.polling_center_name
            FROM election_results er
            JOIN submission_sessions ss ON er.session_id = ss.session_id
            JOIN monitors m ON ss.monitor_id = m.monitor_id
            JOIN users u ON m.user_id = u.user_id
            JOIN polling_centers pc ON ss.polling_center_id = pc.polling_center_id
            WHERE er.session_id=?
        `, [sessionId]);

        const fullResults = [];
        for (const r of results) {
            const [votes] = await pool.query(`SELECT v.*, c.candidate_name, c.party FROM votes v JOIN candidates c ON v.candidate_id=c.candidate_id WHERE v.result_id=?`, [r.result_id]);
            fullResults.push({ ...r, candidates: votes });
        }
        res.json(fullResults);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching session details' });
    }
});

// --- Verify election result ---
router.post('/api/results/verify', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { result_id, total_votes_cast, invalid_votes, unused_ballots, total_registered_voters, votes } = req.body;
        
        await connection.query(`UPDATE election_results SET total_votes_cast=?, invalid_votes=?, unused_ballots=?, total_registered_voters=?, is_verified=1 WHERE result_id=?`,
            [total_votes_cast, invalid_votes, unused_ballots, total_registered_voters, result_id]);

        for (const v of votes) {
            await connection.query(`UPDATE votes SET votes_count=? WHERE result_id=? AND candidate_id=?`, [v.votes_count, result_id, v.candidate_id]);
        }
        
        // Check if all elections for this session are verified
        const [resultRow] = await connection.query(`SELECT session_id FROM election_results WHERE result_id = ?`, [result_id]);
        const sessionId = resultRow[0].session_id;

        const [unverifiedResults] = await connection.query(`SELECT COUNT(*) as count FROM election_results WHERE session_id = ? AND is_verified = 0`, [sessionId]);
        if (unverifiedResults[0].count === 0) {
            const [rejectedResults] = await connection.query(`SELECT COUNT(*) as count FROM election_results WHERE session_id = ? AND is_verified = 2`, [sessionId]);
            if (rejectedResults[0].count === 0) {
                 await connection.query(`
                     UPDATE monitors m
                     JOIN submission_sessions ss ON m.monitor_id = ss.monitor_id
                     SET m.payment_status = 'eligible'
                     WHERE ss.session_id = ?
                 `, [sessionId]);
            }
        }
        
        await connection.commit();
        res.json({ message: 'Election verified successfully' });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: 'Error verifying result' });
    } finally {
        connection.release();
    }
});

// --- Reject election result ---
router.post('/api/results/reject', async (req, res) => {
    try {
        const { result_id } = req.body;
        await pool.query(`UPDATE election_results SET is_verified=2 WHERE result_id=?`, [result_id]);
        res.json({ message: 'Election rejected successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error rejecting result' });
    }
});

// --- Get filtered election results ---
router.get('/api/results', async (req, res) => {
    const { district_id, constituency_id, ward_id, election_type } = req.query;

    let query = `
        SELECT
            c.candidate_name,
            c.party,
            SUM(v.votes_count) as total_votes
        FROM
            votes v
        JOIN
            election_results er ON v.result_id = er.result_id
        JOIN
            submission_sessions ss ON er.session_id = ss.session_id
        JOIN
            polling_centers pc ON ss.polling_center_id = pc.polling_center_id
        JOIN
            wards w ON pc.ward_id = w.ward_id
        JOIN
            constituencies co ON w.constituency_id = co.constituency_id
        JOIN
            districts d ON co.district_id = d.district_id
        JOIN
            candidates c ON v.candidate_id = c.candidate_id
        WHERE
            er.is_verified = 1 AND er.election_type = ?
    `;

    const queryParams = [election_type];
    
    if (district_id && district_id !== 'all') {
        query += ' AND d.district_id = ?';
        queryParams.push(district_id);
    }

    if (constituency_id && constituency_id !== 'all') {
        query += ' AND co.constituency_id = ?';
        queryParams.push(constituency_id);
    }

    if (ward_id && ward_id !== 'all') {
        query += ' AND w.ward_id = ?';
        queryParams.push(ward_id);
    }

    query += `
        GROUP BY
            c.candidate_name, c.party
        ORDER BY
            total_votes DESC
    `;

    try {
        const [results] = await pool.query(query, queryParams);
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching filtered results' });
    }
});

// Endpoint for presidential pie chart data
router.get('/api/presidential-results', async (req, res) => {
    try {
        const [results] = await pool.query(`
            SELECT
                c.candidate_name,
                c.party,
                SUM(v.votes_count) as total_votes
            FROM
                votes v
            JOIN
                election_results er ON v.result_id = er.result_id
            JOIN
                candidates c ON v.candidate_id = c.candidate_id
            WHERE
                er.is_verified = 1 
                AND er.election_type = 'presidential'
            GROUP BY
                c.candidate_name, c.party
            ORDER BY
                total_votes DESC
        `);
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching presidential results' });
    }
});

module.exports = router;