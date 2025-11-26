import React from 'react';

const LogoVelocity = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 8l8-4 8 4-8 4-8-4z" />
    <path d="M4 8v8l8 4" />
    <path d="M12 20v-8" />
    <path d="M15 11l5 2.5" className="opacity-50" />
    <path d="M17 15l3 1.5" className="opacity-75" />
    <path d="M12 16l8 4" />
  </svg>
);

export default LogoVelocity;
