import { useMutation } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { useAuth } from '@/auth/react';
import { api } from '../../lib/api';
import { toRequestError, type RequestError } from '@/shared/lib/api-error';

type CreateKind = 'cube' | 'reference';

export type CreateStudioLutInput = { kind: CreateKind; name: string; file: File };
export type CreateStudioLutResult = { lutId: string };

export function useCreateStudioLut() {
  const { getToken } = useAuth();

  // Multi-step presign → upload flow requires raw useMutation.
  // The wrapper's single parseResponse call can't handle the two-phase upload.
  return useMutation<{ lutId: string }, RequestError, { kind: CreateKind; name: string; file: File }>({
    mutationFn: async ({ kind, name, file }) => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Step 1: Get presigned URL (use parseResponse for Hono client)
        const presignResponse =
          kind === 'cube'
            ? await parseResponse(
                api.studio.luts.cube.presign.$post({ json: { name, contentLength: file.size } }, { headers }),
              )
            : await parseResponse(
                api.studio.luts.reference.presign.$post(
                  {
                    json: {
                      name,
                      contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
                      contentLength: file.size,
                    },
                  },
                  { headers },
                ),
              );

        // Step 2: Upload directly to R2
        const uploadRes = await fetch(presignResponse.data.putUrl, {
          method: 'PUT',
          headers: presignResponse.data.requiredHeaders,
          body: kind === 'cube' ? new Blob([await file.text()], { type: 'text/plain' }) : file,
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
