export const formatTime = (seconds) => {
  let totalSeconds = Number(seconds) || 0;
  if (totalSeconds < 0) totalSeconds = 0;

  const hours = Math.floor(totalSeconds / 3600);
  const remainingAfterHours = totalSeconds % 3600;
  const mins = Math.floor(remainingAfterHours / 60);
  const secs = Math.floor(remainingAfterHours % 60);
  const centisecs = Math.floor((remainingAfterHours % 1) * 100);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${mins}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
};

export const parseTimeString = (timeStr, maxDuration) => {
  try {
    const trimmed = timeStr.trim();
    if (!trimmed) return 0;

    const parts = trimmed.split(':');
    let seconds = 0;

    if (parts.length === 3) {
      const hours = parseInt(parts[0], 10) || 0;
      const mins = parseInt(parts[1], 10) || 0;
      const secs = parseFloat(parts[2]) || 0;
      seconds = hours * 3600 + mins * 60 + secs;
    } else if (parts.length === 2) {
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseFloat(parts[1]) || 0;
      seconds = mins * 60 + secs;
    } else {
      seconds = parseFloat(parts[0]) || 0;
    }

    return Math.max(0, Math.min(maxDuration, seconds));
  } catch {
    return 0;
  }
};