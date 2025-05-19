import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import {
  subscribeToFriendRequests,
  subscribeToFriendsList,
  subscribeToUserStatus,
  updateUserOnlineStatus,
  sendFriendRequest,
  updateFriendRequest,
  searchUsers,
  removeFriendship,
  updateFriendshipMetadata
} from '../services/firebaseOperations';
import FriendSuggestions from './FriendSuggestions';
import '../styles/Friends.css'; // We'll create this file next

function Friends() {
  const { user } = useUserAuth();
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [friendStatuses, setFriendStatuses] = useState({});
  const [hoveredFriend, setHoveredFriend] = useState(null);
  const [sendingRequest, setSendingRequest] = useState({});
  const [showFriendDetails, setShowFriendDetails] = useState(null);
  const [requestError, setRequestError] = useState(null);

  // Add the missing getTrustScoreColor function
  const getTrustScoreColor = (score) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-primary';
    if (score >= 40) return 'text-warning';
    return 'text-danger';
  };

  // Set up real-time listeners for friends and friend requests
  useEffect(() => {
    if (!user) return;

    let unsubscribeRequests;
    let unsubscribeFriends;
    const statusUnsubscribes = new Map();

    const setupListeners = async () => {
      try {
        setLoading(true);

        // Subscribe to friend requests
        unsubscribeRequests = subscribeToFriendRequests(user.uid, (result) => {
          if (result.success) {
            setFriendRequests(result.requests);
            setError(null); // Clear any existing error since the request was successful
          } else if (result.error) {
            // Check if it's an index building error
            if (result.error.code === 'failed-precondition' && 
                result.error.message.includes('index') && 
                result.error.message.includes('building')) {
              // Don't show an error for index building, just log it
              console.log('Index is still building, using fallback query');
              setError(null);
            } else {
              // For other errors, show the error message
              setError('Failed to load friend requests');
              console.error(result.error);
            }
          }
        });

        // Subscribe to friends list
        unsubscribeFriends = subscribeToFriendsList(user.uid, (result) => {
          if (result.success) {
            setFriends(result.friends);
            
            // Set up status listeners for each friend
            result.friends.forEach(friend => {
              // Clean up existing listener if any
              if (statusUnsubscribes.has(friend.id)) {
                statusUnsubscribes.get(friend.id)();
              }

              // Set up new listener
              const unsubscribe = subscribeToUserStatus(friend.id, (statusResult) => {
                if (statusResult.success) {
                  setFriendStatuses(prev => ({
                    ...prev,
                    [friend.id]: statusResult.status
                  }));
                }
              });
              statusUnsubscribes.set(friend.id, unsubscribe);
            });
          } else {
            setError('Failed to load friends list');
            console.error(result.error);
          }
        });

        // Set up online status for current user
        const updateStatus = async () => {
          await updateUserOnlineStatus(user.uid, true);
        };
        updateStatus();

        // Handle window visibility change
        const handleVisibilityChange = async () => {
          if (document.visibilityState === 'visible') {
            await updateUserOnlineStatus(user.uid, true);
          } else {
            await updateUserOnlineStatus(user.uid, false);
          }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Handle beforeunload
        const handleBeforeUnload = async () => {
          await updateUserOnlineStatus(user.uid, false);
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        setLoading(false);

        // Cleanup function
        return () => {
          if (unsubscribeRequests) unsubscribeRequests();
          if (unsubscribeFriends) unsubscribeFriends();
          statusUnsubscribes.forEach(unsubscribe => unsubscribe());
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('beforeunload', handleBeforeUnload);
          updateUserOnlineStatus(user.uid, false);
        };
      } catch (err) {
        setError('Failed to set up real-time listeners');
        console.error(err);
        setLoading(false);
      }
    };

    setupListeners();
  }, [user]);

  // Fix the search filter to use the correct user reference
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const result = await searchUsers(searchTerm);
      if (result.success) {
        // Filter out current user and existing friends
        const filteredResults = result.users.filter(
          u => 
            u.id !== user.uid && 
            !friends.some(friend => friend.id === u.id) &&
            !friendRequests.some(request => 
              (request.senderId === u.id || request.receiverId === u.id) &&
              request.status === 'pending'
            )
        );
        setSearchResults(filteredResults);
      } else {
        setError('Failed to search users');
      }
    } catch (err) {
      setError('Error searching users');
      console.error(err);
    }
  };

  // Handle sending friend request
  const handleSendRequest = async (receiverId) => {
    try {
      setSendingRequest(prev => ({ ...prev, [receiverId]: true }));
      const result = await sendFriendRequest(user.uid, receiverId);
      if (result.success) {
        // Remove the user from search results after successful request
        setSearchResults(prev => prev.filter(user => user.id !== receiverId));
      } else {
        setError('Failed to send friend request');
      }
    } catch (err) {
      setError('Error sending friend request');
      console.error(err);
    } finally {
      setSendingRequest(prev => ({ ...prev, [receiverId]: false }));
    }
  };

  // Handle accepting friend request
  const handleAcceptRequest = async (requestId) => {
    try {
      setRequestError(null);
      const result = await updateFriendRequest(requestId, 'accepted');
      if (result.success) {
        // Remove the request from the local state
        setFriendRequests(prev => prev.filter(request => request.id !== requestId));
      } else {
        setRequestError('Failed to accept friend request');
      }
    } catch (err) {
      setRequestError('Error accepting friend request');
      console.error(err);
    }
  };

  // Handle rejecting friend request
  const handleRejectRequest = async (requestId) => {
    try {
      setRequestError(null);
      const result = await updateFriendRequest(requestId, 'rejected');
      if (result.success) {
        // Remove the request from the local state
        setFriendRequests(prev => prev.filter(request => request.id !== requestId));
      } else {
        setRequestError('Failed to reject friend request');
      }
    } catch (err) {
      setRequestError('Error rejecting friend request');
      console.error(err);
    }
  };

  // Handle unfriending
  const handleUnfriend = async (friendId) => {
    try {
      const result = await removeFriendship(user.uid, friendId);
      if (!result.success) {
        setError('Failed to remove friend');
      }
      // The friends list will update automatically through the real-time listener
    } catch (err) {
      setError('Error removing friend');
      console.error(err);
    }
  };

  // Handle invite to ride (placeholder for now)
  const handleInviteToRide = (friendId) => {
    // TODO: Implement ride invitation
    console.log('Inviting friend to ride:', friendId);
  };

  // Format last seen timestamp
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  // Handle updating friend preferences
  const handleUpdatePreferences = async (friendId, preferences) => {
    try {
      const result = await updateFriendshipMetadata(user.uid, friendId, {
        'metadata.preferences': preferences
      });
      if (!result.success) {
        setError('Failed to update preferences');
      }
    } catch (err) {
      setError('Error updating preferences');
      console.error(err);
    }
  };

  // Calculate reliability score
  const calculateReliabilityScore = (friend) => {
    const stats = friend.metadata?.groupRideStats;
    if (!stats) return 0;

    const totalRides = stats.totalRides;
    if (totalRides === 0) return 0;

    // Weight different factors
    const driverRatio = stats.asDriver / totalRides;
    const passengerRatio = stats.asPassenger / totalRides;
    const baseScore = 50;

    // Adjust score based on participation balance
    let score = baseScore;
    score += (driverRatio * 25); // Up to 25 points for being a driver
    score += (passengerRatio * 25); // Up to 25 points for being a passenger

    return Math.min(Math.round(score), 100);
  };

  if (loading) {
    return <div className="text-center mt-5">Loading...</div>;
  }

  return (
    <div className="container mt-4" style={{ 
      minHeight: 'calc(100vh - 200px)', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ width: '100%', maxWidth: '800px' }}>
        {error && (
          <div className="alert alert-danger mb-4" role="alert">
            {error}
            <button 
              className="btn btn-link"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Friend Suggestions Section */}
        <div className="mb-4">
          <FriendSuggestions />
        </div>

        {/* Search Section */}
        <div className="card mb-4">
          <div className="card-body">
            <h5 className="card-title">Find Friends</h5>
            <form onSubmit={handleSearch} className="d-flex gap-2">
              <input
                type="text"
                className="form-control"
                placeholder="Search by name or email"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                Search
              </button>
            </form>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-3">
                <h6>Search Results</h6>
                <div className="list-group">
                  {searchResults.map(user => (
                    <div key={user.id} className="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-0">{user.displayName}</h6>
                        <small className="text-muted">{user.email}</small>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSendRequest(user.id)}
                        disabled={sendingRequest[user.id]}
                      >
                        {sendingRequest[user.id] ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Sending...
                          </>
                        ) : (
                          'Add Friend'
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Friend Requests Section */}
        {friendRequests.length > 0 && (
          <div className="card mb-4">
            <div className="card-body">
              <h5 className="card-title">Friend Requests</h5>
              {requestError && (
                <div className="alert alert-danger mb-3" role="alert">
                  {requestError}
                  <button 
                    className="btn btn-link"
                    onClick={() => setRequestError(null)}
                  >
                    Dismiss
                  </button>
                </div>
              )}
              <div className="list-group">
                {friendRequests.map(request => (
                  <div key={request.id} className="list-group-item">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-0">{request.senderName || 'Unknown User'}</h6>
                        <small className="text-muted">{request.senderEmail}</small>
                      </div>
                      <div className="btn-group">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleAcceptRequest(request.id)}
                        >
                          Accept
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRejectRequest(request.id)}
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
        )}

        {/* Friends List Section */}
        <div className="card">
          <div className="card-body">
            <h5 className="card-title">Friends</h5>
            {friends.length === 0 ? (
              <p className="text-muted">No friends yet. Start by searching for users or check out the suggestions above!</p>
            ) : (
              <div className="list-group">
                {friends.map(friend => (
                  <div 
                    key={friend.id} 
                    className="list-group-item friend-item"
                    onMouseEnter={() => setHoveredFriend(friend.id)}
                    onMouseLeave={() => {
                      setHoveredFriend(null);
                      setShowFriendDetails(null);
                    }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="flex-grow-1">
                        <h6 className="mb-0">
                          {friend.displayName}
                          <span className={`ms-2 badge ${friendStatuses[friend.id]?.isOnline ? 'bg-success' : 'bg-secondary'}`}>
                            {friendStatuses[friend.id]?.isOnline ? 'Online' : 'Offline'}
                          </span>
                          {friend.metadata && (
                            <span className={`ms-2 badge ${getTrustScoreColor(calculateReliabilityScore(friend))}`}>
                              Reliability: {calculateReliabilityScore(friend)}%
                            </span>
                          )}
                        </h6>
                        <small className="text-muted">
                          {friend.email}
                          {!friendStatuses[friend.id]?.isOnline && friendStatuses[friend.id]?.lastSeen && (
                            <span className="ms-2">
                              Last seen: {formatLastSeen(friendStatuses[friend.id].lastSeen)}
                            </span>
                          )}
                        </small>
                        {friend.metadata && (
                          <div className="friend-stats mt-2">
                            <small>
                              Rides shared: {friend.metadata.ridesShared || 0} |
                              Mutual friends: {friend.metadata.mutualFriends || 0}
                            </small>
                          </div>
                        )}
                      </div>
                      <div className="d-flex align-items-center">
                        {hoveredFriend === friend.id && (
                          <div className="friend-actions">
                            <button
                              className="btn btn-outline-primary btn-sm me-2"
                              onClick={() => setShowFriendDetails(showFriendDetails === friend.id ? null : friend.id)}
                            >
                              Details
                            </button>
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => {
                                if (window.confirm('Are you sure you want to remove this friend?')) {
                                  handleUnfriend(friend.id);
                                }
                              }}
                            >
                              Unfriend
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Friend Details Section */}
                    {showFriendDetails === friend.id && friend.metadata && (
                      <div className="friend-details mt-3 p-3 border-top">
                        <h6>Friend Details</h6>
                        <div className="row">
                          <div className="col-md-6">
                            <h6 className="mb-2">Ride Statistics</h6>
                            <ul className="list-unstyled">
                              <li>Total Rides: {friend.metadata.groupRideStats?.totalRides || 0}</li>
                              <li>As Driver: {friend.metadata.groupRideStats?.asDriver || 0}</li>
                              <li>As Passenger: {friend.metadata.groupRideStats?.asPassenger || 0}</li>
                            </ul>
                          </div>
                          <div className="col-md-6">
                            <h6 className="mb-2">Preferences</h6>
                            <ul className="list-unstyled">
                              <li>Communication: {friend.metadata.preferences?.communicationPreference || 'app'}</li>
                              <li>Music: {friend.metadata.preferences?.ridePreferences?.music ? 'Yes' : 'No'}</li>
                              <li>Conversation: {friend.metadata.preferences?.ridePreferences?.conversation ? 'Yes' : 'No'}</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Friends; 