import React from 'react';

interface BetaBadgeProps {
  className?: string;
}

const BetaBadge: React.FC<BetaBadgeProps> = ({ className = '' }) => {
  return (
    <svg 
      width="40" 
      viewBox="0 0 40 24" 
      className={className}
      style={{ marginLeft: '6px', display: 'inline-block' }}
    >
      <path
        d="M4 4h32c2.209 0 4 2.686 4 6s-1.791 6-4 6H4c-2.209 0-4-2.686-4-6s1.791-6 4-6Z"
        fill="#faeae8"
      />
      <text
        x="20"
        y="14"
        textAnchor="middle"
        fill="#7d1007"
        fontSize="10"
        fontStyle="italic"
        fontFamily="'RedHatText', 'Overpass', overpass, helvetica, arial, sans-serif"
      >
        Beta
      </text>
    </svg>
  );
};

export default BetaBadge;
