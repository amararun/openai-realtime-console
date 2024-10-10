import React from 'react';
import { CapabilityCard } from '../components/CapabilityCard';
import './ConsolePage.scss'; // Using ConsolePage.scss for styles

export function SimpleVoiceBotPage() {
  const capabilities = [
    { title: "MySQL DW" },
    { title: "Text-to-SQL" },
    { title: "Analyze Data" },
    { title: "Python Charts" },
    { title: "Yahoo Finance" },
    { title: "Update Trackers" },
    { title: "Slide Deck" },
    { title: "Email Reports" },
  ];

  return (
    <div data-component="SimpleVoiceBotPage">
      <div className="header-section">
        <div className="capabilities-section">
          {capabilities.map((capability, index) => (
            <CapabilityCard key={index} title={capability.title} />
          ))}
        </div>
        <div className="main-header">
          <div className="content-title">
            <img src={`${process.env.PUBLIC_URL}/FXISLOGO.png`} alt="FXIS Logo" className="fxis-logo" />
            <span>Simple Voice Bot</span>
          </div>
        </div>
      </div>
      <div className="content-main">
        <h2>This is the Simple Voice Bot Page</h2>
        {/* Add more content specific to the Simple Voice Bot page here */}
      </div>
    </div>
  );
}