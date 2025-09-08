let currentFile = null;
let isMarkedLoaded = false;
let zoomLevel = 1;

// Clear session on page load
window.onload = () => {
  console.log("Application initialized");
  clearErrorMessage();
};

// Load marked library (Markdown parser) from CDN
const script = document.createElement("script");
script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
script.onload = () => {
  isMarkedLoaded = true;
  document.getElementById("send-btn").disabled = false;
  console.log("Marked library loaded successfully");
};
script.onerror = () => {
  console.error("Failed to load marked library");
  showErrorMessage("Failed to load Markdown parser. Please refresh the page.");
};
document.head.appendChild(script);

// ===== DOM ELEMENTS =====
const uploadZone = document.getElementById("upload-zone");
const fileInput = document.getElementById("file-input");
const fileChip = document.getElementById("file-chip");
const fileName = document.getElementById("file-name");
const fileSize = document.getElementById("file-size");
const fileIcon = document.getElementById("file-icon");
const previewBtn = document.getElementById("preview-btn");
const deleteBtn = document.getElementById("delete-btn");
const emailInput = document.getElementById("email-input");
const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const typingIndicator = document.getElementById("typing-indicator");
const previewModal = document.getElementById("preview-modal");
const modalClose = document.getElementById("modal-close");
const modalTitle = document.getElementById("modal-title");
const previewContent = document.getElementById("preview-content");
const zoomControls = document.getElementById("zoom-controls");
const zoomIn = document.getElementById("zoom-in");
const zoomOut = document.getElementById("zoom-out");
const exportBtn = document.getElementById("export-btn");
const errorMessage = document.getElementById("error-message");
const errorText = document.getElementById("error-text");

// ===== UTILITY FUNCTIONS =====
function showErrorMessage(message) {
  errorText.textContent = message;
  errorMessage.classList.add("show");
  setTimeout(() => {
    clearErrorMessage();
  }, 5000);
}

function clearErrorMessage() {
  errorMessage.classList.remove("show");
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileIcon(mimetype) {
  if (mimetype.startsWith("image/")) return "fas fa-image";
  if (mimetype.startsWith("video/")) return "fas fa-video";
  if (mimetype === "application/pdf") return "fas fa-file-pdf";
  if (mimetype.includes("word")) return "fas fa-file-word";
  if (mimetype.includes("excel") || mimetype.includes("sheet"))
    return "fas fa-file-excel";
  return "fas fa-file";
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 128) + "px";
}

// ===== FILE UPLOAD FUNCTIONS =====
uploadZone.addEventListener("click", () => fileInput.click());

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (!uploadZone.contains(e.relatedTarget)) {
    uploadZone.classList.remove("drag-over");
  }
});
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) {
    handleFileUpload(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFileUpload(e.target.files[0]);
});

