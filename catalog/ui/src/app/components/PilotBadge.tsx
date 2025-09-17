import React from 'react';

interface PilotBadgeProps {
  className?: string;
}

const PilotBadge: React.FC<PilotBadgeProps> = ({ className = '' }) => {
  return (
    <svg 
      width="40" 
      viewBox="0 0 40 24" 
      className={className}
      style={{ marginLeft: '6px', display: 'inline-block' }}
    >
      <path
        d="M4 4h32c2.209 0 4 2.686 4 6s-1.791 6-4 6H4c-2.209 0-4-2.686-4-6s1.791-6 4-6Z"
        fill="#e7f3ff"
      />
      <text
        x="20"
        y="14"
        textAnchor="middle"
        fill="#004080"
        fontSize="10"
        fontStyle="italic"
        fontFamily="'RedHatText', 'Overpass', overpass, helvetica, arial, sans-serif"
      >
        Pilot
      </text>
    </svg>
  );
};

export default PilotBadge;
