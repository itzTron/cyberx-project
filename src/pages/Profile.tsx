import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Check, Copy, ExternalLink, Github, Globe, Linkedin, LoaderCircle, Lock, Mail, MapPin, Navigation2, Phone, Plus, Save, Search, Trash2, X } from 'lucide-react';
import Cropper, { type Area } from 'react-easy-crop';

import Footer from '@/components/Footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  getCurrentUserProfile,
  updateCurrentUserEmail,
  updateCurrentUserProfile,
  getSecondaryEmail,
  sendSecondaryEmailOtp,
  verifyAndSaveSecondaryEmail,
  removeSecondaryEmail,
  changeUsername,
  type HubUserProfile,
} from '@/lib/hubApi';
import { loadGoogleMapsApi } from '@/lib/googleMaps';
import { geocodeWithLocationIQ, reverseGeocodeWithLocationIQ } from '@/lib/locationIQ';

const MAX_AVATAR_BYTES = 1_500_000;
const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629 };
type GeocodeResult = { lat: number; lng: number; label: string };

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part.trim()[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const normalizePreviewUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Unable to read image blob.'));
    reader.readAsDataURL(blob);
  });

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image.'));
    image.src = url;
  });

const createCroppedAvatarDataUrl = async (imageUrl: string, pixelCrop: Area) => {
  const image = await loadImage(imageUrl);
  const cropSize = Math.max(1, Math.round(Math.min(pixelCrop.width, pixelCrop.height)));
  const sourceX = Math.round(pixelCrop.x + (pixelCrop.width - cropSize) / 2);
  const sourceY = Math.round(pixelCrop.y + (pixelCrop.height - cropSize) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = cropSize;
  canvas.height = cropSize;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to initialize canvas for avatar crop.');
  }

  context.clearRect(0, 0, cropSize, cropSize);
  context.save();
  context.beginPath();
  context.arc(cropSize / 2, cropSize / 2, cropSize / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, cropSize, cropSize);
  context.restore();

  return canvas.toDataURL('image/png');
};

