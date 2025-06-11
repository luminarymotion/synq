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

      const result = await sendFriendRequest(user.uid, userToAdd.id, "Let's be friends!");
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
    <div className="user-table-wrapper">
      <table className="user-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id || user.tempId} className="user-row">
              <td className="user-info">
                <div className="user-avatar">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.name} />
                  ) : (
                    <div className="avatar-placeholder">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="user-details">
                  <span className="user-name">{user.name}</span>
                  {user.email && <span className="user-email">{user.email}</span>}
                </div>
              </td>
              <td>
                {getRoleSelect(user)}
              </td>
              <td>
                {getStatusBadge(user)}
              </td>
              <td className="actions-cell">
                {getFriendActions(user)}
                {!user.isCreator && user.id !== user.uid && (
                <button 
                    className="remove-button"
                    onClick={() => handleRemoveParticipant(user.id || user.tempId)}
                    title="Remove participant"
                  >
                    <i className="fas fa-user-minus"></i>
                </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
