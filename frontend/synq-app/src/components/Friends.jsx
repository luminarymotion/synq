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
  
    // Set up real-time subscriptions
    const unsubscribeFriends = subscribeToFriendsList(user.uid, (result) => {
      if (result.success) {
        setFriends(result.friends);
        setLoading(false);
      } else {
        setError(result.error);
        setLoading(false);
      }
    });
  
    // Set up friend requests subscription
    const unsubscribeRequests = subscribeToFriendRequests(user.uid, (result) => {
      if (result.success) {
        setFriendRequests(result.requests);
      } else {
        console.error('Error in friend requests subscription:', result.error);
      }
    });
  
    // Set up status subscriptions
    const statusUnsubscribers = friends.map(friend => 
      subscribeToUserStatus(friend.id, (result) => {
        if (result.success) {
          setFriends(prevFriends => 
            prevFriends.map(f => 
              f.id === friend.id 
                ? { ...f, isOnline: result.status.isOnline, lastSeen: result.status.lastSeen }
                : f
            )
          );
        }
      })
    );
  
    return () => {
      unsubscribeFriends();
      unsubscribeRequests();
      statusUnsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [user]);

  const handleFriendRequest = async (requestId, status) => {
    try {
      setProcessingRequest(prev => ({ ...prev, [requestId]: true }));
      const result = await updateFriendRequest(requestId, status, user.uid);
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
      <div className="friends-page">
        <div className="friends-container">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Friends</h5>
              <div className="text-center">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="friends-page">
      <div className="friends-container">
        {/* User Search Section */}
        <div className="friends-section">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Search Users</h5>
              <UserSearch />
            </div>
          </div>
        </div>

        {/* Friend Requests Section */}
        {friendRequests.length > 0 && (
          <div className="friends-section">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Friend Requests</h5>
                <div className="list-group">
                  {friendRequests.map(request => (
                    <div key={request.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center">
                          <div className="position-relative me-3">
                            <img 
                              src={request.senderProfile.photoURL || '/default-avatar.png'} 
                              alt={request.senderProfile.displayName}
                              className="rounded-circle"
                              style={{ width: '40px', height: '40px' }}
                            />
                          </div>
                          <div>
                            <h6 className="mb-0">{request.senderProfile.displayName}</h6>
                            <small className="text-muted">{request.senderProfile.email}</small>
                            {request.message && (
                              <p className="mt-1 mb-0 small">{request.message}</p>
                            )}
                          </div>
                        </div>
                        <div className="d-flex gap-2">
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
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Friends List Section */}
        <div className="friends-section">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Friends</h5>
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                  <button 
                    className="btn btn-link"
                    onClick={() => setError(null)}
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {friends.length === 0 ? (
                <p className="text-muted">No friends yet. Try adding some friends!</p>
              ) : (
                <div className="list-group">
                  {friends.map(friend => (
                    <div key={friend.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center">
                          <div className="position-relative me-3">
                            <img 
                              src={friend.profile.photoURL || '/default-avatar.png'} 
                              alt={friend.profile.displayName}
                              className="rounded-circle"
                              style={{ width: '40px', height: '40px' }}
                            />
                            <span 
                              className={`status-indicator ${friend.isOnline ? 'status-online' : 'status-offline'}`}
                            />
                          </div>
                          <div>
                            <h6 className="mb-0">{friend.profile.displayName}</h6>
                            <small className="text-muted">
                              {friend.isOnline 
                                ? 'Online' 
                                : `Last seen ${formatLastSeen(friend.lastSeen)}`}
                            </small>
                            {friend.relationship.communityId && (
                              <div className="mt-1">
                                <span className="badge bg-info">
                                  {friend.relationship.communityRole || 'Member'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="d-flex gap-2">
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
                              'Remove'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Friend Suggestions Section */}
        <div className="friends-section">
          <FriendSuggestions />
        </div>
      </div>
    </div>
  );
}

export default Friends; 