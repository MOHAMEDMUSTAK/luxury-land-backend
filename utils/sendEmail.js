const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // For development without credentials, log the message instead of failing
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("-----------------------------------------");
    console.log("📧 MOCK EMAIL SENT (Development mode)");
    console.log("To:", options.email);
    console.log("Subject:", options.subject);
    console.log("Message:", options.message);
    console.log("-----------------------------------------");
    return;
  }

  // Create a transporter
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE, // e.g., Gmail
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // Define email options
  const mailOptions = {
    from: `Land Marketplace <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html // Optional: HTML body
  };

  // Actually send the email
  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
