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

// --- API Endpoints for Filters ---
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