import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import {
  getFriendsList,
  removeFriendship,
  updateRelationshipCommunity,
  subscribeToFriendsList,
  subscribeToUserStatus,
  subscribeToFriendRequests,
  updateFriendRequest,
  cleanupOrphanedRelationships
} from '../services/firebaseOperations';
import FriendSuggestions from './FriendSuggestions';
import UserSearch from './UserSearch';
import SimpleLoading from './SimpleLoading';
// MUI imports
import { Box, Container, Card, CardContent, Typography, Button, Avatar, Stack, Chip, Divider, Alert, IconButton } from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

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
        
        // Check for orphaned relationships and clean them up
        const orphanedCount = result.friends.filter(f => f.isOrphaned).length;
        if (orphanedCount > 0) {
          console.log(`Found ${orphanedCount} orphaned relationships, cleaning up...`);
          cleanupOrphanedRelationships(user.uid).then(cleanupResult => {
            if (cleanupResult.success && cleanupResult.cleanedCount > 0) {
              console.log(`Cleaned up ${cleanupResult.cleanedCount} orphaned relationships`);
            }
          });
        }
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
      if (result.success) {
        // Show success message
        console.log('Friend removed successfully:', result.message);
      } else {
        setError(`Failed to remove friend: ${result.error}`);
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

  if (loading) {
    return (
      <SimpleLoading 
        message="Loading your friends..."
        size="large"
      />
    );
  }

  return (
    <Box sx={{ background: palette.bg, minHeight: '100vh', py: { xs: 2, md: 5 } }}>
      <Container maxWidth="md" sx={{ px: { xs: 1, sm: 3, md: 6 } }}>
        <Typography variant="h4" fontWeight={800} color={palette.text} mb={4} sx={{ letterSpacing: 0.5 }}>
          Your Friends
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {/* Friend Requests - full width, top */}
        {friendRequests.length > 0 && (
          <Card sx={{ background: palette.requestBg, borderRadius: 4, boxShadow: '0 2px 12px 0 #e0c9b3', mb: 4, p: 1 }}>
            <CardContent sx={{ py: 3 }}>
              <Typography variant="h6" fontWeight={700} color={palette.textSoft} mb={2}>
                Friend Requests
              </Typography>
              <Stack spacing={2}>
                {friendRequests.map(req => (
                  <Box key={req.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderRadius: 3, p: 2, boxShadow: '0 1px 4px 0 #e0c9b3', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: '0 4px 16px 0 #e0c9b3' } }}>
                    <Box display="flex" alignItems="center">
                      <Avatar src={req.senderProfile?.photoURL || '/default-avatar.png'} alt={req.senderProfile?.displayName} sx={{ width: 48, height: 48, mr: 2, bgcolor: palette.accent }} />
                      <Box>
                        <Typography fontWeight={700} color={palette.text}>{req.senderProfile?.displayName || 'Unknown User'}</Typography>
                        <Typography variant="body2" color={palette.textSoft}>{req.senderProfile?.email || req.senderId}</Typography>
                      </Box>
                    </Box>
                    <Box>
                      <IconButton color="success" onClick={() => handleFriendRequest(req.id, 'accepted')} disabled={processingRequest[req.id]} sx={{ mx: 0.5 }}>
                        <CheckIcon />
                      </IconButton>
                      <IconButton color="error" onClick={() => handleFriendRequest(req.id, 'rejected')} disabled={processingRequest[req.id]} sx={{ mx: 0.5 }}>
                        <CloseIcon />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}
        {/* Search Users */}
        <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: '0 2px 12px 0 #e0c9b3', mb: 4, p: 1 }}>
          <CardContent sx={{ py: 3 }}>
            <Typography variant="h6" fontWeight={700} color={palette.textSoft} mb={2}>
              Search Users
            </Typography>
            <UserSearch />
          </CardContent>
        </Card>
        {/* Friend Suggestions */}
        <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: '0 2px 12px 0 #e0c9b3', mb: 4, p: 1 }}>
          <CardContent sx={{ py: 3 }}>
            <Typography variant="h6" fontWeight={700} color={palette.textSoft} mb={2}>
              Friend Suggestions
            </Typography>
            <FriendSuggestions />
          </CardContent>
        </Card>
        {/* Friends List */}
        <Card sx={{ background: palette.card, borderRadius: 4, boxShadow: '0 2px 12px 0 #e0c9b3', mb: 4, p: 1 }}>
          <CardContent sx={{ py: 3 }}>
            <Typography variant="h6" fontWeight={700} color={palette.textSoft} mb={2}>
              Friends {friends.length > 0 && (
                <Chip label={friends.length} size="small" sx={{ ml: 1, background: palette.accent, color: palette.text }} />
              )}
            </Typography>
            <Divider sx={{ mb: 2, background: palette.border }} />
            {friends.length === 0 ? (
              <Box textAlign="center" py={4}>
                <GroupIcon sx={{ fontSize: 56, color: palette.accent2, mb: 2 }} />
                <Typography color={palette.textSoft} mb={1} fontSize={18}>No friends yet</Typography>
                <Typography color={palette.textSoft} variant="body2">Try adding some friends to get started!</Typography>
              </Box>
            ) : (
              <Stack spacing={2}>
                {friends.map(friend => (
                  <Box key={friend.id} sx={{ 
                    background: friend.isOrphaned ? '#f8d7da' : palette.friendBg, 
                    borderRadius: 3, 
                    p: 2.5, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    boxShadow: '0 1px 4px 0 #e0c9b3', 
                    transition: 'box-shadow 0.2s', 
                    '&:hover': { 
                      boxShadow: '0 4px 16px 0 #e0c9b3', 
                      background: friend.isOrphaned ? '#f5c6cb' : '#f5f3e7' 
                    },
                    border: friend.isOrphaned ? '1px solid #dc3545' : 'none',
                    opacity: friend.isOrphaned ? 0.8 : 1
                  }}>
                    <Box display="flex" alignItems="center">
                      <Avatar 
                        src={friend.profile.photoURL || '/default-avatar.png'} 
                        alt={friend.profile.displayName} 
                        sx={{ 
                          width: 56, 
                          height: 56, 
                          mr: 2, 
                          bgcolor: friend.isOrphaned ? '#dc3545' : palette.accent 
                        }} 
                      />
                      <Box>
                        <Typography 
                          fontWeight={700} 
                          color={friend.isOrphaned ? '#721c24' : palette.text} 
                          fontSize={18}
                          sx={{ 
                            textDecoration: friend.isOrphaned ? 'line-through' : 'none',
                            fontStyle: friend.isOrphaned ? 'italic' : 'normal'
                          }}
                        >
                          {friend.profile.displayName}
                          {friend.isOrphaned && ' (Deleted)'}
                        </Typography>
                        {friend.isOrphaned && (
                          <Typography variant="caption" color="#721c24" sx={{ fontStyle: 'italic' }}>
                            This user's account has been deleted
                          </Typography>
                        )}
                        {friend.relationship.communityId && !friend.isOrphaned && (
                          <Chip label={friend.relationship.communityRole || 'Member'} size="small" sx={{ background: palette.accent3, color: palette.text, mt: 0.5 }} />
                        )}
                      </Box>
                    </Box>
                    <Box>
                      <IconButton 
                        color="error" 
                        onClick={() => handleRemoveFriend(friend.id)} 
                        disabled={removingFriend[friend.id]} 
                        sx={{ mx: 0.5 }}
                        title={friend.isOrphaned ? 'Remove orphaned relationship' : 'Remove friend'}
                      >
                        <PersonRemoveIcon />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

export default Friends; 