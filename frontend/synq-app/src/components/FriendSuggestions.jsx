import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import {
  getMutualFriends,
  sendFriendRequest,
  searchUsers
} from '../services/firebaseOperations';
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

        // Filter out current user and existing friends
        const potentialFriends = users.filter(u => u.id !== user.uid);
        
        // Get mutual friends for each potential friend
        const suggestionsWithMutualFriends = await Promise.all(
          potentialFriends.map(async (potentialFriend) => {
            const { mutualFriends } = await getMutualFriends(user.uid, potentialFriend.id);
            return {
              ...potentialFriend,
              mutualFriends,
              trustScore: calculateTrustScore(mutualFriends)
            };
          })
        );

        // Sort by trust score and mutual friends
        const sortedSuggestions = suggestionsWithMutualFriends
          .sort((a, b) => {
            // First sort by trust score
            if (b.trustScore !== a.trustScore) {
              return b.trustScore - a.trustScore;
            }
            // Then by number of mutual friends
            return b.mutualFriends.length - a.mutualFriends.length;
          })
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

  const calculateTrustScore = (mutualFriends) => {
    // Base score starts at 50
    let score = 50;
    
    // Add points for mutual friends (up to 30 points)
    score += Math.min(mutualFriends.length * 10, 30);
    
    // Add points for verified users (if implemented)
    // score += user.isVerified ? 20 : 0;
    
    return Math.min(score, 100); // Cap at 100
  };

  const handleSendRequest = async (userId) => {
    try {
      setSendingRequest(prev => ({ ...prev, [userId]: true }));
      const result = await sendFriendRequest(user.uid, userId);
      if (result.success) {
        // Remove the suggestion after successful request
        setSuggestions(prev => prev.filter(s => s.id !== userId));
      } else {
        setError('Failed to send friend request');
      }
    } catch (err) {
      setError('Error sending friend request');
      console.error(err);
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
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
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
                    {suggestion.displayName}
                    <span className={`ms-2 badge ${getTrustScoreColor(suggestion.trustScore)}`}>
                      Trust Score: {suggestion.trustScore}%
                    </span>
                  </h6>
                  <small className="text-muted">
                    {suggestion.mutualFriends.length} mutual friends
                  </small>
                  {suggestion.mutualFriends.length > 0 && (
                    <div className="mutual-friends mt-1">
                      <small>
                        Mutual friends: {suggestion.mutualFriends.map(f => f.displayName).join(', ')}
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