// src/components/ErrorLogsDashboard.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, orderBy, limit, where, onSnapshot } from 'firebase/firestore';
import { useUserAuth } from '../services/auth';

const ErrorLogsDashboard = () => {
  const [errorLogs, setErrorLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, mobile, critical, today
  const { user } = useUserAuth();

  useEffect(() => {
    if (!user) return;

    let q;
    const baseQuery = collection(db, 'mobile_error_logs');
    
    // Build query based on filter
    switch (filter) {
      case 'mobile':
        q = query(
          baseQuery,
          where('isMobile', '==', true),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        break;
      case 'critical':
        q = query(
          baseQuery,
          where('severity', 'in', ['critical', 'high']),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        break;
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        q = query(
          baseQuery,
          where('timestamp', '>=', today),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        break;
      default:
        q = query(
          baseQuery,
          orderBy('timestamp', 'desc'),
          limit(50)
        );
    }

    // Set up real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(doc.data().clientTimestamp)
      }));
      setErrorLogs(logs);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching logs:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, filter]);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return '#ff4444';
      case 'high': return '#ff8800';
      case 'error': return '#ff6b6b';
      case 'warning': return '#ffa726';
      case 'medium': return '#ffa726';
      default: return '#666';
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>Loading error logs...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>📱 Mobile Error Logs Dashboard</h2>
      
      {/* Filter Controls */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ marginRight: '10px' }}>Filter:</label>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          style={{ padding: '5px', marginRight: '20px' }}
        >
          <option value="all">All Errors</option>
          <option value="mobile">Mobile Only</option>
          <option value="critical">Critical/High Only</option>
          <option value="today">Today Only</option>
        </select>
        <span style={{ color: '#666', fontSize: '14px' }}>
          ({errorLogs.length} logs)
        </span>
      </div>

      {/* Error Logs List */}
      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {errorLogs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
            No error logs found for the selected filter.
          </div>
        ) : (
          errorLogs.map((log) => (
            <div
              key={log.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '15px',
                marginBottom: '10px',
                backgroundColor: '#f9f9f9',
                borderLeft: `4px solid ${getSeverityColor(log.severity)}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    color: getSeverityColor(log.severity),
                    fontSize: '16px',
                    marginBottom: '5px'
                  }}>
                    {log.errorType?.toUpperCase() || 'UNKNOWN ERROR'}
                  </div>
                  <div style={{ marginBottom: '8px', color: '#333' }}>
                    {log.errorMessage || 'No message available'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.4' }}>
                    <div><strong>URL:</strong> {log.url || 'Unknown'}</div>
                    <div><strong>User Agent:</strong> {log.userAgent || 'Unknown'}</div>
                    {log.userId && <div><strong>User ID:</strong> {log.userId}</div>}
                    {log.component && <div><strong>Component:</strong> {log.component}</div>}
                    {log.isMobile && <div><strong>Mobile:</strong> Yes</div>}
                    {log.isSafari && <div><strong>Safari:</strong> Yes</div>}
                  </div>
                </div>
                <div style={{ 
                  textAlign: 'right', 
                  fontSize: '12px', 
                  color: '#666',
                  minWidth: '80px'
                }}>
                  <div>{formatTimeAgo(log.timestamp)}</div>
                  <div style={{ 
                    marginTop: '5px',
                    padding: '2px 6px',
                    backgroundColor: getSeverityColor(log.severity),
                    color: 'white',
                    borderRadius: '4px',
                    fontSize: '10px'
                  }}>
                    {log.severity?.toUpperCase() || 'UNKNOWN'}
                  </div>
                </div>
              </div>
              
              {/* Error Stack (collapsible) */}
              {log.errorStack && (
                <details style={{ marginTop: '10px' }}>
                  <summary style={{ cursor: 'pointer', color: '#666', fontSize: '12px' }}>
                    Stack Trace
                  </summary>
                  <pre style={{ 
                    fontSize: '10px', 
                    backgroundColor: '#f5f5f5', 
                    padding: '8px', 
                    borderRadius: '4px',
                    overflow: 'auto',
                    marginTop: '5px',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {log.errorStack}
                  </pre>
                </details>
              )}

              {/* Additional Details (collapsible) */}
              {log.additionalDetails && Object.keys(log.additionalDetails).length > 0 && (
                <details style={{ marginTop: '10px' }}>
                  <summary style={{ cursor: 'pointer', color: '#666', fontSize: '12px' }}>
                    Additional Details
                  </summary>
                  <pre style={{ 
                    fontSize: '10px', 
                    backgroundColor: '#f5f5f5', 
                    padding: '8px', 
                    borderRadius: '4px',
                    overflow: 'auto',
                    marginTop: '5px'
                  }}>
                    {JSON.stringify(log.additionalDetails, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>

      {/* Stats Summary */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#f0f0f0', 
        borderRadius: '8px' 
      }}>
        <h3>Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <div>
            <strong>Total Errors:</strong> {errorLogs.length}
          </div>
          <div>
            <strong>Mobile Errors:</strong> {errorLogs.filter(log => log.isMobile).length}
          </div>
          <div>
            <strong>Critical/High:</strong> {errorLogs.filter(log => log.severity === 'critical' || log.severity === 'high').length}
          </div>
          <div>
            <strong>Safari Mobile:</strong> {errorLogs.filter(log => log.isSafari).length}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <p>💡 <strong>Tip:</strong> This dashboard shows real-time error logs from your mobile and desktop users.</p>
        <p>🔍 Logs are automatically captured when users encounter errors in the app.</p>
        <p>⚡ Critical errors are highlighted and can trigger alerts.</p>
      </div>
    </div>
  );
};

export default ErrorLogsDashboard;
