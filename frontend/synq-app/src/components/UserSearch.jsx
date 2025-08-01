import React, { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { searchUsers, sendFriendRequest, checkFriendshipStatus } from '../services/firebaseOperations';
import {
  Box,
  TextField,
  Avatar,
  Typography,
  Button,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Alert,
  IconButton,
  InputAdornment
} from '@mui/material';
import {
  Search as SearchIcon,
  PersonAdd as PersonAddIcon,
  Check as CheckIcon,
  Schedule as ScheduleIcon,
  Add as AddIcon
} from '@mui/icons-material';

function UserSearch({ onSelectFriend, onlyShowFriends = false }) {
  const { user } = useUserAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sendingRequest, setSendingRequest] = useState({});
  const [searchTimeout, setSearchTimeout] = useState(null);

  useEffect(() => {
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

      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      const timeout = setTimeout(async () => {
        const result = await searchUsers(term);
        if (result.success) {
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
      }, 300);

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
    if (onSelectFriend && user.friendshipStatus === 'friends') {
      return (
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => onSelectFriend(user)}
          sx={{
            fontSize: '12px',
            px: 1.5,
            py: 0.5,
            minWidth: 'auto',
            borderRadius: '8px'
          }}
        >
          Select
        </Button>
      );
    }

    switch (user.friendshipStatus) {
      case 'friends':
        return (
          <Chip
            icon={<CheckIcon />}
            label="Friends"
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontSize: '11px', height: '24px' }}
          />
        );
      case 'pending':
        return (
          <Chip
            icon={<ScheduleIcon />}
            label="Request Sent"
            size="small"
            color="warning"
            variant="outlined"
            sx={{ fontSize: '11px', height: '24px' }}
          />
        );
      case 'not_friends':
        return (
          <Button
            variant="outlined"
            size="small"
            startIcon={sendingRequest[user.id] ? <CircularProgress size={12} /> : <PersonAddIcon />}
            onClick={() => handleAddFriend(user.id)}
            disabled={sendingRequest[user.id]}
            sx={{
              fontSize: '12px',
              px: 1.5,
              py: 0.5,
              minWidth: 'auto',
              borderRadius: '8px'
            }}
          >
            {sendingRequest[user.id] ? 'Sending...' : 'Add Friend'}
          </Button>
        );
      default:
        return null;
    }
  };

  const filteredResults = onlyShowFriends 
    ? searchResults.filter(u => u.friendshipStatus === 'friends')
    : searchResults;

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      maxHeight: '100%'
    }}>
      {/* Search Header */}
      <Box sx={{ 
        p: 2, 
        pb: 1,
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)'
      }}>
        <Typography variant="h6" sx={{ 
          mb: 2, 
          fontWeight: 600,
          color: '#333'
        }}>
          {onSelectFriend ? 'Select Friends' : 'Add Friends'}
        </Typography>
        
        <TextField
          fullWidth
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            handleSearch(e.target.value);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
              </InputAdornment>
            ),
            sx: {
              borderRadius: '12px',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.12)'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.24)'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main'
              }
            }
          }}
          size="small"
        />
      </Box>

      {/* Results List */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'auto',
        p: 1
      }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, fontSize: '13px' }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            py: 4
          }}>
            <CircularProgress size={24} />
          </Box>
        ) : filteredResults.length > 0 ? (
          <List sx={{ p: 0 }}>
            {filteredResults.map((user, index) => (
              <React.Fragment key={user.id}>
                <ListItem 
                  sx={{ 
                    px: 1.5, 
                    py: 1,
                    borderRadius: '8px',
                    mb: 0.5,
                    '&:hover': {
                      backgroundColor: 'rgba(0, 0, 0, 0.02)'
                    }
                  }}
                >
                  <ListItemAvatar>
                    <Avatar 
                      src={user.profile?.photoURL || user.photoURL} 
                      sx={{ 
                        width: 40, 
                        height: 40,
                        fontSize: '16px'
                      }}
                    >
                      {(user.profile?.displayName || user.displayName || user.email)?.charAt(0)?.toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ 
                        fontWeight: 500,
                        color: '#333',
                        fontSize: '14px'
                      }}>
                        {user.profile?.displayName || user.displayName || user.email}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" sx={{ 
                        color: '#666',
                        fontSize: '12px'
                      }}>
                        {user.profile?.email || user.email}
                      </Typography>
                    }
                    sx={{ mr: 1 }}
                  />
                  
                  <ListItemSecondaryAction>
                    {getActionButton(user)}
                  </ListItemSecondaryAction>
                </ListItem>
                {index < filteredResults.length - 1 && (
                  <Divider sx={{ mx: 2, opacity: 0.5 }} />
                )}
              </React.Fragment>
            ))}
          </List>
        ) : searchTerm ? (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            py: 4,
            textAlign: 'center'
          }}>
            <Typography variant="body2" sx={{ 
              color: '#666',
              fontSize: '14px',
              mb: 1
            }}>
              No users found
            </Typography>
            <Typography variant="caption" sx={{ 
              color: '#999',
              fontSize: '12px'
            }}>
              Try searching with a different name or email
            </Typography>
          </Box>
        ) : (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            py: 4,
            textAlign: 'center'
          }}>
            <Typography variant="body2" sx={{ 
              color: '#666',
              fontSize: '14px',
              mb: 1
            }}>
              Search for friends to add
            </Typography>
            <Typography variant="caption" sx={{ 
              color: '#999',
              fontSize: '12px'
            }}>
              Enter a name or email to find users
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default UserSearch; 