const Profile = () => {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [profile, setProfile] = useState<HubUserProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [isMapDialogOpen, setIsMapDialogOpen] = useState(false);
  const [mapSearchAddress, setMapSearchAddress] = useState('');
  const [mapStatus, setMapStatus] = useState('');
  const [isMapBusy, setIsMapBusy] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savedAvatarUrl, setSavedAvatarUrl] = useState('');
  const [email, setEmail] = useState('');
  // ── Username change state
  const [currentUsername, setCurrentUsername] = useState('');
  const [usernameCopied, setUsernameCopied] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [showUsernamePassword, setShowUsernamePassword] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState('');
  const [usernameStatusOk, setUsernameStatusOk] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [secondaryEmail, setSecondaryEmail] = useState('');
  const [newSecondaryEmail, setNewSecondaryEmail] = useState('');
  const [secondaryOtp, setSecondaryOtp] = useState('');
  // 'idle' | 'entering' | 'otp_sent' | 'saving' | 'done'
  const [secondaryStep, setSecondaryStep] = useState<'idle' | 'entering' | 'otp_sent' | 'saving'>('idle');
  const [secondaryStatus, setSecondaryStatus] = useState('');
  const [secondaryStatusOk, setSecondaryStatusOk] = useState(false);
  const [isSecondaryLoading, setIsSecondaryLoading] = useState(false);
  const [profileStatus, setProfileStatus] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [cropSourceImage, setCropSourceImage] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapMarkerRef = useRef<any>(null);

  const mapClickListenerRef = useRef<any>(null);
  const markerDragListenerRef = useRef<any>(null);
  const hasAvatarChanges = avatarUrl.trim() !== savedAvatarUrl.trim();
  const googleMapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';
  const locationIQApiKey = (import.meta.env.VITE_LOCATIONIQ_API_KEY as string | undefined)?.trim() || '';

  const syncForm = (data: HubUserProfile) => {
    setProfile(data);
    setFullName(data.fullName);
    setPhoneNumber(data.phoneNumber);
    setAddress(data.address);
    setBio(data.bio);
    setLinkedinUrl(data.linkedinUrl);
    setGithubUrl(data.githubUrl);
    setWebsiteUrl(data.websiteUrl);
    setLocationLabel(data.locationLabel);
    setLocationLat(data.locationLat);
    setLocationLng(data.locationLng);
    setMapSearchAddress(data.locationLabel || data.address);
    setAvatarUrl(data.avatarUrl);
    setSavedAvatarUrl(data.avatarUrl);
    setEmail(data.email);
    setCurrentUsername(data.username);
    // Load secondary email
    getSecondaryEmail().then((v) => setSecondaryEmail(v)).catch(() => {});
  };

  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      setAccessError('');

      try {
        const userProfile = await getCurrentUserProfile();
        syncForm(userProfile);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load profile.';
        setAccessError(message);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, []);

  const openCropDialogForImage = async (sourceImage: string) => {
    if (!sourceImage.trim()) {
      setProfileStatus('Select an image first.');
      return;
    }

    try {
      const normalizedImage = sourceImage.startsWith('data:')
        ? sourceImage
        : await fetch(sourceImage)
            .then((response) => {
              if (!response.ok) {
                throw new Error('Unable to fetch image for cropping.');
              }
              return response.blob();
            })
            .then((blob) => readBlobAsDataUrl(blob));

      setCropSourceImage(normalizedImage);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsCropDialogOpen(true);
      setProfileStatus('Adjust avatar crop and apply. Save profile to keep the change.');
    } catch {
      setProfileStatus('Unable to open crop editor. Re-upload the image to crop it.');
    }
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setProfileStatus('Avatar must be under 1.5 MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setProfileStatus('Select an image file for the avatar.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      await openCropDialogForImage(dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process avatar.';
      setProfileStatus(message);
    } finally {
      event.target.value = '';
    }
  };

  const triggerAvatarFilePicker = () => {
    avatarFileInputRef.current?.click();
  };

  const handleAvatarDelete = () => {
    setAvatarUrl('');
    setProfileStatus('Avatar removed. Save profile to apply changes.');
  };

  const handleAvatarCropEdit = async () => {
    await openCropDialogForImage(avatarUrl);
  };

  const handleApplyCrop = async () => {
    if (!cropSourceImage || !croppedAreaPixels) {
      setProfileStatus('Adjust the crop area before applying.');
      return;
    }

    setIsApplyingCrop(true);
    try {
      const croppedAvatar = await createCroppedAvatarDataUrl(cropSourceImage, croppedAreaPixels);
      setAvatarUrl(croppedAvatar);
      setIsCropDialogOpen(false);
      setProfileStatus('Avatar crop updated. Save profile to apply changes.');
    } catch {
      setProfileStatus('Unable to apply avatar crop. Try again.');
    } finally {
      setIsApplyingCrop(false);
    }
  };

  const updateSelectedLocation = ({
    lat,
    lng,
    label,
  }: {
    lat: number;
    lng: number;
    label: string;
  }) => {
    setLocationLat(lat);
    setLocationLng(lng);
    if (label.trim()) {
      setLocationLabel(label.trim());
      setAddress(label.trim());
      setMapSearchAddress(label.trim());
    }
  };

  const geocodeAddress = async (addressQuery: string): Promise<GeocodeResult> => {
    return geocodeWithLocationIQ(locationIQApiKey, addressQuery);
  };

  const reverseGeocodePosition = async (lat: number, lng: number): Promise<string> => {
    return reverseGeocodeWithLocationIQ(locationIQApiKey, lat, lng);
  };

  const handleGetGpsLocation = async () => {
    if (!navigator.geolocation) {
      setProfileStatus('Geolocation is not supported by your browser.');
      return;
    }

    setIsGpsLoading(true);
    setProfileStatus('');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = position.coords;
      setLocationLat(latitude);
      setLocationLng(longitude);

      // Reverse geocode to get a readable address
      try {
        const label = await reverseGeocodePosition(latitude, longitude);
        if (label) {
          setLocationLabel(label);
          setAddress(label);
          setMapSearchAddress(label);
        } else {
          const coordLabel = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          setLocationLabel(coordLabel);
          setAddress(coordLabel);
        }
      } catch {
        const coordLabel = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        setLocationLabel(coordLabel);
        setAddress(coordLabel);
      }

      setProfileStatus('GPS location detected successfully.');
    } catch (error) {
      const geoError = error as GeolocationPositionError;
      switch (geoError.code) {
        case geoError.PERMISSION_DENIED:
          setProfileStatus('Location permission denied. Please allow GPS access in your browser settings.');
          break;
        case geoError.POSITION_UNAVAILABLE:
          setProfileStatus('Location information is unavailable.');
          break;
        case geoError.TIMEOUT:
          setProfileStatus('GPS request timed out. Please try again.');
          break;
        default:
          setProfileStatus('Unable to get your location.');
      }
    } finally {
      setIsGpsLoading(false);
    }
  };

  const setMarkerPosition = (google: any, lat: number, lng: number) => {
    const position = new google.maps.LatLng(lat, lng);
    if (!mapMarkerRef.current) {
      mapMarkerRef.current = new google.maps.Marker({
        map: mapInstanceRef.current,
        position,
        draggable: true,
      });
    } else {
      mapMarkerRef.current.setPosition(position);
    }

    mapInstanceRef.current?.panTo(position);
  };

  const applyPickedLocation = async (_google: any, lat: number, lng: number) => {
    const label = await reverseGeocodePosition(lat, lng);
    updateSelectedLocation({
      lat,
      lng,
      label: label || address || locationLabel || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    });
  };

  const searchAddressOnMap = async (addressQuery: string) => {
    if (!addressQuery.trim()) {
      setMapStatus('Enter an address to locate on map.');
      return;
    }

    setIsMapBusy(true);
    setMapStatus('');
    try {
      const result = await geocodeAddress(addressQuery.trim());

      const { lat, lng } = result;

      // If the Google Map is loaded, move the marker on it
      if (googleMapsApiKey && mapInstanceRef.current) {
        try {
          const google = await loadGoogleMapsApi(googleMapsApiKey);
          setMarkerPosition(google, lat, lng);
          mapInstanceRef.current.setZoom(15);
        } catch {
          // Map pan failed – coordinates are still saved
        }
      }

      updateSelectedLocation({
        lat,
        lng,
        label: result.label || addressQuery.trim(),
      });
      setMapStatus('Address located. You can drag the pin to fine tune.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setMapStatus(message || 'Unable to locate this address.');
    } finally {
      setIsMapBusy(false);
    }
  };

  const openMapDialog = () => {
    setIsMapDialogOpen(true);
    setMapStatus('');
    setMapSearchAddress((current) => current || locationLabel || address);
  };

  useEffect(() => {
    if (!isMapDialogOpen) {
      return;
    }

    if (!googleMapsApiKey) {
      setIsMapReady(false);
      setMapStatus('Set VITE_GOOGLE_MAPS_API_KEY in .env to enable the interactive map picker.');
      return;
    }

    let isCancelled = false;
    const initMap = async () => {
      setIsMapBusy(true);
      try {
        const google = await loadGoogleMapsApi(googleMapsApiKey);
        if (isCancelled || !mapContainerRef.current) {
          return;
        }

        const initialCenter =
          typeof locationLat === 'number' && typeof locationLng === 'number'
            ? { lat: locationLat, lng: locationLng }
            : DEFAULT_MAP_CENTER;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new google.maps.Map(mapContainerRef.current, {
            center: initialCenter,
            zoom: typeof locationLat === 'number' && typeof locationLng === 'number' ? 14 : 5,
            streetViewControl: false,
            mapTypeControl: false,
          });
        } else {
          mapInstanceRef.current.setCenter(initialCenter);
          mapInstanceRef.current.setZoom(typeof locationLat === 'number' && typeof locationLng === 'number' ? 14 : 5);
        }

        setMarkerPosition(google, initialCenter.lat, initialCenter.lng);

        if (mapClickListenerRef.current) {
          google.maps.event.removeListener(mapClickListenerRef.current);
        }
        mapClickListenerRef.current = mapInstanceRef.current.addListener('click', (event: any) => {
          if (!event?.latLng) {
            return;
          }

          const lat = event.latLng.lat();
          const lng = event.latLng.lng();
          setMarkerPosition(google, lat, lng);
          void applyPickedLocation(google, lat, lng);
        });

        if (markerDragListenerRef.current) {
          google.maps.event.removeListener(markerDragListenerRef.current);
        }
        markerDragListenerRef.current = mapMarkerRef.current.addListener('dragend', (event: any) => {
          if (!event?.latLng) {
            return;
          }

          const lat = event.latLng.lat();
          const lng = event.latLng.lng();
          void applyPickedLocation(google, lat, lng);
        });

        setIsMapReady(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to initialize Google Map.';
        setMapStatus(message);
        setIsMapReady(false);
      } finally {
        if (!isCancelled) {
          setIsMapBusy(false);
        }
      }
    };

    void initMap();

    return () => {
      isCancelled = true;

      // Clean up map refs when dialog closes so a fresh map is created on re-open
      const google = (window as any).google;
      if (google?.maps?.event) {
        if (mapClickListenerRef.current) {
          google.maps.event.removeListener(mapClickListenerRef.current);
          mapClickListenerRef.current = null;
        }
        if (markerDragListenerRef.current) {
          google.maps.event.removeListener(markerDragListenerRef.current);
          markerDragListenerRef.current = null;
        }
      }

      if (mapMarkerRef.current) {
        mapMarkerRef.current.setMap?.(null);
        mapMarkerRef.current = null;
      }

      mapInstanceRef.current = null;
      setIsMapReady(false);
    };
  }, [googleMapsApiKey, isMapDialogOpen, locationLat, locationLng]);

  useEffect(
    () => () => {
      const google = (window as any).google;
      if (google?.maps?.event) {
        if (mapClickListenerRef.current) {
          google.maps.event.removeListener(mapClickListenerRef.current);
        }
        if (markerDragListenerRef.current) {
          google.maps.event.removeListener(markerDragListenerRef.current);
        }
      }
    },
    [],
  );

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileStatus('');

    try {
      const updated = await updateCurrentUserProfile({
        fullName,
        phoneNumber,
        address,
        bio,
        linkedinUrl,
        githubUrl,
        websiteUrl,
        locationLabel,
        locationLat,
        locationLng,
        avatarUrl,
      });
      syncForm(updated);
      setProfileStatus('Profile updated successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update profile.';
      setProfileStatus(message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleEmailUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingEmail(true);
    setEmailStatus('');

    try {
      const result = await updateCurrentUserEmail(email);
      setEmailStatus(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update email.';
      setEmailStatus(message);
    } finally {
      setIsSavingEmail(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">


      <section className="pt-28 pb-16">
        <div className="container mx-auto px-4 max-w-4xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Profile Settings</h1>
            <p className="text-muted-foreground mt-2">Manage your profile picture, bio, personal details, and public links.</p>
          </div>

          {isBootstrapping && (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">Loading profile...</CardContent>
            </Card>
          )}

          {!isBootstrapping && accessError && (
            <Card>
              <CardHeader>
                <CardTitle>Access Required</CardTitle>
                <CardDescription>{accessError}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link to="/signin">Go to Sign In</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!isBootstrapping && !accessError && profile && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Public Profile Preview</CardTitle>
                  <CardDescription>Preview the profile image, name, username, bio, and links shown on your profile.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border bg-muted/20 p-5 space-y-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:text-left gap-5">
                        <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-primary/40 bg-background p-1">
                          <Avatar className="h-full w-full">
                            <AvatarImage src={avatarUrl || undefined} alt={fullName || profile.username} />
                            <AvatarFallback>{getInitials(fullName || profile.username)}</AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-2xl font-semibold text-foreground">{fullName || 'Your name'}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-muted-foreground">@{profile.username}</p>
                              <button
                                type="button"
                                title="Copy username"
                                onClick={() => {
                                  void navigator.clipboard.writeText(profile.username);
                                  setUsernameCopied(true);
                                  setTimeout(() => setUsernameCopied(false), 2000);
                                }}
                                className="text-muted-foreground hover:text-primary transition-colors"
                              >
                                {usernameCopied
                                  ? <span className="text-xs text-primary">Copied!</span>
                                  : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                          <p className="max-w-xl text-sm text-muted-foreground">
                            {bio.trim() || 'Add a bio to tell people about your work.'}
                          </p>
                          {hasAvatarChanges && <p className="text-xs text-primary">Unsaved avatar changes</p>}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 justify-center lg:justify-end">
                        <Button type="button" variant="outline" onClick={triggerAvatarFilePicker}>
                          <Camera className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleAvatarCropEdit()}
                          disabled={!avatarUrl}
                        >
                          Edit
                        </Button>
                        <Button type="button" variant="outline" onClick={handleAvatarDelete} disabled={!avatarUrl}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Phone className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{phoneNumber.trim() || 'Add your phone number in profile details.'}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{address.trim() || 'Add your address in profile details.'}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {typeof locationLat === 'number' && typeof locationLng === 'number' ? (
                        <>
                          <span className="inline-flex items-center gap-1">
                            Coordinates:
                            <span className="font-medium text-foreground">{locationLat.toFixed(6)}</span>,
                            <span className="font-medium text-foreground">{locationLng.toFixed(6)}</span>
                          </span>
                          <Button type="button" variant="outline" size="sm" onClick={openMapDialog}>
                            Open Map Preview
                          </Button>
                        </>
                      ) : (
                        <span>No pinned location yet. Open the map picker in Profile Details.</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {linkedinUrl.trim() && (
                        <a
                          href={normalizePreviewUrl(linkedinUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <Linkedin className="h-4 w-4" />
                          LinkedIn
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {githubUrl.trim() && (
                        <a
                          href={normalizePreviewUrl(githubUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <Github className="h-4 w-4" />
                          GitHub
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {websiteUrl.trim() && (
                        <a
                          href={normalizePreviewUrl(websiteUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <Globe className="h-4 w-4" />
                          Website
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Upload an image, then use <span className="font-medium text-foreground">Edit</span> to open a
                      large crop window with a circular avatar guide.
                    </p>
                  </div>

                  <Input
                    id="profile-avatar-upload"
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleAvatarUpload(event)}
                    className="hidden"
                  />
                </CardContent>
              </Card>

              <Dialog open={isCropDialogOpen} onOpenChange={setIsCropDialogOpen}>
                <DialogContent className="max-w-5xl p-0">
                  <DialogHeader className="px-6 pt-6">
                    <DialogTitle>Crop Profile Picture</DialogTitle>
                    <DialogDescription>
                      Move and zoom your image inside the circular frame to position your avatar.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="px-6 pb-6 space-y-4">
                    <div className="relative h-[50vh] min-h-[340px] overflow-hidden rounded-md border border-border bg-black/80">
                      {cropSourceImage && (
                        <Cropper
                          image={cropSourceImage}
                          crop={crop}
                          zoom={zoom}
                          aspect={1}
                          cropShape="round"
                          showGrid={false}
                          objectFit="contain"
                          onCropChange={setCrop}
                          onZoomChange={setZoom}
                          onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                        />
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-foreground">
                        <span>Zoom</span>
                        <span>{zoom.toFixed(2)}x</span>
                      </div>
                      <Slider
                        value={[zoom]}
                        min={1}
                        max={3}
                        step={0.05}
                        onValueChange={(values) => setZoom(values[0] ?? 1)}
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsCropDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={() => void handleApplyCrop()} disabled={isApplyingCrop}>
                        {isApplyingCrop ? (
                          <span className="inline-flex items-center gap-2">
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Applying...
                          </span>
                        ) : (
                          'Apply Crop'
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isMapDialogOpen} onOpenChange={setIsMapDialogOpen}>
                <DialogContent className="max-w-6xl">
                  <DialogHeader>
                    <DialogTitle>Map Location Picker</DialogTitle>
                    <DialogDescription>Search an address or click anywhere on the map to set an accurate pin.</DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={mapSearchAddress}
                        onChange={(event) => setMapSearchAddress(event.target.value)}
                        placeholder="Search address for map pin"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void searchAddressOnMap(mapSearchAddress)}
                        disabled={isMapBusy}
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Locate
                      </Button>
                    </div>

                    {!googleMapsApiKey ? (
                      <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                        Google Maps is disabled. Add `VITE_GOOGLE_MAPS_API_KEY` to your `.env` file, then reload.
                      </div>
                    ) : (
                      <div
                        ref={mapContainerRef}
                        className="h-[62vh] min-h-[360px] w-full rounded-md border border-border bg-muted/30"
                      />
                    )}

                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Picked address: {locationLabel || address || 'Not selected yet'}</span>
                      <span>
                        Coordinates:{' '}
                        {typeof locationLat === 'number' && typeof locationLng === 'number'
                          ? `${locationLat.toFixed(6)}, ${locationLng.toFixed(6)}`
                          : 'Not selected yet'}
                      </span>
                      {isMapReady && <span>Tip: click on the map or drag the marker.</span>}
                    </div>
                    {mapStatus && <p className="text-sm text-muted-foreground">{mapStatus}</p>}
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsMapDialogOpen(false)}>
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Card>
                <CardHeader>
                  <CardTitle>Profile Details</CardTitle>
                  <CardDescription>Update your personal details, bio, and public profile links.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProfileSave} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="profile-full-name" className="block text-sm text-foreground mb-2">
                          Full Name
                        </label>
                        <Input
                          id="profile-full-name"
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          placeholder="Your full name"
                        />
                      </div>

                      <div>
                        <label htmlFor="profile-phone" className="block text-sm text-foreground mb-2">
                          Phone Number
                        </label>
                        <Input
                          id="profile-phone"
                          value={phoneNumber}
                          onChange={(event) => setPhoneNumber(event.target.value)}
                          placeholder="+1 555 123 4567"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="profile-address" className="block text-sm text-foreground mb-2">
                        Address
                      </label>
                      <Textarea
                        id="profile-address"
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        placeholder="City, state, country or full address"
                        className="min-h-[88px]"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleGetGpsLocation()}
                          disabled={isGpsLoading}
                        >
                          {isGpsLoading ? (
                            <LoaderCircle className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Navigation2 className="h-4 w-4 mr-2" />
                          )}
                          {isGpsLoading ? 'Detecting...' : 'Use GPS'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void searchAddressOnMap(address)}
                          disabled={isMapBusy}
                        >
                          <Search className="h-4 w-4 mr-2" />
                          Locate Address
                        </Button>
                        <Button type="button" variant="outline" onClick={openMapDialog}>
                          <MapPin className="h-4 w-4 mr-2" />
                          Pinpoint On Map
                        </Button>
                      </div>
                      {locationLabel && <p className="mt-2 text-xs text-muted-foreground">Pinned address: {locationLabel}</p>}
                      {typeof locationLat === 'number' && typeof locationLng === 'number' && (
                        <p className="text-xs text-muted-foreground">
                          Coordinates: {locationLat.toFixed(6)}, {locationLng.toFixed(6)}
                        </p>
                      )}
                      {mapStatus && <p className="mt-1 text-xs text-muted-foreground">{mapStatus}</p>}
                    </div>

                    <div>
                      <label htmlFor="profile-bio" className="block text-sm text-foreground mb-2">
                        Bio
                      </label>
                      <Textarea
                        id="profile-bio"
                        value={bio}
                        onChange={(event) => setBio(event.target.value)}
                        placeholder="Share what you work on."
                        className="min-h-[120px]"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label htmlFor="profile-linkedin" className="block text-sm text-foreground mb-2">
                          LinkedIn Profile
                        </label>
                        <Input
                          id="profile-linkedin"
                          value={linkedinUrl}
                          onChange={(event) => setLinkedinUrl(event.target.value)}
                          placeholder="linkedin.com/in/your-name"
                        />
                      </div>

                      <div>
                        <label htmlFor="profile-github" className="block text-sm text-foreground mb-2">
                          GitHub Profile
                        </label>
                        <Input
                          id="profile-github"
                          value={githubUrl}
                          onChange={(event) => setGithubUrl(event.target.value)}
                          placeholder="github.com/your-handle"
                        />
                      </div>

                      <div>
                        <label htmlFor="profile-website" className="block text-sm text-foreground mb-2">
                          Website
                        </label>
                        <Input
                          id="profile-website"
                          value={websiteUrl}
                          onChange={(event) => setWebsiteUrl(event.target.value)}
                          placeholder="yourwebsite.com"
                        />
                      </div>
                    </div>

                    {profileStatus && <p className="text-sm text-muted-foreground">{profileStatus}</p>}

                    <Button type="submit" disabled={isSavingProfile}>
                      {isSavingProfile ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Saving...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Save className="h-4 w-4" />
                          Save Profile
                        </span>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* ── Account Email Card ─────────────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle>Account Email</CardTitle>
                  <CardDescription>
                    Your primary email is locked and cannot be changed. You can add a secondary email for authentication — the same secondary email may be used on multiple accounts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* Primary email — read-only */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Primary Email
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30">
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground flex-1 truncate">{email || '—'}</span>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        Primary
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      This is the email registered to your account and cannot be transferred to another account.
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-border" />

                  {/* Secondary email */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Secondary Email
                      <span className="ml-2 text-xs text-muted-foreground font-normal">(optional, for authentication)</span>
                    </label>

                    {/* Show current secondary email */}
                    {secondaryEmail && secondaryStep === 'idle' && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30 mb-3">
                        <Mail className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm text-foreground flex-1 truncate">{secondaryEmail}</span>
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                          Verified
                        </span>
                        <button
                          type="button"
                          title="Remove secondary email"
                          onClick={async () => {
                            try {
                              await removeSecondaryEmail();
                              setSecondaryEmail('');
                            } catch (e) {
                              setSecondaryStatus(e instanceof Error ? e.message : 'Failed to remove.');
                              setSecondaryStatusOk(false);
                            }
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Step: idle — show Add button */}
                    {secondaryStep === 'idle' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setSecondaryStep('entering'); setSecondaryStatus(''); }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {secondaryEmail ? 'Change Secondary Email' : 'Add Secondary Email'}
                      </Button>
                    )}

                    {/* Step: entering email */}
                    {secondaryStep === 'entering' && (
                      <div className="space-y-3">
                        <Input
                          type="email"
                          placeholder="new@example.com"
                          value={newSecondaryEmail}
                          onChange={(e) => setNewSecondaryEmail(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isSecondaryLoading}
                            onClick={async () => {
                              setSecondaryStatus('');
                              setIsSecondaryLoading(true);
                              try {
                                await sendSecondaryEmailOtp(newSecondaryEmail);
                                setSecondaryStep('otp_sent');
                                setSecondaryStatus('Verification code sent. Check your inbox.');
                                setSecondaryStatusOk(true);
                              } catch (e) {
                                setSecondaryStatus(e instanceof Error ? e.message : 'Failed to send code.');
                                setSecondaryStatusOk(false);
                              } finally {
                                setIsSecondaryLoading(false);
                              }
                            }}
                          >
                            {isSecondaryLoading
                              ? <><LoaderCircle className="h-4 w-4 animate-spin mr-2" />Sending…</>
                              : <><Mail className="h-4 w-4 mr-2" />Send Verification Code</>}
                          </Button>
                          <Button type="button" size="sm" variant="ghost"
                            onClick={() => { setSecondaryStep('idle'); setNewSecondaryEmail(''); setSecondaryStatus(''); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Step: OTP verification */}
                    {secondaryStep === 'otp_sent' && (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Enter the 6-digit code sent to <strong className="text-foreground">{newSecondaryEmail}</strong>
                        </p>
                        {/* OTP digit input */}
                        <Input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="000000"
                          value={secondaryOtp}
                          onChange={(e) => setSecondaryOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="tracking-[0.5em] text-center text-xl font-mono w-44"
                          autoFocus
                        />
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isSecondaryLoading || secondaryOtp.length !== 6}
                            onClick={async () => {
                              setSecondaryStatus('');
                              setIsSecondaryLoading(true);
                              try {
                                await verifyAndSaveSecondaryEmail(newSecondaryEmail, secondaryOtp);
                                setSecondaryEmail(newSecondaryEmail);
                                setSecondaryStep('idle');
                                setNewSecondaryEmail('');
                                setSecondaryOtp('');
                                setSecondaryStatus('Secondary email verified and saved!');
                                setSecondaryStatusOk(true);
                              } catch (e) {
                                setSecondaryStatus(e instanceof Error ? e.message : 'Verification failed.');
                                setSecondaryStatusOk(false);
                              } finally {
                                setIsSecondaryLoading(false);
                              }
                            }}
                          >
                            {isSecondaryLoading
                              ? <><LoaderCircle className="h-4 w-4 animate-spin mr-2" />Verifying…</>
                              : <><Check className="h-4 w-4 mr-2" />Verify Code</>}
                          </Button>
                          <Button type="button" size="sm" variant="outline"
                            onClick={async () => {
                              setSecondaryStatus('');
                              setIsSecondaryLoading(true);
                              try {
                                await sendSecondaryEmailOtp(newSecondaryEmail);
                                setSecondaryStatus('New code sent.');
                                setSecondaryStatusOk(true);
                                setSecondaryOtp('');
                              } catch (e) {
                                setSecondaryStatus(e instanceof Error ? e.message : 'Failed.');
                                setSecondaryStatusOk(false);
                              } finally {
                                setIsSecondaryLoading(false);
                              }
                            }}
                            disabled={isSecondaryLoading}
                          >
                            Resend Code
                          </Button>
                          <Button type="button" size="sm" variant="ghost"
                            onClick={() => { setSecondaryStep('idle'); setSecondaryOtp(''); setSecondaryStatus(''); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Status message */}
                    {secondaryStatus && (
                      <p className={`mt-2 text-sm flex items-center gap-1.5 ${
                        secondaryStatusOk ? 'text-green-400' : 'text-destructive'
                      }`}>
                        {secondaryStatusOk
                          ? <Check className="h-3.5 w-3.5" />
                          : <X className="h-3.5 w-3.5" />}
                        {secondaryStatus}
                      </p>
                    )}

                    <p className="mt-3 text-xs text-muted-foreground">
                      The same secondary email can be linked to more than one account. A secondary email cannot be used as a primary email on a different account.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* ── Change Username Card ──────────────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle>Username</CardTitle>
                  <CardDescription>
                    Change your public username. Your username must be unique and 3–30 characters. You'll need your account password to confirm the change.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Current username display */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Current Username</label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30">
                      <span className="text-sm text-muted-foreground">@</span>
                      <span className="text-sm text-foreground flex-1">{currentUsername || profile?.username || '—'}</span>
                      <button
                        type="button"
                        title="Copy username"
                        onClick={() => {
                          void navigator.clipboard.writeText(currentUsername || profile?.username || '');
                          setUsernameCopied(true);
                          setTimeout(() => setUsernameCopied(false), 2000);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
                      >
                        {usernameCopied
                          ? <span className="text-xs text-primary">Copied!</span>
                          : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-border" />

                  {/* New username input */}
                  <div>
                    <label htmlFor="new-username" className="block text-sm font-medium text-foreground mb-2">
                      New Username
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm pointer-events-none">@</span>
                      <Input
                        id="new-username"
                        type="text"
                        value={newUsername}
                        onChange={(e) => {
                          setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                          setUsernameStatus('');
                        }}
                        placeholder="new_username"
                        className="pl-8"
                        maxLength={30}
                      />
                    </div>
                    {/* Live format feedback */}
                    {newUsername && (
                      (() => {
                        const valid = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(newUsername);
                        return (
                          <p className={`mt-1.5 text-xs ${valid ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {valid
                              ? '✓ Valid username format'
                              : '3–30 chars, start & end with letter/number, may contain . - _'}
                          </p>
                        );
                      })()
                    )}
                  </div>

                  {/* Password confirmation */}
                  <div>
                    <label htmlFor="username-password" className="block text-sm font-medium text-foreground mb-2">
                      Confirm with Password
                    </label>
                    <div className="relative">
                      <Input
                        id="username-password"
                        type={showUsernamePassword ? 'text' : 'password'}
                        value={usernamePassword}
                        onChange={(e) => setUsernamePassword(e.target.value)}
                        placeholder="Your account password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowUsernamePassword((v) => !v)}
                        className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground"
                      >
                        {showUsernamePassword ? <X className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Status */}
                  {usernameStatus && (
                    <p className={`text-sm flex items-center gap-1.5 ${usernameStatusOk ? 'text-green-400' : 'text-destructive'}`}>
                      {usernameStatusOk ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      {usernameStatus}
                    </p>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSavingUsername || !newUsername || !usernamePassword}
                    onClick={async () => {
                      setUsernameStatus('');
                      setIsSavingUsername(true);
                      try {
                        const saved = await changeUsername(newUsername, usernamePassword);
                        setCurrentUsername(saved);
                        setNewUsername('');
                        setUsernamePassword('');
                        setUsernameStatus('Username changed successfully!');
                        setUsernameStatusOk(true);
                      } catch (e) {
                        setUsernameStatus(e instanceof Error ? e.message : 'Failed to change username.');
                        setUsernameStatusOk(false);
                      } finally {
                        setIsSavingUsername(false);
                      }
                    }}
                  >
                    {isSavingUsername
                      ? <><LoaderCircle className="h-4 w-4 animate-spin mr-2" />Saving…</>
                      : <><Save className="h-4 w-4 mr-2" />Change Username</>}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Profile;
