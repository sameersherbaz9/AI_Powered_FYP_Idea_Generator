const axios = require('axios');
const pool = require('../config/database');

/**
 * Fetches the top 8 live industry trends for a given department
 * from the Groq API. Falls back to a static list on failure.
 * @param {string} department
 * @returns {Promise<string>} Comma-separated list of trends
 */
const fetchLiveTrends = async (department) => {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: 'You are a technology trends analyst. Respond only with a comma-separated list of trends, no extra text, no numbering, no explanation.' },
          { role: 'user', content: `List the top 8 cutting-edge technology trends in 2026 for ${department} students doing their Final Year Project. Focus on trends currently adopted in industry in 2026.` }
        ],
        temperature: 0.7,
        max_tokens: 200
      },
      { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('Failed to fetch live trends:', err.message);
    return 'AI & Machine Learning, IoT & Edge Computing, Cloud-Native Apps, Cybersecurity, AR/VR, Blockchain, DevOps, Generative AI';
  }
};

const ideaController = {

  generateIdeas: async (req, res) => {
    try {
      const { department, semester, cgpa, interests } = req.body;
      const userId = req.params.userId || req.user.id;

      const cgpaNum = parseFloat(cgpa) || 0;
      const difficulty =
        cgpaNum >= 3.5 ? 'Advanced' :
        cgpaNum >= 2.8 ? 'Intermediate' : 'Beginner';

      const semesterNum = parseInt(semester) || 1;
      const semesterLabel = semesterNum >= 7 ? 'FYP-level (comprehensive system)' : `Semester ${semesterNum} level`;
      const trends = await fetchLiveTrends(department || 'Software Engineering');

      const prompt = `Generate exactly 4 unique FYP project ideas for a university student.

Student Profile:
- Department: ${department || 'Software Engineering'}
- Semester: ${semesterLabel}
- CGPA: ${cgpaNum.toFixed(2)} → Difficulty target: ${difficulty}
- Interests: ${interests || 'General Computer Science'}
- Latest 2026 Industry Trends in ${department} (live): ${trends}

Format the output strictly as a JSON object with a single "ideas" array containing exactly 4 objects.
Each object must have the following keys:
- "title" (string)
- "description" (string)
- "technologies" (string, comma-separated)
- "difficulty" (string, either Beginner, Intermediate, or Advanced)
- "trendUsed" (string)

Make all 4 ideas distinct from each other.`;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'openai/gpt-oss-120b',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are an expert FYP advisor. Generate highly tailored, innovative, unique project ideas based on student profile and latest trends. Never suggest generic ideas.'
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.9,
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiText = response.data.choices[0].message.content;
      
      let parsedIdeas = [];
      try {
        const jsonResponse = JSON.parse(aiText);
        parsedIdeas = jsonResponse.ideas || [];
      } catch (err) {
        console.error('JSON parsing failed, AI returned:', aiText);
        throw new Error('Failed to parse AI response');
      }

      const ideas = parsedIdeas.map((idea, index) => ({
        id: `groq-${Date.now()}-${index + 1}`,
        title: idea.title,
        description: idea.description,
        technologies: idea.technologies,
        difficulty: idea.difficulty || difficulty,
        trendUsed: idea.trendUsed || '',
        category: department || 'AI-Generated',
        source: 'groq'
      }));

      const wss = req.app.get('wss');
      if (wss) {
        wss.notify(userId, 'Ideas Ready', `${ideas.length} fresh ideas generated for you!`, 'success');
      }

      res.json({ success: true, ideas });
    } catch (error) {
      console.error('GENERATE IDEAS ERROR:', error.response?.data || error.message);
      res.status(500).json({ error: error.message });
    }
  },

  getSavedIdeas: async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT si.id as saved_id, si.idea_title, si.idea_description,
                si.idea_category, si.idea_technologies, si.idea_difficulty,
                si.idea_trend, si.saved_at
         FROM saved_ideas si
         WHERE si.student_id = ?
         ORDER BY si.saved_at DESC`,
        [req.params.userId]
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  saveIdea: async (req, res) => {
    try {
      const { title, description, category, technologies, difficulty, trendUsed } = req.body;
      const userId = req.params.userId || req.body.userId;

      if (!userId || !title) {
        return res.status(400).json({ error: 'User ID and idea title are required' });
      }

      const [students] = await pool.execute('SELECT id FROM students WHERE id = ?', [userId]);
      if (students.length === 0) {
        return res.status(404).json({ error: 'Student profile not found. Please complete your profile first.' });
      }
      const studentId = students[0].id;

      const [existing] = await pool.execute(
        'SELECT id FROM saved_ideas WHERE student_id = ? AND idea_title = ?',
        [studentId, title]
      );
      if (existing.length > 0) {
        return res.status(400).json({ error: 'This idea is already in your saved list' });
      }

      const techStr = Array.isArray(technologies) ? technologies.join(', ') : (technologies || '');

      const [insertResult] = await pool.execute(
        `INSERT INTO saved_ideas (student_id, idea_title, idea_description, idea_category, idea_technologies, idea_difficulty, idea_trend)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [studentId, title, description || '', category || 'AI-Generated', techStr, difficulty || 'Intermediate', trendUsed || '']
      );

      const wss = req.app.get('wss');
      if (wss) {
        wss.notify(userId, 'Idea Saved', 'Idea added to your collection!', 'success');
      }

      res.json({ success: true, message: 'Idea saved successfully', savedId: insertResult.insertId });
    } catch (error) {
      console.error('SAVE IDEA ERROR:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  deleteSavedIdea: async (req, res) => {
    try {
      const userId = req.user.id;
      const savedIdeaId = req.params.id;

      const [result] = await pool.execute(
        `DELETE FROM saved_ideas WHERE id = ? AND student_id = ?`,
        [savedIdeaId, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Saved idea not found or you do not have permission to delete it' });
      }

      res.json({ success: true, message: 'Idea removed from saved list' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  chatAboutIdea: async (req, res) => {
    try {
      const { message, history, ideaContext } = req.body;

      const messages = [
        {
          role: 'system',
          content: `You are an expert FYP (Final Year Project) advisor at a university. You are helping a student develop and understand their project idea.\n\nPROJECT CONTEXT:\n${ideaContext}\n\nSTRICT FORMATTING RULES:\n1. Never reply in a single block of text. Always use structure.\n2. Start with a one-line direct answer.\n3. Use bold headings, bullet points, and numbered steps where appropriate.\n4. End with a short Next Steps or Tip section.\n5. Be professional, encouraging, and precise.\n6. Do NOT use markdown headers (#, ##, ###) — write section headings as a standalone line wrapped in **bold** instead, e.g. **Architecture Overview**.\n7. Do NOT use triple-backtick code fences — use single backticks for inline code only.`
        },
        ...(history ? history.slice(-10) : []),
        { role: 'user', content: message }
      ];

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'openai/gpt-oss-120b',
          messages,
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      res.json({ reply: response.data.choices[0].message.content });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = ideaController;
