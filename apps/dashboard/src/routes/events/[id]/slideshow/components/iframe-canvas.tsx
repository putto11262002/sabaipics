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

interface ConfigUpdatedMessage {
  type: 'config-updated';
  config: SlideshowConfig;
}

type IframeMessage = IframeReadyMessage | BlockSelectedMessage | ConfigUpdatedMessage;

// ─── Component ─────────────────────────────────────────────────────────────────

interface IframeCanvasProps {
  config: SlideshowConfig;
  context: SlideshowContext;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string | null) => void;
  onConfigUpdate?: (config: SlideshowConfig) => void;
}

export function IframeCanvas({
  config,
  context,
  selectedBlockId,
  onSelectBlock,
  onConfigUpdate,
}: IframeCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { id } = useParams<{ id: string }>();
  const isIframeReady = useRef(false);
  const pendingConfig = useRef<EditorConfigMessage | null>(null);

  // Send config to iframe
  const sendConfigToIframe = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !isIframeReady.current) {
      // Store for when iframe is ready
      console.log('[PARENT] Config not sent - iframe not ready, storing as pending');
      pendingConfig.current = {
        type: 'slideshow-config',
        config,
        context,
        selectedBlockId,
      };
      return;
    }

    console.log('[PARENT] Sending slideshow-config to iframe', {
      blockCount: config.blocks.length,
      selectedBlockId,
    });

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
    console.log('[PARENT] Config changed, triggering sendConfigToIframe');
    sendConfigToIframe();
  }, [sendConfigToIframe]);

  // Listen for messages from iframe
  useEffect(() => {
    const handler = (event: MessageEvent<IframeMessage>) => {
      // Validate message origin in production
      // For now, accept messages from same origin
      if (event.source !== iframeRef.current?.contentWindow) return;

      if (event.data.type === 'iframe-ready') {
        console.log('[PARENT] Received iframe-ready');
        isIframeReady.current = true;
        // Send any pending config
        if (pendingConfig.current) {
          console.log('[PARENT] Sending pending config to iframe');
          iframeRef.current?.contentWindow?.postMessage(pendingConfig.current, '*');
          pendingConfig.current = null;
        }
      }

      if (event.data.type === 'block-selected') {
        console.log('[PARENT] Received block-selected:', event.data.blockId);
        onSelectBlock(event.data.blockId || null);
      }

      if (event.data.type === 'config-updated') {
        console.log('[PARENT] Received config-updated from iframe');
        onConfigUpdate?.(event.data.config);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelectBlock, onConfigUpdate]);

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
