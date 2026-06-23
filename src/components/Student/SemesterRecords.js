import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { studentAPI } from '../../services/api';
import ErrorDisplay from '../common/ErrorDisplay';
import Autocomplete from '../common/Autocomplete';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';

const COURSE_OPTIONS = [
  'Introduction to Programming', 'Object Oriented Programming',
  'Information Security and Forensics', 'Web Engineering', 'Blockchain',
  'Mobile Application and Development', 'Database', 'Data Structures',
  'Software Engineering', 'Software Requirement Engineering'
];
const LANGUAGE_OPTIONS = ['C', 'C++', 'Python', 'Java', 'JavaScript', 'TypeScript', 'Rust', 'Go', 'Kotlin', 'Swift'];
const FRONTEND_OPTIONS = ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'HTML/CSS', 'Tailwind CSS', 'Bootstrap'];
const BACKEND_OPTIONS = ['Node.js', 'Express', 'Django', 'Flask', 'Spring Boot', 'Laravel', '.NET', 'FastAPI'];

const SemesterRecords = () => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  const [newProject, setNewProject] = useState({
    semesterNumber: '1',
    course_name: '',
    project_name: '',
    languages: '',
    frontend_frameworks: '',
    backend_frameworks: '',
    project_description: ''
  });

  useEffect(() => {
    if (user?.id) {
      fetchProjects();
    }
  }, [user?.id]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await studentAPI.getProjects(user.id);
      setProjects(res.projects || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load records.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Re-pulls the profile after a project add/edit, since the backend may
   * have just auto-bumped current_semester to match the new highest project
   * semester. Keeps AuthContext (and every other page reading `user.profile`,
   * e.g. the Area of Interest unlock on Profile/Dashboard) in sync without
   * needing a full reload.
   */
  const refreshProfile = async () => {
    try {
      const freshProfile = await studentAPI.getProfile(user.id);
      updateUser({ ...user, profile: freshProfile });
    } catch (err) {
      console.error('Failed to refresh profile after project change:', err);
    }
  };

  const handleAddProject = async () => {
    if (!newProject.course_name || !newProject.project_name || !newProject.languages || !newProject.project_description) {
      setError('Course name, Project name, Languages, and Description are required!');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await studentAPI.saveProject(user.id, {
        semesterNumber: parseInt(newProject.semesterNumber),
        courseName: newProject.course_name,
        projectName: newProject.project_name,
        languages: newProject.languages,
        frontendFrameworks: newProject.frontend_frameworks,
        backendFrameworks: newProject.backend_frameworks,
        projectDescription: newProject.project_description,
      });

      setNewProject({
        semesterNumber: '1',
        course_name: '',
        project_name: '',
        languages: '',
        frontend_frameworks: '',
        backend_frameworks: '',
        project_description: ''
      });
      await fetchProjects();
      await refreshProfile();
      toast.success('Project record added successfully!');
    } catch (err) {
      setError(err.message || 'Failed to save project.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (proj) => {
    setEditingId(proj.id);
    setEditData({
      semesterNumber: proj.semester_number,
      course_name: proj.course_name,
      project_name: proj.project_name,
      languages: proj.languages || '',
      frontend_frameworks: proj.frontend_frameworks || '',
      backend_frameworks: proj.backend_frameworks || '',
      project_description: proj.project_description || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async (projectId) => {
    if (!editData.course_name || !editData.project_name) {
      setError('Course name and Project name are required!');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await studentAPI.updateProject(projectId, {
        semesterNumber: parseInt(editData.semesterNumber),
        courseName: editData.course_name,
        projectName: editData.project_name,
        languages: editData.languages,
        frontendFrameworks: editData.frontend_frameworks,
        backendFrameworks: editData.backend_frameworks,
        projectDescription: editData.project_description
      });
      setEditingId(null);
      setEditData({});
      await fetchProjects();
      await refreshProfile();
    } catch (err) {
      setError(err.message || 'Failed to update project.');
    } finally {
      setLoading(false);
    }
  };

  const removeProject = async (id) => {
    if (!window.confirm('Are you sure you want to delete this project record?')) return;
    try {
      await studentAPI.deleteProject(id);
      await fetchProjects();
      await refreshProfile();
    } catch (err) {
      setError(err.message || 'Failed to delete project.');
    }
  };

  return (
    <div className="flex min-h-screen bg-[#1A1A2E]">
      <Sidebar />

      <main className="flex-1 p-4 md:p-10 text-white overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Semester Records</h1>
          <p className="text-gray-400 text-lg font-medium">
            Add your projects semester by semester. You need at least 6 projects to unlock AI idea generation.
          </p>
        </header>

        {error && <ErrorDisplay message={error} />}

        <div className="grid grid-cols-1 gap-8 mt-4">
          {/* Add New Project Form */}
          <div className="bg-[#242444] p-8 rounded-2xl shadow-2xl border border-white/5 space-y-6">
            <h3 className="text-lg font-bold text-white uppercase tracking-widest">Add New Project</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              <div>
                <label className="block text-gray-300 font-bold text-sm mb-3 uppercase">Semester Number</label>
                <select
                  value={newProject.semesterNumber}
                  onChange={(e) => setNewProject({ ...newProject, semesterNumber: e.target.value })}
                  className="w-full p-4 bg-[#1A1A2E] border border-gray-700/50 rounded-xl text-gray-300 focus:border-cyan-500 outline-none transition-all"
                >
                  {[1,2,3,4,5,6,7,8].map(s => (
                    <option key={s} value={s}>Semester {s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 font-bold text-sm mb-3 uppercase">Course Name</label>
                <Autocomplete
                  value={newProject.course_name}
                  onChange={(val) => setNewProject({ ...newProject, course_name: val })}
                  options={COURSE_OPTIONS}
                  placeholder="Select or type a course..."
                  className="w-full p-4 bg-[#1A1A2E] border border-gray-700/50 rounded-xl text-gray-300 focus:border-cyan-500 outline-none transition-all placeholder:text-gray-600"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-bold text-sm mb-3 uppercase">Project Name</label>
                <input
                  type="text"
                  value={newProject.project_name}
                  onChange={(e) => setNewProject({ ...newProject, project_name: e.target.value })}
                  placeholder="E.g. E-Commerce Store"
                  className="w-full p-4 bg-[#1A1A2E] border border-gray-700/50 rounded-xl text-gray-300 focus:border-cyan-500 outline-none transition-all placeholder:text-gray-600"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-bold text-sm mb-3 uppercase">Languages</label>
                <Autocomplete
                  value={newProject.languages}
                  onChange={(val) => setNewProject({ ...newProject, languages: val })}
                  options={LANGUAGE_OPTIONS}
                  placeholder="E.g. JavaScript, Python"
                  className="w-full p-4 bg-[#1A1A2E] border border-gray-700/50 rounded-xl text-gray-300 focus:border-cyan-500 outline-none transition-all placeholder:text-gray-600"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-bold text-sm mb-3 uppercase">Frontend Frameworks</label>
                <Autocomplete
                  value={newProject.frontend_frameworks}
                  onChange={(val) => setNewProject({ ...newProject, frontend_frameworks: val })}
                  options={FRONTEND_OPTIONS}
                  placeholder="E.g. React, Vue (Optional)"
                  className="w-full p-4 bg-[#1A1A2E] border border-gray-700/50 rounded-xl text-gray-300 focus:border-cyan-500 outline-none transition-all placeholder:text-gray-600"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-bold text-sm mb-3 uppercase">Backend Frameworks</label>
                <Autocomplete
                  value={newProject.backend_frameworks}
                  onChange={(val) => setNewProject({ ...newProject, backend_frameworks: val })}
                  options={BACKEND_OPTIONS}
                  placeholder="E.g. Node.js, Express (Optional)"
                  className="w-full p-4 bg-[#1A1A2E] border border-gray-700/50 rounded-xl text-gray-300 focus:border-cyan-500 outline-none transition-all placeholder:text-gray-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-300 font-bold text-sm mb-3 uppercase">Description (What was it about?)</label>
              <textarea
                value={newProject.project_description}
                onChange={(e) => setNewProject({ ...newProject, project_description: e.target.value })}
                placeholder="A brief description of your project..."
                className="w-full p-4 bg-[#1A1A2E] border border-gray-700/50 rounded-xl text-gray-300 focus:border-cyan-500 outline-none transition-all placeholder:text-gray-600 min-h-[100px]"
              />
            </div>

            <button
              onClick={handleAddProject}
              disabled={loading}
              className="w-full py-5 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-xl font-bold text-white uppercase tracking-wider hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-3 shadow-lg shadow-pink-500/20"
            >
              {loading ? 'SAVING...' : '+ ADD PROJECT RECORD'}
            </button>
          </div>

          {/* Saved Project Records */}
          <div className="bg-[#242444] p-8 rounded-2xl shadow-2xl border border-white/5 min-h-[400px]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-white uppercase tracking-widest">Saved Project Records</h3>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{projects.length} / 6+ required</span>
            </div>

            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-6xl mb-6 grayscale opacity-20">📁</div>
                <h2 className="text-2xl font-bold text-white mb-2 uppercase italic opacity-20 tracking-tighter">No Records Found</h2>
                <p className="text-gray-500 max-w-sm mx-auto">
                  Start adding your semester projects to unlock AI idea generation!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {projects.map((proj) => (
                  <div key={proj.id} className="bg-[#1A1A2E] border border-white/5 rounded-xl group hover:border-cyan-500/30 transition-all overflow-hidden">
                    {editingId === proj.id ? (
                      /* --- EDIT MODE --- */
                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-cyan-400 font-bold text-sm uppercase tracking-widest">Editing Project</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(proj.id)}
                              disabled={loading}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-bold uppercase transition-all border border-green-500/30"
                            >
                              <Check size={14} /> Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-xs font-bold uppercase transition-all border border-white/10"
                            >
                              <X size={14} /> Cancel
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Semester</label>
                            <select
                              value={editData.semesterNumber}
                              onChange={(e) => setEditData({...editData, semesterNumber: e.target.value})}
                              className="w-full p-3 bg-[#242444] border border-gray-700/50 rounded-lg text-gray-300 focus:border-cyan-500 outline-none text-sm"
                            >
                              {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Course Name</label>
                            <Autocomplete
                              value={editData.course_name}
                              onChange={(val) => setEditData({...editData, course_name: val})}
                              options={COURSE_OPTIONS}
                              placeholder="Select or type a course..."
                              className="w-full p-3 bg-[#1A1A2E] border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Project Name</label>
                            <input
                              type="text"
                              value={editData.project_name}
                              onChange={(e) => setEditData({...editData, project_name: e.target.value})}
                              className="w-full p-3 bg-[#242444] border border-gray-700/50 rounded-lg text-gray-300 focus:border-cyan-500 outline-none text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Languages</label>
                            <Autocomplete
                              value={editData.languages}
                              onChange={(val) => setEditData({...editData, languages: val})}
                              options={LANGUAGE_OPTIONS}
                              placeholder="E.g. JavaScript, Python"
                              className="w-full p-3 bg-[#1A1A2E] border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Frontend</label>
                            <Autocomplete
                              value={editData.frontend_frameworks}
                              onChange={(val) => setEditData({...editData, frontend_frameworks: val})}
                              options={FRONTEND_OPTIONS}
                              placeholder="E.g. React, Vue (Optional)"
                              className="w-full p-3 bg-[#1A1A2E] border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Backend</label>
                            <Autocomplete
                              value={editData.backend_frameworks}
                              onChange={(val) => setEditData({...editData, backend_frameworks: val})}
                              options={BACKEND_OPTIONS}
                              placeholder="E.g. Node.js, Express (Optional)"
                              className="w-full p-3 bg-[#1A1A2E] border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-gray-500 text-xs font-bold uppercase mb-1">Description</label>
                          <textarea
                            value={editData.project_description}
                            onChange={(e) => setEditData({...editData, project_description: e.target.value})}
                            rows={3}
                            className="w-full p-3 bg-[#242444] border border-gray-700/50 rounded-lg text-gray-300 focus:border-cyan-500 outline-none text-sm resize-none"
                          />
                        </div>
                      </div>
                    ) : (
                      /* --- VIEW MODE --- */
                      <div className="p-4 flex justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className="bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">
                              Sem {proj.semester_number}
                            </span>
                            <h4 className="text-white font-bold text-base truncate">
                              {proj.course_name} — {proj.project_name}
                            </h4>
                          </div>
                          <div className="text-sm truncate">
                            <span className="text-gray-300 font-medium">Stack:</span>{' '}
                            <span className="text-cyan-400/80">
                              {[proj.languages, proj.frontend_frameworks, proj.backend_frameworks].filter(Boolean).join(', ') || 'Not specified'}
                            </span>
                            <span className="text-gray-600 mx-2">|</span>
                            <span className="text-gray-400 italic truncate">{proj.project_description || 'No description provided.'}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => startEdit(proj)}
                            className="p-2 text-cyan-500/50 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => removeProject(proj.id)}
                            className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SemesterRecords;
