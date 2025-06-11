import React from 'react';
import Friends from '../components/Friends';
import FriendSuggestions from '../components/FriendSuggestions';
import UserSearch from '../components/UserSearch';
import '../styles/FriendsPage.css';

function FriendsPage() {
  return (
    <div className="friends-page">
      <div className="friends-page-container">
        {/* User Search Section */}
        <div className="friends-section">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Search Users</h5>
              <UserSearch />
            </div>
          </div>
        </div>

        {/* Friend Requests Section */}
        <div className="friends-section">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title">Friend Requests</h5>
              {/* FriendRequests component will be added here */}
            </div>
          </div>
        </div>

        {/* Friends List Section */}
        <div className="friends-section">
          <Friends />
        </div>

        {/* Friend Suggestions Section */}
        <div className="friends-section">
          <FriendSuggestions />
        </div>
      </div>
    </div>
  );
}

export default FriendsPage; 