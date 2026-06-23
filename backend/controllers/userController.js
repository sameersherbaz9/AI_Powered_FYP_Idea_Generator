const pool = require('../config/database');

const userController = {

  /**
   * Returns a single user by ID — safe columns only, password hash excluded.
   * Restricted to the requester's own record (enforced by verifyOwnership
   * middleware on the route), so this can never be used to look up other
   * students' data.
   */
  getUserById: async (req, res) => {
    try {
      const [rows] = await pool.execute(
        'SELECT id, full_name, email, created_at FROM students WHERE id = ?',
        [req.params.id]
      );
      if (rows.length > 0) {
        res.json(rows[0]);
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

};

module.exports = userController;
