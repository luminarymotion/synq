import React, { useState } from 'react';
import '../styles/UserTable.css';
import { useUserAuth } from '../services/auth';
import { 
  sendFriendRequest,
  checkFriendshipStatus
} from '../services/firebaseOperations';

function UserTable({ users, onDelete, onRoleChange, rideId }) {
  const { user } = useUserAuth();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(null);
  const [friendRequestStatus, setFriendRequestStatus] = useState({});

  const getStatusBadge = (user) => {
    // Update status to use friend system
    const status = user.friendStatus || 'not_friend';
    const statusConfig = {
      not_friend: { class: 'status-pending', icon: 'fa-user-plus', text: 'Not Friends' },
      pending: { class: 'status-pending', icon: 'fa-clock', text: 'Friend Request Pending' },
      accepted: { class: 'status-accepted', icon: 'fa-check', text: 'Friends' },
      declined: { class: 'status-declined', icon: 'fa-times', text: 'Request Declined' }
    };

    const config = statusConfig[status];
    return (
      <span className={`status-badge ${config.class}`}>
        <i className={`fas ${config.icon}`}></i>
        {config.text}
      </span>
    );
  };

  const getFriendActions = (user) => {
    if (user.id === user.uid) return null; // Don't show actions for current user

    const status = friendRequestStatus[user.id] || user.friendStatus || 'not_friend';
    
    switch (status) {
      case 'not_friend':
        return (
          <button 
            className="add-friend-button"
            onClick={() => handleAddFriend(user)}
            disabled={friendRequestStatus[user.id] === 'pending'}
          >
            <i className="fas fa-user-plus"></i>
            Add Friend
          </button>
        );
      case 'pending':
        return (
          <span className="pending-status">
            <i className="fas fa-clock"></i>
            Request Sent
          </span>
        );
      case 'accepted':
        return (
          <span className="friends-status">
            <i className="fas fa-check"></i>
            Friends
          </span>
        );
      case 'declined':
        return (
          <button 
            className="retry-friend-button"
            onClick={() => handleAddFriend(user)}
          >
            <i className="fas fa-redo"></i>
            Try Again
          </button>
        );
      default:
        return null;
    }
  };

  const getRoleSelect = (user) => {
    if (user.id === user.uid && !user.role) {
      return (
        <select
          value={user.role || ''}
          onChange={(e) => onRoleChange(user.id, e.target.value)}
          className="role-select"
        >
          <option value="">Select Role</option>
          <option value="driver">Driver</option>
          <option value="passenger">Passenger</option>
        </select>
      );
    }
    else if (user.role) {
      return (
        <span className={`role-badge ${user.role}`}>
          <i className={`fas fa-${user.role === 'driver' ? 'car' : 'user'}`}></i>
          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
        </span>
      );
    }
    return null;
  };

  const handleAddFriend = async (userToAdd) => {
    if (!user) return;

    try {
      // Check if already friends
      const statusResult = await checkFriendshipStatus(user.uid, userToAdd.id);
      if (statusResult.success && statusResult.areFriends) {
        setFriendRequestStatus(prev => ({
          ...prev,
          [userToAdd.id]: 'accepted'
        }));
        return;
      }

      // Send friend request
      setFriendRequestStatus(prev => ({
        ...prev,
        [userToAdd.id]: 'pending'
      }));

      const result = await sendFriendRequest({
        senderId: user.uid,
        receiverId: userToAdd.id,
        message: "Let's be friends!"
      });
      
      if (!result.success) {
        setFriendRequestStatus(prev => ({
          ...prev,
          [userToAdd.id]: 'declined'
        }));
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      setFriendRequestStatus(prev => ({
        ...prev,
        [userToAdd.id]: 'declined'
      }));
    }
  };

  const handleRemoveParticipant = (userId) => {
    setShowRemoveConfirm(userId);
  };

  const confirmRemoveParticipant = (userId) => {
    onDelete(userId);
    setShowRemoveConfirm(null);
  };

  return (
    <div className="user-cards-wrapper">
      <div className="user-cards-container">
          {users.map((user) => (
          <div key={user.id || user.tempId} className="user-card">
            <div className="user-card-header">
              <div className="user-card-avatar">
                  {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || user.name} />
                  ) : (
                    <div className="avatar-placeholder">
                    {(user.displayName || user.name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              <div className="user-card-info">
                <div className="user-card-name">
                  {user.displayName || user.name}
                </div>
                {user.friendStatus && (
                  <div className={`user-card-status ${user.friendStatus}`}>
                    {user.friendStatus === 'accepted' && <i className="fas fa-check"></i>}
                    {user.friendStatus === 'pending' && <i className="fas fa-clock"></i>}
                    {user.friendStatus === 'not_friend' && <i className="fas fa-user-plus"></i>}
                    {user.friendStatus === 'accepted' ? 'Friend' : 
                     user.friendStatus === 'pending' ? 'Request Sent' : 'Not Friend'}
                  </div>
                )}
              </div>
            </div>
            
            <div className="user-card-content">
              <div className="user-card-role">
                {getRoleSelect(user)}
              </div>
              
                {!user.isCreator && user.id !== user.uid && (
                <button 
                  className="user-card-remove"
                    onClick={() => handleRemoveParticipant(user.id || user.tempId)}
                    title="Remove participant"
                  >
                  <i className="fas fa-times"></i>
                </button>
                )}
            </div>
          </div>
          ))}
      </div>

      {/* Remove Confirmation Modal */}
      {showRemoveConfirm && (
        <div className="modal-backdrop">
          <div className="modal-content confirmation-modal">
            <h3>Remove Participant</h3>
            <p>Are you sure you want to remove this participant from the group?</p>
            <div className="modal-actions">
              <button
                className="cancel-button"
                onClick={() => setShowRemoveConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={() => confirmRemoveParticipant(showRemoveConfirm)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {users.length === 0 && (
        <div className="empty-state">
          <i className="fas fa-users"></i>
          <p>No participants added yet</p>
        </div>
      )}
    </div>
  );
}

export default UserTable;
