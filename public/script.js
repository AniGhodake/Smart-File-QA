// my upload script
let lastUploadId = null;

document.getElementById('upload-btn').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', () => {
  const fileInput = document.getElementById('file-input');
  const file = fileInput.files[0];
  if (!file) {
    alert('Please select a file!');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  fetch('/upload', {
    method: 'POST',
    body: formData
  })
    .then(response => response.json())
    .then(data => {
      const preview = document.getElementById('preview');
      preview.innerHTML = '';
      if (data.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.maxWidth = '300px';
        preview.appendChild(img);
      } else if (data.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.controls = true;
        video.style.maxWidth = '300px';
        preview.appendChild(video);
      } else {
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = 'View Document';
        preview.appendChild(link);
      }
      alert('Uploaded: ' + data.filename);
      lastUploadId = data.id;
    })
    .catch(error => {
      alert('Error: ' + error.message);
    });
});

document.getElementById('submit-btn').addEventListener('click', () => {
  const email = document.getElementById('email-input').value;
  const prompt = document.getElementById('prompt-input').value;
  if (!email || !prompt || !lastUploadId) {
    alert('Please enter email, question, and upload a file first!');
    return;
  }
  fetch('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, prompt, id: lastUploadId })
  })
    .then(response => response.json())
    .then(data => {
      alert('Answer: ' + data.answer);
    })
    .catch(error => {
      alert('Error: ' + error.message);
    });
});

var temp = 0; // not used