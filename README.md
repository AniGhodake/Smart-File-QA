# Smart File QA Server

A **full-stack web application** that allows users to upload files (images, videos, documents, PDFs) and interact with them using **Google's Gemini AI**.  
Users can ask questions about their files, receive intelligent responses, generate PDFs of conversations, and even get results via email.  

The app also includes an **Admin Dashboard** for monitoring sessions, files, and conversations.  

---

## 🚀 Features

- **File Upload & Analysis** – Upload and analyze images, videos, PDFs, Word/Excel docs (up to 10MB)  
- **AI-Powered Q&A** – Ask questions about uploaded files using Gemini's multimodal AI (text + file context)  
- **Session Management** – Persistent conversation history stored in SQLite  
- **PDF Generation & Download** – Export conversation reports with PDFKit  
- **Email Integration** – Send summaries and download links via Nodemailer (Zoho/Gmail SMTP) -------->>> in my case it is Zoho 
- **Admin Dashboard** – Monitor stats, sessions, files, and users at `/db`  
- **Responsive UI** – Simple HTML/CSS/JS frontend  

---

## 🛠 Tech Stack

- **Backend:** Node.js, Express.js  
- **Database:** SQLite3 (file-based, auto-initialized)  
- **AI Integration:** Google Generative AI (Gemini API)  ------------>>> 2.5 flash
- **File Handling:** Multer, PDFKit, pdf-lib  
- **Email:** Nodemailer (Zoho/Gmail SMTP)  
- **Frontend:** HTML/CSS/JS  
- **Dev Tools:** Nodemon  

---

## 📦 Prerequisites

- Node.js **v18+**  
- npm (Node package manager)  
- Google Gemini API Key (from Google AI Studio)  -------->>> you can use chatgpt also
- Email credentials (Zoho or Gmail with app-specific password)  ---------->>> configure google setting for gmail. set app password 

---

## ⚙️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/smart-file-qa-server.git
cd smart-file-qa-server
2. Install Dependencies
bash
Copy code
npm install
3. Set Environment Variables
Create a .env file in the root directory:

env
Copy code
# Google Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Email Configuration
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password_or_app_password
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587

# Server Configuration
BASE_URL=http://localhost:3000
JWT_SECRET=your_jwt_secret_here
PORT=3000
NODE_ENV=development
Environment Variables Explained:

Variable	Description	Example
GEMINI_API_KEY	Google Gemini API key	AIzaSyC...
EMAIL_USER	Your email address for notifications	user@gmail.com
EMAIL_PASS	App-specific password or email pass	abcd efgh ijkl mnop
SMTP_HOST	SMTP server hostname	smtp.zoho.com / smtp.gmail.com
SMTP_PORT	SMTP port (usually 587 for TLS)	587
BASE_URL	Base URL for file access links	http://localhost:3000
JWT_SECRET	Secret key for JWT token signing	your-secret-key-here
PORT	Port number for the server	3000
NODE_ENV	Environment mode	development / production

4. Initialize Database
The SQLite database smart_file_qa.db is created automatically on first startup.

5. Run the Server
bash
Copy code
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
# or
node server.js
The app will be available at: http://localhost:3000
