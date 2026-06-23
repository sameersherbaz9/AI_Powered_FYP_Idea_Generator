import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { studentAPI } from '../../services/api';
import Sidebar from './Sidebar';
import wsService from '../../services/websocket';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const SavedIdeas = () => {
  const { user } = useAuth();
  const [savedIdeas, setSavedIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ difficulty: '' });

  const fetchSavedIdeas = useCallback(async () => {
    try {
      setLoading(true);
      const ideas = await studentAPI.getSavedIdeas(user.id);
      // Normalize backend field names (idea_title → title, etc.) so the UI
      // can use consistent short names regardless of DB column naming.
      const normalized = (Array.isArray(ideas) ? ideas : []).map(i => ({
        ...i,
        title:        i.title        || i.idea_title        || '',
        description:  i.description  || i.idea_description  || '',
        technologies: i.technologies || i.idea_technologies || '',
        difficulty:   i.difficulty   || i.idea_difficulty   || '',
      }));
      setSavedIdeas(normalized);
    } catch (error) {
      console.error('Error fetching saved ideas:', error);
      setSavedIdeas([]);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchSavedIdeas();
  }, [fetchSavedIdeas]);

  const handleRemoveIdea = async (savedId) => {
    try {
      await studentAPI.deleteSavedIdea(savedId);
      setSavedIdeas(prevIdeas => prevIdeas.filter(idea => idea.saved_id !== savedId));
      wsService.notifyIdeaDeleted(savedId);
      toast.success('Idea removed from your saved list.');
    } catch (error) {
      console.error('Error removing idea:', error);
      toast.error('Failed to remove idea. Please try again.');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown date';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const filteredIdeas = (Array.isArray(savedIdeas) ? savedIdeas : []).filter(idea => {
    const matchesSearch = !searchQuery ||
      idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      idea.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDifficulty = !filters.difficulty || idea.difficulty === filters.difficulty;
    return matchesSearch && matchesDifficulty;
  });

  return (
    <div className="flex min-h-screen bg-[#1A1A2E]">
      <Sidebar />
      <main className="flex-1 p-4 md:p-10 text-white overflow-y-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Saved Ideas</h1>
          <p className="text-gray-400 text-lg font-medium">Your bookmarked FYP project ideas.</p>
        </header>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved ideas..."
            className="flex-1 p-3 bg-[#242444] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyan-500 outline-none transition-all"
          />
          <select
            value={filters.difficulty}
            onChange={(e) => setFilters(prev => ({ ...prev, difficulty: e.target.value }))}
            className="p-3 bg-[#242444] border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-all"
          >
            <option value="">All Difficulties</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>

        {/* Ideas Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <span className="w-8 h-8 border-2 border-t-cyan-400 border-white/20 rounded-full animate-spin"></span>
          </div>
        ) : filteredIdeas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-white/10 rounded-3xl">
            <p className="text-gray-500 text-sm uppercase tracking-widest font-bold">No saved ideas found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredIdeas.map((idea) => (
              <div
                key={idea.saved_id || idea.id}
                className="bg-[#242444] p-6 rounded-3xl border border-white/5 hover:border-cyan-500/30 transition-all shadow-2xl relative overflow-hidden group flex flex-col"
              >
                {/* Title row with difficulty badge */}
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors pr-2 flex-1">
                    {idea.title}
                  </h3>
                  {idea.difficulty && (
                    <span className="text-[10px] font-bold text-cyan-400/60 border border-cyan-500/20 px-2 py-0.5 rounded-lg bg-cyan-500/5 shrink-0">
                      {idea.difficulty}
                    </span>
                  )}
                </div>

                <p className="text-gray-400 text-xs mb-4 leading-relaxed flex-1">
                  {idea.description}
                </p>

                {idea.technologies && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {idea.technologies.split(',').map((tech, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-bold text-cyan-400/70 border border-cyan-500/20 px-2 py-0.5 rounded-lg bg-cyan-500/5"
                      >
                        #{tech.trim()}
                      </span>
                    ))}
                  </div>
                )}

                {/* Bottom bar: saved date (left) + trash icon (right) */}
                <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[10px] text-gray-500 font-medium">
                      Saved {formatDate(idea.saved_at)}
                    </span>
                  </div>

                  {/* Trash icon — bottom-right */}
                  <button
                    onClick={() => handleRemoveIdea(idea.saved_id)}
                    title="Remove idea"
                    className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/15 border border-transparent hover:border-red-500/20 transition-all"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SavedIdeas;