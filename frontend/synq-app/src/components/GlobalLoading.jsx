import React from 'react';
import '../styles/GlobalLoading.css';

const GlobalLoading = ({ 
  title = "Loading SynqRoute", 
  subtitle = "Getting everything ready for you",
  icon = "fas fa-car",
  steps = [
    "Initializing app",
    "Loading your data", 
    "Preparing interface"
  ]
}) => {
  return (
    <div className="global-loading-overlay">
      <div className="modern-loading-container">
        <div className="loading-spinner-modern">
          <div className="spinner-ring outer"></div>
          <div className="spinner-ring middle"></div>
          <div className="spinner-ring inner"></div>
          <div className="spinner-center">
            <i className={icon}></i>
          </div>
        </div>
        <div className="loading-content">
          <h3 className="loading-title">{title}</h3>
          <p className="loading-subtitle">{subtitle}</p>
          <div className="loading-progress">
            <div className="progress-bar">
              <div className="progress-fill"></div>
            </div>
            <div className="progress-steps">
              {steps.map((step, index) => (
                <span 
                  key={index} 
                  className={`step ${index === 0 ? 'active' : ''}`}
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalLoading; 