import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { searchUsers, sendFriendRequest, checkFriendshipStatus } from '../services/firebaseOperations';
import SimpleLoading from './SimpleLoading';
import '../styles/UserSearch.css';

function UserSearch({ onSelectFriend }) {
  const { user } = useUserAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sendingRequest, setSendingRequest] = useState({});
  const [searchTimeout, setSearchTimeout] = useState(null);

  useEffect(() => {
    // Clear timeout on unmount
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  const handleSearch = async (term) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Add debounce to search
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      const timeout = setTimeout(async () => {
        const result = await searchUsers(term);
        if (result.success) {
          // Filter out current user and get friendship status for each user
          const usersWithStatus = await Promise.all(
            result.users
              .filter(u => u.id !== user.uid)
              .map(async (userData) => {
                const statusResult = await checkFriendshipStatus(user.uid, userData.id);
                return {
                  ...userData,
                  friendshipStatus: statusResult.success ? 
                    (statusResult.areFriends ? 'friends' : 'not_friends') : 
                    'unknown'
                };
              })
          );
          setSearchResults(usersWithStatus);
        } else {
          setError('Failed to search users');
        }
        setLoading(false);
      }, 300); // 300ms debounce

      setSearchTimeout(timeout);
    } catch (err) {
      console.error('Error searching users:', err);
      setError('Error searching users');
      setLoading(false);
    }
  };

  const handleAddFriend = async (userId) => {
    if (!user) return;

    try {
      setSendingRequest(prev => ({ ...prev, [userId]: true }));
      
      // Check if already friends
      const statusResult = await checkFriendshipStatus(user.uid, userId);
      if (statusResult.success && statusResult.areFriends) {
        setSearchResults(prev => 
          prev.map(u => 
            u.id === userId 
              ? { ...u, friendshipStatus: 'friends' }
              : u
          )
        );
        return;
      }

      // Send friend request
      const result = await sendFriendRequest({
        senderId: user.uid,
        receiverId: userId,
        message: "Let's be friends!"
      });
      
      if (result.success) {
        setSearchResults(prev => 
          prev.map(u => 
            u.id === userId 
              ? { ...u, friendshipStatus: 'pending' }
              : u
          )
        );
      } else {
        setError('Failed to send friend request');
      }
    } catch (err) {
      console.error('Error sending friend request:', err);
      setError('Error sending friend request');
    } finally {
      setSendingRequest(prev => ({ ...prev, [userId]: false }));
    }
  };

  const getActionButton = (user) => {
    // If onSelectFriend is provided, show select button for friends
    if (onSelectFriend && user.friendshipStatus === 'friends') {
      return (
        <button
          className="btn btn-success btn-sm"
          onClick={() => onSelectFriend(user)}
        >
          <i className="fas fa-plus me-2"></i>
          Select
        </button>
      );
    }

    switch (user.friendshipStatus) {
      case 'friends':
        return (
          <span className="status-badge friends">
            <i className="fas fa-check"></i>
            Friends
          </span>
        );
      case 'pending':
        return (
          <span className="status-badge pending">
            <i className="fas fa-clock"></i>
            Request Sent
          </span>
        );
      case 'not_friends':
        return (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleAddFriend(user.id)}
            disabled={sendingRequest[user.id]}
          >
            {sendingRequest[user.id] ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Sending...
              </>
            ) : (
              <>
                <i className="fas fa-user-plus me-2"></i>
                Add Friend
              </>
            )}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="user-search-container">
      <div className="search-box">
        <div className="input-group">
          <span className="input-group-text">
            <i className="fas fa-search"></i>
          </span>
          <input
            type="text"
            className="form-control"
            placeholder="Search users by name or email..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              handleSearch(e.target.value);
            }}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-danger mt-3" role="alert">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center mt-3">
          <SimpleLoading 
            message="Searching users..."
            size="small"
          />
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="search-results mt-3">
          {searchResults.map(user => (
            <div key={user.id} className="user-card">
              <div className="user-info">
                <img 
                  src={user.profile?.photoURL || '/default-avatar.png'} 
                  alt={user.profile?.displayName || 'User'} 
                  className="user-avatar"
                />
                <div className="user-details">
                  <h6 className="user-name">{user.profile?.displayName || 'Unknown User'}</h6>
                  <small className="text-muted">{user.profile?.email || 'No email'}</small>
                </div>
              </div>
              {getActionButton(user)}
            </div>
          ))}
        </div>
      )}

      {searchTerm && !loading && searchResults.length === 0 && (
        <div className="text-center mt-3 text-muted">
          <i className="fas fa-search mb-2" style={{ fontSize: '2rem' }}></i>
          <p>No users found matching "{searchTerm}"</p>
        </div>
      )}
    </div>
  );
}

export default UserSearch; 