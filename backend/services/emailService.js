const axios = require('axios');
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const getConfig = () => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Email service is not configured. Set BREVO_API_KEY in your environment.');
  }
  if (!process.env.BREVO_FROM_EMAIL) {
    throw new Error('Email service is not configured. Set BREVO_FROM_EMAIL (must be a Brevo-verified sender).');
  }
  return {
    apiKey: process.env.BREVO_API_KEY,
    fromEmail: process.env.BREVO_FROM_EMAIL
  };
};

const sendViaBrevo = async (toEmail, subject, html) => {
  const { apiKey, fromEmail } = getConfig();

  try {
    const response = await axios.post(
      BREVO_ENDPOINT,
      {
        sender: { name: 'AI FYP Generator', email: fromEmail },
        to: [{ email: toEmail }],
        subject,
        htmlContent: html
      },
      {
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json'
        },
        timeout: 15000
      }
    );
    return response;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(detail);
  }
};

/**
 * Sends a 6-digit OTP verification email to a CUST student.
 *
 * @param {string} toEmail - Recipient email (must be @cust.pk)
 * @param {string} otp     - The 6-digit OTP code
 * @param {string} name    - Student's full name
 */
const sendVerificationEmail = async (toEmail, otp, name) => {
  const html = `
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
  `;

  try {
    const response = await sendViaBrevo(toEmail, '🎓 Verify Your Email - AI FYP Generator', html);
    console.log('Verification email sent successfully to:', toEmail, '| Status:', response.status);
    return response.data;
  } catch (sendErr) {
    console.error('Failed to send email to', toEmail, ':', sendErr.message);
    throw new Error('Failed to send verification email: ' + sendErr.message);
  }
};

/**
 * Sends a password reset link to a CUST student.
 *
 * @param {string} toEmail   - Recipient email (must be @cust.pk)
 * @param {string} resetLink - Full frontend URL containing the reset token
 * @param {string} name      - Student's full name
 */
const sendPasswordResetEmail = async (toEmail, resetLink, name) => {
  const html = `
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
  `;

  try {
    const response = await sendViaBrevo(toEmail, '🔑 Reset Your Password - AI FYP Generator', html);
    console.log('Password reset email sent successfully to:', toEmail, '| Status:', response.status);
    return response.data;
  } catch (sendErr) {
    console.error('Failed to send email to', toEmail, ':', sendErr.message);
    throw new Error('Failed to send password reset email: ' + sendErr.message);
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
