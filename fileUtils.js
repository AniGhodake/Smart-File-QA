const fs = require('fs');
const path = require('path');   ///        file and folder paths
const jwt = require('jsonwebtoken');      // secure tokens    for generations
const crypto = require('crypto');       /// unique session ids ..... random given

//                    unique session ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

//         generate secure file token
function generateFileToken(sessionId, fileId, expiresIn = '24h') {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign({ sessionId, fileId, type: 'file_download' }, secret, { expiresIn });
}

/////         verify file token with your in .env
function verifyFileToken(token) {
  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

// generate download link (for actual downloads)
function generateDownloadLink(sessionId, fileId, filename, baseUrl) {
  const token = generateFileToken(sessionId, fileId);
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const encodedFilename = encodeURIComponent(safeFilename);
  return `${baseUrl}/secure-download/${sessionId}/${fileId}/${encodedFilename}?token=${token}`;
}

///       generate preview link (for browser viewing)       // currently have problems
function generatePreviewLink(sessionId, fileId, filename, baseUrl) {
  const token = generateFileToken(sessionId, fileId);
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const encodedFilename = encodeURIComponent(safeFilename);
  return `${baseUrl}/secure-download/${sessionId}/${fileId}/${encodedFilename}?token=${token}&preview=true`;
}

/// save file to disk
async function saveFileToDisk(sessionId, fileBuffer, originalFilename, mimetype) {
  try {
    //// create session directory
    const sessionDir = path.join(__dirname, 'uploads', sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }




    ////         generate unique filename ..... to ovveride with same name conflicts 
    const timestamp = Date.now();
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext);
    const safeFilename = `${timestamp}_${baseName}${ext}`.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    const filePath = path.join(sessionDir, safeFilename);
    
    
    await fs.promises.writeFile(filePath, fileBuffer);       // write file to disk
    
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


async function readFileFromDisk(filePath) {       //// read file from disk
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    return await fs.promises.readFile(filePath);
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
}


async function deleteFileFromDisk(filePath) {     // / delete file.......disk
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

//////               clean up old session files ...... 7 days
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

///////  getting file info from path......... from project folder
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


function formatFileSize(bytes) {        //// format file size
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
  generatePreviewLink, //////          export the preview link function
  saveFileToDisk,
  readFileFromDisk,                  // few works few are under process
  deleteFileFromDisk,
  cleanupOldFiles,
  getFileInfo,
  formatFileSize
};