import React from 'react';
import '../styles/SimpleLoading.css';

const SimpleLoading = ({ 
  message = "Loading...",
  size = "medium" // small, medium, large
}) => {
  return (
    <div className="simple-loading-overlay">
      <div className={`simple-loading-container size-${size}`}>
        <div className="simple-spinner">
          <div className="spinner-circle"></div>
        </div>
        {message && <p className="simple-loading-message">{message}</p>}
      </div>
    </div>
  );
};

export default SimpleLoading; 