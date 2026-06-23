const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

const ALLOWED_DOMAIN = '@cust.pk';

const generateOTP = () => crypto.randomInt(100000, 999999).toString();

const validatePassword = (password) => {
  if (!password || password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Password must contain at least one special character';
  return null;
};

/**
 * Maps a CUST email prefix to the corresponding department name.
 * @param {string} email - Student email address
 * @returns {string} Department name or 'Unknown'
 */
const getDepartmentFromEmail = (email) => {
  const prefix = email.split('@')[0].toLowerCase();
  const departmentMap = [
    { codes: ['bcpe'], name: 'Computer Engineering' },
    { codes: ['bcs'],  name: 'Computer Science' },
    { codes: ['bte'],  name: 'Telecommunication Engineering' },
    { codes: ['bme'],  name: 'Mechanical Engineering' },
    { codes: ['bee'],  name: 'Electrical Engineering' },
    { codes: ['bce'],  name: 'Civil Engineering' },
    { codes: ['bbe'],  name: 'Biomedical Engineering' },
    { codes: ['bcys', 'bcy'], name: 'Cybersecurity' },
    { codes: ['bse'],  name: 'Software Engineering' },
    { codes: ['bai'],  name: 'Artificial Intelligence' },
    { codes: ['bds'],  name: 'Data Science' },
    { codes: ['bit'],  name: 'Information Technology' },
    { codes: ['bis'],  name: 'Information Systems' },
    { codes: ['bgd'],  name: 'Game Design and Development' },
    { codes: ['bhrm'], name: 'Human Resource Management' },
    { codes: ['bpm'],  name: 'Project Management' },
    { codes: ['baf'],  name: 'Accounting and Finance' },
    { codes: ['beco', 'bec'], name: 'Economics' },
    { codes: ['bba'],  name: 'Business Administration' },
    { codes: ['bpsy'], name: 'Psychology' },
    { codes: ['beng'], name: 'English Literature' },
    { codes: ['bmc'],  name: 'Mass Communication' },
    { codes: ['bir'],  name: 'International Relations' },
  ];
  const letters = prefix.replace(/[0-9]/g, '');
  for (const { codes, name } of departmentMap) {
    for (const code of codes) {
      if (letters === code || letters.startsWith(code)) return name;
    }
  }
  return 'Unknown';
};

const authController = {

  sendVerificationOTP: async (req, res) => {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password)
        return res.status(400).json({ success: false, error: 'All fields are required' });

      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail.endsWith(ALLOWED_DOMAIN))
        return res.status(400).json({ success: false, error: `Only CUST university emails are allowed (e.g. BSE223011${ALLOWED_DOMAIN})` });

      const pwError = validatePassword(password);
      if (pwError) return res.status(400).json({ success: false, error: pwError });

      const [existing] = await pool.execute('SELECT id FROM students WHERE email = ?', [normalizedEmail]);
      if (existing.length > 0)
        return res.status(400).json({ success: false, error: 'Email already registered' });

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await pool.execute('DELETE FROM email_verifications WHERE email = ?', [normalizedEmail]);
      await pool.execute(
        'INSERT INTO email_verifications (email, otp, expires_at) VALUES (?, ?, ?)',
        [normalizedEmail, otp, expiresAt]
      );

      await sendVerificationEmail(normalizedEmail, otp, name);

      return res.status(200).json({ success: true, message: `Verification code sent to ${normalizedEmail}`, requiresVerification: true });
    } catch (error) {
      console.error('Send OTP error:', error.message);
      return res.status(500).json({ success: false, error: error.message || 'Failed to send verification email. Please try again.' });
    }
  },

  register: async (req, res) => {
    let connection;
    try {
      const { name, email, password, otp } = req.body;
      if (!name || !email || !password || !otp)
        return res.status(400).json({ success: false, error: 'All fields including verification code are required' });

      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail.endsWith(ALLOWED_DOMAIN))
        return res.status(400).json({ success: false, error: `Only CUST university emails are allowed (${ALLOWED_DOMAIN})` });

      const pwError = validatePassword(password);
      if (pwError) return res.status(400).json({ success: false, error: pwError });

      const [otpRows] = await pool.execute(
        'SELECT * FROM email_verifications WHERE email = ? AND otp = ? AND verified = 0 ORDER BY created_at DESC LIMIT 1',
        [normalizedEmail, otp.trim()]
      );
      if (otpRows.length === 0)
        return res.status(400).json({ success: false, error: 'Invalid verification code' });

      if (new Date() > new Date(otpRows[0].expires_at))
        return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new one.' });

      const [existingUsers] = await pool.execute('SELECT id FROM students WHERE email = ?', [normalizedEmail]);
      if (existingUsers.length > 0)
        return res.status(400).json({ success: false, error: 'Email already registered' });

      await pool.execute('UPDATE email_verifications SET verified = 1 WHERE id = ?', [otpRows[0].id]);

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const hashedPassword = await bcrypt.hash(password, 10);
      const department = getDepartmentFromEmail(normalizedEmail);
      const regNumber = normalizedEmail.split('@')[0].toUpperCase();

      const [result] = await connection.execute(
        `INSERT INTO students (full_name, email, password, reg_number, department, current_semester, cgpa)
         VALUES (?, ?, ?, ?, ?, 1, 0.0)`,
        [name, normalizedEmail, hashedPassword, regNumber, department]
      );
      const userId = result.insertId;

      await connection.execute(
        'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
        [userId, 'REGISTER', 'User registered with email verification']
      );

      await connection.commit();

      const token = jwt.sign({ id: userId, email: normalizedEmail }, process.env.JWT_SECRET, { expiresIn: '24h' });

      const [newUser] = await connection.execute('SELECT * FROM students WHERE id = ?', [userId]);

      return res.status(201).json({
        success: true,
        message: 'Registration successful',
        token,
        user: {
          id: userId,
          name,
          email: normalizedEmail,
          profile: newUser[0]
        }
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Registration error:', error);
      return res.status(500).json({ success: false, error: 'Server error: ' + error.message });
    } finally {
      if (connection) connection.release();
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password)
        return res.status(400).json({ success: false, error: 'Email and password are required' });

      const normalizedEmail = email.trim().toLowerCase();
      const [users] = await pool.execute('SELECT * FROM students WHERE email = ?', [normalizedEmail]);

      if (users.length === 0)
        return res.status(401).json({ success: false, error: 'Invalid email or password' });

      const user = users[0];
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid)
        return res.status(401).json({ success: false, error: 'Invalid email or password' });

      if (!user.department || user.department === 'Unknown') {
        const detectedDept = getDepartmentFromEmail(user.email);
        if (detectedDept !== 'Unknown') {
          await pool.execute('UPDATE students SET department = ? WHERE id = ?', [detectedDept, user.id]);
          user.department = detectedDept;
        }
      }

      const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.full_name,
          email: user.email,
          profile: user
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ success: false, error: 'Server error during login' });
    }
  },

  verifyToken: async (req, res) => {
    try {
      const [users] = await pool.execute('SELECT * FROM students WHERE id = ?', [req.user.id]);
      if (users.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, user: users[0] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * Step 1 of password reset: accepts an email, and if a matching account
   * exists, emails a one-time reset link. Always returns a generic success
   * message regardless of whether the email exists, to avoid leaking which
   * emails are registered.
   */
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

      const normalizedEmail = email.trim().toLowerCase();
      const genericResponse = {
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.'
      };

      const [users] = await pool.execute('SELECT id, full_name, email FROM students WHERE email = ?', [normalizedEmail]);
      if (users.length === 0) {
        // Do not reveal whether the email is registered.
        return res.status(200).json(genericResponse);
      }

      const user = users[0];

      // Raw token is emailed to the user; only its hash is stored in the DB,
      // so a leaked database alone can't be used to reset accounts.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await pool.execute(
        'UPDATE students SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
        [hashedToken, expiresAt, user.id]
      );

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetLink = `${frontendUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

      await sendPasswordResetEmail(user.email, resetLink, user.full_name);

      return res.status(200).json(genericResponse);
    } catch (error) {
      console.error('Forgot password error:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to process password reset request. Please try again.' });
    }
  },

  /**
   * Step 2 of password reset: validates the token + email pair and,
   * if valid and unexpired, sets the new password.
   */
  resetPassword: async (req, res) => {
    try {
      const { token, email, password } = req.body;
      if (!token || !email || !password)
        return res.status(400).json({ success: false, error: 'Token, email, and new password are required' });

      const pwError = validatePassword(password);
      if (pwError) return res.status(400).json({ success: false, error: pwError });

      const normalizedEmail = email.trim().toLowerCase();
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const [users] = await pool.execute(
        'SELECT id, reset_token_expires FROM students WHERE email = ? AND reset_token = ?',
        [normalizedEmail, hashedToken]
      );

      if (users.length === 0)
        return res.status(400).json({ success: false, error: 'Invalid or expired reset link. Please request a new one.' });

      const user = users[0];
      if (!user.reset_token_expires || new Date() > new Date(user.reset_token_expires))
        return res.status(400).json({ success: false, error: 'This reset link has expired. Please request a new one.' });

      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.execute(
        'UPDATE students SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [hashedPassword, user.id]
      );

      await pool.execute(
        'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
        [user.id, 'PASSWORD_RESET', 'Password reset via email link']
      );

      return res.status(200).json({ success: true, message: 'Password has been reset successfully. You can now log in with your new password.' });
    } catch (error) {
      console.error('Reset password error:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to reset password. Please try again.' });
    }
  }
};

module.exports = authController;
