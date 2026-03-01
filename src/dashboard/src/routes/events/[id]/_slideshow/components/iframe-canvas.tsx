import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams } from 'react-router';
import type { SlideshowConfig, SlideshowContext, DeviceType, Orientation } from '../types';
import { getDeviceDimensions } from '../types';

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
  deviceType: DeviceType;
  orientation: Orientation;
  onSelectBlock: (blockId: string | null) => void;
  onConfigUpdate?: (config: SlideshowConfig) => void;
}

export function IframeCanvas({
  config,
  context,
  selectedBlockId,
  deviceType,
  orientation,
  onSelectBlock,
  onConfigUpdate,
}: IframeCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { id } = useParams<{ id: string }>();
  const isIframeReady = useRef(false);
  const pendingConfig = useRef<EditorConfigMessage | null>(null);
  const [parentSize, setParentSize] = useState({ width: 0, height: 0 });

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

  // Measure parent container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setParentSize({ width, height });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Calculate scale factor to fit device preview in available space
  const deviceDimensions = getDeviceDimensions(deviceType, orientation);
  const padding = 32; // 16px on each side
  const availableWidth = parentSize.width - padding;
  const availableHeight = parentSize.height - padding;

  let scale = 1;
  if (availableWidth > 0 && availableHeight > 0) {
    const scaleX = availableWidth / deviceDimensions.width;
    const scaleY = availableHeight / deviceDimensions.height;
    scale = Math.min(scaleX, scaleY, 1); // Never scale up, only down
  }

  // Scaled visual dimensions (for the wrapper that reserves space)
  const scaledWidth = deviceDimensions.width * scale;
  const scaledHeight = deviceDimensions.height * scale;

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center bg-muted/50 p-4"
    >
      {/* Wrapper reserves the scaled visual space */}
      <div
        className="relative overflow-hidden rounded-lg border shadow-sm"
        style={{
          width: scaledWidth,
          height: scaledHeight,
        }}
      >
        {/* Iframe at actual device dimensions, scaled down via CSS transform */}
        <iframe
          ref={iframeRef}
          src={`/events/${id}/slideshow-preview?mode=editor`}
          className="origin-top-left bg-background"
          style={{
            width: deviceDimensions.width,
            height: deviceDimensions.height,
            transform: `scale(${scale})`,
          }}
          onLoad={handleIframeLoad}
          title="Slideshow Preview"
        />
      </div>
    </div>
  );
}
