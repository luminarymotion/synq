import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import {
  searchUsers,
  sendFriendRequest,
  checkFriendshipStatus
} from '../services/firebaseOperations';
import SimpleLoading from './SimpleLoading';
import '../styles/FriendSuggestions.css';
import { Box, Card, CardContent, Typography, Button, Chip, Avatar, Stack } from '@mui/material';

function FriendSuggestions() {
  const { user } = useUserAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sendingRequest, setSendingRequest] = useState({});

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
      <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: '0 2px 12px 0 #e0c9b3', mb: 2 }}>
        <CardContent sx={{ py: 3 }}>
          <Box sx={{ textAlign: 'center' }}>
            <SimpleLoading 
              message="Loading suggestions..."
              size="small"
            />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: '0 2px 12px 0 #e0c9b3', mb: 2 }}>
        <CardContent sx={{ py: 3 }}>
          <Box sx={{ background: '#fff0f0', color: '#b71c1c', borderRadius: 2, p: 2, mb: 2, fontWeight: 500 }}>
            {error}
            <Button variant="text" size="small" sx={{ color: palette.accent2, ml: 2 }} onClick={() => setError(null)}>
              Dismiss
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: '0 2px 12px 0 #e0c9b3', mb: 2 }}>
        <CardContent sx={{ py: 3 }}>
          <Typography color={palette.textSoft}>No suggestions available at the moment.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: '0 2px 12px 0 #e0c9b3', mb: 2 }}>
      <CardContent sx={{ py: 3 }}>
        <Stack spacing={2}>
          {suggestions.map(suggestion => (
            <Box key={suggestion.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: palette.friendBg, borderRadius: 3, p: 2, boxShadow: '0 1px 4px 0 #e0c9b3', transition: 'box-shadow 0.2s, background 0.2s', '&:hover': { boxShadow: '0 4px 16px 0 #e0c9b3', background: '#f5f3e7' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar src={suggestion.profile?.photoURL || '/default-avatar.png'} alt={suggestion.profile?.displayName || suggestion.displayName} sx={{ width: 48, height: 48, mr: 2, bgcolor: palette.accent }} />
                <Box>
                  <Typography fontWeight={700} color={palette.text} fontSize={17}>{suggestion.profile?.displayName || suggestion.displayName}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center" mt={0.5}>
                    <Chip label={`Trust Score: ${suggestion.trustScore}%`} size="small" sx={{ background: palette.accent3, color: palette.text }} />
                    <Typography variant="caption" color={palette.textSoft}>
                      {suggestion.reputation?.rideCount || 0} rides
                      {suggestion.reputation?.rating && ` • ${suggestion.reputation.rating.toFixed(1)}★`}
                    </Typography>
                  </Stack>
                  {suggestion.reputation?.badges?.length > 0 && (
                    <Stack direction="row" spacing={1} mt={0.5}>
                      {suggestion.reputation.badges.map((badge, idx) => (
                        <Chip key={idx} label={badge} size="small" sx={{ background: palette.accent, color: palette.text }} />
                      ))}
                    </Stack>
                  )}
                </Box>
              </Box>
              <Button
                variant="contained"
                size="small"
                sx={{ background: palette.accent2, color: '#fff', borderRadius: 2, fontWeight: 600, px: 2, py: 1, fontSize: 15, minWidth: 110 }}
                onClick={() => handleSendRequest(suggestion.id)}
                disabled={sendingRequest[suggestion.id]}
              >
                {sendingRequest[suggestion.id] ? 'Sending...' : 'Add Friend'}
              </Button>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default FriendSuggestions; 