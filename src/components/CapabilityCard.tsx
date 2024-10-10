import React from 'react';
import './CapabilityCard.scss';

interface CapabilityCardProps {
  title: string;
}

export function CapabilityCard({ title }: CapabilityCardProps) {
  return (
    <div className="CapabilityCard">
      {title}
    </div>
  );
}