import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the login page brand heading at the root route', () => {
  // App.js wraps everything in its own BrowserRouter, and "/" renders Login,
  // which shows the "FYP Idea Generator" heading on its default (login) view.
  render(<App />);
  const heading = screen.getByText(/FYP Idea Generator/i);
  expect(heading).toBeInTheDocument();
});
