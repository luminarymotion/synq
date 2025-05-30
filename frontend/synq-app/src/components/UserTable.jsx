import React from 'react';

function UserTable({ users, onDelete }) {
  return (
    <div className="users-table-container">
      <table className="users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Location</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr key={index}>
              <td>
                <div className="user-info">
                  <div
                    className="user-color-indicator"
                    style={{ backgroundColor: user.color }}
                  />
                  <span className="user-name">{user.name}</span>
                </div>
              </td>
              <td>
                <span className={`user-role ${user.role}`}>
                  {user.role === 'driver' ? (
                    <i className="fas fa-car me-1"></i>
                  ) : (
                    <i className="fas fa-user me-1"></i>
                  )}
                  {user.role}
                </span>
              </td>
              <td>
                <div className="user-location">
                  <i className="fas fa-map-marker-alt me-1"></i>
                  {user.address}
                </div>
              </td>
              <td>
                <button 
                  className="delete-user-btn"
                  onClick={() => onDelete(index)}
                  title="Remove friend"
                >
                  <i className="fas fa-trash-alt"></i>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && (
        <div className="empty-state">
          <i className="fas fa-users"></i>
          <p>No friends added yet</p>
          <span>Add friends to start planning your ride</span>
        </div>
      )}
    </div>
  );
}

export default UserTable;
