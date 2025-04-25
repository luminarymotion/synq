import './App.css';
import { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import UserForm from './UserForm';
import MapView from './MapView';
import UserTable from './UserTable';

function App() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ 
    name: '', 
    address: '', 
    destination: '', 
    role: 'passenger',
    userLocation: '' 
  });
  const [destination, setDestination] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const geocodeAddress = async (address) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=us&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.length > 0) {
      // Extract the name of the establishment if possible, otherwise use full address
      const display_name = data[0].display_name;
      const nameParts = display_name.split(',');
      const establishmentName = nameParts.length > 1 ? nameParts[0].trim() : display_name; // Extract first part as name
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: establishmentName };
    }
    return null;
  };

  const addUser = async (e) => {
    e.preventDefault();
    const { name, address, role } = form;
    if (!name || !address) return;

    const coords = await geocodeAddress(address);
    if (coords) {
      const color = `#${Math.floor(Math.random() * 16777215).toString(16)}`; // Generate random color
      setUsers((prevUsers) => [...prevUsers, { 
        name, 
        address: coords.address, 
        lat: coords.lat, 
        lng: coords.lng, 
        color,
        role 
      }]);
      setForm({ 
        name: '', 
        address: '', 
        destination: form.destination, 
        role: 'passenger',
        userLocation: form.userLocation 
      }); // Reset form but keep destination and user location
    } else {
      alert('Address not found!');
    }
  };

  const handleDelete = (index) => {
    const newUsers = users.filter((user, i) => i !== index);
    setUsers(newUsers);
  };

  const handleDestinationChange = (coords) => {
    setDestination(coords);
  };

  const handleUserLocationChange = async (address) => {
    const coords = await geocodeAddress(address);
    if (coords) {
      setUserLocation(coords);
    } else {
      alert('Location not found!');
    }
  };

  return (
    <div className="container my-4">
      <h1 className="mb-4">Synq Route Optimizer</h1>
      <UserForm 
        form={form} 
        onChange={handleChange} 
        onSubmit={addUser} 
        onDestinationChange={handleDestinationChange}
        onUserLocationChange={handleUserLocationChange}
      />
      <UserTable users={users} onDelete={handleDelete} />
      <MapView 
        users={users} 
        destination={destination}
        userLocation={userLocation}
        onSetDestinationFromMap={(coords) => setDestination(coords)}
      />
    </div>
  );
}

export default App;
