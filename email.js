const nodemailer = require('nodemailer');

function sendEmail(email, pdfPath) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'your.email@gmail.com', // replace with your Gmail
      pass: 'yourpassword' // replace with app password
    }
  });

  const mailOptions = {
    from: 'your.email@gmail.com',
    to: email,
    subject: 'Your File QA Report',
    text: 'Attached is your report.',
    attachments: [{ path: pdfPath }]
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.log(error);
    else console.log('Email sent: ' + info.response);
  });
}

module.exports = { sendEmail };