const pool = require('../config/database');
const axios = require('axios');

/**
 * Verifies the user exists and returns their student ID.
 * @param {number} userId
 * @returns {Promise<number>} studentId
 */
const ensureStudentRecord = async (userId) => {
  const [rows] = await pool.execute('SELECT id FROM students WHERE id = ?', [userId]);
  if (rows.length === 0) throw new Error('User not found');
  return rows[0].id;
};

/**
 * Keeps the student's profile `current_semester` mirrored to their Semester
 * Records: it's always set to MAX(semester_number) across their project
 * records — so editing the highest-semester project down (or deleting it)
 * pulls the profile down too, not just up. No-ops if the student has no
 * project records yet (nothing to derive a semester from).
 * @param {number} studentId
 * @returns {Promise<number|null>} the resulting current_semester, or null if unchanged
 */
const syncCurrentSemesterToProjects = async (studentId) => {
  const [maxRows] = await pool.execute(
    'SELECT MAX(semester_number) AS maxSem FROM student_projects WHERE student_id = ?',
    [studentId]
  );
  const maxSem = parseInt(maxRows[0]?.maxSem, 10) || 0;
  if (maxSem === 0) return null; // no projects on record — leave current_semester untouched

  const [studentRows] = await pool.execute('SELECT current_semester FROM students WHERE id = ?', [studentId]);
  const currentSem = parseInt(studentRows[0]?.current_semester, 10) || 0;

  if (maxSem !== currentSem) {
    await pool.execute('UPDATE students SET current_semester = ? WHERE id = ?', [maxSem, studentId]);
  }
  return maxSem;
};

/**
 * Fetches live 2026 industry trends for a given department from Groq.
 * Falls back to a static list on failure.
 * @param {string} department
 * @returns {Promise<string>} Comma-separated trends
 */
const fetchLiveTrends = async (department) => {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a technology trends analyst. Respond only with a comma-separated list of trends, no extra text, no numbering, no explanation.'
          },
          {
            role: 'user',
            content: `List the top 8 most relevant and cutting-edge technology trends in 2026 specifically for ${department} students doing their Final Year Project. Focus on trends that are currently being adopted in industry right now in 2026.`
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('Failed to fetch live trends:', err.message);
    return 'AI & Machine Learning, IoT & Edge Computing, Cloud-Native Apps, Cybersecurity, AR/VR, Blockchain, DevOps, Generative AI';
  }
};

