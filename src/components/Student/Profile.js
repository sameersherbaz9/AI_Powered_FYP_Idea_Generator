import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { studentAPI } from '../../services/api';
import { toast } from 'sonner';

const Profile = () => {
  const { user, updateUser } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    reg_number: user?.profile?.reg_number || '',
    department: user?.profile?.department || '',
    current_semester: user?.profile?.current_semester || '1',
    cgpa: user?.profile?.cgpa || '0.00',
    area_of_interest: user?.profile?.area_of_interest || ''
  });

  const [completionData, setCompletionData] = useState(null);

  useEffect(() => {
    const fetchCompletion = async () => {
      if (!user?.id) return;
      try {
        const response = await studentAPI.checkProfileCompletion(user.id);
        setCompletionData(response);
      } catch (err) {
        console.error('Error checking profile completion:', err);
        setCompletionData(null);
      }
    };
    fetchCompletion();
  }, [user?.id]);

  // Live: reflects the in-progress edit (profileData.current_semester), not
  // just the last-saved value — so toggling the semester dropdown while
  // editing unlocks/locks Area of Interest immediately instead of only
  // after saving and re-rendering with fresh `user` data.
  //
  // Also requires Step 1 (profile basics) and Step 2 (project records) to be
  // complete — area_of_interest itself is excluded from the Step 1 check
  // here (coreProfileComplete) since that would otherwise be circular: it
  // can't be filled in before it unlocks.
  const currentSemester = parseInt(profileData.current_semester || '1', 10);
  const isInterestEnabled =
    currentSemester >= 6 &&
    !!completionData?.coreProfileComplete &&
    !!completionData?.projectsComplete;

  const interestLockReason =
    currentSemester < 6
      ? 'Available from Semester 6'
      : !completionData?.coreProfileComplete
      ? 'Complete reg. number, CGPA & semester first'
      : !completionData?.projectsComplete
      ? 'Add your semester project records first'
      : '';

  const handleUpdate = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await studentAPI.updateProfile(user.id, {
        name: profileData.name,
        cgpa: profileData.cgpa,
        current_semester: profileData.current_semester,
        area_of_interest: isInterestEnabled ? profileData.area_of_interest : '',
        reg_number: profileData.reg_number
      });

      updateUser({
        ...user,
        name: profileData.name,
        profile: {
          ...user.profile,
          ...profileData
        }
      });
      toast.success('Profile updated successfully!');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#1A1A2E]">
      <Sidebar />

      <main className="flex-1 p-4 md:p-10 text-white overflow-y-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">User Profile</h1>
          <p className="text-gray-400 text-lg font-medium">Manage your personal and academic information.</p>
        </header>

        <div className="max-w-4xl">
          <div className="bg-[#242444] rounded-3xl shadow-2xl border border-white/5 overflow-hidden">
            {/* Cover Header */}
            <div className="h-32 bg-gradient-to-r from-pink-500/20 to-cyan-500/20 border-b border-white/5 flex items-end p-8">
              <div className="bg-[#1A1A2E] p-1 rounded-2xl border border-white/10 -mb-16 shadow-xl">
                <div className="w-24 h-24 bg-gradient-to-br from-pink-500 to-cyan-500 rounded-xl flex items-center justify-center text-3xl font-bold">
                  {profileData.name.charAt(0)}
                </div>
              </div>
            </div>

            <div className="p-8 pt-20">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h2 className="text-2xl font-bold text-white">{profileData.name}</h2>
                  <p className="text-cyan-400 font-medium">{profileData.reg_number}</p>
                </div>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-sm transition-all"
                >
                  {isEditing ? 'CANCEL' : 'EDIT PROFILE'}
                </button>
              </div>

              <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  {/* Full Name - editable */}
                  <div>
                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Full Name</label>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={profileData.name}
                      onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                      className="w-full p-4 bg-[#1A1A2E] border border-white/5 rounded-xl text-gray-300 focus:border-pink-500/50 outline-none transition-all disabled:opacity-50"
                    />
                  </div>

                  {/* Email - always locked */}
                  <div>
                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Email Address</label>
                    <input
                      type="email"
                      disabled
                      value={profileData.email}
                      className="w-full p-4 bg-[#1A1A2E] border border-white/5 rounded-xl text-gray-500 cursor-not-allowed outline-none"
                    />
                  </div>

                  {/* Issue 2 — Department: read-only, greyed out, auto-detected from email at registration */}
                  <div>
                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">
                      Department
                      <span className="text-[10px] text-gray-600 font-normal ml-2 normal-case">
                        🔒 auto-detected from your email
                      </span>
                    </label>
                    <div className="w-full p-4 bg-[#0f0f1a] border border-white/5 rounded-xl text-gray-500 cursor-not-allowed select-none opacity-70 flex items-center gap-2">
                      <span>{profileData.department || 'Not detected — contact admin'}</span>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">
                      This is automatically set from your CUST email prefix and cannot be changed.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Current Semester */}
                  <div>
                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Current Semester</label>
                    <select
                      disabled={!isEditing}
                      value={profileData.current_semester}
                      onChange={(e) => setProfileData({...profileData, current_semester: e.target.value})}
                      className="w-full p-4 bg-[#1A1A2E] border border-white/5 rounded-xl text-gray-300 focus:border-pink-500/50 outline-none transition-all disabled:opacity-50 appearance-none"
                    >
                      {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                    </select>
                  </div>

                  {/* CGPA */}
                  <div>
                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">CGPA</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="4"
                      disabled={!isEditing}
                      value={profileData.cgpa}
                      onChange={(e) => setProfileData({...profileData, cgpa: e.target.value})}
                      className="w-full p-4 bg-[#1A1A2E] border border-white/5 rounded-xl text-gray-300 focus:border-pink-500/50 outline-none transition-all disabled:opacity-50"
                    />
                  </div>

                  {/* Area of Interest - locked until semester 6 + Step 1 + Step 2 complete */}
                  <div>
                    <label className="block text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">
                      Area of Interest
                      {!isInterestEnabled && (
                        <span className="text-[10px] text-yellow-500/70 font-normal ml-2">🔒 {interestLockReason}</span>
                      )}
                    </label>
                    {isInterestEnabled ? (
                      <input
                        type="text"
                        disabled={!isEditing}
                        value={profileData.area_of_interest}
                        onChange={(e) => setProfileData({...profileData, area_of_interest: e.target.value})}
                        placeholder="E.g. Machine Learning, Web Development"
                        className="w-full p-4 bg-[#1A1A2E] border border-white/5 rounded-xl text-gray-300 focus:border-pink-500/50 outline-none transition-all disabled:opacity-50"
                      />
                    ) : (
                      <div className="w-full p-4 bg-[#1A1A2E] border border-white/5 rounded-xl text-gray-600 cursor-not-allowed opacity-50 text-sm italic">
                        Locked — {interestLockReason}
                      </div>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="md:col-span-2 pt-4">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="w-full py-4 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-xl font-bold text-white uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-pink-500/20 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;
