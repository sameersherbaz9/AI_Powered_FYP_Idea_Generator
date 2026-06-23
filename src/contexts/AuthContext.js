import React, { createContext, useState, useContext, useEffect } from 'react';
import { authAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import wsService from '../services/websocket';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData);
        // We delay the WS connection to useEffect since it might depend on browser APIs 
        // that are better called after initial render, though state is set synchronously.
        return parsedUser;
      } catch (e) {
        console.error('Failed to parse stored user data', e);
        localStorage.clear();
      }
    }
    return null;
  });

  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      wsService.connect(token);
    }

    const handleUnauthorized = () => logout();
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      wsService.disconnect();
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (email, password) => {
    try {
      const data = await authAPI.login(email, password);
      if (data && data.success) {
        const { token, user } = data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        wsService.connect(token);
        navigate('/student/dashboard');
        return { success: true, user, message: 'Login successful' };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  /**
   * Step 1: Send OTP to the user's @cust.pk email.
   * Returns { success: true, requiresVerification: true } on success.
   */
  const sendOTP = async (userData) => {
    try {
      const data = await authAPI.sendOTP(userData);
      if (data && data.success) {
        return { success: true, requiresVerification: true, message: data.message };
      } else {
        return { success: false, error: data.error || 'Failed to send verification email' };
      }
    } catch (error) {
      console.error('Send OTP error:', error);
      return { success: false, error: error.message || 'Failed to send verification email' };
    }
  };

  /**
   * Step 2: Submit OTP + registration data to create the account.
   * Uses the token returned by the register endpoint to avoid a
   * redundant second login request.
   */
  const register = async (userData) => {
    try {
      const data = await authAPI.register(userData);
      if (data && data.success) {
        const { token, user } = data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        wsService.connect(token);
        navigate('/student/dashboard');
        return { success: true, user, message: 'Registration successful' };
      } else {
        return { success: false, error: data.error || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: error.message || 'Registration failed' };
    }
  };

  const logout = () => {
    wsService.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/');
  };

  /**
   * Step 1 of password reset: request a reset link be emailed.
   * Always resolves with success (the backend hides whether the email exists).
   */
  const forgotPassword = async (email) => {
    try {
      const data = await authAPI.forgotPassword(email);
      return { success: true, message: data.message };
    } catch (error) {
      console.error('Forgot password error:', error);
      return { success: false, error: error.message || 'Failed to send reset email' };
    }
  };

  /**
   * Step 2 of password reset: submit the token from the email link
   * along with a new password.
   */
  const resetPassword = async (token, email, password) => {
    try {
      const data = await authAPI.resetPassword(token, email, password);
      if (data && data.success) {
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || 'Failed to reset password' };
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, error: error.message || 'Failed to reset password' };
    }
  };

  const updateUser = (updatedUserData) => {
    localStorage.setItem('user', JSON.stringify(updatedUserData));
    setUser(updatedUserData);
  };

  const value = {
    user,
    login,
    sendOTP,
    register,
    logout,
    updateUser,
    forgotPassword,
    resetPassword,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
