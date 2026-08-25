import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { studentAPI } from '../../services/api';
import LoadingSpinner from '../common/LoadingSpinner';
import { Bookmark, MessageSquare, X, Send, CheckCircle } from 'lucide-react';
import wsService from '../../services/websocket';
import useWebSocket from '../../hooks/useWebSocket';
import { toast } from 'sonner';

// Renders AI markdown responses with proper formatting
const MarkdownMessage = ({ content }) => {
  const lines = content.split('\n');
  const elements = [];
  let key = 0;
  let inCodeBlock = false;
  let codeBlockLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code block: ```...```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={key++} className="bg-black/40 text-cyan-300 p-3 rounded-lg text-xs font-mono overflow-x-auto my-1 whitespace-pre-wrap">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Skip empty lines but add spacing
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }

    // Markdown header: "#", "##", "###" text
    if (/^#{1,6}\s+.+/.test(line.trim())) {
      const text = line.trim().replace(/^#{1,6}\s+/, '');
      elements.push(
        <p key={key++} className="font-bold text-white mt-3 mb-1 text-sm uppercase tracking-wide">
          {renderInline(text)}
        </p>
      );
      continue;
    }

    // Numbered list: "1. text"
    if (/^\d+\.\s/.test(line.trim())) {
      const text = line.replace(/^\d+\.\s/, '').trim();
      const num = line.match(/^(\d+)\./)[1];
      elements.push(
        <div key={key++} className="flex gap-2 my-0.5">
          <span className="text-cyan-400 font-bold min-w-[1.2rem]">{num}.</span>
          <span>{renderInline(text)}</span>
        </div>
      );
      continue;
    }

    // Bullet: "• text" or "- text" or "* text"
    if (/^[•\-\*]\s/.test(line.trim())) {
      const text = line.replace(/^[•\-\*]\s/, '').trim();
      elements.push(
        <div key={key++} className="flex gap-2 my-0.5 pl-1">
          <span className="text-cyan-400 mt-1 min-w-[0.6rem]">•</span>
          <span>{renderInline(text)}</span>
        </div>
      );
      continue;
    }

    // Bold heading: "**Heading**" or "**Heading:**"
    if (/^\*\*.+\*\*:?\s*$/.test(line.trim())) {
      const text = line.replace(/\*\*/g, '').replace(/:$/, '').trim();
      elements.push(
        <p key={key++} className="font-bold text-white mt-3 mb-1 text-sm uppercase tracking-wide">
          {text}
        </p>
      );
      continue;
    }

    // Regular paragraph line
    elements.push(
      <p key={key++} className="my-0.5 leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  // Flush an unterminated code block (model didn't close the fence)
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre key={key++} className="bg-black/40 text-cyan-300 p-3 rounded-lg text-xs font-mono overflow-x-auto my-1 whitespace-pre-wrap">
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return <div className="space-y-0.5 text-sm">{elements}</div>;
};

// Renders inline bold (**text**) and backtick code (`code`)
const renderInline = (text) => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-black/40 text-cyan-300 px-1.5 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
    }
    return part;
  });
};

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState([]);
  const [savedIdeaIds, setSavedIdeaIds] = useState(new Set());

  // WebSocket real-time notification state
  const [wsNotification, setWsNotification] = useState(null);
  const wsNotifTimerRef = useRef(null);
  const wsEventTypes = useMemo(() => [
    'idea_generation_ack',
    'idea_save_ack',
    'idea_delete_ack',
    'notification',
    'new_idea',
  ], []);

  const handleWsMessage = useCallback(({ type, payload }) => {
    const messages = {
      idea_generation_ack: { text: payload?.message || 'Ideas generated!', variant: 'success' },
      idea_save_ack:       { text: payload?.message || 'Idea saved!',       variant: 'success' },
      idea_delete_ack:     { text: payload?.message || 'Idea removed.',      variant: 'info'    },
      notification:        { text: payload?.message || 'Notification',       variant: payload?.variant || 'info' },
      new_idea:            { text: 'A new idea was suggested for you!',       variant: 'info'    },
    };
    const notif = messages[type];
    if (notif) {
      setWsNotification(notif);
      clearTimeout(wsNotifTimerRef.current);
      wsNotifTimerRef.current = setTimeout(() => setWsNotification(null), 3500);
    }
  }, []);

  useWebSocket(wsEventTypes, handleWsMessage);

  // Chat states
  const [chatIdea, setChatIdea] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const latestUserMsgRef = useRef(null);

  // Cleanup notification timer on unmount
  useEffect(() => {
    return () => clearTimeout(wsNotifTimerRef.current);
  }, []);

  // Scroll so the latest USER message is at top
  useEffect(() => {
    if (latestUserMsgRef.current) {
      latestUserMsgRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [chatHistory]);

  // Profile completion states
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);
  const [completionData, setCompletionData] = useState(null);

  // Scope states
  const [department, setDepartment] = useState(user?.profile?.department || '');
  const [semester, setSemester] = useState(user?.profile?.current_semester || '1');
  const [cgpa, setCgpa] = useState(user?.profile?.cgpa ?? '0.0');
  const [areaOfInterest, setAreaOfInterest] = useState(user?.profile?.area_of_interest || '');

  // Unlocks at Semester 6, but only once Step 1 (profile basics) and Step 2
  // (project records) are both done too — area_of_interest itself is
  // excluded from the Step 1 check here (coreProfileComplete) since that
  // would otherwise be circular: it can't be filled in before it unlocks.
  const isInterestEnabled =
    parseInt(semester) >= 6 &&
    !!completionData?.coreProfileComplete &&
    !!completionData?.projectsComplete;

  const interestLockReason =
    parseInt(semester) < 6
      ? 'Unlocks at Semester 6'
      : !completionData?.coreProfileComplete
      ? 'Complete your profile details first'
      : !completionData?.projectsComplete
      ? 'Add your semester project records first'
      : '';

  useEffect(() => {
    if (user?.profile) {
      setDepartment(user.profile.department || '');
      setSemester(user.profile.current_semester || '1');
      setCgpa(user.profile.cgpa ?? '0.0');
      setAreaOfInterest(user.profile.area_of_interest || '');
    }
  }, [user?.profile]);

  useEffect(() => {
    const checkProfileCompletion = async () => {
      if (!user?.id) {
        setCheckingProfile(false);
        return;
      }
      try {
        setCheckingProfile(true);
        const response = await studentAPI.checkProfileCompletion(user.id);
        setProfileComplete(response.isComplete || false);
        setCompletionData(response);
      } catch (error) {
        console.error('Error checking profile completion:', error);
        setProfileComplete(false);
        setCompletionData(null);
      } finally {
        setCheckingProfile(false);
      }
    };
    checkProfileCompletion();
  }, [user?.id]);

  useEffect(() => {
    const loadSavedIds = async () => {
      if (!user?.id) return;
      try {
        const saved = await studentAPI.getSavedIdeas(user.id);
        // Backend returns idea_title etc.; use saved_id to track which ideas are saved.
        // We need the original idea identifier — store the idea titles as a fallback key
        // since generated ideas use groq-timestamp IDs that aren't persisted.
        // Build a Set of saved titles so the bookmark button shows correctly.
        const ids = new Set((saved || []).map(s => s.id || s.idea_id || s.idea_title));
        setSavedIdeaIds(ids);
      } catch (e) {}
    };
    loadSavedIds();
  }, [user?.id]);

  const generateIdeas = async () => {
    const cgpaNum = parseFloat(cgpa);
    if (isNaN(cgpaNum) || cgpaNum < 0 || cgpaNum > 4.0) {
      toast.error('CGPA must be between 0.00 and 4.00');
      return;
    }

    setLoading(true);
    setIdeas([]);
    setSavedIdeaIds(new Set());

    try {
      // Derive reg_number from the email prefix (e.g. bse223079@cust.pk → BSE223079)
      // so that updateProfile never overwrites it with null and Step 1 stays complete.
      const regNumber =
        user?.profile?.reg_number ||
        (user?.email ? user.email.split('@')[0].toUpperCase() : '');

      await studentAPI.updateProfile(user.id, {
        name: user?.name,
        cgpa,
        current_semester: semester,
        area_of_interest: areaOfInterest,
        reg_number: regNumber,
      });
    } catch (saveErr) {
      console.warn('Could not persist profile before generation:', saveErr);
    }

    try {
      const response = await studentAPI.generateIdeasWithHistory(user.id);
      const generatedIdeas = response.ideas || [];
      setIdeas(generatedIdeas);
      wsService.notifyIdeaGenerated(generatedIdeas);
    } catch (error) {
      console.error('Generation failed:', error);

      // Rate limits (and auth/permission errors) are real failures, not a sign
      // that the user lacks project history — don't mask them with a silent
      // fallback attempt that will just fail the same way.
      if (error.status === 429 || error.status === 401 || error.status === 403) {
        toast.error(error.message || 'Failed to generate ideas. Please try again.');
        setLoading(false);
        return;
      }

      toast.error('Primary generation failed, trying fallback…');
      try {
        const fallbackResponse = await studentAPI.generateIdeas(user.id, {
          department, semester, cgpa, interests: areaOfInterest
        });
        const fallbackIdeas = fallbackResponse.ideas || [];
        setIdeas(fallbackIdeas);
        wsService.notifyIdeaGenerated(fallbackIdeas);
      } catch (fallbackError) {
        toast.error(fallbackError.message || 'Failed to generate ideas. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const saveIdeaToCollection = async (idea) => {
    try {
      if (!idea.id) {
        toast.error('Idea ID not found. Please try again.');
        return;
      }
      await studentAPI.saveIdea(user.id, idea);
      // Track by title (and id as fallback) since generated groq IDs are ephemeral
      setSavedIdeaIds(prev => new Set([...prev, idea.id, idea.title]));
      wsService.notifyIdeaSaved(idea);
      toast.success('Idea saved to your collection!');
    } catch (error) {
      console.error('Save error:', error);
      const errorMsg = error.response?.data?.error || error.message;
      if (errorMsg && errorMsg.toLowerCase().includes('already')) {
        toast.info('This idea is already in your saved collection.');
      } else {
        toast.error(`Failed to save: ${errorMsg}`);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;
    const msg = chatMessage;
    setChatMessage('');
    const newHistory = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(newHistory);
    setChatLoading(true);

    try {
      const cappedHistory = chatHistory.slice(-20);
      const response = await studentAPI.chatAboutIdea(user.id, {
        message: msg,
        history: cappedHistory,
        ideaContext: `Title: ${chatIdea.title}\nDescription: ${chatIdea.description}\nTechnologies: ${Array.isArray(chatIdea.technologies) ? chatIdea.technologies.join(', ') : chatIdea.technologies}\nDifficulty: ${chatIdea.difficulty}`
      });
      setChatHistory([...newHistory, { role: 'assistant', content: response.reply }]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to get a response from AI. Please try again.');
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#1A1A2E] font-['Inter',sans-serif]">
      <Sidebar />

      <main className="flex-1 p-4 md:p-10 text-white overflow-y-auto">

        {/* FIX: Moved the checkingProfile conditional HERE so the Sidebar stays rendered */}
        {checkingProfile && !completionData ? (
          <div className="flex items-center justify-center h-full">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            {/* Profile Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
              <div className="bg-[#242444] border border-white/10 rounded-2xl p-6 hover:border-cyan-500/30 transition-all">
                <p className="text-gray-400 text-xs uppercase font-semibold tracking-widest mb-2">Department</p>
                <p className="text-white text-lg font-bold">{department}</p>
              </div>
              <div className="bg-[#242444] border border-white/10 rounded-2xl p-6 hover:border-cyan-500/30 transition-all">
                <p className="text-gray-400 text-xs uppercase font-semibold tracking-widest mb-2">Semester</p>
                <p className="text-white text-lg font-bold">Semester {semester}</p>
              </div>
              <div className="bg-[#242444] border border-white/10 rounded-2xl p-6 hover:border-cyan-500/30 transition-all">
                <p className="text-gray-400 text-xs uppercase font-semibold tracking-widest mb-2">Current CGPA</p>
                <p className="text-white text-lg font-bold">{cgpa}</p>
              </div>
              <div className="bg-[#242444] border border-white/10 rounded-2xl p-6 hover:border-cyan-500/30 transition-all">
                <p className="text-gray-400 text-xs uppercase font-semibold tracking-widest mb-2">Status</p>
                {checkingProfile ? (
                  <p className="text-gray-400 text-lg font-bold">Checking…</p>
                ) : profileComplete ? (
                  <p className="text-green-400 text-lg font-bold">✓ Complete</p>
                ) : (
                  <p className="text-yellow-400 text-lg font-bold">⚠ Incomplete</p>
                )}
              </div>
            </div>

            {/* Profile Completion Checklist Banner */}
            {!checkingProfile && !profileComplete && completionData && (
              <div className="mb-8 bg-[#1e1b3a] border border-yellow-500/30 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-yellow-400 text-xl">⚠</span>
                  <div>
                    <h3 className="text-white font-bold text-lg">Complete your profile to generate ideas</h3>
                    <p className="text-gray-400 text-sm">Finish both steps below so the AI can personalise your FYP suggestions.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Step 1 — Profile Details */}
                  <div className={`rounded-xl p-4 border ${completionData.profileDetailsComplete ? 'border-green-500/40 bg-green-500/5' : 'border-white/10 bg-[#242444]'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-xl ${completionData.profileDetailsComplete ? 'text-green-400' : 'text-gray-500'}`}>
                        {completionData.profileDetailsComplete ? '✅' : '⬜'}
                      </span>
                      <p className={`font-bold ${completionData.profileDetailsComplete ? 'text-green-400' : 'text-white'}`}>
                        Step 1 — Fill Profile Details
                      </p>
                    </div>
                    {completionData.profileDetailsComplete ? (
                      <p className="text-green-400 text-sm ml-8">All required fields filled ✓</p>
                    ) : (
                      <p className="text-gray-400 text-sm ml-8 mb-2">
                        Missing: {completionData.missingProfileFields
                          .map(f => ({ reg_number: 'Registration No.', cgpa: 'CGPA', current_semester: 'Semester', area_of_interest: 'Area of Interest' }[f] || f))
                          .join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Step 2 — Semester Projects */}
                  <div className={`rounded-xl p-4 border ${completionData.projectsComplete ? 'border-green-500/40 bg-green-500/5' : 'border-white/10 bg-[#242444]'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-xl ${completionData.projectsComplete ? 'text-green-400' : 'text-gray-500'}`}>
                        {completionData.projectsComplete ? '✅' : '⬜'}
                      </span>
                      <p className={`font-bold ${completionData.projectsComplete ? 'text-green-400' : 'text-white'}`}>
                        Step 2 — Add Semester Projects
                      </p>
                    </div>
                    {completionData.projectsComplete ? (
                      <p className="text-green-400 text-sm ml-8">6 projects from 4+ semesters added ✓</p>
                    ) : (
                      <div className="ml-8 space-y-1 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${completionData.totalProjectCount >= 6 ? 'bg-green-400' : 'bg-yellow-400'}`} />
                          <p className="text-gray-300 text-sm">
                            <span className={completionData.totalProjectCount >= 6 ? 'text-green-400 font-bold' : 'text-yellow-400 font-bold'}>
                              {completionData.totalProjectCount}/6
                            </span>
                            {' '}projects added
                            {completionData.totalProjectCount < 6 && (
                              <span className="text-gray-500"> — need {6 - completionData.totalProjectCount} more</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${completionData.distinctSemesterCount >= 4 ? 'bg-green-400' : 'bg-yellow-400'}`} />
                          <p className="text-gray-300 text-sm">
                            <span className={completionData.distinctSemesterCount >= 4 ? 'text-green-400 font-bold' : 'text-yellow-400 font-bold'}>
                              {completionData.distinctSemesterCount}/4
                            </span>
                            {' '}different semesters covered
                            {completionData.distinctSemesterCount < 4 && (
                              <span className="text-gray-500"> — need {4 - completionData.distinctSemesterCount} more</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
              {/* Configuration Card */}
              <div className="bg-[#242444] p-8 rounded-3xl shadow-2xl border border-white/5 space-y-6">
                <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Define Your Scope</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-gray-400 font-bold text-xs uppercase tracking-widest mb-3">Department</label>
                    <div className="w-full p-4 bg-[#1A1A2E] border border-gray-700/30 rounded-2xl text-gray-400 cursor-not-allowed opacity-70">
                      {department}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">Set from your email</p>
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold text-xs uppercase tracking-widest mb-3">Semester</label>
                    <select
                      value={semester}
                      onChange={(e) => setSemester(e.target.value)}
                      className="w-full p-4 bg-[#1A1A2E] border border-gray-700/30 rounded-2xl text-gray-300 focus:border-cyan-500 outline-none transition-all cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => {
                        const suffix = sem === 1 ? 'st' : sem === 2 ? 'nd' : sem === 3 ? 'rd' : 'th';
                        return (
                          <option key={sem} value={sem}>{sem}{suffix} Semester</option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold text-xs uppercase tracking-widest mb-3">Current CGPA</label>
                    <input
                      type="number"
                      value={cgpa}
                      onChange={(e) => setCgpa(e.target.value)}
                      min="0" max="4" step="0.01"
                      className="w-full p-4 bg-[#1A1A2E] border border-gray-700/30 rounded-2xl text-gray-300 focus:border-cyan-500 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold text-xs uppercase tracking-widest mb-3">
                      Area of Interest
                      {!isInterestEnabled && (
                        <span className="text-[10px] text-yellow-500/70 font-normal ml-2">🔒 {interestLockReason}</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={areaOfInterest}
                      onChange={(e) => setAreaOfInterest(e.target.value)}
                      disabled={!isInterestEnabled}
                      placeholder={isInterestEnabled ? 'E.g. Blockchain, AI' : interestLockReason}
                      className="w-full p-4 bg-[#1A1A2E] border border-gray-700/30 rounded-2xl text-white placeholder-gray-600 focus:border-cyan-500 outline-none transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="relative group">
                  <button
                    onClick={generateIdeas}
                    disabled={loading || !profileComplete}
                    className="w-full py-5 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-2xl font-bold text-white uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl shadow-pink-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {loading ? (
                      <span className="w-6 h-6 border-2 border-t-white border-white/20 rounded-full animate-spin"></span>
                    ) : (
                      <>✨ GENERATE IDEAS</>
                    )}
                  </button>
                  {!profileComplete && !loading && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-[#1e1b3a] border border-yellow-500/40 text-yellow-300 text-xs text-center rounded-xl px-4 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      ⚠ Complete both steps in the checklist above before generating ideas
                    </div>
                  )}
                </div>
              </div>

              {/* Results Area */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Suggested Projects</h2>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{ideas.length} Results</span>
                </div>

                <div className="flex-1 space-y-4 max-h-[520px] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
                  {ideas.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl p-10 bg-white/5 backdrop-blur-sm">
                      <div className="text-5xl mb-4 grayscale opacity-20">??</div>
                      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest italic">Awaiting Generation</h2>
                    </div>
                  ) : (
                    ideas.map((idea, index) => {
                      const isSaved = savedIdeaIds.has(idea.id) || savedIdeaIds.has(idea.title);
                      return (
                        <div key={idea.id || index} className="bg-[#242444] p-6 rounded-3xl border border-white/5 hover:border-cyan-500/30 transition-all group shadow-2xl relative overflow-hidden">
                          <div className="flex justify-between items-start mb-3">
                            <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors pr-10">{idea.title}</h3>
                            {idea.difficulty && (
                              <span className="text-[10px] font-bold text-cyan-400/60 border border-cyan-500/20 px-2 py-0.5 rounded-lg bg-cyan-500/5 shrink-0">
                                {idea.difficulty}
                              </span>
                            )}
                          </div>

                          <p className="text-gray-400 text-xs mb-6 leading-relaxed bg-[#1A1A2E]/40 p-3 rounded-xl border border-white/5 font-medium">
                            {idea.description}
                          </p>

                          <div className="flex flex-wrap gap-2 mb-6">
                            {(() => {
                              let techStr = idea.technologies || idea.tags || '';
                              const techList = typeof techStr === 'string' ? techStr.split(',') : (Array.isArray(techStr) ? techStr : []);
                              return techList.map((tech, i) => {
                                const techLabel = typeof tech === 'string' ? tech.trim() : tech;
                                return (
                                  <span key={i} className="text-[10px] font-bold text-cyan-400/70 border border-cyan-500/20 px-2 py-0.5 rounded-lg bg-cyan-500/5">#{techLabel}</span>
                                );
                              });
                            })()}
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => saveIdeaToCollection(idea)}
                              disabled={isSaved}
                              className={`flex-1 py-3 border rounded-xl text-[10px] font-bold uppercase transition-all tracking-widest shadow-inner flex items-center justify-center gap-2 ${
                                isSaved
                                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400 cursor-not-allowed'
                                  : 'bg-white/5 hover:bg-white/10 border-white/5 text-white'
                              }`}
                            >
                              {isSaved ? (
                                <><CheckCircle size={14} /> Saved</>
                              ) : (
                                <><Bookmark size={14} /> Save to My Ideas</>
                              )}
                            </button>
                            <button
                              onClick={() => { setChatIdea(idea); setChatHistory([]); }}
                              className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[10px] font-bold uppercase transition-all tracking-widest shadow-inner shadow-black/20 flex items-center justify-center gap-2"
                            >
                              <MessageSquare size={14} /> Discuss with AI
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* AI Chat Modal */}
            {chatIdea && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-[#1A1A2E] w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl flex flex-col h-[600px] max-h-[90vh]">
                  <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#242444] rounded-t-3xl">
                    <div>
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <MessageSquare size={20} className="text-cyan-400" />
                        Discuss with AI
                      </h3>
                      <p className="text-gray-400 text-xs mt-1">Idea: {chatIdea.title}</p>
                    </div>
                    <button
                      onClick={() => setChatIdea(null)}
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="bg-[#242444] p-4 rounded-2xl border border-white/5 text-gray-300 text-sm">
                      Hi! I'm your AI FYP Assistant. You selected <strong>{chatIdea.title}</strong>.
                      What would you like to know? I can help you with the architecture, implementation steps, or potential challenges.
                    </div>
                    {chatHistory.map((msg, idx) => {
                      const isLastUserMsg =
                        msg.role === 'user' &&
                        (() => {
                          let last = -1;
                          for (let i = chatHistory.length - 1; i >= 0; i--) {
                            if (chatHistory[i].role === 'user') { last = i; break; }
                          }
                          return idx === last;
                        })();

                      return (
                        <div
                          key={idx}
                          ref={isLastUserMsg ? latestUserMsgRef : null}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`p-4 rounded-2xl max-w-[85%] text-sm ${
                            msg.role === 'user'
                              ? 'bg-cyan-600 border border-cyan-500 text-white rounded-br-none'
                              : 'bg-[#242444] border border-white/5 text-gray-300 rounded-bl-none'
                          }`}>
                            {msg.role === 'assistant'
                              ? <MarkdownMessage content={msg.content} />
                              : msg.content
                            }
                          </div>
                        </div>
                      );
                    })}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="p-4 rounded-2xl max-w-[80%] bg-[#242444] border border-white/5 text-gray-300 rounded-bl-none flex gap-2">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce"></span>
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{animationDelay: '0.2s'}}></span>
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{animationDelay: '0.4s'}}></span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-[#242444] rounded-b-3xl border-t border-white/5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ask about this project..."
                        className="flex-1 bg-[#1A1A2E] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={chatLoading || !chatMessage.trim()}
                        className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-600/50 disabled:cursor-not-allowed rounded-xl text-white font-bold transition-all flex items-center justify-center"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
};

export default Dashboard;
