import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Mail, ShieldCheck, RefreshCw } from 'lucide-react';

// Only allow @cust.pk emails
const ALLOWED_DOMAIN = '@cust.pk';

const validateForm = (data, mode) => {
  const errors = {};
  if (mode === 'signup' || mode === 'login') {
    if (!data.email) errors.email = 'Email is required';
    else if (!data.email.toLowerCase().endsWith(ALLOWED_DOMAIN))
      errors.email = `Only CUST emails allowed (e.g. BSE223011${ALLOWED_DOMAIN})`;
    
    if (!data.password) {
      errors.password = 'Password is required';
    } else if (mode === 'signup') {
      const hasUpper = /[A-Z]/.test(data.password);
      const hasLower = /[a-z]/.test(data.password);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(data.password);
      const hasNumber = /[0-9]/.test(data.password);
      
      if (data.password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
      } else if (!hasUpper || !hasLower || !hasSpecial || !hasNumber) {
        errors.password = 'Include uppercase, lowercase, number, and special character';
      }
    }
  }
  if (mode === 'signup') {
    if (!data.name) errors.name = 'Full name is required';
    if (data.password !== data.confirmPassword) errors.confirmPassword = 'Passwords do not match';
  }
  return { isValid: Object.keys(errors).length === 0, errors };
};

