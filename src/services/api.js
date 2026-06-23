import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/** Redirect to login on 401 (expired or invalid token). */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

const withErrorHandling = async (apiCall) => {
  try {
    const response = await apiCall;
    return response.data;
  } catch (error) {
    console.error('API Error:', error);

    if (error.response) {
      const { status, data } = error.response;
      const messages = {
        400: data?.error || 'Bad request. Please check your input.',
        401: 'Session expired. Please login again.',
        403: 'You do not have permission to perform this action.',
        404: 'Resource not found.',
        429: data?.error || 'Too many requests. Please try again later.',
        500: data?.error || 'Server error. Please try again later.',
      };
      const message = messages[status] || data?.error || 'An error occurred.';
      const err = new Error(message);
      err.response = error.response;
      err.status = status;
      throw err;
    } else if (error.request) {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw new Error('An unexpected error occurred.');
    }
  }
};

export const authAPI = {
  login: (email, password) => withErrorHandling(api.post('/login', { email, password })),
  sendOTP: (userData) => withErrorHandling(api.post('/register/send-otp', userData)),
  register: (userData) => withErrorHandling(api.post('/register', userData)),
  forgotPassword: (email) => withErrorHandling(api.post('/forgot-password', { email })),
  resetPassword: (token, email, password) => withErrorHandling(api.post('/reset-password', { token, email, password })),
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return Promise.resolve();
  },
};

export const studentAPI = {
  getProfile:      (userId)           => withErrorHandling(api.get(`/students/${userId}/profile`)),
  updateProfile:   (userId, data)     => withErrorHandling(api.put(`/students/${userId}/profile`, data)),
  chatAboutIdea:   (userId, payload)  => withErrorHandling(api.post(`/students/${userId}/ideas/chat`, payload)),
  generateIdeas:   (userId, criteria) => withErrorHandling(api.post(`/students/${userId}/ideas/generate`, criteria)),
  getSavedIdeas:   (userId)           => withErrorHandling(api.get(`/students/${userId}/ideas/saved`)),
  saveIdea:        (userId, ideaData) => withErrorHandling(api.post(`/students/${userId}/ideas/save`, ideaData)),
  deleteSavedIdea: (ideaId)           => withErrorHandling(api.delete(`/ideas/saved/${ideaId}`)),

  getProjects:              (userId)            => withErrorHandling(api.get(`/students/${userId}/projects`)),
  saveProject:              (userId, data)      => withErrorHandling(api.post(`/students/${userId}/projects`, data)),
  updateProject:            (projectId, data)   => withErrorHandling(api.put(`/students/projects/${projectId}`, data)),
  deleteProject:            (projectId)         => withErrorHandling(api.delete(`/students/projects/${projectId}`)),
  checkProfileCompletion:   (userId)            => withErrorHandling(api.get(`/students/${userId}/profile-completion`)),
  generateIdeasWithHistory: (userId)            => withErrorHandling(api.post(`/students/${userId}/ideas/generate-with-history`, {})),
};

export default api;
