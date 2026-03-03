package tracectx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

type contextKey string

const (
	traceparentKey contextKey = "traceparent"
	baggageKey     contextKey = "baggage"
)

func WithTrace(ctx context.Context, traceparent, baggage string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx = context.WithValue(ctx, traceparentKey, traceparent)
	ctx = context.WithValue(ctx, baggageKey, baggage)
	return ctx
}

func FromContext(ctx context.Context) (traceparent, baggage string, ok bool) {
	if ctx == nil {
		return "", "", false
	}
	tp, tpOK := ctx.Value(traceparentKey).(string)
	bg, bgOK := ctx.Value(baggageKey).(string)
	if !tpOK || tp == "" {
		carrier := propagation.MapCarrier{}
		otel.GetTextMapPropagator().Inject(ctx, carrier)
		tp = carrier.Get("traceparent")
		bg = carrier.Get("baggage")
		if tp == "" {
			return "", "", false
		}
	}
	if !bgOK {
		bg = ""
	}
	return tp, bg, true
}

func NewTraceparent() string {
	traceID := randomHex(16)
	spanID := randomHex(8)
	return fmt.Sprintf("00-%s-%s-01", traceID, spanID)
}

func NewBaggage(client, route string) string {
	encodedClient := url.QueryEscape(client)
	encodedRoute := url.QueryEscape(route)
	return fmt.Sprintf("app=framefast,client=%s,client_platform=ftp,route=%s", encodedClient, encodedRoute)
}

func randomHex(bytes int) string {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		// Fall back to zero bytes if random source fails.
		return hex.EncodeToString(buf)
	}
	return hex.EncodeToString(buf)
}
