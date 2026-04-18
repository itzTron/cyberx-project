import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ExternalLink, Github, Globe, Linkedin, LoaderCircle, Mail, MapPin, Phone, Save, Search, Trash2 } from 'lucide-react';
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
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savedAvatarUrl, setSavedAvatarUrl] = useState('');
  const [email, setEmail] = useState('');
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
                            <p className="text-sm text-muted-foreground">@{profile.username}</p>
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

              <Card>
                <CardHeader>
                  <CardTitle>Account Email</CardTitle>
                  <CardDescription>Change the email used for this account.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleEmailUpdate} className="space-y-4">
                    <div>
                      <label htmlFor="profile-email" className="block text-sm text-foreground mb-2">
                        Email
                      </label>
                      <Input
                        id="profile-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>

                    {emailStatus && <p className="text-sm text-muted-foreground">{emailStatus}</p>}

                    <Button type="submit" variant="outline" disabled={isSavingEmail}>
                      {isSavingEmail ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Updating...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Update Email
                        </span>
                      )}
                    </Button>
                  </form>
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
