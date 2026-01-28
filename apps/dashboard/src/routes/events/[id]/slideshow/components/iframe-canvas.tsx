import { useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router';
import type { SlideshowConfig, SlideshowContext } from '../types';

// ─── Types for postMessage communication ───────────────────────────────────────

interface EditorConfigMessage {
  type: 'slideshow-config';
  config: SlideshowConfig;
  context: SlideshowContext;
  selectedBlockId: string | null;
}

interface IframeReadyMessage {
  type: 'iframe-ready';
}

interface BlockSelectedMessage {
  type: 'block-selected';
  blockId: string;
}

type IframeMessage = IframeReadyMessage | BlockSelectedMessage;

// ─── Component ─────────────────────────────────────────────────────────────────

interface IframeCanvasProps {
  config: SlideshowConfig;
  context: SlideshowContext;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string | null) => void;
}

export function IframeCanvas({
  config,
  context,
  selectedBlockId,
  onSelectBlock,
}: IframeCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { id } = useParams<{ id: string }>();
  const isIframeReady = useRef(false);
  const pendingConfig = useRef<EditorConfigMessage | null>(null);

  // Send config to iframe
  const sendConfigToIframe = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !isIframeReady.current) {
      // Store for when iframe is ready
      pendingConfig.current = {
        type: 'slideshow-config',
        config,
        context,
        selectedBlockId,
      };
      return;
    }

    iframeRef.current.contentWindow.postMessage(
      {
        type: 'slideshow-config',
        config,
        context,
        selectedBlockId,
      } satisfies EditorConfigMessage,
      '*',
    );
  }, [config, context, selectedBlockId]);

  // Send config when it changes
  useEffect(() => {
    sendConfigToIframe();
  }, [sendConfigToIframe]);

  // Listen for messages from iframe
  useEffect(() => {
    const handler = (event: MessageEvent<IframeMessage>) => {
      // Validate message origin in production
      // For now, accept messages from same origin
      if (event.source !== iframeRef.current?.contentWindow) return;

      if (event.data.type === 'iframe-ready') {
        isIframeReady.current = true;
        // Send any pending config
        if (pendingConfig.current) {
          iframeRef.current?.contentWindow?.postMessage(pendingConfig.current, '*');
          pendingConfig.current = null;
        }
      }

      if (event.data.type === 'block-selected') {
        onSelectBlock(event.data.blockId || null);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelectBlock]);

  // Reset ready state when iframe navigates
  const handleIframeLoad = useCallback(() => {
    // Iframe loaded but may not have sent ready message yet
    // The ready message will trigger config send
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-muted/50 p-4">
      <iframe
        ref={iframeRef}
        src={`/events/${id}/slideshow-preview?mode=editor`}
        className="h-full w-full rounded-lg border bg-background shadow-sm"
        onLoad={handleIframeLoad}
        title="Slideshow Preview"
      />
    </div>
  );
}
