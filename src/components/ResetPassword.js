import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { KeyRound, CheckCircle2 } from 'lucide-react';

const validatePassword = (password) => {
  if (!password || password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Password must contain at least one special character';
  return null;
};

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const gradientClass = 'from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800';
  const ringClass = 'focus:ring-purple-500';

  const missingLinkParams = !token || !email;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    const pwError = validatePassword(password);
    if (pwError) newErrors.password = pwError;
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setLoading(true);
    try {
      const result = await resetPassword(token, email, password);
      if (result && result.success) {
        setDone(true);
        setTimeout(() => navigate('/'), 2500);
      } else {
        setErrors({ submit: result.error || 'Failed to reset password.' });
      }
    } catch {
      setErrors({ submit: 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-purple-500/20">
              {done ? <CheckCircle2 className="w-8 h-8 text-green-400" /> : <KeyRound className="w-8 h-8 text-purple-400" />}
            </div>
            <h1 className="text-2xl font-bold mb-1">{done ? 'Password Reset' : 'Set New Password'}</h1>
            {email && !done && <p className="text-slate-400 text-sm italic">{email}</p>}
          </div>

          {missingLinkParams && !done ? (
            <div className="text-center">
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                This reset link is invalid or incomplete. Please request a new one from the login page.
              </div>
              <Link to="/" className={`inline-block w-full py-3 rounded-lg font-semibold text-white transition-all bg-gradient-to-r ${gradientClass}`}>
                Back to Login
              </Link>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="mb-6 p-3 bg-green-500/10 border border-green-500/40 rounded-lg text-green-400 text-sm">
                Your password has been reset successfully. Redirecting you to login...
              </div>
              <Link to="/" className={`inline-block w-full py-3 rounded-lg font-semibold text-white transition-all bg-gradient-to-r ${gradientClass}`}>
                Go to Login Now
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {errors.submit && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-xs text-center">
                  {errors.submit}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} placeholder="••••••••"
                    onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors(prev => ({ ...prev, password: '' })); }}
                    className={`w-full px-4 py-3 border rounded-lg bg-slate-800 text-white focus:outline-none focus:ring-2 transition pr-10 ${errors.password ? 'border-red-500 focus:ring-red-500' : `border-slate-600 ${ringClass}`}`} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-white">
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.password ? (
                  <p className="mt-1 text-xs text-red-400">{errors.password}</p>
                ) : (
                  <p className="mt-1.5 ml-1 text-xs text-slate-500 italic">Min. 8 chars, 1 Upper, 1 Special, 1 Number</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Confirm New Password</label>
                <div className="relative">
                  <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} placeholder="••••••••"
                    onChange={(e) => { setConfirmPassword(e.target.value); if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: '' })); }}
                    className={`w-full px-4 py-3 border rounded-lg bg-slate-800 text-white focus:outline-none focus:ring-2 transition pr-10 ${errors.confirmPassword ? 'border-red-500 focus:ring-red-500' : `border-slate-600 ${ringClass}`}`} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-white">
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword}</p>}
              </div>

              <button type="submit" disabled={loading} className={`w-full py-3 rounded-lg font-semibold text-white transition-all mt-8 bg-gradient-to-r ${gradientClass} disabled:opacity-50`}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
