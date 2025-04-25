import { useEffect, useState, useRef } from 'react';

function UserForm({ form, onChange, onSubmit, onDestinationChange, onUserLocationChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [userLocationSuggestions, setUserLocationSuggestions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const typingTimeout = useRef(null);
  const destinationTimeout = useRef(null);
  const userLocationTimeout = useRef(null);

  useEffect(() => {
    if (!form.address || form.address.length < 3) {
      setSuggestions([]);
      return;
    }

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    typingTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.address)}&countrycodes=us&limit=5`
        );
        const data = await res.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Error fetching suggestions:", error);
        setSuggestions([]);
      }
    }, 300); // debounce

    return () => clearTimeout(typingTimeout.current);
  }, [form.address]);

  useEffect(() => {
    if (!form.destination || form.destination.length < 3) {
      setDestinationSuggestions([]);
      return;
    }

    if (destinationTimeout.current) {
      clearTimeout(destinationTimeout.current);
    }

    destinationTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.destination)}&countrycodes=us&limit=5`
        );
        const data = await res.json();
        setDestinationSuggestions(data);
      } catch (error) {
        console.error("Error fetching destination suggestions:", error);
        setDestinationSuggestions([]);
      }
    }, 300); // debounce

    return () => clearTimeout(destinationTimeout.current);
  }, [form.destination]);

  useEffect(() => {
    if (!form.userLocation || form.userLocation.length < 3) {
      setUserLocationSuggestions([]);
      return;
    }

    if (userLocationTimeout.current) {
      clearTimeout(userLocationTimeout.current);
    }

    userLocationTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.userLocation)}&countrycodes=us&limit=5`
        );
        const data = await res.json();
        setUserLocationSuggestions(data);
      } catch (error) {
        console.error("Error fetching user location suggestions:", error);
        setUserLocationSuggestions([]);
      }
    }, 300); // debounce

    return () => clearTimeout(userLocationTimeout.current);
  }, [form.userLocation]);

  const handleSelect = (place) => {
    onChange({ target: { name: 'address', value: place.display_name } });
    setSuggestions([]);
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
  };

  const handleDestinationSelect = (place) => {
    onChange({ target: { name: 'destination', value: place.display_name } });
    setDestinationSuggestions([]);
    if (destinationTimeout.current) {
      clearTimeout(destinationTimeout.current);
    }
    if (onDestinationChange) {
      onDestinationChange({ lat: parseFloat(place.lat), lng: parseFloat(place.lon) });
    }
  };

  const handleUserLocationSelect = (place) => {
    onChange({ target: { name: 'userLocation', value: place.display_name } });
    setUserLocationSuggestions([]);
    if (userLocationTimeout.current) {
      clearTimeout(userLocationTimeout.current);
    }
    if (onUserLocationChange) {
      onUserLocationChange(place.display_name);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
    setShowModal(false);
  };

  return (
    <>
      {/* User Location Row */}
      <div className="row g-3 mb-4 p-3 bg-light rounded shadow-sm">
        <div className="col-12">
          <label htmlFor="userLocation" className="form-label">Your Location</label>
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              id="userLocation"
              placeholder="Enter your current location (US addresses only)"
              name="userLocation"
              value={form.userLocation || ''}
              onChange={onChange}
              autoComplete="off"
            />
          </div>
          {userLocationSuggestions.length > 0 && (
            <ul className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
              {userLocationSuggestions.map((sug, idx) => (
                <li
                  key={idx}
                  className="list-group-item list-group-item-action hover-bg-light"
                  onClick={() => handleUserLocationSelect(sug)}
                  role="button"
                >
                  {sug.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Destination Row */}
      <div className="row g-3 mb-4 p-3 bg-light rounded shadow-sm">
        <div className="col-12">
          <label htmlFor="destination" className="form-label">Destination</label>
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              id="destination"
              placeholder="Enter destination (US addresses only)"
              name="destination"
              value={form.destination || ''}
              onChange={onChange}
              autoComplete="off"
            />
            <button 
              className="btn btn-primary" 
              type="button"
              onClick={() => setShowModal(true)}
            >
              Add User
            </button>
          </div>
          {destinationSuggestions.length > 0 && (
            <ul className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
              {destinationSuggestions.map((sug, idx) => (
                <li
                  key={idx}
                  className="list-group-item list-group-item-action hover-bg-light"
                  onClick={() => handleDestinationSelect(sug)}
                  role="button"
                >
                  {sug.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add New User</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setShowModal(false)}
                ></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label htmlFor="name" className="form-label">Name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="name"
                      placeholder="Enter user name"
                      name="name"
                      value={form.name}
                      onChange={onChange}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="role" className="form-label">Role</label>
                    <select
                      className="form-select"
                      id="role"
                      name="role"
                      value={form.role || 'passenger'}
                      onChange={onChange}
                      required
                    >
                      <option value="passenger">Passenger</option>
                      <option value="driver">Driver</option>
                    </select>
                  </div>
                  <div className="mb-3 position-relative">
                    <label htmlFor="address" className="form-label">Address</label>
                    <input
                      type="text"
                      className="form-control"
                      id="address"
                      placeholder="Enter address (US addresses only)"
                      name="address"
                      value={form.address}
                      onChange={onChange}
                      autoComplete="off"
                      required
                    />
                    {suggestions.length > 0 && (
                      <ul className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                        {suggestions.map((sug, idx) => (
                          <li
                            key={idx}
                            className="list-group-item list-group-item-action hover-bg-light"
                            onClick={() => handleSelect(sug)}
                            role="button"
                          >
                            {sug.display_name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Add User
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default UserForm;
