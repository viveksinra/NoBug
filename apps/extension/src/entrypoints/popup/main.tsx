import React from 'react';
import ReactDOM from 'react-dom/client';

function Popup() {
  return (
    <div style={{ width: 320, padding: 16, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>NoBug</h1>
      <p style={{ color: '#888', marginTop: 8 }}>Bug capture extension. Coming soon.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);
