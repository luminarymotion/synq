// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
// MUI theme imports
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#f9f6f2',   // warm off-white
      paper: '#fffaf6',     // very light beige for cards
    },
    primary: {
      main: '#b08968',      // warm brown/tan
      contrastText: '#fff',
    },
    secondary: {
      main: '#e2b07a',      // muted gold/soft orange
      contrastText: '#4e342e',
    },
    text: {
      primary: '#4e342e',   // deep brown
      secondary: '#7c5e48', // lighter brown
    },
    divider: '#e0c9b3',     // light tan divider
  },
  typography: {
    fontFamily: 'Inter, Roboto, Arial, sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 500 },
    h6: { fontWeight: 500 },
  },
  shape: {
    borderRadius: 14,
  },
});

// Add global style to ensure full height
const style = document.createElement('style');
style.innerHTML = `
  html, body, #root {
    height: 100%;
    min-height: 100vh;
    margin: 0;
    padding: 0;
    width: 100vw;
    box-sizing: border-box;
  }
  .App {
    min-height: 100vh;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
