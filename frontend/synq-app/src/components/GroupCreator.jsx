import React, { useState } from 'react';
import MapView from '../MapView';
import geocodeAddress from './geocodeAddress';

const GroupCreator = () => {
  const [users, setUsers] = useState([]);
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: 'passenger',
    address: '',
  });

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => {
    setFormData({ name: '', role: 'passenger', address: '' });
    setIsModalOpen(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDestinationChange = (e) => {
    setDestination(e.target.value);
  };

  const handleDestinationSubmit = async (e) => {
    e.preventDefault();
    const coords = await geocodeAddress(destination);
    if (coords) {
      setDestinationCoords(coords);
    } else {
      alert('Destination not found');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const coords = await geocodeAddress(formData.address);
    if (!coords) {
      alert('Failed to locate the address. Please try again.');
      return;
    }

    const color = `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`;
    const newUser = {
      id: Date.now(),
      name: formData.name,
      role: formData.role,
      address: formData.address,
      lat: coords.lat,
      lng: coords.lng,
      color,
    };

    setUsers((prev) => [...prev, newUser]);
    handleCloseModal();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Group Ride Manager</h1>

      {/* Destination input */}
      <form onSubmit={handleDestinationSubmit} className="mb-4 flex gap-4 items-center">
        <input
          type="text"
          value={destination}
          onChange={handleDestinationChange}
          placeholder="Enter destination address..."
          className="w-full border px-3 py-2 rounded"
        />
        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded">
          Set Destination
        </button>
      </form>

      <button
        onClick={handleOpenModal}
        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
      >
        Add User
      </button>

      <MapView users={users} destination={destinationCoords} />

      <table className="mt-6 w-full text-left border-t pt-4">
        <thead>
          <tr>
            <th className="py-2">Name</th>
            <th>Role</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t">
              <td className="py-2">{user.name}</td>
              <td>{user.role}</td>
              <td>{user.address}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-md w-full max-w-md shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add New User</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Name:</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Driving or Passenger:</label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="driver">Driver</option>
                  <option value="passenger">Passenger</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Address:</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  required
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupCreator;
