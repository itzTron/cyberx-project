import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Camera, LoaderCircle, Mail, Save } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

const Profile = () => {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [profile, setProfile] = useState<HubUserProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [email, setEmail] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const syncForm = (data: HubUserProfile) => {
    setProfile(data);
    setFullName(data.fullName);
    setPhoneNumber(data.phoneNumber);
    setBio(data.bio);
    setAvatarUrl(data.avatarUrl);
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
      setAvatarUrl(dataUrl);
      setProfileStatus('Avatar selected. Save profile to apply changes.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process avatar.';
      setProfileStatus(message);
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
      <Navbar />

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
                <CardContent className="pt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 border border-border">
                      <AvatarImage src={avatarUrl || undefined} alt={fullName} />
                      <AvatarFallback>{getInitials(fullName || profile.username)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{fullName || profile.username}</p>
                      <p className="text-sm text-muted-foreground">@{profile.username}</p>
                      <p className="text-sm text-muted-foreground">{email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <Link to={`/${profile.username}`}>Public Profile</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/dashboard">Dashboard</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

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

                    <div className="space-y-2">
                      <label htmlFor="profile-avatar-url" className="block text-sm text-foreground">
                        Profile Picture URL
                      </label>
                      <Input
                        id="profile-avatar-url"
                        value={avatarUrl}
                        onChange={(event) => setAvatarUrl(event.target.value)}
                        placeholder="https://example.com/avatar.png"
                      />
                      <label
                        htmlFor="profile-avatar-upload"
                        className="inline-flex items-center gap-2 text-sm text-primary cursor-pointer hover:underline"
                      >
                        <Camera className="h-4 w-4" />
                        Upload image from device
                      </label>
                      <Input
                        id="profile-avatar-upload"
                        type="file"
                        accept="image/*"
                        onChange={(event) => void handleAvatarUpload(event)}
                        className="hidden"
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
