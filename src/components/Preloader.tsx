import { useState, useEffect, useCallback } from 'react';

interface PreloaderProps {
  onComplete: () => void;
  minimumDuration?: number;
}

const Preloader = ({ onComplete, minimumDuration = 3000 }: PreloaderProps) => {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  const finishLoading = useCallback(() => {
    setFadeOut(true);
    setTimeout(onComplete, 800);
  }, [onComplete]);

  useEffect(() => {
    const startTime = Date.now();
    let animFrame: number;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / minimumDuration) * 100, 100);
      setProgress(pct);

      if (pct < 100) {
        animFrame = requestAnimationFrame(tick);
      } else {
        finishLoading();
      }
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, [minimumDuration, finishLoading]);

  return (
    <div
      className={`preloader-overlay ${fadeOut ? 'preloader-fade-out' : ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #0a1a0f 0%, #040b06 40%, #010302 100%)',
        transition: 'opacity 0.8s ease-out',
        opacity: fadeOut ? 0 : 1,
      }}
    >
      {/* Logo with shine effect */}
      <div className="preloader-logo-wrapper">
        <div className="preloader-shine-container">
          <img
            src="/cyberx.png"
            alt="CyberX"
            className="preloader-logo"
          />
          <div className="preloader-shine" />
        </div>
      </div>

      {/* Tagline */}
      <div className="preloader-tagline">
        <span className="preloader-tagline-text">INITIALIZING SYSTEM</span>
        <span className="preloader-dots">
          <span>.</span><span>.</span><span>.</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="preloader-progress-track">
        <div
          className="preloader-progress-fill"
          style={{ width: `${progress}%` }}
        />
        <div
          className="preloader-progress-glow"
          style={{ left: `${progress}%` }}
        />
      </div>

      <div className="preloader-percent">
        {Math.floor(progress)}%
      </div>
    </div>
  );
};

export default Preloader;
