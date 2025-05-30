import { useState, useEffect } from 'react';
import { useUserAuth } from '../services/auth';
import { db } from '../services/firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import '../styles/FriendSelectionModal.css';

function FriendSelectionModal({ isOpen, onClose, onAddFriend, existingParticipants }) {
  const { user } = useUserAuth();
  const [friends, setFriends] = useState([]);
  const [filteredFriends, setFilteredFriends] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        friend.displayName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredFriends(filtered);
    }
  }, [searchTerm, friends]);

  const fetchFriends = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const friendsRef = collection(db, 'users', user.uid, 'friends');
      const friendsSnapshot = await getDocs(friendsRef);
      
      const friendsList = friendsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter out friends who are already participants
      const availableFriends = friendsList.filter(
        friend => !existingParticipants.some(p => p.id === friend.id)
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

  const handleAddFriend = (friend) => {
    onAddFriend(friend);
    onClose(); // Close modal after adding
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
                    src={friend.photoURL || '/default-avatar.png'} 
                    alt={friend.displayName}
                    className="friend-avatar"
                  />
                  <span className="friend-name">{friend.displayName}</span>
                </div>
                <button
                  className="add-friend-button"
                  onClick={() => handleAddFriend(friend)}
                >
                  <i className="fas fa-plus"></i>
                  Add
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default FriendSelectionModal; 