import { useQuery, useMutation } from '@tanstack/react-query';
import { useApiClient } from '../../lib/api';

interface FtpCredentialsResponse {
  id: string;
  username: string;
  expiresAt: string;
  createdAt: string;
}

interface RevealCredentialsResponse {
  username: string;
  password: string;
}

export function useFtpCredentials(eventId: string | undefined) {
  const { getToken } = useApiClient();

  return useQuery({
    queryKey: ['ftp-credentials', eventId],
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID is required');
      }

      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated. Please sign in and try again.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ftp/events/${eventId}/ftp-credentials`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch FTP credentials: ${response.status}`);
      }

      return (await response.json()) as FtpCredentialsResponse;
    },
    enabled: !!eventId,
    refetchOnWindowFocus: !import.meta.env.DEV,
    refetchOnMount: false,
    staleTime: 1000 * 60,
  });
}

export function useRevealFtpCredentials(eventId: string | undefined) {
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async () => {
      if (!eventId) {
        throw new Error('Event ID is required');
      }

      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated. Please sign in and try again.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ftp/events/${eventId}/ftp-credentials/reveal`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to reveal FTP password: ${response.status}`);
      }

      return (await response.json()) as RevealCredentialsResponse;
    },
  });
}
