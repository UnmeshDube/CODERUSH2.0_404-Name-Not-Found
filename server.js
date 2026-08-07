/**
 * JanSetu AI - Live Central Backend REST API Server
 * Handles static web serving and REST API endpoints for cross-device mobile & desktop data synchronization.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8000;
const DB_FILE = path.join(__dirname, 'database.json');

// Initialize database file if missing
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.geojson': 'application/json'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

const server = http.createServer((req, res) => {
    // Enable CORS for mobile devices & cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const reqUrl = req.url.split('?')[0];
    console.log(`[HTTP] ${req.method} ${reqUrl}`);

    // REST API Endpoint: Get Reports
    if (reqUrl === '/api/reports' && req.method === 'GET') {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to read database' }));
        }
        return;
    }

function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');
}

function isDuplicateReport(r1, r2) {
    const addr1 = normalizeText(r1.address);
    const addr2 = normalizeText(r2.address);
    const desc1 = normalizeText(r1.description);
    const desc2 = normalizeText(r2.description);

    if (!addr1 || !addr2) return false;

    // Check if location addresses overlap (supports Hindi/Marathi Devanagari & English)
    const addrMatch = addr1.includes(addr2) || addr2.includes(addr1) || 
                      (addr1.length >= 4 && addr2.length >= 4 && (addr1.startsWith(addr2.substring(0, 4)) || addr2.startsWith(addr1.substring(0, 4))));
    
    // Check if situation / details overlap
    const descMatch = !desc1 || !desc2 || desc1.includes(desc2) || desc2.includes(desc1) ||
                      (desc1.length >= 4 && desc2.length >= 4 && (desc1.startsWith(desc2.substring(0, 4)) || desc2.startsWith(desc1.substring(0, 4))));

    return addrMatch && descMatch;
}

    // REST API Endpoint: Save New Report (with Hindi/Marathi Unicode Support & Duplicate Detection)
    if (reqUrl === '/api/reports' && req.method === 'POST') {
        req.setEncoding('utf8');
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const newReport = JSON.parse(body);
                const currentDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '[]');

                // Check if a report for the same location & situation already exists
                const existingIndex = currentDb.findIndex(item => isDuplicateReport(newReport, item));

                if (existingIndex !== -1) {
                    // Duplicate found! Increment upvotes/report count
                    const existing = currentDb[existingIndex];
                    existing.upvotes = (existing.upvotes || 1) + 1;
                    existing.lastUpdated = new Date().toISOString();

                    // If 10 or more people report the same issue, escalate to HIGHEST PRIORITY!
                    if (existing.upvotes >= 10) {
                        existing.priority = 'HIGHEST PRIORITY (URGENT)';
                    } else if (existing.upvotes >= 5 && existing.priority !== 'HIGHEST PRIORITY (URGENT)') {
                        existing.priority = 'HIGH';
                    }

                    // Move updated report to the top of database
                    currentDb.splice(existingIndex, 1);
                    currentDb.unshift(existing);
                    fs.writeFileSync(DB_FILE, JSON.stringify(currentDb, null, 2), 'utf8');

                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        success: true,
                        isDuplicate: true,
                        report: existing,
                        message: `Already uploaded! This issue has already been reported. Added your support (Total Reports: ${existing.upvotes}).`
                    }));
                } else {
                    // New unique report
                    if (!newReport.id) {
                        newReport.id = 'NMC-' + Math.floor(100000 + Math.random() * 900000);
                    }
                    if (!newReport.timestamp) {
                        newReport.timestamp = new Date().toISOString();
                    }
                    newReport.upvotes = newReport.upvotes || 1;
                    newReport.priority = newReport.priority || 'NORMAL';

                    currentDb.unshift(newReport);
                    fs.writeFileSync(DB_FILE, JSON.stringify(currentDb, null, 2), 'utf8');

                    res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        success: true,
                        isDuplicate: false,
                        report: newReport,
                        message: 'Report submitted successfully!'
                    }));
                }
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            }
        });
        return;
    }

    // REST API Endpoint: Update Report Status (Pending / In Progress / Completed)
    if (reqUrl === '/api/reports/update-status' && req.method === 'POST') {
        req.setEncoding('utf8');
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { id, status } = JSON.parse(body);
                const currentDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '[]');
                const reportIndex = currentDb.findIndex(item => item.id === id);

                if (reportIndex !== -1) {
                    currentDb[reportIndex].status = status || 'Completed';
                    currentDb[reportIndex].lastUpdated = new Date().toISOString();
                    fs.writeFileSync(DB_FILE, JSON.stringify(currentDb, null, 2), 'utf8');

                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, report: currentDb[reportIndex] }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: 'Report not found' }));
                }
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
            }
        });
        return;
    }

    // REST API Endpoint: Clear / Delete All Complaint Data
    if (reqUrl === '/api/reports/clear-all' && (req.method === 'POST' || req.method === 'DELETE')) {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'All complaint data deleted successfully' }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to clear database' }));
        }
        return;
    }

    // Serve Static Web Files
    let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
    const exists = fs.existsSync(filePath);
    if (!exists || (exists && fs.statSync(filePath).isDirectory())) {
        filePath = path.join(__dirname, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
            res.end(data);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`=======================================================`);
    console.log(`🚀 JanSetu AI Live Backend Server Running!`);
    console.log(`💻 Desktop Access: http://localhost:${PORT}`);
    console.log(`📱 Mobile Access:  http://${localIp}:${PORT}`);
    console.log(`=======================================================`);
});
