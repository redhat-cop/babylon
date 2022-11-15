import React from 'react';

const Hero: React.FC<{ image: string; children: React.ReactNode }> = ({ image, children, ...rest }) => {
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyItems: 'center',
    color: '#fff',
    textAlign: 'center',
    backgroundImage: `url(${image})`,
    backgroundSize: 'cover',
    backgroundPositionY: 'center',
    padding: '128px 24px',
    margin: 0,
    marginBottom: 'var(--pf-global--spacer--md)',
  };
  return (
    <div style={style} {...rest}>
      {children}
    </div>
  );
};

export default Hero;
