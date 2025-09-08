require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const PDFDocument = require("pdfkit");
const path = require("path");
const app = express();
const port = process.env.PORT || 3000;
const dbDashboard = require('./dbDashboard');


// Add these imports after your existing requires
const { initDatabase, dbHelpers } = require('./database');
const { 
  generateSessionId, 
  generateDownloadLink, 
  generatePreviewLink,
  saveFileToDisk, 
  readFileFromDisk, 
  verifyFileToken,
  cleanupOldFiles 
} = require('./fileUtils');
const jwt = require('jsonwebtoken');


// Add this after: let sessionData = { ... };
let currentSessionId = generateSessionId();

// Initialize database on startup
initDatabase().catch(console.error);

// Clean up old files daily
setInterval(() => {
  cleanupOldFiles(7); // Clean files older than 7 days
}, 24 * 60 * 60 * 1000); // Run once per day


// ===== MIDDLEWARE =====
app.use(express.static("public"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const nodemailer = require("nodemailer");

// Email transporter setup
let emailTransporter;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  const nodemailer = require("nodemailer");

emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.zoho.in",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true if you use port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


  console.log("Email service configured");
} else {
  console.log("Email service not configured");
}

app.use('/db', dbDashboard);

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ===== SESSION DATA =====
let sessionData = {
  file: null, // { buffer, filename, mimetype, size }
  email: "",
  chatHistory: [], // [{ prompt, answer, timestamp }]
};

// ===== ERROR HANDLING MIDDLEWARE =====
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const errorHandler = (err, req, res, next) => {
  console.error("Error:", err.message);
  console.error("Stack:", err.stack);

  // Handle specific error types
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 10MB." });
    }
    return res.status(400).json({ error: "File upload error: " + err.message });
  }

  res.status(500).json({
    error: "Internal server error",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};

// ===== MULTER CONFIGURATION =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/avi",
      "video/mov",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ===== GEMINI AI SETUP =====
let genAI;
try {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log("Gemini AI initialized successfully");
} catch (error) {
  console.error("Failed to initialize Gemini AI:", error.message);
}

// ===== UTILITY FUNCTIONS =====
function sanitizeInput(input) {
  if (typeof input !== "string") return "";
  return input.trim().replace(/[<>]/g, ""); // Basic XSS protection
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ===== ROUTES =====

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    session: {
      hasFile: !!sessionData.file,
      email: !!sessionData.email,
      chatHistory: sessionData.chatHistory.length,
    },
  });
});

// Reset Session
app.get("/reset", (req, res) => {
  sessionData = { file: null, email: "", chatHistory: [] };
  res.json({ success: true, message: "Session reset successfully" });
});

