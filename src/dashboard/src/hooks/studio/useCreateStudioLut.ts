import { useMutation } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { useAuth } from '@/auth/react';
import { api } from '../../lib/api';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

export type CreateStudioLutInput = { name: string; file: File };
export type CreateStudioLutResult = { lutId: string };

export function useCreateStudioLut() {
  const { getToken } = useAuth();

  return useMutation<{ lutId: string }, RequestError, { kind: 'cube'; name: string; file: File }>({
    mutationFn: async ({ name, file }) => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const presignResponse = await parseResponse(
          api.studio.luts.cube.presign.$post(
            { json: { name, contentLength: file.size } },
            { headers },
          ),
        );

        const uploadRes = await fetch(presignResponse.data.putUrl, {
          method: 'PUT',
          headers: presignResponse.data.requiredHeaders,
          body: new Blob([await file.text()], { type: 'text/plain' }),
        });

        if (!uploadRes.ok) {
          throw new Error('Upload to storage failed');
        }

        return { lutId: presignResponse.data.lutId };
      } catch (e) {
        throw toRequestError(e);
      }
    },
    retry: false,
  });
}