const Login = () => {
  const [currentView, setCurrentView] = useState('login'); 
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', confirmPassword: '', role: 'student'
  });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [successMsg, setSuccessMsg] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const otpRefs = useRef([]);
  const { login, sendOTP, register, forgotPassword, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/student/dashboard');
  }, [user, navigate]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    if (errors.submit) setErrors(prev => ({ ...prev, submit: '' }));
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    pasted.split('').forEach((ch, i) => { newOtp[i] = ch; });
    setOtp(newOtp);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const { isValid, errors: errs } = validateForm(formData, 'login');
    if (!isValid) { setErrors(errs); return; }
    setLoading(true);
    try {
      const result = await login(formData.email, formData.password);
      if (result && !result.success) setErrors({ submit: result.error });
    } catch {
      setErrors({ submit: 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    const { isValid, errors: errs } = validateForm(formData, 'signup');
    if (!isValid) { setErrors(errs); return; }
    setLoading(true);
    try {
      const result = await sendOTP(formData);
      if (result && result.success) {
        setCurrentView('verify');
        setOtp(['', '', '', '', '', '']);
        setResendTimer(60);
        setSuccessMsg(`Verification code sent to ${formData.email}`);
        setTimeout(() => otpRefs.current[0]?.focus(), 200);
      } else {
        setErrors({ submit: result.error });
      }
    } catch {
      setErrors({ submit: 'Failed to send verification email.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length < 6) { setErrors({ otp: 'Please enter the complete 6-digit code' }); return; }
    setLoading(true);
    try {
      const result = await register({ ...formData, otp: otpCode });
      if (result && !result.success) setErrors({ submit: result.error });
    } catch {
      setErrors({ submit: 'Verification failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToChoice = () => {
    setCurrentView(currentView === 'verify' ? 'signup' : 'login');
    setErrors({});
    setSuccessMsg('');
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail) { setErrors({ forgotEmail: 'Email is required' }); return; }
    if (!forgotEmail.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setErrors({ forgotEmail: `Only CUST emails allowed (e.g. BSE223011${ALLOWED_DOMAIN})` });
      return;
    }
    setLoading(true);
    try {
      const result = await forgotPassword(forgotEmail);
      if (result && result.success) {
        setForgotSubmitted(true);
        setErrors({});
      } else {
        setErrors({ submit: result.error || 'Failed to send reset email.' });
      }
    } catch {
      setErrors({ submit: 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const goToForgotPassword = () => {
    setCurrentView('forgot');
    setForgotEmail(formData.email || '');
    setForgotSubmitted(false);
    setErrors({});
  };

  const gradientClass = 'from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800';
  const ringClass = 'focus:ring-purple-500';
  const textAccent = 'text-purple-400 hover:text-purple-300';

  if (currentView === 'forgot') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
        <div className="w-full max-w-sm sm:max-w-md">
          <button onClick={() => { setCurrentView('login'); setErrors({}); }} className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back to login
          </button>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-purple-500/20">
                <Mail className="w-8 h-8 text-purple-400" />
              </div>
              <h1 className="text-2xl font-bold mb-1">Forgot Password</h1>
              <p className="text-slate-400 text-sm">
                {forgotSubmitted
                  ? 'Check your inbox for the reset link'
                  : "Enter your university email and we'll send you a reset link"}
              </p>
            </div>

            {forgotSubmitted ? (
              <div>
                <div className="mb-6 p-4 bg-green-500/10 border border-green-500/40 rounded-lg text-green-400 text-sm text-center">
                  If an account exists for <span className="font-semibold">{forgotEmail}</span>, a password reset link has been sent. The link expires in 30 minutes.
                </div>
                <button type="button" onClick={() => setForgotSubmitted(false)} className={`w-full py-3 rounded-lg font-semibold text-white transition-all bg-gradient-to-r ${gradientClass}`}>
                  Send another link
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-5">
                {errors.submit && (
                  <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-xs text-center">
                    {errors.submit}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
                  <input type="email" name="forgotEmail" placeholder={`BSE223011${ALLOWED_DOMAIN}`} value={forgotEmail}
                    onChange={(e) => { setForgotEmail(e.target.value); if (errors.forgotEmail) setErrors(prev => ({ ...prev, forgotEmail: '' })); }}
                    className={`w-full px-4 py-3 border rounded-lg bg-slate-800 text-white focus:outline-none focus:ring-2 transition ${errors.forgotEmail ? 'border-red-500 focus:ring-red-500' : `border-slate-600 ${ringClass}`}`} />
                  {errors.forgotEmail && <p className="mt-1 text-xs text-red-400">{errors.forgotEmail}</p>}
                </div>
                <button type="submit" disabled={loading} className={`w-full py-3 rounded-lg font-semibold text-white transition-all bg-gradient-to-r ${gradientClass} disabled:opacity-50`}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
        <div className="w-full max-w-sm sm:max-w-md">
          <button onClick={handleBackToChoice} className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-purple-500/20">
                <ShieldCheck className="w-8 h-8 text-purple-400" />
              </div>
              <h1 className="text-2xl font-bold mb-1">Verify Your Email</h1>
              <p className="text-slate-400 text-sm italic">{formData.email}</p>
            </div>
            {successMsg && <div className="mb-5 p-3 bg-green-500/10 border border-green-500/40 rounded-lg text-green-400 text-sm">{successMsg}</div>}
            <form onSubmit={handleVerifySubmit}>
              <div className="flex justify-center gap-3 mb-6" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input key={i} ref={el => otpRefs.current[i] = el} type="text" inputMode="numeric" maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)} onKeyDown={e => handleOtpKeyDown(i, e)}
                    className={`w-12 h-14 text-center text-2xl font-bold rounded-xl border bg-slate-800 text-white focus:outline-none focus:ring-2 transition ${errors.otp ? 'border-red-500 focus:ring-red-500' : `border-slate-600 ${ringClass}`}`} />
                ))}
              </div>
              {errors.otp && <p className="text-center text-red-400 text-xs mb-4">{errors.otp}</p>}
              <button type="submit" disabled={loading} className={`w-full py-3 rounded-lg font-semibold bg-gradient-to-r ${gradientClass} disabled:opacity-50`}>
                {loading ? 'Verifying...' : 'Verify & Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-black">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
          <div className="text-center mb-8">
            <div className="inline-block p-3 rounded-xl mb-4 bg-purple-500/20 text-purple-400"><BookOpen size={24} /></div>
            <h1 className="text-3xl font-bold text-white mb-1">FYP Idea Generator</h1>
            <p className="text-slate-400 text-sm">{currentView === 'login' ? 'Student Login' : 'Create Student Account'}</p>
          </div>

          {/* General Submit Error */}
          {errors.submit && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-xs text-center">
              {errors.submit}
            </div>
          )}

          <form onSubmit={currentView === 'login' ? handleLoginSubmit : handleSignupSubmit} className="space-y-5">
            {currentView === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <input type="text" name="name" placeholder="Ali Hassan" value={formData.name} onChange={handleChange}
                  className={`w-full px-4 py-3 border rounded-lg bg-slate-800 text-white focus:outline-none focus:ring-2 transition ${errors.name ? 'border-red-500 focus:ring-red-500' : `border-slate-600 ${ringClass}`}`} />
                {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
              <input type="email" name="email" placeholder={`BSE223011${ALLOWED_DOMAIN}`} value={formData.email} onChange={handleChange}
                className={`w-full px-4 py-3 border rounded-lg bg-slate-800 text-white focus:outline-none focus:ring-2 transition ${errors.email ? 'border-red-500 focus:ring-red-500' : `border-slate-600 ${ringClass}`}`} />
              {errors.email ? (
                <p className="mt-1 text-xs text-red-400">{errors.email}</p>
              ) : currentView === 'signup' && (
                <p className="mt-1.5 ml-1 text-xs text-slate-500 italic">Must be your university email (@cust.pk)</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} name="password" placeholder="••••••••" value={formData.password} onChange={handleChange}
                  className={`w-full px-4 py-3 border rounded-lg bg-slate-800 text-white focus:outline-none focus:ring-2 transition pr-10 ${errors.password ? 'border-red-500 focus:ring-red-500' : `border-slate-600 ${ringClass}`}`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-white">
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password ? (
                 <p className="mt-1 text-xs text-red-400">{errors.password}</p>
              ) : currentView === 'signup' && (
                <p className="mt-1.5 ml-1 text-xs text-slate-500 italic">Min. 8 chars, 1 Upper, 1 Special, 1 Number</p>
              )}
              {currentView === 'login' && (
                <div className="mt-2 text-right">
                  <button type="button" onClick={goToForgotPassword} className={`text-xs font-medium transition-colors ${textAccent}`}>
                    Forgot password?
                  </button>
                </div>
              )}
            </div>

            {currentView === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                <div className="relative">
                  <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange}
                    className={`w-full px-4 py-3 border rounded-lg bg-slate-800 text-white focus:outline-none focus:ring-2 transition pr-10 ${errors.confirmPassword ? 'border-red-500 focus:ring-red-500' : `border-slate-600 ${ringClass}`}`} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-white">
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword}</p>}
              </div>
            )}

            <button type="submit" disabled={loading} className={`w-full py-3 rounded-lg font-semibold text-white transition-all mt-8 bg-gradient-to-r ${gradientClass} disabled:opacity-50`}>
              {loading ? 'Processing...' : currentView === 'login' ? 'Login' : 'Sign up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button type="button" onClick={() => { setCurrentView(currentView === 'login' ? 'signup' : 'login'); setErrors({}); }} className={`text-sm font-semibold transition-colors ${textAccent}`}>
              {currentView === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;