const studentProjectController = {

  getStudentProjects: async (req, res) => {
    try {
      const userId = req.params.userId;
      const studentId = await ensureStudentRecord(userId);

      const [projects] = await pool.execute(
        `SELECT sp.*
         FROM student_projects sp
         WHERE sp.student_id = ?
         ORDER BY sp.semester_number ASC, sp.created_at ASC`,
        [studentId]
      );

      res.json({ projects });
    } catch (error) {
      console.error('GET PROJECTS ERROR:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  addSemesterProject: async (req, res) => {
    try {
      const userId = req.params.userId;
      const { semesterNumber, courseName, projectName, projectDescription, languages, frontendFrameworks, backendFrameworks } = req.body;

      if (!semesterNumber || !courseName || !projectName) {
        return res.status(400).json({ error: 'Semester number, course name, and project name are required' });
      }

      const studentId = await ensureStudentRecord(userId);

      const [result] = await pool.execute(
        `INSERT INTO student_projects 
         (student_id, semester_number, course_name, project_name, project_description, languages, frontend_frameworks, backend_frameworks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [studentId, semesterNumber, courseName, projectName, projectDescription || '', languages || '', frontendFrameworks || '', backendFrameworks || '']
      );

      const updatedSemester = await syncCurrentSemesterToProjects(studentId);

      res.json({ success: true, message: 'Project saved successfully', projectId: result.insertId, current_semester: updatedSemester });
    } catch (error) {
      console.error('ADD PROJECT ERROR:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  updateProject: async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;
      const { semesterNumber, courseName, projectName, projectDescription, languages, frontendFrameworks, backendFrameworks } = req.body;

      if (!semesterNumber || !courseName || !projectName) {
        return res.status(400).json({ error: 'Semester number, course name, and project name are required' });
      }

      const [result] = await pool.execute(
        `UPDATE student_projects
         SET semester_number = ?,
             course_name = ?,
             project_name = ?,
             project_description = ?,
             languages = ?,
             frontend_frameworks = ?,
             backend_frameworks = ?,
             updated_at = NOW()
         WHERE id = ? AND student_id = ?`,
        [semesterNumber, courseName, projectName, projectDescription || '', languages || '', frontendFrameworks || '', backendFrameworks || '', projectId, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Project not found or you do not have permission to update it' });
      }

      const updatedSemester = await syncCurrentSemesterToProjects(userId);

      res.json({ success: true, message: 'Project updated successfully', current_semester: updatedSemester });
    } catch (error) {
      console.error('UPDATE PROJECT ERROR:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  deleteProject: async (req, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.id;

      const [result] = await pool.execute(
        `DELETE FROM student_projects WHERE id = ? AND student_id = ?`,
        [projectId, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Project not found or you do not have permission to delete it' });
      }

      const updatedSemester = await syncCurrentSemesterToProjects(userId);

      res.json({ success: true, message: 'Project deleted successfully', current_semester: updatedSemester });
    } catch (error) {
      console.error('DELETE PROJECT ERROR:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  checkProfileCompletion: async (req, res) => {
    try {
      const userId = req.params.userId;

      const [studentRows] = await pool.execute(
        `SELECT id, reg_number, cgpa, current_semester, area_of_interest, department
         FROM students WHERE id = ?`,
        [userId]
      );

      if (studentRows.length === 0) {
        return res.json({
          isComplete: false,
          profileDetailsComplete: false,
          coreProfileComplete: false,
          projectsComplete: false,
          missingProfileFields: ['reg_number', 'cgpa', 'current_semester', 'area_of_interest'],
          totalProjectCount: 0,
          distinctSemesterCount: 0,
          distinctSemesters: [],
          requiredProjects: 6,
          requiredSemesters: 4,
          message: 'Profile not found. Please complete registration.'
        });
      }

      const student = studentRows[0];

      const missingFields = [];
      if (!student.reg_number || student.reg_number.trim() === '') missingFields.push('reg_number');
      if (student.cgpa === null || student.cgpa === undefined || parseFloat(student.cgpa) <= 0) missingFields.push('cgpa');
      if (!student.current_semester || parseInt(student.current_semester) < 1) missingFields.push('current_semester');
      if (!student.area_of_interest || student.area_of_interest.trim() === '') missingFields.push('area_of_interest');

      const profileDetailsComplete = missingFields.length === 0;

      // Same as profileDetailsComplete but excludes area_of_interest itself.
      // Used to gate whether the Area of Interest field is allowed to unlock —
      // using profileDetailsComplete there would be circular, since that field
      // can never be filled in until it's unlocked.
      const coreProfileComplete = missingFields.filter(f => f !== 'area_of_interest').length === 0;

      const [projectRows] = await pool.execute(
        `SELECT semester_number FROM student_projects WHERE student_id = ?`,
        [student.id]
      );

      const totalProjectCount = projectRows.length;
      const distinctSemesters = [...new Set(projectRows.map(r => r.semester_number))];
      const distinctSemesterCount = distinctSemesters.length;

      const projectsComplete = totalProjectCount >= 6 && distinctSemesterCount >= 4;
      const isComplete = profileDetailsComplete && projectsComplete;

      return res.json({
        isComplete,
        profileDetailsComplete,
        coreProfileComplete,
        projectsComplete,
        missingProfileFields: missingFields,
        totalProjectCount,
        distinctSemesterCount,
        distinctSemesters,
        requiredProjects: 6,
        requiredSemesters: 4,
        message: isComplete
          ? 'Profile complete — you can generate ideas!'
          : !profileDetailsComplete
            ? `Complete your profile details first (missing: ${missingFields.join(', ')})`
            : `Add more projects: ${totalProjectCount}/6 projects, ${distinctSemesterCount}/4 semesters covered`
      });

    } catch (error) {
      console.error('PROFILE CHECK ERROR:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  generateIdeasWithGroq: async (req, res) => {
    try {
      const userId = req.params.userId;
      const studentId = await ensureStudentRecord(userId);

      const [studentData] = await pool.execute(
        `SELECT id, area_of_interest, cgpa, department, current_semester, full_name
         FROM students WHERE id = ?`,
        [studentId]
      );

      const student = studentData[0];

      const [projects] = await pool.execute(
        `SELECT * FROM student_projects WHERE student_id = ? ORDER BY semester_number ASC`,
        [student.id]
      );

      if (projects.length < 6) {
        return res.status(400).json({
          error: 'At least 6 projects are required to generate ideas. Please add more projects.',
          code: 'PROFILE_INCOMPLETE'
        });
      }

      const cgpa = parseFloat(student.cgpa) || 0;
      const department = student.department || 'Software Engineering';
      const currentSemester = student.current_semester || 7;

      /**
       * Exclude ideas already saved by any student in the same department
       * to ensure generated ideas are unique across the cohort.
       */
      const [savedIdeas] = await pool.execute(
        `SELECT DISTINCT si.idea_title
         FROM saved_ideas si
         JOIN students ON si.student_id = students.id
         WHERE students.department = ?`,
        [department]
      );
      const excludedIdeasTitles = savedIdeas.map(idea => idea.idea_title).join(', ');
      const excludedContext = excludedIdeasTitles ? `\nDO NOT suggest any of these ideas already saved by students in ${department}: ${excludedIdeasTitles}\n` : '';

      const difficultyGuidance =
        cgpa >= 3.5
          ? 'The student has an excellent CGPA (3.5+). Suggest mostly Advanced level ideas with research potential.'
          : cgpa >= 2.8
          ? 'The student has a good CGPA (2.8–3.5). Suggest Intermediate to Advanced level ideas.'
          : 'The student has a lower CGPA. Suggest Beginner to Intermediate level ideas that are achievable and well-scoped.';

      const semesterGuidance =
        parseInt(currentSemester) >= 7
          ? `The student is in Semester ${currentSemester} and ready for a full FYP. Ideas should be comprehensive and deployable systems.`
          : `The student is in Semester ${currentSemester}. Ideas should be scoped appropriately for their current level.`;

      const studentProfileContext = `
Student Profile:
- Full Name: ${student.full_name}
- Department: ${department}
- Current Semester: ${currentSemester}
- CGPA: ${cgpa.toFixed(2)}
- ${difficultyGuidance}
- ${semesterGuidance}
`;

      let projectContext = 'Student Project History (All Semesters):\n\n';
      projects.forEach(proj => {
        projectContext += `Semester ${proj.semester_number}:\n`;
        projectContext += `- Course: ${proj.course_name}\n`;
        projectContext += `- Project: ${proj.project_name}\n`;
        projectContext += `- Description: ${proj.project_description}\n`;
        projectContext += `- Languages: ${proj.languages}\n`;
        projectContext += `- Frontend: ${proj.frontend_frameworks}\n`;
        projectContext += `- Backend: ${proj.backend_frameworks}\n\n`;
      });

      const interestContext = student.area_of_interest
        ? `\nStudent's Stated Interests:\n${student.area_of_interest}\n`
        : '';

      const trends = await fetchLiveTrends(department);
      const trendsContext = `\nLatest 2026 Industry Trends in ${department} (fetched live):\n${trends}\n`;

      const prompt = `You are generating FYP ideas for a university student. Use ALL the context below carefully:

${studentProfileContext}
${projectContext}
${interestContext}
${trendsContext}
${excludedContext}

Generate exactly 4 highly relevant, innovative, and unique Final Year Project (FYP) ideas that:
- Are specifically tailored to the student's department: ${department}
- Are appropriate for Semester ${currentSemester} level complexity
- Match difficulty to their CGPA of ${cgpa.toFixed(2)} (${difficultyGuidance})
- Build on and extend their past project skills and technologies
- Incorporate at least one of the latest 2026 trends listed above
- Are diverse from each other (different problem domains)

Please format each idea STRICTLY as follows:

Idea X:
Title: [Project Title]
Description: [Detailed Description (2-3 sentences)]
Technologies: [Comma separated technologies]
Difficulty: [Beginner/Intermediate/Advanced]
Why: [Why this fits this specific student's background and CGPA]
Trend Used: [Which 2026 trend this idea incorporates]

Make all 4 ideas clearly distinct. Ideas should get progressively more complex.`;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `You are an expert FYP advisor at a university. You generate highly tailored, innovative, and completely unique project ideas based on a student's full academic profile including their CGPA, department, semester, past projects, interests, and the latest 2026 industry trends. Never suggest generic or cliché projects. Always ensure ideas are realistic, implementable, and directly relevant to the student's background. Generate exactly 4 ideas every time.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.9,
          max_tokens: 3000
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      const ideas = parseGroqResponse(aiResponse, projects);

      res.json({
        success: true,
        ideas,
        context: {
          studentName: student.full_name,
          department,
          currentSemester,
          cgpa: cgpa.toFixed(2),
          projectCount: projects.length,
          interests: student.area_of_interest,
          trendsUsed: trends
        }
      });
    } catch (error) {
      console.error('GROQ GENERATION ERROR:', error.response?.data || error.message);
      res.status(500).json({
        error: error.response?.data?.error?.message || error.message,
        details: 'Failed to generate ideas with Groq API'
      });
    }
  }
};

/**
 * Parses the Groq AI response into a structured array of idea objects.
 * Handles Markdown bold formatting that Groq may include in section headers.
 * Falls back to a single raw idea object if parsing yields no results.
 * @param {string} content - Raw AI response
 * @param {Array} projects - Student's past projects (used for tech fallback)
 * @returns {Array} Parsed idea objects (max 4)
 */
function parseGroqResponse(content, projects) {
  const allTechs = projects
    .flatMap(p => [
      ...(p.languages ? p.languages.split(',') : []),
      ...(p.frontend_frameworks ? p.frontend_frameworks.split(',') : []),
      ...(p.backend_frameworks ? p.backend_frameworks.split(',') : [])
    ].map(t => t.trim()).filter(Boolean));

  const ideas = [];
  const sections = content.split(/\*{0,2}(?:Idea|Project)\s*\d+[:.]\*{0,2}/i).slice(1);

  sections.forEach((section, index) => {
    const titleMatch = section.match(/(?:Title|Project Title):\s*(.+?)(?:\n|$)/i);
    const descMatch = section.match(/(?:Description|Details?):\s*(.+?)(?:Technologies|Tech|$)/is);
    const techMatch = section.match(/(?:Technologies|Tech|Stack):\s*(.+?)(?:\n|Difficulty|Why|Trend|$)/i);
    const diffMatch = section.match(/Difficulty(?:\s+Level)?:\s*(.+?)(?:\n|Why|Trend|$)/i);
    const trendMatch = section.match(/Trend Used:\s*(.+?)(?:\n|$)/i);

    if (titleMatch && descMatch) {
      ideas.push({
        id: `groq-${index + 1}`,
        title: titleMatch[1].trim(),
        description: descMatch[1].trim(),
        technologies: techMatch ? techMatch[1].trim() : allTechs.slice(0, 3).join(', '),
        difficulty: diffMatch ? diffMatch[1].trim() : 'Intermediate',
        trendUsed: trendMatch ? trendMatch[1].trim() : '',
        category: 'AI-Generated',
        source: 'groq'
      });
    }
  });

  if (ideas.length === 0) {
    ideas.push({
      id: 'groq-raw',
      title: 'AI-Generated FYP Ideas',
      description: content.substring(0, 500),
      technologies: allTechs.join(', '),
      difficulty: 'Intermediate',
      trendUsed: '',
      category: 'AI-Generated',
      source: 'groq'
    });
  }

  return ideas.slice(0, 4);
}

module.exports = studentProjectController;
