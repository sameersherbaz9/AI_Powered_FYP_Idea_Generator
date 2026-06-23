const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

/**
 * Rate limiter for OTP requests — 5 per 15 minutes per IP.
 * Prevents brute-forcing the 6-digit OTP space.
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many OTP requests. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for login attempts — 10 per 15 minutes per IP.
 * Prevents credential brute-forcing.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many login attempts. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for AI generation — 20 requests per hour per IP.
 * Each call makes 2 Groq API requests (trends + ideas); limit protects API quota.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'AI generation limit reached. You can generate up to 20 times per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for password reset requests — 5 per 15 minutes per IP.
 * Prevents email-bombing an account and brute-forcing reset tokens.
 */
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many password reset requests. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for the AI chat endpoint — 30 messages per hour per USER.
 * Keyed by the authenticated user's id (not IP), so switching networks /
 * getting a new IP doesn't reset the limit. Requires authenticateToken to
 * run BEFORE this middleware on the route so req.user is already set.
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id?.toString() || req.ip,
  message: { success: false, error: 'Chat limit reached. You can send up to 30 messages per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

const userController = require('./controllers/userController');
const ideaController = require('./controllers/ideaController');
const studentController = require('./controllers/studentController');
const studentProjectController = require('./controllers/studentProjectController');
const authController = require('./controllers/authController');
const WebSocketServer = require('./websocket');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocketServer(server);

const PORT = process.env.PORT || 5000;

const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

app.use(express.json());
app.set('wss', wss);

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

const verifyOwnership = (req, res, next) => {
  if (req.params.userId && parseInt(req.params.userId, 10) !== req.user.id) {
    return res.status(403).json({ error: 'You do not have permission to access this resource' });
  }
  next();
};

/** Same ownership check as verifyOwnership, but for routes using :id instead of :userId. */
const verifyUserIdOwnership = (req, res, next) => {
  if (req.params.id && parseInt(req.params.id, 10) !== req.user.id) {
    return res.status(403).json({ error: 'You do not have permission to access this resource' });
  }
  next();
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'FYP Generator API is running' });
});

// Auth routes
app.post('/api/login', loginLimiter, authController.login);
app.post('/api/register/send-otp', otpLimiter, authController.sendVerificationOTP);
app.post('/api/register', otpLimiter, authController.register);
app.get('/api/verify', authenticateToken, authController.verifyToken);
app.post('/api/forgot-password', passwordResetLimiter, authController.forgotPassword);
app.post('/api/reset-password', passwordResetLimiter, authController.resetPassword);

// User routes
app.get('/api/users/:id', authenticateToken, verifyUserIdOwnership, userController.getUserById);

/**
 * Student project routes must be registered BEFORE /:userId parameterized routes
 * to prevent Express from matching 'projects' as a :userId value.
 */
app.put('/api/students/projects/:projectId', authenticateToken, studentProjectController.updateProject);
app.delete('/api/students/projects/:projectId', authenticateToken, studentProjectController.deleteProject);

// Student routes
app.get('/api/students/:userId/profile', authenticateToken, verifyOwnership, studentController.getProfile);
app.put('/api/students/:userId/profile', authenticateToken, verifyOwnership, studentController.updateProfile);

// Idea routes
app.post('/api/students/:userId/ideas/generate', aiLimiter, authenticateToken, verifyOwnership, ideaController.generateIdeas);
app.post('/api/students/:userId/ideas/chat', authenticateToken, chatLimiter, verifyOwnership, ideaController.chatAboutIdea);
app.get('/api/students/:userId/ideas/saved', authenticateToken, verifyOwnership, ideaController.getSavedIdeas);
app.post('/api/students/:userId/ideas/save', authenticateToken, verifyOwnership, ideaController.saveIdea);
app.delete('/api/ideas/saved/:id', authenticateToken, ideaController.deleteSavedIdea);

// Student project history routes
app.get('/api/students/:userId/projects', authenticateToken, verifyOwnership, studentProjectController.getStudentProjects);
app.post('/api/students/:userId/projects', authenticateToken, verifyOwnership, studentProjectController.addSemesterProject);
app.get('/api/students/:userId/profile-completion', authenticateToken, verifyOwnership, studentProjectController.checkProfileCompletion);
app.post('/api/students/:userId/ideas/generate-with-history', aiLimiter, authenticateToken, verifyOwnership, studentProjectController.generateIdeasWithGroq);

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const pool = require('./config/database');
    const [rows] = await pool.execute(
      'SELECT id, full_name as name, email FROM students WHERE id = ?',
      [req.user.id]
    );
    if (rows.length > 0) {
      res.json({ success: true, user: rows[0] });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS allowed origin: ${allowedOrigin}`);
});