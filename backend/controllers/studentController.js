const pool = require('../config/database');

const studentController = {

  getProfile: async (req, res) => {
    try {
      const [rows] = await pool.execute(
        'SELECT id, full_name, email, reg_number, department, current_semester, cgpa, area_of_interest, created_at, updated_at FROM students WHERE id = ?',
        [req.params.userId]
      );
      if (rows.length === 0)
        return res.status(404).json({ error: 'Student profile not found. Please complete registration.' });
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const { cgpa, current_semester, area_of_interest, reg_number, name } = req.body;

      const cgpaNum = parseFloat(cgpa);
      if (isNaN(cgpaNum) || cgpaNum < 0 || cgpaNum > 4.0)
        return res.status(400).json({ error: 'CGPA must be between 0.00 and 4.00' });

      let semesterNum = parseInt(current_semester, 10);
      if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8)
        return res.status(400).json({ error: 'Semester must be between 1 and 8' });

      // Floor the semester to the highest semester project the student has on
      // record, so the profile can never silently fall out of sync with their
      // Semester Records (e.g. a stale page submitting an older value).
      const [projRows] = await pool.execute(
        'SELECT MAX(semester_number) AS maxSem FROM student_projects WHERE student_id = ?',
        [req.params.userId]
      );
      const maxProjectSemester = parseInt(projRows[0]?.maxSem, 10) || 0;
      if (maxProjectSemester > semesterNum) semesterNum = maxProjectSemester;

      // `name` is optional here — callers like the pre-generation sync on the
      // Dashboard don't send it. NULLIF + COALESCE means a missing/empty name
      // simply leaves full_name untouched instead of wiping it to NULL/''
      // (full_name is NOT NULL, so overwriting it with null previously either
      // threw and silently aborted the whole update, or — on non-strict SQL
      // modes — actually blanked the student's name in the DB).
      const [result] = await pool.execute(
        `UPDATE students
         SET cgpa = ?, current_semester = ?, area_of_interest = ?, reg_number = ?,
             full_name = COALESCE(NULLIF(?, ''), full_name)
         WHERE id = ?`,
        [cgpaNum, semesterNum, area_of_interest || null, reg_number || null, name || '', req.params.userId]
      );

      if (result.affectedRows === 0)
        return res.status(404).json({ error: 'Student profile not found' });

      res.json({ success: true, message: 'Profile updated successfully', current_semester: semesterNum });
    } catch (error) {
      console.error('Update profile error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = studentController;
