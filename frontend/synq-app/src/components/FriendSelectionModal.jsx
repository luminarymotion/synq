import { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { getFriendsList } from '../services/firebaseOperations';
import '../styles/FriendSelectionModal.css';

function FriendSelectionModal({ isOpen, onClose, onAddFriend, existingParticipants }) {
  const { user } = useUserAuth();
  const [friends, setFriends] = useState([]);
  const [filteredFriends, setFilteredFriends] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingFriend, setAddingFriend] = useState(null);
  const [invitedFriends, setInvitedFriends] = useState(new Set());

  // Fetch friends when modal opens
  useEffect(() => {
    if (isOpen && user) {
      fetchFriends();
    }
  }, [isOpen, user]);

  // Filter friends based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredFriends(friends);
    } else {
      const filtered = friends.filter(friend => 
        friend.profile?.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        friend.profile?.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredFriends(filtered);
    }
  }, [searchTerm, friends]);

  const fetchFriends = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use the proper friends list function
      const result = await getFriendsList(user.uid);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load friends');
      }

      // Filter out friends who are already participants and orphaned relationships
      const availableFriends = result.friends.filter(friend => 
        !existingParticipants.some(p => p.id === friend.id) && 
        !friend.isOrphaned // Don't show deleted users
      );

      setFriends(availableFriends);
      setFilteredFriends(availableFriends);
    } catch (err) {
      console.error('Error fetching friends:', err);
      setError('Failed to load friends. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (friend) => {
    try {
      setAddingFriend(friend.id);
      await onAddFriend(friend);
      // Add friend to invited set after successful invite
      setInvitedFriends(prev => new Set([...prev, friend.id]));
    } finally {
      setAddingFriend(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="friend-selection-modal">
        <div className="modal-header">
          <h2>Add Friends to Ride</h2>
          <button className="close-button" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="search-container">
          <i className="fas fa-search search-icon"></i>
          <input
            type="text"
            placeholder="Search friends..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="friends-list">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading friends...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <i className="fas fa-exclamation-circle"></i>
              <p>{error}</p>
              <button onClick={fetchFriends} className="retry-button">
                Try Again
              </button>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="empty-state">
              {searchTerm ? (
                <>
                  <i className="fas fa-search"></i>
                  <p>No friends found matching "{searchTerm}"</p>
                </>
              ) : (
                <>
                  <i className="fas fa-user-friends"></i>
                  <p>No friends available to add</p>
                </>
              )}
            </div>
          ) : (
            filteredFriends.map(friend => (
              <div key={friend.id} className="friend-item">
                <div className="friend-info">
                  <img 
                    src={friend.profile?.photoURL || '/default-avatar.png'} 
                    alt={friend.profile?.displayName || 'Friend'}
                    className="friend-avatar"
                  />
                  <div className="friend-details">
                    <span className="friend-name">{friend.profile?.displayName || friend.profile?.email || 'Unknown User'}</span>
                    {invitedFriends.has(friend.id) && (
                      <span className="invite-status">
                        <i className="fas fa-check-circle"></i>
                        Invite Sent
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className={`add-friend-button ${addingFriend === friend.id ? 'adding' : ''} ${invitedFriends.has(friend.id) ? 'invited' : ''}`}
                  onClick={() => handleAddFriend(friend)}
                  disabled={addingFriend === friend.id || invitedFriends.has(friend.id)}
                >
                  {addingFriend === friend.id ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Sending...
                    </>
                  ) : invitedFriends.has(friend.id) ? (
                    <>
                      <i className="fas fa-check"></i>
                      Invited
                    </>
                  ) : (
                    <>
                      <i className="fas fa-plus"></i>
                      Invite
                    </>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Updated styles for better UI
const styles = `
  .friend-selection-modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    padding: 1.25rem;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #333;
  }

  .search-container {
    padding: 1rem;
    position: relative;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .search-icon {
    position: absolute;
    left: 1.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: #666;
  }

  .friends-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 1rem 1rem;
  }

  .friend-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-radius: 8px;
    margin-bottom: 0.5rem;
    transition: background-color 0.2s;
  }

  .friend-item:hover {
    background-color: #f8f9fa;
  }

  .friend-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .friend-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
  }

  .friend-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .friend-name {
    font-weight: 500;
    color: #333;
  }

  .invite-status {
    font-size: 0.8rem;
    color: #28a745;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .add-friend-button {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 90px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .add-friend-button:not(.invited):not(.adding) {
    background-color: #2196F3;
    color: white;
  }

  .add-friend-button:not(.invited):not(.adding):hover {
    background-color: #1976D2;
  }

  .add-friend-button.adding {
    background-color: #e3f2fd;
    color: #2196F3;
    cursor: wait;
  }

  .add-friend-button.invited {
    background-color: #e8f5e9;
    color: #28a745;
    cursor: default;
  }

  .add-friend-button i {
    font-size: 0.875rem;
  }

  .loading-state, .error-state, .empty-state {
    text-align: center;
    padding: 2rem;
    color: #666;
  }

  .spinner {
    border: 3px solid #f3f3f3;
    border-top: 3px solid #2196F3;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .retry-button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background-color: #2196F3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .retry-button:hover {
    background-color: #1976D2;
  }
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

export default FriendSelectionModal; 