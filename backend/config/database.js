const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * MySQL connection pool.
 * Configuration is sourced from environment variables defined in .env.
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fyp_generator',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully to:', process.env.DB_NAME);
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.log('Please check your MySQL server is running');
  });

module.exports = pool;
