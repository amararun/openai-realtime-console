import React from 'react';
import './CapabilityCard.scss';

interface CapabilityCardProps {
  title: string;
}

export const CapabilityCard: React.FC<CapabilityCardProps> = ({ title }) => {
  return (
    <div className="capability-card">
      <div className="capability-card-title">{title}</div>
    </div>
  );
};