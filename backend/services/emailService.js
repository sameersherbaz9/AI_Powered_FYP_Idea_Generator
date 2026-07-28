const nodemailer = require('nodemailer');

/**
 * Shared SMTP transporter, created lazily on first use and reused for every
 * subsequent email. Avoids paying for a new TCP/TLS handshake (and a
 * transporter.verify() round-trip) on every single send.
 *
 * NOTE: Gmail SMTP from cloud hosts (Render, Heroku, Railway, etc.) is
 * unreliable — Google's anti-spam systems can silently drop connections
 * from data-center IPs regardless of these settings, independent of your
 * credentials. The changes below (port 587, forced IPv4, short timeouts)
 * are best-effort mitigations, not a guarantee. If this keeps timing out
 * after redeploying, that confirms it's an IP-level block on Google's side,
 * not a config problem, and the real fix is moving to an HTTP-based email
 * API (Resend/SendGrid/Brevo) instead of SMTP.
 */
let transporter = null;
let verified = false;

const getTransporter = async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error('Email service is not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD in .env');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      family: 4, // Force IPv4 — some hosts resolve Gmail's IPv6 address, which never responds, causing a hang instead of a fast failure
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
      // No `tls: { rejectUnauthorized: false }` here — Gmail's SMTP endpoint
      // has a valid certificate, so disabling verification only weakens the
      // connection against MITM with no benefit.
    });
  }

  if (!verified) {
    try {
      await transporter.verify();
      verified = true;
    } catch (verifyErr) {
      console.error('SMTP transporter verification failed:', verifyErr.message);
      throw new Error(
        'Cannot connect to email server. ' +
        'Please check EMAIL_USER and EMAIL_APP_PASSWORD in .env. ' +
        'Make sure you are using a Gmail App Password (not your regular Gmail password). ' +
        'Original error: ' + verifyErr.message
      );
    }
  }

  return transporter;
};

/**
 * Sends a 6-digit OTP verification email to a CUST student.
 *
 * Uses Gmail SMTP over STARTTLS (port 587) with an App Password.
 * Generate an App Password at: Google Account → Security → 2-Step Verification → App Passwords.
 *
 * @param {string} toEmail - Recipient email (must be @cust.pk)
 * @param {string} otp     - The 6-digit OTP code
 * @param {string} name    - Student's full name
 */
const sendVerificationEmail = async (toEmail, otp, name) => {
  const mailer = await getTransporter();

  const mailOptions = {
    from: `"AI FYP Generator" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: '🎓 Verify Your Email - AI FYP Generator',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f3e8ff;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3e8ff;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="500" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
                <tr>
                  <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:bold;">🎓 AI FYP Generator</h1>
                    <p style="margin:8px 0 0;color:#ddd6fe;font-size:14px;">Capital University of Science & Technology</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px 32px;">
                    <h2 style="margin:0 0 8px;color:#f8fafc;font-size:22px;">Verify Your Email</h2>
                    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;">Hi ${name}, enter this code to complete your registration:</p>
                    <div style="background:#0f172a;border:2px solid #7c3aed;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                      <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Your Verification Code</p>
                      <div style="font-size:42px;font-weight:bold;color:#a78bfa;letter-spacing:12px;font-family:monospace;">${otp}</div>
                    </div>
                    <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-align:center;">⏱ This code expires in <strong style="color:#f59e0b;">10 minutes</strong></p>
                    <p style="margin:0;color:#64748b;font-size:13px;text-align:center;">If you didn't request this, please ignore this email.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#0f172a;padding:20px 32px;text-align:center;border-top:1px solid #1e293b;">
                    <p style="margin:0;color:#475569;font-size:12px;">CUST • AI FYP Generator • Secure Verification</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  };

  try {
    const info = await mailer.sendMail(mailOptions);
    console.log('Verification email sent successfully to:', toEmail, '| Message ID:', info.messageId);
    return info;
  } catch (sendErr) {
    console.error('Failed to send email to', toEmail, ':', sendErr.message);
    throw new Error('Failed to send verification email: ' + sendErr.message);
  }
};

/**
 * Sends a password reset link to a CUST student.
 *
 * Uses the same Gmail SMTP transport as sendVerificationEmail.
 *
 * @param {string} toEmail   - Recipient email (must be @cust.pk)
 * @param {string} resetLink - Full frontend URL containing the reset token
 * @param {string} name      - Student's full name
 */
const sendPasswordResetEmail = async (toEmail, resetLink, name) => {
  const mailer = await getTransporter();

  const mailOptions = {
    from: `"AI FYP Generator" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: '🔑 Reset Your Password - AI FYP Generator',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f3e8ff;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3e8ff;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="500" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
                <tr>
                  <td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:bold;">🎓 AI FYP Generator</h1>
                    <p style="margin:8px 0 0;color:#ddd6fe;font-size:14px;">Capital University of Science & Technology</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px 32px;">
                    <h2 style="margin:0 0 8px;color:#f8fafc;font-size:22px;">Reset Your Password</h2>
                    <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;">Hi ${name}, we received a request to reset your password. Click the button below to choose a new one:</p>
                    <div style="text-align:center;margin-bottom:24px;">
                      <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 32px;border-radius:10px;">Reset Password</a>
                    </div>
                    <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-align:center;word-break:break-all;">Or copy this link into your browser:<br><span style="color:#a78bfa;">${resetLink}</span></p>
                    <p style="margin:16px 0 8px;color:#64748b;font-size:13px;text-align:center;">⏱ This link expires in <strong style="color:#f59e0b;">30 minutes</strong></p>
                    <p style="margin:0;color:#64748b;font-size:13px;text-align:center;">If you didn't request this, you can safely ignore this email — your password will not be changed.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#0f172a;padding:20px 32px;text-align:center;border-top:1px solid #1e293b;">
                    <p style="margin:0;color:#475569;font-size:12px;">CUST • AI FYP Generator • Secure Verification</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  };

  try {
    const info = await mailer.sendMail(mailOptions);
    console.log('Password reset email sent successfully to:', toEmail, '| Message ID:', info.messageId);
    return info;
  } catch (sendErr) {
    console.error('Failed to send email to', toEmail, ':', sendErr.message);
    throw new Error('Failed to send password reset email: ' + sendErr.message);
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