async function handleFileUpload(file) {
  clearErrorMessage();

  if (file.size > 10 * 1024 * 1024) {
    showErrorMessage("File size must be less than 10MB");
    return;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "video/mp4",
    "video/quicktime",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (!allowedTypes.includes(file.type)) {
    showErrorMessage("Unsupported file type. Please upload images, videos, PDFs, or documents.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  sendBtn.disabled = true;
  sendBtn.innerHTML = '<div class="loading"></div>';

  try {
    const response = await fetch("/upload", { method: "POST", body: formData });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    currentFile = data;
    displayFileChip(data, file.size);
    zoomLevel = 1;
  } catch (err) {
    console.error("Upload error:", err);
    showErrorMessage(`Upload failed: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
  }
}

function displayFileChip(fileData, fileSize) {
  fileName.textContent = fileData.filename;
  fileSize.textContent = formatFileSize(fileSize || 0);
  fileIcon.className = getFileIcon(fileData.type);
  fileChip.classList.add("show");
}

// ===== FILE ACTIONS =====
previewBtn.addEventListener("click", () => {
  if (!currentFile) return;

  previewContent.innerHTML = "";
  modalTitle.textContent = currentFile.filename;

  if (currentFile.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = `/preview?file=${encodeURIComponent(currentFile.filename)}&t=${Date.now()}`;
    img.style.maxWidth = "90%";
    img.style.maxHeight = "80vh";
    img.style.objectFit = "contain";
    img.style.display = "block";
    img.style.margin = "0 auto";
    img.style.transform = `scale(${zoomLevel})`;
    img.style.transformOrigin = "center";
    img.style.transition = "transform 0.2s ease";
    previewContent.appendChild(img);
    zoomControls.classList.add("show");
  } else if (currentFile.type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = `/preview?file=${encodeURIComponent(currentFile.filename)}&t=${Date.now()}`;
    video.controls = true;
    video.style.maxWidth = "90%";
    video.style.maxHeight = "80vh";
    video.style.display = "block";
    video.style.margin = "0 auto";
    previewContent.appendChild(video);
    zoomControls.classList.remove("show");
  } else {
    const docPreview = document.createElement("div");
    docPreview.className = "document-preview";
    docPreview.innerHTML = `
      <div class="document-icon"><i class="${getFileIcon(currentFile.type)}"></i></div>
      <div class="document-name">${currentFile.filename}</div>
      <div class="document-info">Document preview not available. Use AI to analyze content.</div>`;
    previewContent.appendChild(docPreview);
    zoomControls.classList.remove("show");
  }

  previewModal.classList.add("show");
});

deleteBtn.addEventListener("click", async () => {
  if (!currentFile) return;
  try {
    const response = await fetch("/delete-file", { method: "POST" });
    if (!response.ok) throw new Error("Failed to delete file");
    currentFile = null;
    fileChip.classList.remove("show");
    previewModal.classList.remove("show");
    fileInput.value = "";
  } catch (err) {
    console.error("Delete error:", err);
    showErrorMessage(`Delete failed: ${err.message}`);
  }
});

// ===== ZOOM CONTROLS =====
zoomIn.addEventListener("click", () => {
  zoomLevel = Math.min(zoomLevel + 0.2, 3);
  const img = previewContent.querySelector("img");
  if (img) img.style.transform = `scale(${zoomLevel})`;
});
zoomOut.addEventListener("click", () => {
  zoomLevel = Math.max(zoomLevel - 0.2, 0.5);
  const img = previewContent.querySelector("img");
  if (img) img.style.transform = `scale(${zoomLevel})`;
});

// ===== MODAL FUNCTIONS =====
modalClose.addEventListener("click", closeModal);
previewModal.addEventListener("click", (e) => {
  if (e.target === previewModal) closeModal();
});
function closeModal() {
  previewModal.classList.remove("show");
  previewContent.innerHTML = "";
  zoomControls.classList.remove("show");
  zoomLevel = 1;
}

// ===== CHAT FUNCTIONS =====
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
messageInput.addEventListener("input", (e) => autoResize(e.target));

async function sendMessage() {
  if (!isMarkedLoaded) {
    showErrorMessage("Markdown parser is still loading. Please wait.");
    return;
  }
  const prompt = messageInput.value.trim();
  if (!prompt) return;

  sendBtn.disabled = true;
  sendBtn.innerHTML = '<div class="loading"></div>';
  addMessage(prompt, "user");
  messageInput.value = "";
  messageInput.style.height = "auto";
  showTypingIndicator();

  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    hideTypingIndicator();
    addMessage(marked.parse(data.answer), "ai");
  } catch (err) {
    console.error("AI error:", err);
    hideTypingIndicator();
    showErrorMessage(`AI response failed: ${err.message}`);
    addMessage("Sorry, I encountered an error. Please try again.", "ai");
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
  }
}

function addMessage(content, type) {
  const div = document.createElement("div");
  div.className = `message ${type}`;
  div.innerHTML = `
    <div class="message-avatar ${type}">${type === "user" ? "You" : "AI"}</div>
    <div class="message-content">${type === "ai" ? content : escapeHtml(content)}</div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[m]);
}
function showTypingIndicator() {
  typingIndicator.classList.add("show");
  chatMessages.appendChild(typingIndicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function hideTypingIndicator() {
  typingIndicator.classList.remove("show");
  if (typingIndicator.parentNode) typingIndicator.parentNode.removeChild(typingIndicator);
}

// ===== EMAIL & EXPORT =====
emailInput.addEventListener("input", async () => {
  try {
    await fetch("/update-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value }),
    });
  } catch (err) {
    console.error("Email update failed:", err.message);
  }
});

exportBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) return showErrorMessage("Enter email before exporting");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErrorMessage("Invalid email");

  exportBtn.disabled = true;
  exportBtn.innerHTML = '<div class="loading"></div> Sending...';
  try {
    const res = await fetch("/send-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("Failed to send report");
    showSuccessMessage(`Report sent successfully to ${email}!`);
  } catch (err) {
    showErrorMessage(err.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Report';
  }
});
function showSuccessMessage(msg) {
  const statusDiv = document.getElementById("status");
  if (statusDiv) {
    statusDiv.style.color = "green";
    statusDiv.innerText = msg;
    setTimeout(() => {
      statusDiv.style.transition = "opacity 1s ease";
      statusDiv.style.opacity = "0";
      setTimeout(() => {
        statusDiv.innerText = "";
        statusDiv.style.opacity = "1";
      }, 1000);
    }, 3000);
  } else alert(msg);
}

// ===== SHORTCUTS =====
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && previewModal.classList.contains("show")) closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") sendMessage();
});

// ===== ERROR HANDLING =====
window.addEventListener("error", (e) => {
  console.error("Global error:", e.error);
  showErrorMessage("Unexpected error occurred. Refresh page.");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled rejection:", e.reason);
  showErrorMessage("Unexpected error occurred. Try again.");
});

console.log("Smart File QA initialized successfully");
