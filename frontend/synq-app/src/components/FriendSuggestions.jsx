import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import {
  searchUsers,
  sendFriendRequest,
  checkFriendshipStatus
} from '../services/firebaseOperations';
import SimpleLoading from './SimpleLoading';
import '../styles/FriendSuggestions.css';

function FriendSuggestions() {
  const { user } = useUserAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingRequest, setSendingRequest] = useState({});

  useEffect(() => {
    const loadSuggestions = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        // Get all users
        const { users } = await searchUsers('');
        if (!users) return;

        // Filter out current user
        const potentialFriends = users.filter(u => u.id !== user.uid);
        
        // Check friendship status and get user profiles
        const suggestionsWithStatus = await Promise.all(
          potentialFriends.map(async (potentialFriend) => {
            // Check if they're already friends or have a pending request
            const { areFriends, friendshipId } = await checkFriendshipStatus(user.uid, potentialFriend.id);
            
            // Calculate trust score based on user's reputation
            const trustScore = calculateTrustScore(potentialFriend.reputation || {});
            
            return {
              ...potentialFriend,
              areFriends,
              friendshipId,
              trustScore
            };
          })
        );

        // Filter out existing friends and sort by trust score
        const sortedSuggestions = suggestionsWithStatus
          .filter(suggestion => !suggestion.areFriends) // Only show non-friends
          .sort((a, b) => b.trustScore - a.trustScore)
          .slice(0, 5); // Show top 5 suggestions

        setSuggestions(sortedSuggestions);
      } catch (err) {
        setError('Failed to load suggestions');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadSuggestions();
  }, [user]);

  const calculateTrustScore = (reputation) => {
    // Base score starts at 50
    let score = 50;
    
    // Add points based on reputation metrics
    if (reputation) {
      // Add points for ride count (up to 20 points)
      score += Math.min((reputation.rideCount || 0) * 2, 20);
      
      // Add points for rating (up to 20 points)
      score += Math.min((reputation.rating || 0) * 4, 20);
      
      // Add points for verification (10 points)
      if (reputation.verification?.email) score += 5;
      if (reputation.verification?.phone) score += 5;
      
      // Add points for badges (up to 10 points)
      score += Math.min((reputation.badges?.length || 0) * 2, 10);
    }
    
    return Math.min(score, 100); // Cap at 100
  };

  const handleSendRequest = async (userId) => {
    if (!user) return;

    try {
      setSendingRequest(prev => ({ ...prev, [userId]: true }));
      
      // Check if already friends
      const statusResult = await checkFriendshipStatus(user.uid, userId);
      if (statusResult.success && statusResult.areFriends) {
        setSuggestions(prev => 
          prev.map(s => 
            s.id === userId 
              ? { ...s, areFriends: true }
              : s
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
        setSuggestions(prev => 
          prev.map(s => 
            s.id === userId 
              ? { ...s, friendshipStatus: 'pending' }
              : s
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

  const getTrustScoreColor = (score) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-primary';
    if (score >= 40) return 'text-warning';
    return 'text-danger';
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body">
          <h5 className="card-title">Friend Suggestions</h5>
          <div className="text-center">
            <SimpleLoading 
              message="Loading suggestions..."
              size="small"
            />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-body">
          <h5 className="card-title">Friend Suggestions</h5>
          <div className="alert alert-danger" role="alert">
            {error}
            <button 
              className="btn btn-link"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <h5 className="card-title">Friend Suggestions</h5>
          <p className="text-muted">No suggestions available at the moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">Friend Suggestions</h5>
        <div className="list-group">
          {suggestions.map(suggestion => (
            <div key={suggestion.id} className="list-group-item">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="mb-0">
                    {suggestion.profile?.displayName || suggestion.displayName}
                    <span className={`ms-2 badge ${getTrustScoreColor(suggestion.trustScore)}`}>
                      Trust Score: {suggestion.trustScore}%
                    </span>
                  </h6>
                  <small className="text-muted">
                    {suggestion.reputation?.rideCount || 0} rides completed
                    {suggestion.reputation?.rating && ` • ${suggestion.reputation.rating.toFixed(1)}★ rating`}
                  </small>
                  {suggestion.reputation?.badges?.length > 0 && (
                    <div className="badges mt-1">
                      <small>
                        Badges: {suggestion.reputation.badges.join(', ')}
                      </small>
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSendRequest(suggestion.id)}
                  disabled={sendingRequest[suggestion.id]}
                >
                  {sendingRequest[suggestion.id] ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Sending...
                    </>
                  ) : (
                    'Add Friend'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FriendSuggestions; 