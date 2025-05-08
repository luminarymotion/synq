import './App.css';
import { Routes, Route } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import RouteOptimizer from './pages/RouteOptimizer';
import ProfileSetup from './pages/ProfileSetup';
import { UserAuthContextProvider } from './services/auth';

function App() {
  return (
    <UserAuthContextProvider>
      <Routes>
        <Route path="/" element={<RouteOptimizer />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/profile-setup" element={<ProfileSetup />} />
      </Routes>
    </UserAuthContextProvider>
  );
}

export default App;
