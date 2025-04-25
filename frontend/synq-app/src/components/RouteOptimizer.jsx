import React, { useState } from 'react';

const RouteOptimizer = () => {
  const [destination, setDestination] = useState('');
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [isDriver, setIsDriver] = useState(false);
  const [route, setRoute] = useState([]);

  const handleAddUser = () => {
    if (!name || !location) return;
    const newUser = { name, location, isDriver };
    setUsers([...users, newUser]);
    setName('');
    setLocation('');
    setIsDriver(false);
  };

  const handleOptimizeRoute = () => {
    // Dummy optimization: pick driver, sort riders by location string
    const drivers = users.filter(user => user.isDriver);
    if (drivers.length === 0) return alert('Add at least one driver.');

    const sortedRiders = users
      .filter(user => !user.isDriver)
      .sort((a, b) => a.location.localeCompare(b.location));

    const plan = [drivers[0], ...sortedRiders, { name: 'Destination', location: destination }];
    setRoute(plan);
  };

  return (
    <div className="container py-4">
      <h2 className="mb-4">Synq Route Optimizer</h2>

      {/* Destination Input */}
      <div className="mb-3">
        <label className="form-label">Destination</label>
        <input
          type="text"
          className="form-control"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="123 Main St, City"
        />
      </div>

      {/* Add User Form */}
      <div className="row g-2 align-items-end mb-4">
        <div className="col-md-3">
          <label className="form-label">Name</label>
          <input
            type="text"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alice"
          />
        </div>
        <div className="col-md-4">
          <label className="form-label">Location</label>
          <input
            type="text"
            className="form-control"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="456 Oak Rd"
          />
        </div>
        <div className="col-md-2 form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={isDriver}
            onChange={() => setIsDriver(!isDriver)}
          />
          <label className="form-check-label">Driver</label>
        </div>
        <div className="col-md-2">
          <button className="btn btn-primary w-100" onClick={handleAddUser}>Add User</button>
        </div>
      </div>

      {/* Users List */}
      <div className="mb-4">
        <h5>Current Users:</h5>
        <ul className="list-group">
          {users.map((user, idx) => (
            <li key={idx} className="list-group-item">
              {user.name} — {user.location} {user.isDriver && <strong>(Driver)</strong>}
            </li>
          ))}
        </ul>
      </div>

      {/* Optimize Route */}
      <div className="mb-4">
        <button className="btn btn-success" onClick={handleOptimizeRoute}>Optimize Route</button>
      </div>

      {/* Route Output */}
      {route.length > 0 && (
        <div>
          <h5>Suggested Route:</h5>
          <ol className="list-group list-group-numbered">
            {route.map((step, idx) => (
              <li key={idx} className="list-group-item">
                {step.name} — {step.location}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export default RouteOptimizer;
