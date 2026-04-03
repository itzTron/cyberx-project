import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, RefreshCw } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listActivityLogs, type HubActivityLog } from '@/lib/hubApi';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const toTitleCase = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (token) => token.toUpperCase());

const safeContextEntries = (context: Record<string, unknown>) =>
  Object.entries(context)
    .filter(([key]) => !key.toLowerCase().includes('user_id') && !key.toLowerCase().includes('author_id'))
    .filter(([key]) => !key.toLowerCase().endsWith('_id'))
    .slice(0, 4)
    .map(([key, value]) => ({
      label: toTitleCase(key),
      value:
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : Array.isArray(value)
            ? value.join(', ')
            : 'Updated',
    }));

const Activity = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activityLogs, setActivityLogs] = useState<HubActivityLog[]>([]);

  const fetchActivity = async ({ refreshing }: { refreshing: boolean }) => {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage('');

    try {
      const logs = await listActivityLogs();
      setActivityLogs(logs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load activity.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchActivity({
      refreshing: false,
    });
  }, []);

  const preparedLogs = useMemo(
    () =>
      activityLogs.map((log) => ({
        ...log,
        title: toTitleCase(log.activity_type),
        details: safeContextEntries(log.activity_context || {}),
      })),
    [activityLogs],
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-28 pb-16">
        <div className="container mx-auto px-4 max-w-4xl space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Latest Activity</h1>
              <p className="text-muted-foreground mt-2">Recent account, repository, and profile events.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void fetchActivity({
                  refreshing: true,
                })
              }
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {isLoading && (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">Loading activity...</CardContent>
            </Card>
          )}

          {!isLoading && errorMessage && (
            <Card>
              <CardHeader>
                <CardTitle>Access Required</CardTitle>
                <CardDescription>{errorMessage}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link to="/signin">Go to Sign In</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && !errorMessage && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-primary" />
                  Recent Events
                </CardTitle>
                <CardDescription>Only relevant activity details are shown.</CardDescription>
              </CardHeader>
              <CardContent>
                {preparedLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity logged yet.</p>
                ) : (
                  <div className="space-y-3">
                    {preparedLogs.map((log) => (
                      <div key={log.id} className="rounded-md border border-border p-3">
                        <p className="text-sm font-medium text-foreground">{log.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDateTime(log.created_at)}</p>
                        {log.details.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {log.details.map((entry) => (
                              <span
                                key={`${log.id}-${entry.label}`}
                                className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
                              >
                                <span className="font-medium text-foreground mr-1">{entry.label}:</span>
                                {entry.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Activity;
