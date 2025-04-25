import React from 'react';

function UserTable({ users, onDelete }) {
  return (
    <div className="table-responsive">
      <table className="table table-striped">
        <thead>
          <tr>
            <th>Color</th>
            <th>Name</th>
            <th>Role</th>
            <th>Place</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => (
            <tr key={index}>
              <td>
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: user.color,
                    borderRadius: '50%',
                    border: '1px solid #ccc',
                    margin: 'auto',
                  }}
                />
              </td>
              <td>{user.name}</td>
              <td>
                <span className={`badge ${user.role === 'driver' ? 'bg-primary' : 'bg-secondary'}`}>
                  {user.role}
                </span>
              </td>
              <td>{user.address}</td>
              <td>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(index)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UserTable;
