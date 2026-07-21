const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    try {
      // Sanitize user (trim whitespaces) and password (remove spaces/quotes)
      const userVal = (process.env.EMAIL_USER || '').trim();
      const passVal = (process.env.EMAIL_PASS || '').replace(/\s+/g, '').replace(/['"]/g, '');

      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: userVal,
          pass: passVal,
        },
      });
      console.log("📬 NodeMailer configured with Gmail SMTP");
    } catch (err) {
      console.error("❌ Failed to configure NodeMailer:", err.message);
      throw err;
    }
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter();
  
  const mailOptions = {
    from: `"Inventra System" <${process.env.EMAIL_USER}>`,
    to,
    subject,
  };
  
  if (text) mailOptions.text = text;
  if (html) mailOptions.html = html;

  return await tx.sendMail(mailOptions);
}

module.exports = {
  getTransporter,
  sendMail
};
