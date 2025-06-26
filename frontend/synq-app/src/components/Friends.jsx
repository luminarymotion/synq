import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import {
  getFriendsList,
  removeFriendship,
  updateRelationshipCommunity,
  subscribeToFriendsList,
  subscribeToUserStatus,
  subscribeToFriendRequests,
  updateFriendRequest
} from '../services/firebaseOperations';
import FriendSuggestions from './FriendSuggestions';
import UserSearch from './UserSearch';
import SimpleLoading from './SimpleLoading';
import '../styles/Friends.css';

function Friends() {
  const { user } = useUserAuth();
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [removingFriend, setRemovingFriend] = useState({});
  const [processingRequest, setProcessingRequest] = useState({});

  useEffect(() => {
    if (!user) return;
  
    const unsubscribeFriends = subscribeToFriendsList(user.uid, (result) => {
      if (result.success) {
        setFriends(result.friends);
        setLoading(false);
      } else {
        setError(result.error);
        setLoading(false);
      }
    });
  
    const unsubscribeRequests = subscribeToFriendRequests(user.uid, (result) => {
      if (result.success) {
        setFriendRequests(result.requests);
      } else {
        console.error('Error in friend requests subscription:', result.error);
      }
    });
  
    return () => {
      unsubscribeFriends();
      unsubscribeRequests();
    };
  }, [user]);

  const handleFriendRequest = async (requestId, status) => {
    if (!user) {
      setError('You must be logged in to handle friend requests');
      return;
    }

    try {
      setProcessingRequest(prev => ({ ...prev, [requestId]: true }));
      const result = await updateFriendRequest(requestId, status);
      if (result.success) {
        setFriendRequests(prev => prev.filter(req => req.id !== requestId));
      } else {
        setError('Failed to update friend request');
      }
    } catch (err) {
      setError('Error updating friend request');
      console.error(err);
    } finally {
      setProcessingRequest(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleRemoveFriend = async (friendId) => {
    try {
      setRemovingFriend(prev => ({ ...prev, [friendId]: true }));
      const result = await removeFriendship(user.uid, friendId);
      if (!result.success) {
        setError('Failed to remove friend');
      }
    } catch (err) {
      setError('Error removing friend');
      console.error(err);
    } finally {
      setRemovingFriend(prev => ({ ...prev, [friendId]: false }));
    }
  };

  const handleUpdateCommunity = async (relationshipId, communityId, communityRole) => {
    try {
      const result = await updateRelationshipCommunity(
        relationshipId,
        communityId,
        communityRole,
        user.uid
      );
      if (!result.success) {
        setError('Failed to update community');
      }
    } catch (err) {
      setError('Error updating community');
      console.error(err);
    }
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const now = new Date();
    const lastSeen = timestamp.toDate();
    const diff = now - lastSeen;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return lastSeen.toLocaleDateString();
  };

  if (loading) {
    return (
      <SimpleLoading 
        message="Loading your friends..."
        size="large"
      />
    );
  }

  return (
    <div className="friends-page">
      <div className="friends-container">
        {error && (
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            {error}
            <button 
              type="button" 
              className="btn-close" 
              onClick={() => setError(null)}
              aria-label="Close"
            ></button>
          </div>
        )}

        <div className="friends-grid">
          {/* Search Section */}
          <div className="friends-section search-section">
            <div className="card scrollable-card">
              <div className="card-body">
                <h5 className="card-title">
                  <i className="fas fa-search me-2"></i>
                  Search Users
                </h5>
                <div className="scrollable-content">
                  <UserSearch />
                </div>
              </div>
            </div>
          </div>

          {/* Friends List Section */}
          <div className="friends-section friends-list-section">
            <div className="card scrollable-card">
              <div className="card-body">
                <h5 className="card-title">
                  <i className="fas fa-users me-2"></i>
                  Friends
                  {friends.length > 0 && (
                    <span className="badge bg-secondary ms-2">{friends.length}</span>
                  )}
                </h5>
                <div className="scrollable-content">
                  {friends.length === 0 ? (
                    <div className="empty-state">
                      <i className="fas fa-user-friends mb-3"></i>
                      <p>No friends yet</p>
                      <span className="text-muted">Try adding some friends to get started!</span>
                    </div>
                  ) : (
                    <div className="friends-list">
                      {friends.map(friend => (
                        <div key={friend.id} className="friend-item">
                          <div className="friend-content">
                            <img 
                              src={friend.profile.photoURL || '/default-avatar.png'} 
                              alt={friend.profile.displayName}
                              className="friend-avatar"
                            />
                            <div className="friend-info">
                              <h6 className="friend-name">{friend.profile.displayName}</h6>
                              {friend.relationship.communityId && (
                                <span className="badge bg-info">
                                  {friend.relationship.communityRole || 'Member'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="friend-actions">
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleRemoveFriend(friend.id)}
                              disabled={removingFriend[friend.id]}
                            >
                              {removingFriend[friend.id] ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                  Removing...
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-user-minus me-1"></i>
                                  Remove
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Friend Suggestions Section */}
          <div className="friends-section suggestions-section">
            <div className="card scrollable-card">
              <div className="card-body">
                <h5 className="card-title">
                  <i className="fas fa-lightbulb me-2"></i>
                  Suggested Friends
                </h5>
                <div className="scrollable-content">
                  <FriendSuggestions />
                </div>
              </div>
            </div>
          </div>

          {/* Friend Requests Section - Moved to bottom */}
          {friendRequests.length > 0 && (
            <div className="friends-section requests-section">
              <div className="card scrollable-card">
                <div className="card-body">
                  <h5 className="card-title">
                    <i className="fas fa-user-plus me-2"></i>
                    Friend Requests
                    <span className="badge bg-primary ms-2">{friendRequests.length}</span>
                  </h5>
                  <div className="scrollable-content">
                    <div className="friend-requests-list">
                      {friendRequests.map(request => (
                        <div key={request.id} className="friend-request-item">
                          <div className="friend-request-content">
                            <img 
                              src={request.senderProfile.photoURL || '/default-avatar.png'} 
                              alt={request.senderProfile.displayName}
                              className="friend-avatar"
                            />
                            <div className="friend-request-info">
                              <h6 className="friend-name">{request.senderProfile.displayName}</h6>
                              <p className="friend-message text-muted">{request.message}</p>
                            </div>
                          </div>
                          <div className="friend-request-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleFriendRequest(request.id, 'accepted')}
                              disabled={processingRequest[request.id]}
                            >
                              {processingRequest[request.id] ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                  Processing...
                                </>
                              ) : (
                                'Accept'
                              )}
                            </button>
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleFriendRequest(request.id, 'rejected')}
                              disabled={processingRequest[request.id]}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Friends; 