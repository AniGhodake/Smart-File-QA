const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Generate unique session ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// Generate secure file token
function generateFileToken(sessionId, fileId, expiresIn = '24h') {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign({ sessionId, fileId, type: 'file_download' }, secret, { expiresIn });
}

// Verify file token
function verifyFileToken(token) {
  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

// Generate download link (for actual downloads)
function generateDownloadLink(sessionId, fileId, filename, baseUrl) {
  const token = generateFileToken(sessionId, fileId);
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const encodedFilename = encodeURIComponent(safeFilename);
  return `${baseUrl}/secure-download/${sessionId}/${fileId}/${encodedFilename}?token=${token}`;
}

// NEW: Generate preview link (for browser viewing)
function generatePreviewLink(sessionId, fileId, filename, baseUrl) {
  const token = generateFileToken(sessionId, fileId);
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const encodedFilename = encodeURIComponent(safeFilename);
  return `${baseUrl}/secure-download/${sessionId}/${fileId}/${encodedFilename}?token=${token}&preview=true`;
}

// Save file to disk
async function saveFileToDisk(sessionId, fileBuffer, originalFilename, mimetype) {
  try {
    // Create session directory
    const sessionDir = path.join(__dirname, 'uploads', sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext);
    const safeFilename = `${timestamp}_${baseName}${ext}`.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    const filePath = path.join(sessionDir, safeFilename);
    
    // Write file to disk
    await fs.promises.writeFile(filePath, fileBuffer);
    
    return {
      filePath: filePath,
      relativePath: path.join('uploads', sessionId, safeFilename),
      filename: safeFilename,
      originalName: originalFilename
    };
  } catch (error) {
    throw new Error(`Failed to save file: ${error.message}`);
  }
}

// Read file from disk
async function readFileFromDisk(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    return await fs.promises.readFile(filePath);
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
}

// Delete file from disk
async function deleteFileFromDisk(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to delete file: ${error.message}`);
    return false;
  }
}

// Clean up old session files (call periodically)
async function cleanupOldFiles(daysOld = 7) {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const sessionDirs = await fs.promises.readdir(uploadsDir);
    
    for (const sessionDir of sessionDirs) {
      const sessionPath = path.join(uploadsDir, sessionDir);
      const stats = await fs.promises.stat(sessionPath);
      
      if (stats.isDirectory() && stats.mtime < cutoffDate) {
        await fs.promises.rmdir(sessionPath, { recursive: true });
        console.log(`Cleaned up old session: ${sessionDir}`);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Get file info from path
function getFileInfo(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      exists: true
    };
  } catch (error) {
    return null;
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  generateSessionId,
  generateFileToken,
  verifyFileToken,
  generateDownloadLink,
  generatePreviewLink, // NEW: Export the preview link function
  saveFileToDisk,
  readFileFromDisk,
  deleteFileFromDisk,
  cleanupOldFiles,
  getFileInfo,
  formatFileSize
};