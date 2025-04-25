// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import AccountCreationForm from './components/AccountCreation.jsx';
// import SignUp from './pages/SignUp.jsx';
// import Profile from './pages/Profile.jsx'; // ← we’ll build this soon
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/signup" element={<AccountCreationForm />} />
        {/* <Route path="/signup" element={<SignUp />} /> */}
        {/* <Route path="/profile" element={<Profile />} /> */}
      </Routes>
    </Router>
  </React.StrictMode>,
);
