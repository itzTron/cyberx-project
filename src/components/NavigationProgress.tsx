import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * GitHub-style navigation progress bar.
 * Shows a thin, animated bar at the top of the page during route transitions.
 */
const NavigationProgress = () => {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const previousPath = useRef(location.pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (location.pathname === previousPath.current) return;
    previousPath.current = location.pathname;

    cleanup();

    // Start the progress bar
    setProgress(0);
    setIsVisible(true);

    // Quickly jump to ~30%
    requestAnimationFrame(() => {
      setProgress(30);
    });

    // Gradually increase (simulates loading)
    let current = 30;
    intervalRef.current = setInterval(() => {
      current += Math.random() * 12 + 3;
      if (current >= 90) {
        current = 90;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
      setProgress(current);
    }, 200);

    // Complete the bar after a short delay (page has rendered)
    timerRef.current = setTimeout(() => {
      cleanup();
      setProgress(100);

      // Hide after the completion animation
      timerRef.current = setTimeout(() => {
        setIsVisible(false);
        setProgress(0);
      }, 400);
    }, 600);

    return cleanup;
  }, [location.pathname, cleanup]);

  if (!isVisible && progress === 0) return null;

  return (
    <div
      className="nav-progress-container"
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <div
        className="nav-progress-bar"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

export default NavigationProgress;
