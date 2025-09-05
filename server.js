const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'video/mp4', 'video/quicktime', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, PDF, MP4, MOV, Word, or Excel files are allowed'));
    }
  }
});

// MySQL connection
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', 
  database: 'db1'
});

// Gemini AI setup
const genAI = new GoogleGenerativeAI('YOUR_API_KEY_HERE'); // due to security cocerns i have not mentioned my key

// Upload route with MySQL save
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    const [rows] = await pool.query(
      'INSERT INTO file_qa (file_path, email, question, answer, timestamp) VALUES (?, ?, ?, ?, NOW())',
      [req.file.originalname, 'user@example.com', '', '', new Date()]
    );
    res.json({ filename: req.file.originalname, type: req.file.mimetype, id: rows.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

app.get('/', (req, res) => {
  res.send('My app works!');
});

app.listen(port, () => {
  console.log('Server on http://localhost:3000');
});

var temp1 = 0; // not needed but ok