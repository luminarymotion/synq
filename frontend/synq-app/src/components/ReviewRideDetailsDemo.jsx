import React, { useState } from 'react';
import RideDetailsVerificationModal from './RideDetailsVerificationModal';

function ReviewRideDetailsDemo() {
  const [showModal, setShowModal] = useState(false);
  const [rideDetails, setRideDetails] = useState({
    title: 'Weekend Trip to Dallas',
    startTime: '2024-01-15T10:00',
    destination: '2961 McDermott Rd, Plano, Texas 75025',
    description: 'Heading to Dallas for the weekend. Looking for travel companions!',
    carSeatsAvailable: 3,
    specialNotes: 'Please bring snacks and good music!'
  });

  const handleCreateRide = (finalRideData) => {
    console.log('Creating ride with data:', finalRideData);
    setShowModal(false);
    // Here you would typically send the data to your backend
    alert('Ride created successfully!');
  };

  const handleBackToEdit = () => {
    console.log('Going back to edit mode');
    setShowModal(false);
    // Here you would typically navigate back to the edit form
  };

  return (
    <div style={{ 
      padding: '20px', 
      textAlign: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f9f6f2 0%, #fffaf6 100%)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <h1 style={{ 
        color: '#4e342e', 
        marginBottom: '20px',
        fontSize: '2rem',
        fontWeight: 'bold'
      }}>
        Review Ride Details Modal Demo
      </h1>
      
      <p style={{ 
        color: '#7c5e48', 
        marginBottom: '30px',
        fontSize: '1.1rem',
        maxWidth: '600px'
      }}>
        Click the button below to see the updated Review Ride Details modal with the new title field, 
        compact design, and improved layout.
      </p>
      
      <button
        onClick={() => setShowModal(true)}
        style={{
          backgroundColor: '#b08968',
          color: 'white',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '10px',
          fontSize: '1rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: '0 4px 15px rgba(176, 137, 104, 0.3)'
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'translateY(-2px)';
          e.target.style.boxShadow = '0 6px 20px rgba(176, 137, 104, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'translateY(0)';
          e.target.style.boxShadow = '0 4px 15px rgba(176, 137, 104, 0.3)';
        }}
      >
        Open Review Modal
      </button>

      <RideDetailsVerificationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        rideData={rideDetails}
        onConfirm={handleCreateRide}
        onEdit={handleBackToEdit}
      />
    </div>
  );
}

export default ReviewRideDetailsDemo; 