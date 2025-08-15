import React from 'react';

interface LabIconProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

const LabIcon: React.FC<LabIconProps> = ({ 
  width = 60, 
  height = 60, 
  className = "demo-card__icon",
  style = {},
  alt = "Lab Icon"
}) => {
  return (
    <svg 
      className={className}
      style={{ width, height, ...style }}
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 36 36"
      role="img"
      aria-label={alt}
    >
      <defs>
        <style>
          {`.lab-icon-fill { fill: #e00; }`}
        </style>
      </defs>
      <g>
        <path 
          className="lab-icon-fill" 
          d="M14,18.62h8a.62.62,0,0,0,0-1.24h-.38V13a.62.62,0,0,0-1.24,0v4.38H18.62v-2.5a.62.62,0,1,0-1.24,0v2.5H15.62V16.12a.62.62,0,0,0-1.24,0v1.26H14a.62.62,0,0,0,0,1.24Z"
        />
        <path 
          className="lab-icon-fill" 
          d="M31,6.38H5A.61.61,0,0,0,4.38,7V24a.61.61,0,0,0,.62.62H15.38v3.76H9a.62.62,0,1,0,0,1.24H27a.62.62,0,0,0,0-1.24H20.62V24.62H31a.61.61,0,0,0,.62-.62V7A.61.61,0,0,0,31,6.38Zm-11.62,22H16.62V24.62h2.76Zm11-5H5.62V7.62H30.38Z"
        />
      </g>
    </svg>
  );
};

export default LabIcon;
