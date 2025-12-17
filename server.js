const express = require('express');
const multer = require('multer');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
const uploadDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'database.json');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify([]));

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Helper: Read/Write DB
const getDB = () => JSON.parse(fs.readFileSync(dbFile));
const saveDB = (data) => fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));

// Routes

// 1. Upload Image
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const db = getDB();
    const newEntry = {
        id: Date.now().toString(),
        filename: req.file.filename,
        originalName: req.file.originalname,
        senderName: req.body.senderName || 'Anonymous',
        uploadedAt: new Date().toISOString(),
        views: []
    };

    db.push(newEntry);
    saveDB(db);

    res.json({
        message: 'Upload successful',
        id: newEntry.id,
        link: `/view/${newEntry.id}`
    });
});

// 2. View Image Page (Serves HTML)
app.get('/view/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// 3. Track View
app.post('/api/track/:id', (req, res) => {
    const { id } = req.params;
    const { latitude, longitude, userAgent } = req.body;

    const db = getDB();
    const entryIndex = db.findIndex(img => img.id === id);

    if (entryIndex !== -1) {
        db[entryIndex].views.push({
            timestamp: new Date().toISOString(),
            latitude,
            longitude,
            userAgent: userAgent || req.headers['user-agent']
        });
        saveDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Image not found' });
    }
});

// 4. Get Image Info (for View Page logic)
app.get('/api/image/:id', (req, res) => {
    const db = getDB();
    const entry = db.find(img => img.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json(entry);
});

// 5. Admin Dashboard Data
app.get('/api/images', (req, res) => {
    const db = getDB();
    res.json(db);
});

// Start Server
const server = app.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);

    // Auto-start Tunnel (Only in Development)
    if (process.env.NODE_ENV !== 'production') {
        try {
            const localtunnel = require('localtunnel');
            const https = require('https');

            const tunnel = await localtunnel({ port: PORT });

            console.log(`\n==================================================`);
            console.log(`PUBLIC URL: ${tunnel.url}`);

            // Fetch Tunnel Password
            https.get('https://loca.lt/mytunnelpassword', (resp) => {
                let data = '';
                resp.on('data', (chunk) => { data += chunk; });
                resp.on('end', () => {
                    console.log(`TUNNEL PASSWORD: ${data.trim()}  <-- (Use this to open the link first time)`);
                    console.log(`==================================================\n`);
                });
            }).on("error", (err) => {
                console.log("Could not fetch tunnel password automatically.");
                console.log(`==================================================\n`);
            });

            tunnel.on('close', () => {
                console.log("Tunnel closed");
            });
        } catch (err) {
            console.error("Failed to start tunnel:", err);
        }
    }
});
