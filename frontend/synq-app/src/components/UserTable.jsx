import React, { useState } from 'react';
import '../styles/UserTable.css';
import { sendRideInvitation } from '../services/firebaseOperations';
import { useUserAuth } from '../services/auth';

function UserTable({ users, onDelete, onRoleChange, onInvitationResponse, rideId, onResendInvitation }) {
  const { user } = useUserAuth();
  const [resendingInvitation, setResendingInvitation] = useState(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(null);

  const getStatusBadge = (user) => {
    const status = user.invitationStatus || 'pending';
    const statusConfig = {
      pending: { class: 'status-pending', icon: 'fa-clock', text: 'Pending Response' },
      accepted: { class: 'status-accepted', icon: 'fa-check', text: 'Accepted' },
      declined: { class: 'status-declined', icon: 'fa-times', text: 'Declined' },
      maybe: { class: 'status-maybe', icon: 'fa-question', text: 'Maybe' }
    };

    const config = statusConfig[status];
    return (
      <span className={`status-badge ${config.class}`}>
        <i className={`fas ${config.icon}`}></i>
        {config.text}
      </span>
    );
  };

  const getInvitationActions = (user) => {
    // If this is the current user and they haven't responded yet
    if (user.id === user.uid && user.invitationStatus === 'pending') {
      return (
        <div className="invitation-actions">
          <button
            className="action-button accept"
            onClick={() => onInvitationResponse(user.id, 'accepted')}
            title="Accept"
          >
            <i className="fas fa-check"></i> Accept
          </button>
          <button
            className="action-button maybe"
            onClick={() => onInvitationResponse(user.id, 'maybe')}
            title="Maybe"
          >
            <i className="fas fa-question"></i> Maybe
          </button>
          <button
            className="action-button decline"
            onClick={() => onInvitationResponse(user.id, 'declined')}
            title="Decline"
          >
            <i className="fas fa-times"></i> Decline
          </button>
        </div>
      );
    }
    // If this is the inviter and the invitation is pending
    else if (user.id !== user.uid && user.invitationStatus === 'pending') {
      return (
        <button
          className="resend-button"
          onClick={() => handleResendInvitation(user.id)}
          disabled={resendingInvitation === user.id}
          title="Resend invitation"
        >
          {resendingInvitation === user.id ? (
            <i className="fas fa-spinner fa-spin"></i>
          ) : (
            <i className="fas fa-paper-plane"></i>
          )}
          Resend
        </button>
      );
    }
    return null;
  };

  const getRoleSelect = (user) => {
    // Only show role select if:
    // 1. This is the current user
    // 2. They have accepted the invitation
    // 3. They haven't been assigned a role yet
    if (user.id === user.uid && user.invitationStatus === 'accepted' && !user.role) {
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
    // Show role if it's been set
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

  const handleResendInvitation = async (userId) => {
    try {
      setResendingInvitation(userId);
      await sendRideInvitation({
        rideId,
        inviterId: user.uid,
        inviteeId: userId,
        inviterName: user.displayName,
        inviterPhotoURL: user.photoURL
      });
      // Show success notification
      if (onResendInvitation) {
        onResendInvitation(userId, 'success');
      }
    } catch (error) {
      console.error('Error resending invitation:', error);
      if (onResendInvitation) {
        onResendInvitation(userId, 'error');
      }
    } finally {
      setResendingInvitation(null);
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
                {getInvitationActions(user)}
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
