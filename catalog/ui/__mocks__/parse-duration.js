const parseDuration = (str) => {
  if (!str) return null;
  const units = { ms: 1, s: 1000, m: 60000, min: 60000, h: 3600000, d: 86400000, w: 604800000, y: 31536000000 };
  const match = str.match(/^(-?\d*\.?\d+)\s*(ms|min|[smhdwy])$/);
  if (!match) return null;
  return parseFloat(match[1]) * (units[match[2]] || 1);
};
module.exports = parseDuration;
module.exports.default = parseDuration;
