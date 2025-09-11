const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');


const uploadsDir = path.join(__dirname, 'uploads');       /// upload should be there in your project
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

///    database setup
const dbPath = path.join(__dirname, 'smart_file_qa.db');
const db = new sqlite3.Database(dbPath);

// initialize database without the values     just void tables
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      ////                                          users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email VARCHAR(255) UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      ////                                          sessions table
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id VARCHAR(255) UNIQUE NOT NULL,
          user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      ///                                               files
      db.run(`
        CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          filename VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          mimetype VARCHAR(100) NOT NULL,
          file_size INTEGER NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_deleted BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
      `);

      ///                                                    Conversations table
      db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          prompt TEXT NOT NULL,
          ai_response TEXT NOT NULL,
          response_time INTEGER,
          has_file BOOLEAN DEFAULT FALSE,
          file_name VARCHAR(255),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ Database initialized successfully');
          resolve();
        }
      });
    });
  });
}

/// database helper functions          stuck---may have issue
const dbHelpers = {
                       // create or get user by email
  async createOrGetUser(email) {
    return new Promise((resolve, reject) => {
      if (!email) {
        resolve(null);
        return;
      }

      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          resolve(row);
        } else {
          db.run('INSERT INTO users (email) VALUES (?)', [email], function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({ id: this.lastID, email, created_at: new Date().toISOString() });
            }
          });
        }
      });
    });
  },

  //                                    Create / get session
  async createOrGetSession(sessionId, userEmail = null) {
    return new Promise(async (resolve, reject) => {
      try {
        // check if session exists
        db.get('SELECT * FROM sessions WHERE session_id = ?', [sessionId], async (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (row) {
            resolve(row);
          } else {
            //create new session
            let userId = null;
            if (userEmail) {
              const user = await dbHelpers.createOrGetUser(userEmail);
              userId = user?.id;
            }

            db.run('INSERT INTO sessions (session_id, user_id) VALUES (?, ?)', 
              [sessionId, userId], function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve({ 
                    id: this.lastID, 
                    session_id: sessionId, 
                    user_id: userId,
                    created_at: new Date().toISOString()
                  });
                }
              });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  //                                              Save file 
  async saveFile(sessionId, fileData, filePath) {
    return new Promise(async (resolve, reject) => {
      try {
        const session = await dbHelpers.createOrGetSession(sessionId);
        
        db.run(`
          INSERT INTO files (session_id, filename, original_name, mimetype, file_size, file_path)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          session.id,
          fileData.filename,
          fileData.filename,
          fileData.mimetype,
          fileData.size,
          filePath
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              id: this.lastID,
              session_id: session.id,
              ...fileData,
              file_path: filePath
            });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  //                                     save conversation
  async saveConversation(sessionId, prompt, aiResponse, responseTime, hasFile = false, fileName = null) {
    return new Promise(async (resolve, reject) => {
      try {
        const session = await dbHelpers.createOrGetSession(sessionId);
        
        db.run(`
          INSERT INTO conversations (session_id, prompt, ai_response, response_time, has_file, file_name)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          session.id,
          prompt,
          aiResponse,
          responseTime,
          hasFile ? 1 : 0,
          fileName
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              id: this.lastID,
              session_id: session.id,
              prompt,
              ai_response: aiResponse,
              response_time: responseTime,
              has_file: hasFile,
              file_name: fileName,
              created_at: new Date().toISOString()
            });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // get session conversations       unique            by id
  async getSessionConversations(sessionId) {
    return new Promise(async (resolve, reject) => {
      try {
        const session = await dbHelpers.createOrGetSession(sessionId);
        
        db.all(`
          SELECT * FROM conversations 
          WHERE session_id = ? 
          ORDER BY created_at ASC
        `, [session.id], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  //                               get session file
  async getSessionFiles(sessionId) {
    return new Promise(async (resolve, reject) => {
      try {
        const session = await dbHelpers.createOrGetSession(sessionId);
        
        db.all(`
          SELECT * FROM files 
          WHERE session_id = ? AND is_deleted = FALSE 
          ORDER BY uploaded_at DESC
        `, [session.id], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },




  //                    update session for user
  async updateSessionUser(sessionId, userEmail) {
    return new Promise(async (resolve, reject) => {
      try {
        const session = await dbHelpers.createOrGetSession(sessionId);
        const user = await dbHelpers.createOrGetUser(userEmail);
        
        db.run(`
          UPDATE sessions 
          SET user_id = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [user?.id, session.id], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
};

/// export database and helpers              very important step    
module.exports = {
  db,
  initDatabase,
  dbHelpers
};