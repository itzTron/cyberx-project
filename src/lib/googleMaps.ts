let googleMapsLoaderPromise: Promise<any> | null = null;

export const loadGoogleMapsApi = (apiKey: string) => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps API can only load in the browser.'));
  }

  const win = window as any;
  if (win.google?.maps) {
    return Promise.resolve(win.google);
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve((window as any).google));
      existingScript.addEventListener('error', () => reject(new Error('Unable to load Google Maps API.')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = 'true';
    script.onload = () => resolve((window as any).google);
    script.onerror = () => reject(new Error('Unable to load Google Maps API.'));
    document.head.appendChild(script);
  }).catch((error) => {
    googleMapsLoaderPromise = null;
    throw error;
  });

  return googleMapsLoaderPromise;
};
