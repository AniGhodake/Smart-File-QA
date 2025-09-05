const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generatePDF } = require('./export.js');
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
  password: '', // adjust if needed
  database: 'db1'
});

// Gemini AI setup
const genAI = new GoogleGenerativeAI('YOUR_API_KEY_HERE'); // replace with your key

// Submit route
app.post('/submit', async (req, res) => {
  const { email, prompt, id } = req.body;
  if (!email || !prompt || !id) {
    return res.status(400).json({ error: 'Missing email, prompt, or upload ID' });
  }
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const answer = result.response.text();
    await pool.query(
      'UPDATE file_qa SET email = ?, question = ?, answer = ?, timestamp = NOW() WHERE id = ?',
      [email, prompt, answer, id]
    );
    res.json({ answer });
  } catch (error) {
    res.status(500).json({ error: 'API or database error: ' + error.message });
  }
});

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

// Export PDF route
app.get('/export', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM file_qa');
    generatePDF(rows);
    res.download('report.pdf');
  } catch (error) {
    res.status(500).json({ error: 'Export error: ' + error.message });
  }
});

app.get('/', (req, res) => {
  res.send('My app works!');
});

app.listen(port, () => {
  console.log('Server on http://localhost:3000');
});

var temp1 = 0; // not needed but ok