// Add this new route for secure file downloads
app.get('/secure-download/:sessionId/:fileId/:filename', asyncHandler(async (req, res) => {
  const { sessionId, fileId, filename } = req.params;
  const { token, preview } = req.query; // Add preview parameter

  console.log(`Download request: Session ${sessionId}, File ${fileId}, Filename ${filename}, Preview: ${preview}`);

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyFileToken(token);
  if (!decoded || decoded.sessionId !== sessionId) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    let fileBuffer = null;
    let fileInfo = null;

    // Strategy 1: Try to get from database first
    if (fileId !== 'current') {
      try {
        const files = await dbHelpers.getSessionFiles(sessionId);
        const file = files.find(f => f.id.toString() === fileId);
        
        if (file) {
          fileBuffer = await readFileFromDisk(path.join(__dirname, file.file_path));
          fileInfo = {
            mimetype: file.mimetype,
            filename: file.original_name,
            size: file.file_size
          };
          console.log(`File served from database/disk: ${file.original_name}`);
        }
      } catch (dbError) {
        console.log('Database/disk retrieval failed, trying memory fallback:', dbError.message);
      }
    }

    // Strategy 2: Fallback to current session memory
    if (!fileBuffer && sessionData.file && sessionId === currentSessionId) {
      if (sessionData.file.filename === decodeURIComponent(filename)) {
        fileBuffer = sessionData.file.buffer;
        fileInfo = {
          mimetype: sessionData.file.mimetype,
          filename: sessionData.file.filename,
          size: sessionData.file.size
        };
        console.log(`File served from memory: ${sessionData.file.filename}`);
      }
    }

    if (!fileBuffer || !fileInfo) {
      return res.status(404).json({ 
        error: 'File not found or no longer available',
        details: 'The file may have been deleted or the session may have expired'
      });
    }

    // Validate file exists and has content
    if (!fileBuffer.length) {
      return res.status(404).json({ error: 'File is empty or corrupted' });
    }

    // Set headers based on preview mode
    res.setHeader('Content-Type', fileInfo.mimetype);
    
    if (preview === 'true') {
      // PREVIEW MODE: Display in browser
      res.setHeader('Content-Disposition', `inline; filename="${fileInfo.filename}"`);
      
      // For videos, ensure proper headers for browser playback
      if (fileInfo.mimetype.startsWith('video/')) {
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      
      // For PDFs, ensure they open in browser
      if (fileInfo.mimetype === 'application/pdf') {
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      }
      
      console.log(`✅ File preview successful: ${fileInfo.filename}`);
    } else {
      // DOWNLOAD MODE: Force download
      res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      console.log(`✅ File download successful: ${fileInfo.filename}`);
    }
    
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);

  } catch (error) {
    console.error('Secure download/preview error:', error);
    
    if (error.message.includes('ENOENT')) {
      return res.status(404).json({ 
        error: 'File not found on server',
        details: 'The file may have been moved or deleted from the server storage'
      });
    }
    
    if (error.message.includes('permission') || error.message.includes('EACCES')) {
      return res.status(403).json({ 
        error: 'Permission denied',
        details: 'Server does not have permission to access the file'
      });
    }

    res.status(500).json({ 
      error: 'Failed to process file',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}));


// /upload route with this enhanced version:
app.post(
  "/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // Save to memory (keep existing functionality)
      sessionData.file = {
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      };

      // Also save to disk and database
      try {
        const savedFile = await saveFileToDisk(
          currentSessionId, 
          req.file.buffer, 
          req.file.originalname, 
          req.file.mimetype
        );
        
        await dbHelpers.saveFile(currentSessionId, {
          filename: savedFile.filename,
          mimetype: req.file.mimetype,
          size: req.file.size
        }, savedFile.relativePath);

        console.log(`File saved: Memory + Disk + DB - ${req.file.originalname}`);
      } catch (dbError) {
        console.error('Database save failed (continuing with memory):', dbError.message);
      }

      console.log(
        `File uploaded: ${req.file.originalname} (${formatFileSize(
          req.file.size
        )})`
      );

      res.json({
        success: true,
        filename: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
        message: "File uploaded successfully",
      });
    } catch (error) {
      console.error("Upload processing error:", error);
      res.status(500).json({ error: "Failed to process uploaded file" });
    }
  })
);

// Delete File Route
app.post(
  "/delete-file",
  asyncHandler(async (req, res) => {
    if (!sessionData.file) {
      return res.status(404).json({ error: "No file to delete" });
    }

    const filename = sessionData.file.filename;
    sessionData.file = null;
    sessionData.chatHistory = []; // Clear chat history when file is deleted

    console.log(`File deleted: ${filename}`);
    res.json({ success: true, message: "File deleted successfully" });
  })
);

