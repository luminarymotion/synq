import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import '../styles/Header.css';

function Header() {
  const { user } = useUserAuth();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const groupDropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(event.target)) {
        setIsGroupDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        {/* Logo */}
        <Link to="/dashboard" className="logo">
          <span className="logo-text">SYNQ</span>
        </Link>

        {/* Navigation Tabs */}
        <nav className="nav-tabs">
          <Link to="/dashboard" className="nav-tab">
            Dashboard
          </Link>
          
          <Link to="/friends" className="nav-tab">
            SynqMap
          </Link>
          
          <div className="nav-tab dropdown" ref={groupDropdownRef}>
            <button onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}>
              Make a Group
              <i className="bi bi-chevron-down ms-1"></i>
            </button>
            <div className={`dropdown-menu ${isGroupDropdownOpen ? 'show' : ''}`}>
              <Link to="/create-group" className="dropdown-item">
                Create New Group
              </Link>
              <Link to="/join-group" className="dropdown-item">
                Join Existing Group
              </Link>
            </div>
          </div>

        </nav>

        {/* User Settings */}
        <div className="user-settings" ref={dropdownRef}>
          <button 
            className="user-button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {user?.displayName || user?.email}
          </button>
          
          {isDropdownOpen && (
            <div className="settings-dropdown">
              <Link to="/profile" className="dropdown-item">
                Profile Settings
              </Link>
              <Link to="/account" className="dropdown-item">
                Account Settings
              </Link>
              <button 
                className="dropdown-item logout"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header; 