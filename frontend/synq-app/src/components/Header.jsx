import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUserAuth } from '../services/auth';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import useLocation from '../hooks/useLocation';
import '../styles/Header.css';

function Header() {
  const { user } = useUserAuth();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);
  const groupDropdownRef = useRef(null);
  const { isTracking, startTracking, stopTracking, error } = useLocation();

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Handle user settings dropdown
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      // Handle group dropdown
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(event.target)) {
        setIsGroupDropdownOpen(false);
      }
    };

    // Add click listener to document
    document.addEventListener('click', handleClickOutside, true);
    
    // Cleanup
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Toggle group dropdown handler
  const toggleGroupDropdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGroupDropdownOpen(prev => !prev);
  };

  // Handle dropdown item click
  const handleDropdownItemClick = (e) => {
    e.stopPropagation();
    setIsGroupDropdownOpen(false);
  };

  // Toggle user dropdown handler
  const toggleUserDropdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropdownOpen(!isDropdownOpen);
  };

  // Handle location tracking toggle
  const handleLocationToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        {/* Logo */}
        <Link to={user ? "/dashboard" : "/"} className="logo">
          <span className="logo-text">SYNQ</span>
        </Link>

        {/* Navigation Tabs - Only show when user is authenticated */}
        {user && (
          <>
        <nav className="nav-tabs">
          <Link to="/dashboard" className="nav-tab">
            Dashboard
          </Link>
          
          <Link to="/friends" className="nav-tab">
            Friends
          </Link>
          
          <Link to="/rides" className="nav-tab">
            Rides
          </Link>
          
          <div className="dropdown nav-tab-wrapper" ref={groupDropdownRef}>
            <button 
              type="button"
              onClick={toggleGroupDropdown}
              className={`nav-tab ${isGroupDropdownOpen ? 'active' : ''}`}
              aria-expanded={isGroupDropdownOpen}
              aria-haspopup="true"
            >
              Make a Group
              <i className={`fas fa-chevron-${isGroupDropdownOpen ? 'up' : 'down'} ms-2`}></i>
            </button>
            <div 
              className={`dropdown-menu ${isGroupDropdownOpen ? 'show' : ''}`}
              onClick={handleDropdownItemClick}
            >
              <Link 
                to="/create-group" 
                className="dropdown-item"
                onClick={handleDropdownItemClick}
              >
                <i className="fas fa-plus-circle"></i>
                <span>Create New Group</span>
              </Link>
              <Link 
                to="/join-group" 
                className="dropdown-item"
                onClick={handleDropdownItemClick}
              >
                <i className="fas fa-sign-in-alt"></i>
                <span>Join Existing Group</span>
              </Link>
            </div>
          </div>
        </nav>

            {/* User Settings */}
            <div className="user-settings" ref={userDropdownRef}>
              <button 
                className="user-button"
                onClick={toggleUserDropdown}
                aria-expanded={isDropdownOpen}
                aria-haspopup="true"
              >
                {user?.displayName || user?.email}
                <i className={`fas fa-chevron-${isDropdownOpen ? 'up' : 'down'}`}></i>
              </button>
              
              {isDropdownOpen && (
                <div className="settings-dropdown">
                  <Link to="/settings" className="dropdown-item" onClick={() => setIsDropdownOpen(false)}>
                    <i className="fas fa-sliders-h"></i>
                    <span>Settings</span>
                  </Link>
                  
                  <div className="dropdown-item location-toggle-wrapper">
                    <div className="location-toggle-content">
                      <i className={`fas fa-${isTracking ? 'location-arrow' : 'location-slash'}`}></i>
                      <span>Location Tracking</span>
                    </div>
                    <label className="modern-toggle">
                      <input
                        type="checkbox"
                        checked={isTracking}
                        onChange={handleLocationToggle}
                      />
                      <span className="toggle-slider"></span>
                      {isTracking && <span className="tracking-indicator"></span>}
                    </label>
                  </div>

                  <button 
                    className="dropdown-item logout"
                    onClick={handleLogout}
                  >
                    <i className="fas fa-sign-out-alt"></i>
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export default Header; 