// Preview Route
app.get("/preview", (req, res) => {
  if (!sessionData.file) {
    return res.status(404).json({ error: "No file available for preview" });
  }

  try {
    res.setHeader("Content-Type", sessionData.file.mimetype);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${sessionData.file.filename}"`
    );
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    res.send(sessionData.file.buffer);
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

// Ask Route (Gemini AI)
// REPLACE the existing /ask route with this enhanced version:
app.post(
  "/ask",
  asyncHandler(async (req, res) => {
    let { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Valid prompt required" });
    }

    prompt = sanitizeInput(prompt);
    if (!prompt) {
      return res.status(400).json({ error: "Prompt cannot be empty" });
    }

    if (!genAI) {
      return res.status(500).json({
        error: "AI service not available. Please check server configuration.",
      });
    }

    try {
      console.log(
        `AI Query: ${prompt.substring(0, 100)}${
          prompt.length > 100 ? "..." : ""
        }`
      );

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
        },
      });

      let answer;
      const startTime = Date.now();

      if (
        sessionData.file &&
        ["image/jpeg", "image/png", "application/pdf"].includes(
          sessionData.file.mimetype
        )
      ) {
        // Handle files that Gemini can directly process
        const fileData = {
          inlineData: {
            data: sessionData.file.buffer.toString("base64"),
            mimeType: sessionData.file.mimetype,
          },
        };

        const enhancedPrompt = `Based on the uploaded file "${sessionData.file.filename}", please answer the following question: ${prompt}`;
        const result = await model.generateContent([enhancedPrompt, fileData]);
        answer = result.response.text();
      } else {
        // Handle text-based queries or unsupported file types
        let contextPrompt = prompt;

        if (sessionData.file) {
          const fileInfo = `File: "${sessionData.file.filename}" (${
            sessionData.file.mimetype
          }, ${formatFileSize(sessionData.file.size)})`;
          contextPrompt = `Context: I have uploaded a file - ${fileInfo}. 
        
User question: ${prompt}

Please provide a helpful response. If you cannot directly analyze this file type, provide relevant information about what you might be able to help with regarding this type of file.`;
        }

        const result = await model.generateContent(contextPrompt);
        answer = result.response.text();
      }

      const responseTime = Date.now() - startTime;
      console.log(`AI Response generated in ${responseTime}ms`);

      const timestamp = new Date().toISOString();

      // Store in chat history (keep existing functionality)
      sessionData.chatHistory.push({
        prompt,
        answer,
        timestamp,
        hasFile: !!sessionData.file,
        fileName: sessionData.file?.filename || null,
      });

      // Also save to database
      try {
        await dbHelpers.saveConversation(
          currentSessionId,
          prompt,
          answer,
          responseTime,
          !!sessionData.file,
          sessionData.file?.filename || null
        );
        console.log('Conversation saved to database');
      } catch (dbError) {
        console.error('Database save failed (continuing with memory):', dbError.message);
      }

      res.json({
        prompt,
        answer,
        timestamp,
        responseTime,
      });
    } catch (error) {
      console.error("Gemini AI Error:", error.message);

      // Handle specific Gemini errors (keep existing error handling)
      if (error.message.includes("API_KEY")) {
        return res.status(500).json({
          error: "AI service configuration error. Please contact support.",
        });
      }
      if (error.message.includes("quota")) {
        return res.status(429).json({
          error: "AI service temporarily unavailable. Please try again later.",
        });
      }
      if (error.message.includes("safety")) {
        return res.status(400).json({
          error: "Content cannot be processed due to safety guidelines.",
        });
      }

      res.status(500).json({
        error: "Failed to get AI response. Please try again.",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  })
);

// Update Email
app.post(
  "/update-email",
  asyncHandler(async (req, res) => {
    let { email } = req.body;

    if (email && typeof email === "string") {
      email = sanitizeInput(email);
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (email && !emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
    }

    sessionData.email = email || "";
    
    // Also save to database
    try {
      if (email) {
        await dbHelpers.updateSessionUser(currentSessionId, email);
        console.log('Session email updated in database');
      }
    } catch (dbError) {
      console.error('Database email update failed:', dbError.message);
    }

    res.json({ success: true, email: sessionData.email });
  })
);

// Download File Route
app.get("/download-file", (req, res) => {
  if (!sessionData.file) {
    return res.status(404).json({ error: "No file available for download" });
  }

  try {
    res.setHeader("Content-Type", sessionData.file.mimetype);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sessionData.file.filename}"`
    );
    res.send(sessionData.file.buffer);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: "Failed to download file" });
  }
});


