import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import {
  getFriendsList,
  getFriendRequests,
  sendFriendRequest,
  updateFriendRequest,
  searchUsers
} from '../services/firebaseOperations';

function Friends() {
  const { user } = useUserAuth();
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load friends and friend requests
  useEffect(() => {
    const loadFriendsData = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const [friendsResult, requestsResult] = await Promise.all([
          getFriendsList(user.uid),
          getFriendRequests(user.uid)
        ]);

        if (friendsResult.success) {
          setFriends(friendsResult.friends);
        }
        if (requestsResult.success) {
          setFriendRequests(requestsResult.requests);
        }
      } catch (err) {
        setError('Failed to load friends data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadFriendsData();
  }, [user]);

  // Handle friend request search
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      const result = await searchUsers(searchTerm);
      if (result.success) {
        // Filter out current user and existing friends
        const filteredResults = result.users.filter(
          user => 
            user.id !== user.uid && 
            !friends.some(friend => friend.id === user.id) &&
            !friendRequests.some(request => 
              (request.senderId === user.id || request.receiverId === user.id) &&
              request.status === 'pending'
            )
        );
        setSearchResults(filteredResults);
      } else {
        setError('Failed to search users');
      }
    } catch (err) {
      setError('Failed to search users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Send friend request
  const handleSendRequest = async (receiverId) => {
    try {
      const result = await sendFriendRequest(user.uid, receiverId);
      if (result.success) {
        setSearchResults(prev => 
          prev.filter(user => user.id !== receiverId)
        );
      }
    } catch (err) {
      setError('Failed to send friend request');
      console.error(err);
    }
  };

  // Handle friend request response
  const handleRequestResponse = async (requestId, status) => {
    try {
      const result = await updateFriendRequest(requestId, status);
      if (result.success) {
        setFriendRequests(prev => 
          prev.filter(request => request.id !== requestId)
        );
        if (status === 'accepted') {
          // Reload friends list
          const friendsResult = await getFriendsList(user.uid);
          if (friendsResult.success) {
            setFriends(friendsResult.friends);
          }
        }
      }
    } catch (err) {
      setError('Failed to update friend request');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="friends-container">
        <div className="loading-spinner">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="friends-container">
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
          <button 
            type="button" 
            className="btn-close float-end" 
            onClick={() => setError(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Friend Requests Section */}
      {friendRequests.length > 0 && (
        <div className="friend-requests-section mb-4">
          <h3>Friend Requests</h3>
          <div className="friend-requests-list">
            {friendRequests.map(request => (
              <div key={request.id} className="friend-request-card">
                <div className="user-info">
                  <img 
                    src={request.senderPhotoURL || '/default-avatar.png'} 
                    alt="Profile" 
                    className="avatar"
                  />
                  <div className="user-details">
                    <span className="user-name">{request.senderName || 'Unknown User'}</span>
                    <span className="user-email">{request.senderEmail}</span>
                  </div>
                </div>
                <div className="request-actions">
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleRequestResponse(request.id, 'accepted')}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRequestResponse(request.id, 'rejected')}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Section */}
      <div className="search-section mb-4">
        <form onSubmit={handleSearch} className="search-form">
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={loading}
            />
            <button 
              className="btn btn-primary" 
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {searchResults.length > 0 && (
          <div className="search-results mt-3">
            {searchResults.map(user => (
              <div key={user.id} className="search-result-card">
                <div className="user-info">
                  <img 
                    src={user.photoURL || '/default-avatar.png'} 
                    alt="Profile" 
                    className="avatar"
                  />
                  <div className="user-details">
                    <span className="user-name">{user.displayName || 'Unknown User'}</span>
                    <span className="user-email">{user.email}</span>
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSendRequest(user.id)}
                  disabled={loading}
                >
                  Add Friend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friends List Section */}
      <div className="friends-list-section">
        <h3>Friends</h3>
        {friends.length === 0 ? (
          <p className="text-muted">No friends yet. Start adding some!</p>
        ) : (
          <div className="friends-list">
            {friends.map(friend => (
              <div key={friend.id} className="friend-card">
                <div className="user-info">
                  <img 
                    src={friend.photoURL || '/default-avatar.png'} 
                    alt="Profile" 
                    className="avatar"
                  />
                  <div className="user-details">
                    <span className="user-name">{friend.displayName || 'Unknown User'}</span>
                    <span className="user-email">{friend.email}</span>
                    <span className="friend-status">
                      {friend.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => {/* TODO: Implement invite to ride */}}
                >
                  Invite to Ride
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .friends-container {
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
        }

        .loading-spinner {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 200px;
        }

        .friend-request-card,
        .search-result-card,
        .friend-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          margin-bottom: 12px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .friend-request-card:hover,
        .search-result-card:hover,
        .friend-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #e9ecef;
        }

        .user-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .user-name {
          font-weight: 600;
          color: #333;
          font-size: 1.1em;
        }

        .user-email {
          color: #666;
          font-size: 0.9em;
        }

        .friend-status {
          font-size: 0.8em;
          padding: 2px 8px;
          border-radius: 12px;
          background: #e9ecef;
          color: #495057;
          display: inline-block;
          margin-top: 4px;
        }

        .request-actions {
          display: flex;
          gap: 8px;
        }

        .search-form {
          margin-bottom: 20px;
        }

        .search-form .input-group {
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .search-form .form-control {
          border-right: none;
        }

        .search-form .btn {
          border-left: none;
          padding-left: 20px;
          padding-right: 20px;
        }

        .friends-list,
        .friend-requests-list,
        .search-results {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .btn-close {
          padding: 0.5rem;
          margin: -0.5rem -0.5rem -0.5rem auto;
        }

        @media (max-width: 576px) {
          .friend-request-card,
          .search-result-card,
          .friend-card {
            flex-direction: column;
            gap: 12px;
            text-align: center;
            padding: 12px;
          }

          .user-info {
            flex-direction: column;
            gap: 8px;
          }

          .user-details {
            align-items: center;
          }

          .request-actions {
            width: 100%;
            justify-content: center;
          }

          .avatar {
            width: 64px;
            height: 64px;
          }
        }
      `}</style>
    </div>
  );
}

export default Friends; 