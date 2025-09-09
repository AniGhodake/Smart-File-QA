const express = require('express');
const { db } = require('./database');   /// reuired modules which we used
const path = require('path');
const router = express.Router();

///         convert file size in bytes to human-readable format ---KB, MB, GB
function formatFileSize(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

////         format date into this local string 
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
}

///          truncate which is advised i hv no idea       --------- search it
function truncateText(text, maxLength = 100) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}






//                  return icon        based on file
function getFileIcon(mimetype) {
    if (!mimetype) return '📄';
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype.startsWith('video/')) return '🎥';
    if (mimetype === 'application/pdf') return '📕';
    if (mimetype.includes('word')) return '📘';
    if (mimetype.includes('excel') || mimetype.includes('sheet')) return '📊';
    return '📄';
}

// database query helpers                   return results as promise
function queryDatabase(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

function getStats() {
    return new Promise((resolve, reject) => {
        const stats = {};
                              ///   predefined queryies 
        const queries = [
            { key: 'totalSessions', sql: 'SELECT COUNT(*) as count FROM sessions' },
            { key: 'totalUsers', sql: 'SELECT COUNT(*) as count FROM users' },
            { key: 'totalFiles', sql: 'SELECT COUNT(*) as count FROM files WHERE is_deleted = FALSE' },
            { key: 'totalConversations', sql: 'SELECT COUNT(*) as count FROM conversations' },
            { key: 'totalStorage', sql: 'SELECT SUM(file_size) as total FROM files WHERE is_deleted = FALSE' },
        ];

        let completed = 0;






        ///run query and collect result
        queries.forEach(({ key, sql }) => {
            db.get(sql, [], (err, row) => {
                if (err) {
                    stats[key] = 0;
                } else {
                    stats[key] = row?.count || row?.total || 0;
                }
                completed++;
                if (completed === queries.length) {
                    resolve(stats);
                }
            });
        });
    });
}

////////      generate CSS styles        for dashboard
function generateCSS() {
    return `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #333;
        line-height: 1.6;
        min-height: 100vh;
        padding: 20px;
      }

      .container {
        max-width: 1400px;
        margin: 0 auto;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        overflow: hidden;
      }

      .header {
        background: linear-gradient(135deg, #2563eb, #3b82f6);
        color: white;
        padding: 30px;
        text-align: center;
      }

      .header h1 {
        font-size: 2.5rem;
        margin-bottom: 10px;
        font-weight: 700;
      }

      .header p {
        opacity: 0.9;
        font-size: 1.1rem;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        padding: 30px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }

      .stat-card {
        background: white;
        padding: 20px;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        border: 1px solid #e2e8f0;
      }

      .stat-number {
        font-size: 2rem;
        font-weight: 700;
        color: #2563eb;
        margin-bottom: 5px;
      }

      .stat-label {
        color: #64748b;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .nav-tabs {
        display: flex;
        background: #f1f5f9;
        border-bottom: 1px solid #e2e8f0;
        overflow-x: auto;
      }

      .nav-tab {
        padding: 15px 25px;
        cursor: pointer;
        border: none;
        background: none;
        font-size: 1rem;
        font-weight: 500;
        color: #64748b;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .nav-tab:hover {
        background: rgba(37, 99, 235, 0.1);
        color: #2563eb;
      }

      .nav-tab.active {
        background: white;
        color: #2563eb;
        border-bottom: 2px solid #2563eb;
      }

      .tab-content {
        display: none;
        padding: 30px;
      }

      .tab-content.active {
        display: block;
      }

      .table-container {
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        border: 1px solid #e2e8f0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      thead {
        background: #f8fafc;
      }

      th {
        padding: 15px;
        text-align: left;
        font-weight: 600;
        color: #374151;
        border-bottom: 1px solid #e2e8f0;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      td {
        padding: 15px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: top;
      }

      tr:hover {
        background: #f8fafc;
      }

      .text-truncate {
        max-width: 300px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
        .response-cell {
        max-width: 500px;
        word-wrap: break-word;
        white-space: pre-wrap;
        line-height: 1.4;
        max-height: 200px;
        overflow-y: auto;
        padding: 10px;
    }

      .badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 500;
      }

      .badge-success { background: #dcfce7; color: #166534; }
      .badge-warning { background: #fef3c7; color: #92400e; }
      .badge-info { background: #dbeafe; color: #1d4ed8; }
      .badge-secondary { background: #f1f5f9; color: #475569; }

      .session-id {
        font-family: 'Monaco', 'Menlo', monospace;
        background: #f1f5f9;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.8rem;
      }

      .file-icon {
        font-size: 1.5rem;
        margin-right: 8px;
      }

      .date {
        color: #64748b;
        font-size: 0.9rem;
      }

      .no-data {
        text-align: center;
        padding: 60px 20px;
        color: #94a3b8;
        font-style: italic;
      }

      .search-box {
        margin-bottom: 20px;
        padding: 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 1rem;
        width: 300px;
        max-width: 100%;
      }

      .error-message {
        background: #fee2e2;
        color: #dc2626;
        padding: 20px;
        border-radius: 8px;
        margin: 20px 0;
        border-left: 4px solid #dc2626;
      }

      @media (max-width: 768px) {
        body { padding: 10px; }
        .header { padding: 20px; }
        .header h1 { font-size: 2rem; }
        .stats-grid { padding: 20px; grid-template-columns: repeat(2, 1fr); }
        .tab-content { padding: 20px; }
        th, td { padding: 10px 8px; font-size: 0.9rem; }
        .conversations-table th:nth-child(3),
.conversations-table td:nth-child(3) {
  width: 40%;
  min-width: 300px;
}
        .text-truncate { max-width: 150px; }
        table { font-size: 0.8rem; }
      }

      .refresh-btn {
        background: #059669;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.9rem;
        margin-bottom: 20px;
        transition: background 0.2s;
      }

      .refresh-btn:hover {
        background: #047857;
      }
    </style>
  `;
}

///   generate JavaScript for tab functionality in the loca......../db 
function generateJS() {
    return `
    <script>
      function showTab(tabName) {
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(tab => {
          tab.classList.remove('active');
        });
        
        // Remove active class from all tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
          tab.classList.remove('active');
        });
        
        // Show selected tab
        document.getElementById(tabName).classList.add('active');
        event.target.classList.add('active');
      }

      function refreshData() {
        window.location.reload();
      }

      // Initialize first tab as active
      document.addEventListener('DOMContentLoaded', function() {
        const firstTab = document.querySelector('.nav-tab');
        const firstContent = document.querySelector('.tab-content');
        if (firstTab) firstTab.classList.add('active');
        if (firstContent) firstContent.classList.add('active');
      });
    </script>
  `;
}

// main dashboard route
router.get('/', async (req, res) => {
    try {
        //gGet all data
        const [stats, sessions, users, files, conversations] = await Promise.all([
            getStats(),
            queryDatabase(`
        SELECT s.*, u.email 
        FROM sessions s 
        LEFT JOIN users u ON s.user_id = u.id 
        ORDER BY s.created_at DESC 
        LIMIT 100
      `),
            queryDatabase('SELECT * FROM users ORDER BY created_at DESC LIMIT 100'),
            queryDatabase(`
        SELECT f.*, s.session_id 
        FROM files f 
        JOIN sessions s ON f.session_id = s.id 
        WHERE f.is_deleted = FALSE 
        ORDER BY f.uploaded_at DESC 
        LIMIT 100
      `),
            queryDatabase(`
        SELECT c.*, s.session_id 
        FROM conversations c 
        JOIN sessions s ON c.session_id = s.id 
        ORDER BY c.created_at DESC 
        LIMIT 100
      `)
        ]);

        const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Smart File QA - Database Dashboard</title>
        ${generateCSS()}
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 Database Dashboard</h1>
                <p>Smart File QA - System Overview & Data Management</p>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${stats.totalSessions}</div>
                    <div class="stat-label">Sessions</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.totalUsers}</div>
                    <div class="stat-label">Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.totalFiles}</div>
                    <div class="stat-label">Files</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.totalConversations}</div>
                    <div class="stat-label">Conversations</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${formatFileSize(stats.totalStorage)}</div>
                    <div class="stat-label">Storage Used</div>
                </div>
            </div>

            <div class="nav-tabs">
                <button class="nav-tab" onclick="showTab('sessions')">Sessions</button>
                <button class="nav-tab" onclick="showTab('files')">Files</button>
                <button class="nav-tab" onclick="showTab('conversations')">Conversations</button>
                <button class="nav-tab" onclick="showTab('users')">Users</button>
            </div>

            <div id="sessions" class="tab-content">
                <button class="refresh-btn" onclick="refreshData()">🔄 Refresh Data</button>
                <div class="table-container">
                    <table class="conversations-table">
                        <thead>
                            <tr>
                                <th>Session ID</th>
                                <th>User Email</th>
                                <th>Created</th>
                                <th>Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sessions.length ? sessions.map(session => `
                                <tr>
                                    <td><span class="session-id">${session.session_id}</span></td>
                                    <td>${session.email || '<span style="color: #94a3b8;">No email</span>'}</td>
                                    <td class="date">${formatDate(session.created_at)}</td>
                                    <td class="date">${formatDate(session.updated_at)}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="4" class="no-data">No sessions found</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="files" class="tab-content">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Session</th>
                                <th>Type</th>
                                <th>Size</th>
                                <th>Uploaded</th>
                                <th>Path</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${files.length ? files.map(file => `
                                <tr>
                                    <td>
                                        <span class="file-icon">${getFileIcon(file.mimetype)}</span>
                                        <span class="text-truncate" title="${file.original_name}">${file.original_name}</span>
                                    </td>
                                    <td><span class="session-id">${file.session_id}</span></td>
                                    <td><span class="badge badge-info">${file.mimetype}</span></td>
                                    <td>${formatFileSize(file.file_size)}</td>
                                    <td class="date">${formatDate(file.uploaded_at)}</td>
                                    <td class="text-truncate" title="${file.file_path}">${file.file_path}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="6" class="no-data">No files found</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="conversations" class="tab-content">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Session</th>
                                <th>Prompt</th>
                                <th>Response</th>
                                <th>File Context</th>
                                <th>Response Time</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${conversations.length ? conversations.map(conv => `
                                <tr>
                                    <td><span class="session-id">${conv.session_id}</span></td>
                                    <td style="max-width: 500px; word-wrap: break-word; white-space: pre-wrap;" title="${conv.prompt}">${(conv.prompt)}</td>
                                    <td style="max-width: 500px; word-wrap: break-word; white-space: pre-wrap;">${conv.ai_response}</td>
                                    <td>
                                        ${conv.has_file ?
                `<span class="badge badge-success">${conv.file_name || 'Yes'}</span>` :
                '<span class="badge badge-secondary">No file</span>'
            }
                                    </td>
                                    <td>${conv.response_time ? conv.response_time + 'ms' : 'N/A'}</td>
                                    <td class="date">${formatDate(conv.created_at)}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="6" class="no-data">No conversations found</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="users" class="tab-content">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Email</th>
                                <th>Registered</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.length ? users.map(user => `
                                <tr>
                                    <td>${user.id}</td>
                                    <td>${user.email}</td>
                                    <td class="date">${formatDate(user.created_at)}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="3" class="no-data">No users found</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        ${generateJS()}
    </body>
    </html>
    `;

        res.send(html);

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>Database Dashboard Error</h1>
          <div style="background: #fee2e2; color: #dc2626; padding: 20px; border-radius: 8px;">
            <p><strong>Error:</strong> ${error.message}</p>
            <p>This might happen if the database is not initialized yet. Try uploading a file or starting a conversation first.</p>
          </div>
          <a href="/" style="color: #2563eb;">← Back to main app</a>
        </body>
      </html>
    `);
    }
});

module.exports = router;