// Enhanced Send Report via Email with Download Links
app.post('/send-report', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email address required' });
  }

  if (!emailTransporter) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    // Get database files for current session (if available)
    let dbFiles = [];
    try {
      dbFiles = await dbHelpers.getSessionFiles(currentSessionId);
    } catch (dbError) {
      console.log('Database files not available, using memory data');
    }

    // Generate PDF in memory
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Smart File QA - Your Report',
          html: `
            <h2>Smart File QA Report</h2>
            <p>Hello,</p>
            <p>Please find your Smart File QA report attached to this email.</p>
            <br>
            <p><strong>Report Details:</strong></p>
            <ul>
              <li>Generated on: ${new Date().toLocaleString()}</li>
              <li>File analyzed: ${sessionData.file ? sessionData.file.filename : 'None'}</li>
              <li>Total conversations: ${sessionData.chatHistory.length}</li>
            </ul>
            <br>
            <p><strong>Note:</strong> Download links in the PDF are valid for 24 hours.</p>
            <br>
            <p>Thank you for using Smart File QA!</p>
          `,
          attachments: [
            {
              filename: `smart-file-qa-report-${Date.now()}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        };

        await emailTransporter.sendMail(mailOptions);

        if (!res.headersSent) {
          res.json({
            success: true,
            message: `Report sent successfully to ${email}`
          });
        }

      } catch (emailError) {
        console.error('Email sending error:', emailError);

        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to send email',
            details: emailError.message,
            code: emailError.code || null,
            response: emailError.response || null
          });
        }
      }
    });

    // ===== ENHANCED PDF CONTENT WITH DOWNLOAD LINKS =====
    doc.fontSize(20).text('Smart File QA - Export Report', { align: 'center' });
    doc.moveDown();

    const exportDate = new Date().toLocaleString();
    doc.fontSize(12).text(`Export Date: ${exportDate}`, 50, doc.y);
    doc.text(`Email: ${email}`, 50, doc.y);
    doc.text(`Session ID: ${currentSessionId}`, 50, doc.y);

    if (sessionData.file) {
      doc.text(`File: ${sessionData.file.filename} (${formatFileSize(sessionData.file.size)})`, 50, doc.y);
    } else {
      doc.text('File: None uploaded', 50, doc.y);
    }

    doc.moveDown(2);

    // Enhanced file section with download links
    if (sessionData.file) {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      
      // Try to get file ID from database
      let fileId = 'current';
      if (dbFiles.length > 0) {
        const matchingFile = dbFiles.find(f => f.original_name === sessionData.file.filename);
        if (matchingFile) {
          fileId = matchingFile.id;
        }
      }

      if (sessionData.file.mimetype.startsWith('image/')) {
        try {
          doc.fontSize(16).text('Uploaded Image:', 50, doc.y);
          doc.moveDown();

          const pageWidth = doc.page.width - 100;
          const maxHeight = 300;

          // Embed image in PDF
          doc.image(sessionData.file.buffer, 50, doc.y, {
            fit: [pageWidth, maxHeight],
            align: 'center'
          });

          doc.y += maxHeight + 20;

          // Add download link for the image
          const downloadLink = generateDownloadLink(currentSessionId, fileId, sessionData.file.filename, baseUrl);
          
          doc.fontSize(12)
            .fillColor('#2563eb')
            .text('Download original image: ', 50, doc.y, { continued: true })
            .text(sessionData.file.filename, {
              link: downloadLink,
              underline: true
            })
            .fillColor('black');

          doc.moveDown();
          doc.fontSize(10)
            .fillColor('#6b7280')
            .text(`Link: ${downloadLink}`)
            .fillColor('black');

          if (doc.y > doc.page.height - 100) {
            doc.addPage();
          }
        } catch (imageError) {
          console.error('Error adding image to PDF:', imageError);
          doc.fontSize(12).text('Image could not be embedded in PDF', 50, doc.y);
          doc.moveDown();
        }
      } 
      else if (sessionData.file.mimetype.startsWith('video/')) {
        // Video files - provide preview link
        doc.fontSize(16).text('Uploaded Video:', 50, doc.y).moveDown();

        const previewLink = generatePreviewLink(currentSessionId, fileId, sessionData.file.filename, baseUrl);
        
        doc.fontSize(12)
          .fillColor('black')
          .text('Preview Link: ', { continued: true })
          .fillColor('#2563eb')
          .text(sessionData.file.filename, {
            link: previewLink,
            underline: true
          })
          .fillColor('black');
        doc.moveDown(2);
      }
      else if (sessionData.file.mimetype === 'application/pdf' || sessionData.file.mimetype.includes('word')) {
        // For PDF and Word documents, provide a download link
        doc.fontSize(16).text('Uploaded Document:', 50, doc.y).moveDown();

        const downloadLink = generateDownloadLink(currentSessionId, fileId, sessionData.file.filename, baseUrl);
        
        doc.fontSize(12)
          .fillColor('black')
          .text('Download Link: ', { continued: true })
          .fillColor('#2563eb')
          .text(sessionData.file.filename, {
            link: downloadLink,
            underline: true
          })
          .fillColor('black');
        doc.moveDown(2);
      } else if (sessionData.file.mimetype.includes('excel')) {
        // For Excel documents, provide a preview link
        doc.fontSize(16).text(`Uploaded Spreadsheet:`, 50, doc.y).moveDown();

        const previewLink = generatePreviewLink(currentSessionId, fileId, sessionData.file.filename, baseUrl);
        
        doc.fontSize(12)
          .fillColor('black')
          .text('Preview Link: ', 50, doc.y, { continued: true })
          .fillColor('#2563eb')
          .text(sessionData.file.filename, {
            link: previewLink,
            underline: true
          })
          .fillColor('black');
        doc.moveDown(2);
      }
      else {
        // Other file types - generic download
        doc.fontSize(16).text('Uploaded File:', 50, doc.y);
        doc.moveDown();

        const downloadLink = generateDownloadLink(currentSessionId, fileId, sessionData.file.filename, baseUrl);
        
        doc.fontSize(14)
          .fillColor('#8b5cf6')
          .text('📎 Download File: ', 50, doc.y, { continued: true })
          .fillColor('#2563eb')
          .text(sessionData.file.filename, {
            link: downloadLink,
            underline: true
          })
          .fillColor('black');

        doc.moveDown();
        doc.fontSize(10)
          .fillColor('#6b7280')
          .text(`Direct link: ${downloadLink}`)
          .fillColor('black');

        doc.moveDown(2);
      }

      // Add QR code info (optional - you can implement QR generation later)
      doc.fontSize(10)
        .fillColor('#6b7280')
        .text('💡 Tip: Download links are valid for 24 hours. Save files locally if needed for longer access.')
        .fillColor('black');

      doc.moveDown(2);
    }

    // Conversation History (unchanged)
    doc.fontSize(16).text('Conversation History:', 50, doc.y);
    doc.moveDown();

    if (sessionData.chatHistory.length === 0) {
      doc.fontSize(12).text('No conversation history available.', 50, doc.y);
    } else {
      sessionData.chatHistory.forEach((chat, index) => {
        if (doc.y > doc.page.height - 150) {
          doc.addPage();
        }

        doc.fontSize(14)
          .fillColor('#2563eb')
          .text(`Q${index + 1}: `, 50, doc.y, { continued: true })
          .fillColor('black')
          .fontSize(12)
          .text(chat.prompt, { width: 500 });

        doc.moveDown(0.5);

        let cleanAnswer = chat.answer
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/`(.*?)`/g, '$1')
          .replace(/#+\s?(.*)/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

        doc.fontSize(14)
          .fillColor('#059669')
          .text(`A${index + 1}: `, 70, doc.y, { continued: true })
          .fillColor('black')
          .fontSize(11)
          .text(cleanAnswer, { width: 480 });

        doc.moveDown(1.5);
      });
    }

    // Add footer with session info and timestamp
    doc.fontSize(8)
      .fillColor('#6b7280')
      .text(`Generated by Smart File QA | Session: ${currentSessionId} | ${new Date().toISOString()}`, 50, doc.page.height - 30)
      .fillColor('black');

    doc.end();

  } catch (error) {
    console.error('PDF Generation Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }
}));


// Enhanced Secure Download Route with Fallback Support
app.get('/secure-download/:sessionId/:fileId/:filename', asyncHandler(async (req, res) => {
  const { sessionId, fileId, filename } = req.params;
  const { token, preview } = req.query;

  console.log(`Download request: Session ${sessionId}, File ${fileId}, Token present: ${!!token}`);

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyFileToken(token);
  if (!decoded || decoded.sessionId !== sessionId) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    let fileBuffer = null;
    let fileInfo = null;

    // Strategy 1: Try to get from database first
    if (fileId !== 'current') {
      try {
        const files = await dbHelpers.getSessionFiles(sessionId);
        const file = files.find(f => f.id.toString() === fileId);
        
        if (file) {
          fileBuffer = await readFileFromDisk(path.join(__dirname, file.file_path));
          fileInfo = {
            mimetype: file.mimetype,
            filename: file.original_name,
            size: file.file_size
          };
          console.log(`File served from database/disk: ${file.original_name}`);
        }
      } catch (dbError) {
        console.log('Database/disk retrieval failed, trying memory fallback:', dbError.message);
      }
    }

    // Strategy 2: Fallback to current session memory (for current session files)
    if (!fileBuffer && sessionData.file && sessionId === currentSessionId) {
      if (sessionData.file.filename === decodeURIComponent(filename)) {
        fileBuffer = sessionData.file.buffer;
        fileInfo = {
          mimetype: sessionData.file.mimetype,
          filename: sessionData.file.filename,
          size: sessionData.file.size
        };
        console.log(`File served from memory: ${sessionData.file.filename}`);
      }
    }

    if (!fileBuffer || !fileInfo) {
      return res.status(404).json({ 
        error: 'File not found or no longer available',
        details: 'The file may have been deleted or the session may have expired'
      });
    }

    // Validate file exists and has content
    if (!fileBuffer.length) {
      return res.status(404).json({ error: 'File is empty or corrupted' });
    }

    // Set appropriate headers for download
    res.setHeader('Content-Type', fileInfo.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Log successful download
    console.log(`✅ File download successful: ${fileInfo.filename} (${formatFileSize(fileInfo.size)})`);
    
    res.send(fileBuffer);

  } catch (error) {
    console.error('Secure download error:', error);
    
    // Provide helpful error messages
    if (error.message.includes('ENOENT')) {
      return res.status(404).json({ 
        error: 'File not found on server',
        details: 'The file may have been moved or deleted from the server storage'
      });
    }
    
    if (error.message.includes('permission') || error.message.includes('EACCES')) {
      return res.status(403).json({ 
        error: 'Permission denied',
        details: 'Server does not have permission to access the file'
      });
    }

    res.status(500).json({ 
      error: 'Failed to download file',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}));

// Alternative route for direct file access (without token - for internal use)
// Alternative route for direct file access (without token - for internal use)
app.get('/file-preview/:sessionId/:filename', asyncHandler(async (req, res) => {
  const { sessionId, filename } = req.params;
  
  console.log(`File preview request: Session ${sessionId}, Filename ${filename}`);
  
  // Only allow preview for current session or if it's a public preview
  if (sessionId !== currentSessionId) {
    console.log(`Access denied: Session ${sessionId} does not match current session ${currentSessionId}`);
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    let fileBuffer = null;
    let fileInfo = null;
    const decodedFilename = decodeURIComponent(filename);

    // Strategy 1: Check current session memory first
    if (sessionData.file && sessionData.file.filename === decodedFilename) {
      fileBuffer = sessionData.file.buffer;
      fileInfo = {
        mimetype: sessionData.file.mimetype,
        filename: sessionData.file.filename,
        size: sessionData.file.size
      };
      console.log(`File found in memory: ${sessionData.file.filename}`);
    }

    // Strategy 2: Try database lookup as fallback
    if (!fileBuffer) {
      try {
        const files = await dbHelpers.getSessionFiles(sessionId);
        const file = files.find(f => f.original_name === decodedFilename || f.filename === decodedFilename);
        
        if (file) {
          fileBuffer = await readFileFromDisk(path.join(__dirname, file.file_path));
          fileInfo = {
            mimetype: file.mimetype,
            filename: file.original_name,
            size: file.file_size
          };
          console.log(`File found in database: ${file.original_name}`);
        }
      } catch (dbError) {
        console.log('Database lookup failed:', dbError.message);
      }
    }

    // If file not found
    if (!fileBuffer || !fileInfo) {
      console.log(`File not found: ${decodedFilename}`);
      return res.status(404).json({ 
        error: 'File not found in current session',
        details: 'The file may have been deleted or does not exist in this session'
      });
    }

    // Validate file has content
    if (!fileBuffer.length) {
      console.log(`File is empty: ${decodedFilename}`);
      return res.status(404).json({ error: 'File is empty or corrupted' });
    }

    // Set headers for browser preview
    res.setHeader('Content-Type', fileInfo.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${fileInfo.filename}"`);
    
    // Cache control for better performance
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Last-Modified', new Date().toUTCString());
    
    // Special headers for different file types
    if (fileInfo.mimetype.startsWith('video/')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
    
    if (fileInfo.mimetype === 'application/pdf') {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    
    // Set content length
    res.setHeader('Content-Length', fileBuffer.length);
    
    console.log(`File preview successful: ${fileInfo.filename} (${formatFileSize(fileInfo.size)})`);
    res.send(fileBuffer);

  } catch (error) {
    console.error('File preview error:', error);
    
    // Handle specific error types
    if (error.message.includes('ENOENT')) {
      return res.status(404).json({ 
        error: 'File not found on server',
        details: 'The file may have been moved or deleted from server storage'
      });
    }
    
    if (error.message.includes('permission') || error.message.includes('EACCES')) {
      return res.status(403).json({ 
        error: 'Permission denied',
        details: 'Server does not have permission to access the file'
      });
    }

    if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
      return res.status(503).json({ 
        error: 'Server temporarily unavailable',
        details: 'Too many open files, please try again in a moment'
      });
    }

    res.status(500).json({ 
      error: 'Failed to preview file',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}));


// ===== ERROR HANDLING =====
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ===== GRACEFUL SHUTDOWN =====
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    console.log("Process terminated");
  });
});

// ===== START SERVER =====
const server = app.listen(port, () => {
  console.log("=================================");
  console.log("  🚀 Smart File QA Server");
  console.log("=================================");
  console.log(`📍 Running on: http://localhost:${port}`);
  console.log(`🤖 Gemini AI: ${genAI ? "✅ Connected" : "❌ Not configured"}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📁 Static files: public/`);
  console.log("=================================");
});

module.exports = app;
