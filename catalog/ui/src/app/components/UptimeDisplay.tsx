import React from 'react';

interface UptimeDisplayProps {
  uptime: number;
}

const UptimeDisplay: React.FC<UptimeDisplayProps> = ({ uptime }) => {
  // Function to get color based on uptime percentage
  const getColor = (): string => {
    if (uptime >= 99) return '#4caf50'; // Green for high uptime
    if (uptime >= 95) return '#ff9800'; // Orange for moderate uptime
    return '#f44336'; // Red for low uptime
  };

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.progressBar,
          backgroundColor: getColor(),
          width: `${uptime}%`,
        }}
      />
      <p style={styles.uptimeText}>{uptime.toFixed(2)}%</p>
    </div>
  );
};

// Styles object with type annotation
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
    maxWidth: '400px',
    margin: '20px auto',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'row'
  },
  progressBar: {
    height: '20px',
    borderRadius: '5px',
    transition: 'width 0.5s ease',
  },
  uptimeText: {
    fontSize: '12px',
    fontWeight: 'bold',
    marginTop: '10px',
  },
};

export default UptimeDisplay;
