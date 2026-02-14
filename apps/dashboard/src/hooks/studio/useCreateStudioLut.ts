import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useApiClient, withAuth } from '../../lib/api';

type CreateKind = 'cube' | 'reference';

export function useCreateStudioLut() {
  const queryClient = useQueryClient();
  const { getToken } = useApiClient();

  return useMutation({
    mutationFn: async ({
      kind,
      name,
      file,
    }: {
      kind: CreateKind;
      name: string;
      file: File;
    }): Promise<{ lutId: string }> => {
      const contentLength = file.size;

      const presignRes =
        kind === 'cube'
          ? await api.studio.luts.cube.presign.$post(
              { json: { name, contentLength } },
              await withAuth(getToken),
            )
          : await api.studio.luts.reference.presign.$post(
              {
                json: {
                  name,
                  contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
                  contentLength,
                },
              },
              await withAuth(getToken),
            );

      if (!presignRes.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { data: presign } = await presignRes.json();

      const uploadRes = await fetch(presign.putUrl, {
        method: 'PUT',
        headers: presign.requiredHeaders,
        body: kind === 'cube' ? new Blob([await file.text()], { type: 'text/plain' }) : file,
      });

      if (!uploadRes.ok) {
        throw new Error('Upload to storage failed');
      }

      return { lutId: presign.lutId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio', 'luts'] });
    },
    retry: false,
  });
}
