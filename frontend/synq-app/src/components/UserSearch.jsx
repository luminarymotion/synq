import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { searchUsers, sendFriendRequest, checkFriendshipStatus } from '../services/firebaseOperations';
import SimpleLoading from './SimpleLoading';
import '../styles/UserSearch.css';
import { Box } from '@mui/material';

function UserSearch({ onSelectFriend, onlyShowFriends = false }) {
  const { user } = useUserAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sendingRequest, setSendingRequest] = useState({});
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Ghibli-inspired earthy palette
  const palette = {
    bg: '#f5f3e7', // warm cream
    card: '#f9f6ef', // lighter cream
    accent: '#b5c99a', // soft green
    accent2: '#a47551', // brown
    accent3: '#e2b07a', // muted gold
    text: '#4e342e', // deep brown
    textSoft: '#7c5e48',
    border: '#e0c9b3',
    friendBg: '#e6ede3', // pale green
    requestBg: '#f6e7d7', // pale tan
  };

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
    <Box sx={{ background: palette.bg, borderRadius: 3, p: { xs: 2, md: 3 }, boxShadow: 0 }}>
      <Box sx={{ background: palette.card, borderRadius: 3, p: { xs: 2, md: 3 }, boxShadow: '0 2px 12px 0 #e0c9b3' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box sx={{ mr: 2, color: palette.textSoft }}>
            <i className="fas fa-search" style={{ fontSize: 20 }}></i>
          </Box>
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              handleSearch(e.target.value);
            }}
            className="user-search-input"
          />
        </Box>
        {/* Filter results if onlyShowFriends is true */}
        {(loading && <SimpleLoading />) || (
          <div className="user-search-results">
            {(onlyShowFriends
              ? searchResults.filter(u => u.friendshipStatus === 'friends')
              : searchResults
            ).map(user => (
              <div key={user.id} className="user-search-result-card">
                <div className="user-info">
                  <img src={user.profile?.photoURL || user.photoURL || '/default-avatar.png'} alt={user.profile?.displayName || user.displayName || user.email} className="user-avatar" />
                  <div className="user-details">
                    <span className="user-name">{user.profile?.displayName || user.displayName || user.email}</span>
                    <span className="user-email">{user.profile?.email || user.email}</span>
                  </div>
                </div>
                <div className="user-action">{getActionButton(user)}</div>
              </div>
            ))}
            {/* Show empty state if no results */}
            {((onlyShowFriends
              ? searchResults.filter(u => u.friendshipStatus === 'friends')
              : searchResults
            ).length === 0 && !loading) && (
              <div className="user-search-empty">No friends found.</div>
            )}
          </div>
        )}
        {error && <div className="user-search-error">{error}</div>}
      </Box>
    </Box>
  );
}

export default UserSearch; 