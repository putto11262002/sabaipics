function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (v) => v.toString(16).padStart(2, '0')).join('');
}

function createTraceparent(): string {
  const version = '00';
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const traceFlags = '01';
  return `${version}-${traceId}-${spanId}-${traceFlags}`;
}

function createBaggage(): string {
  const parts = ['app=framefast', 'client=event', 'client_platform=web'];
  if (typeof window !== 'undefined' && window.location?.pathname) {
    parts.push(`route=${encodeURIComponent(window.location.pathname)}`);
  }
  return parts.join(',');
}

export const tracingFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const headers = new Headers(request.headers);

  if (!headers.has('traceparent')) {
    headers.set('traceparent', createTraceparent());
  }
  if (!headers.has('baggage')) {
    headers.set('baggage', createBaggage());
  }

  return fetch(
    new Request(request, {
      headers,
    }),
  );
};
