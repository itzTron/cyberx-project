import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, LoaderCircle, Mail, Save, Trash2 } from 'lucide-react';
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

const MAX_AVATAR_BYTES = 1_500_000;

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part.trim()[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
  const [bio, setBio] = useState('');
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
  const hasAvatarChanges = avatarUrl.trim() !== savedAvatarUrl.trim();

  const syncForm = (data: HubUserProfile) => {
    setProfile(data);
    setFullName(data.fullName);
    setPhoneNumber(data.phoneNumber);
    setBio(data.bio);
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

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileStatus('');

    try {
      const updated = await updateCurrentUserProfile({
        fullName,
        phoneNumber,
        bio,
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
            <p className="text-muted-foreground mt-2">Manage contact info, profile picture, bio, and account email.</p>
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
                  <CardTitle>Profile Picture Preview</CardTitle>
                  <CardDescription>Preview, crop, upload, or remove your avatar before saving profile changes.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border bg-muted/20 p-4 space-y-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-20 w-20 border border-border">
                          <AvatarImage src={avatarUrl || undefined} alt={fullName || profile.username} />
                          <AvatarFallback>{getInitials(fullName || profile.username)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">Current avatar preview</p>
                          <p className="text-xs text-muted-foreground">
                            {avatarUrl ? 'Image selected' : 'No avatar selected'}
                          </p>
                          {hasAvatarChanges && <p className="text-xs text-primary mt-1">Unsaved avatar changes</p>}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
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

              <Card>
                <CardHeader>
                  <CardTitle>Profile Details</CardTitle>
                  <CardDescription>Update your personal contact details and public bio.</CardDescription>
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
