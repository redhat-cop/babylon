import React from 'react';

import './hero.css';

const Hero: React.FC<{
  image: string;
  overlay?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}> = ({ image, overlay = false, compact = false, children }) => {
  return (
    <div
      className={`hero${overlay ? ' hero--overlay' : ''}${compact ? ' hero--compact' : ''}`}
      style={{ backgroundImage: `url(${image})` }}
    >
      {overlay && <div className="hero__overlay" />}
      <div className="hero__content">{children}</div>
    </div>
  );
};

export default Hero;
