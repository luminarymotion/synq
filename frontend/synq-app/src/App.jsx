import './App.css';
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import UserForm from './components/UserForm';
import MapView from './components/MapView';
import UserTable from './components/UserTable';
import AccountCreation from './components/AccountCreation';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user);
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const geocodeAddress = async (address) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=us&limit=1`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.length > 0) {
      const display_name = data[0].display_name;
      const nameParts = display_name.split(',');
      const establishmentName = nameParts.length > 1 ? nameParts[0].trim() : display_name;
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
      const color = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
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
      });
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

  if (loading) {
    return (
      <div className="container mt-5 text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  console.log('Current user state:', user);
  console.log('Current loading state:', loading);

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          user ? (
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
          ) : (
            <Navigate to="/signup" replace />
          )
        } 
      />
      <Route 
        path="/signup" 
        element={
          user ? <Navigate to="/" replace /> : <AccountCreation />
        } 
      />
    </Routes>
  );
}

export default App;
