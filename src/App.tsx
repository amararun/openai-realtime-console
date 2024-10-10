import React from 'react';
import { BrowserRouter as Router, Route, Link, Routes } from 'react-router-dom';
import { ConsolePage } from './pages/ConsolePage';
import { SimpleVoiceBotPage } from './pages/SimpleVoiceBotPage';
import './App.scss';

function App() {
  return (
    <Router>
      <div className="App">
        <nav>
          <ul>
            <li>
              <Link to="/">REALTIME</Link>
            </li>
            <li>
              <Link to="/simple-voice-bot">VOICE</Link>
            </li>
          </ul>
        </nav>

        <Routes>
          <Route path="/" element={<ConsolePage />} />
          <Route path="/simple-voice-bot" element={<SimpleVoiceBotPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
