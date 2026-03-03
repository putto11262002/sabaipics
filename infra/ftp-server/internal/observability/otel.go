package observability

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/sabaipics/sabaipics/apps/ftp-server/internal/config"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

const serviceName = "framefast-ftp"

var (
	tracer = otel.Tracer(serviceName)
	meter  metric.Meter

	uploadCount      metric.Int64Counter
	uploadBytes      metric.Int64Histogram
	uploadDurationMs metric.Float64Histogram

	lokiPushURL string
	lokiAuth    string
	envName     string
	lokiClient  = &http.Client{Timeout: 5 * time.Second}

	instrumentsOnce sync.Once
)

func Init(ctx context.Context, cfg *config.Config) (func(context.Context) error, error) {
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			attribute.String("deployment.environment", cfg.Environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("create otel resource: %w", err)
	}

	traceProvider, traceShutdown, err := initTraceProvider(ctx, cfg, res)
	if err != nil {
		return nil, err
	}
	metricProvider, metricShutdown, err := initMetricProvider(ctx, cfg, res)
	if err != nil {
		_ = traceShutdown(ctx)
		return nil, err
	}

	otel.SetTracerProvider(traceProvider)
	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		),
	)

	tracer = otel.Tracer(serviceName)
	meter = metricProvider.Meter(serviceName)
	envName = cfg.Environment
	configureLoki(cfg)
	initInstruments()

	return func(shutdownCtx context.Context) error {
		var errs []string
		if err := metricShutdown(shutdownCtx); err != nil {
			errs = append(errs, fmt.Sprintf("metric shutdown: %v", err))
		}
		if err := traceShutdown(shutdownCtx); err != nil {
			errs = append(errs, fmt.Sprintf("trace shutdown: %v", err))
		}
		if len(errs) > 0 {
			return errors.New(strings.Join(errs, "; "))
		}
		return nil
	}, nil
}

func StartUploadSpan(ctx context.Context, filename, eventID, clientIP string) (context.Context, trace.Span) {
	return tracer.Start(
		ctx,
		"ftp.upload",
		trace.WithAttributes(
			attribute.String("file.name", filename),
			attribute.String("event.id", eventID),
			attribute.String("client.ip", clientIP),
		),
	)
}

func StartSpan(ctx context.Context, name string, attrs ...attribute.KeyValue) (context.Context, trace.Span) {
	return tracer.Start(ctx, name, trace.WithAttributes(attrs...))
}

func InjectHeaders(ctx context.Context) (traceparent string, baggage string, ok bool) {
	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)
	traceparent = carrier.Get("traceparent")
	baggage = carrier.Get("baggage")
	if traceparent == "" {
		return "", "", false
	}
	return traceparent, baggage, true
}

func RecordUpload(status string, bytes int64, duration time.Duration) {
	initInstruments()
	if uploadCount != nil {
		uploadCount.Add(context.Background(), 1, metric.WithAttributes(attribute.String("status", status)))
	}
	if uploadBytes != nil {
		uploadBytes.Record(
			context.Background(),
			bytes,
			metric.WithAttributes(attribute.String("status", status)),
		)
	}
	if uploadDurationMs != nil {
		uploadDurationMs.Record(
			context.Background(),
			float64(duration.Milliseconds()),
			metric.WithAttributes(attribute.String("status", status)),
		)
	}
}

func EmitLog(ctx context.Context, level string, event string, fields map[string]any) {
	body := map[string]any{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"event":     event,
	}
	for k, v := range fields {
		body[k] = v
	}

	if traceparent, baggage, ok := InjectHeaders(ctx); ok {
		body["traceparent"] = traceparent
		if baggage != "" {
			body["baggage"] = baggage
		}
	}

	line, err := json.Marshal(body)
	if err != nil {
		log.Printf("[observability] log marshal failed: %v", err)
		return
	}

	log.Printf("%s", line)

	if lokiPushURL == "" || lokiAuth == "" {
		return
	}

	payload := map[string]any{
		"streams": []any{
			map[string]any{
				"stream": map[string]string{
					"service": serviceName,
					"env":     envName,
					"event":   event,
					"level":   level,
				},
				"values": [][]string{
					{fmt.Sprintf("%d", time.Now().UnixNano()), string(line)},
				},
			},
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[observability] loki payload marshal failed: %v", err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, lokiPushURL, strings.NewReader(string(raw)))
	if err != nil {
		log.Printf("[observability] loki request failed: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Basic "+lokiAuth)

	resp, err := lokiClient.Do(req)
	if err != nil {
		log.Printf("[observability] loki push failed: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[observability] loki push rejected status=%d", resp.StatusCode)
	}
}

func initInstruments() {
	instrumentsOnce.Do(func() {
		if meter == nil {
			meter = otel.GetMeterProvider().Meter(serviceName)
		}
		var err error
		uploadCount, err = meter.Int64Counter("framefast_ftp_uploads_total")
		if err != nil {
			log.Printf("[observability] create counter failed: %v", err)
		}
		uploadBytes, err = meter.Int64Histogram("framefast_ftp_upload_bytes")
		if err != nil {
			log.Printf("[observability] create bytes histogram failed: %v", err)
		}
		uploadDurationMs, err = meter.Float64Histogram("framefast_ftp_upload_duration_ms")
		if err != nil {
			log.Printf("[observability] create duration histogram failed: %v", err)
		}
	})
}

func configureLoki(cfg *config.Config) {
	lokiPushURL = ""
	lokiAuth = ""
	base := strings.TrimSpace(cfg.GrafanaLokiURL)
	if base == "" {
		return
	}
	user := strings.TrimSpace(cfg.LokiUser)
	token := strings.TrimSpace(cfg.LokiToken)
	if user == "" || token == "" {
		return
	}
	base = strings.TrimRight(base, "/")
	lokiPushURL = base + "/loki/api/v1/push"
	lokiAuth = base64.StdEncoding.EncodeToString([]byte(user + ":" + token))
}

func initTraceProvider(
	ctx context.Context,
	cfg *config.Config,
	res *resource.Resource,
) (*sdktrace.TracerProvider, func(context.Context) error, error) {
	endpoint := normalizeTracesEndpoint(cfg.GrafanaOTLPTracesURL)
	if endpoint == "" {
		tp := sdktrace.NewTracerProvider(
			sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(cfg.OTELTraceSampleRatio))),
			sdktrace.WithResource(res),
		)
		return tp, tp.Shutdown, nil
	}

	headers := authHeaders(cfg.OTLPTracesUser, cfg.OTLPTracesToken)
	opts, err := httpOptionsFromEndpoint(endpoint, headers)
	if err != nil {
		return nil, nil, fmt.Errorf("trace exporter options: %w", err)
	}
	exporter, err := otlptracehttp.New(ctx, opts...)
	if err != nil {
		return nil, nil, fmt.Errorf("create trace exporter: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(cfg.OTELTraceSampleRatio))),
		sdktrace.WithResource(res),
	)
	return tp, tp.Shutdown, nil
}

func initMetricProvider(
	ctx context.Context,
	cfg *config.Config,
	res *resource.Resource,
) (*sdkmetric.MeterProvider, func(context.Context) error, error) {
	endpoint := normalizeMetricsEndpoint(cfg.GrafanaOTLPMetricsURL, cfg.GrafanaOTLPTracesURL)
	if endpoint == "" {
		mp := sdkmetric.NewMeterProvider(sdkmetric.WithResource(res))
		return mp, mp.Shutdown, nil
	}

	headers := authHeaders(cfg.OTLPMetricsUser, cfg.OTLPMetricsToken)
	if len(headers) == 0 {
		headers = authHeaders(cfg.OTLPTracesUser, cfg.OTLPTracesToken)
	}
	opts, err := metricHTTPOptionsFromEndpoint(endpoint, headers)
	if err != nil {
		return nil, nil, fmt.Errorf("metric exporter options: %w", err)
	}
	exporter, err := otlpmetrichttp.New(ctx, opts...)
	if err != nil {
		return nil, nil, fmt.Errorf("create metric exporter: %w", err)
	}

	reader := sdkmetric.NewPeriodicReader(exporter, sdkmetric.WithInterval(15*time.Second))
	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(reader),
		sdkmetric.WithResource(res),
	)
	return mp, mp.Shutdown, nil
}

func authHeaders(user, token string) map[string]string {
	user = strings.TrimSpace(user)
	token = strings.TrimSpace(token)
	if user == "" || token == "" {
		return map[string]string{}
	}
	creds := base64.StdEncoding.EncodeToString([]byte(user + ":" + token))
	return map[string]string{"Authorization": "Basic " + creds}
}

func httpOptionsFromEndpoint(endpoint string, headers map[string]string) ([]otlptracehttp.Option, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	opts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(u.Host),
		otlptracehttp.WithURLPath(u.Path),
		otlptracehttp.WithHeaders(headers),
	}
	if u.Scheme == "http" {
		opts = append(opts, otlptracehttp.WithInsecure())
	}
	return opts, nil
}

func metricHTTPOptionsFromEndpoint(endpoint string, headers map[string]string) ([]otlpmetrichttp.Option, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	opts := []otlpmetrichttp.Option{
		otlpmetrichttp.WithEndpoint(u.Host),
		otlpmetrichttp.WithURLPath(u.Path),
		otlpmetrichttp.WithHeaders(headers),
	}
	if u.Scheme == "http" {
		opts = append(opts, otlpmetrichttp.WithInsecure())
	}
	return opts, nil
}

func normalizeTracesEndpoint(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	raw = strings.TrimRight(raw, "/")
	switch {
	case strings.HasSuffix(raw, "/v1/traces"):
		return raw
	case strings.HasSuffix(raw, "/otlp"):
		return raw + "/v1/traces"
	case strings.HasSuffix(raw, "/tempo"):
		return strings.TrimSuffix(raw, "/tempo") + "/otlp/v1/traces"
	default:
		return raw + "/v1/traces"
	}
}

func normalizeMetricsEndpoint(metricsRaw, tracesRaw string) string {
	metricsRaw = strings.TrimSpace(metricsRaw)
	if metricsRaw != "" {
		metricsRaw = strings.TrimRight(metricsRaw, "/")
		switch {
		case strings.HasSuffix(metricsRaw, "/v1/metrics"):
			return metricsRaw
		case strings.HasSuffix(metricsRaw, "/otlp"):
			return metricsRaw + "/v1/metrics"
		default:
			return metricsRaw + "/v1/metrics"
		}
	}
	tracesRaw = strings.TrimSpace(tracesRaw)
	if tracesRaw == "" {
		return ""
	}
	tracesRaw = strings.TrimRight(tracesRaw, "/")
	switch {
	case strings.HasSuffix(tracesRaw, "/otlp"):
		return tracesRaw + "/v1/metrics"
	case strings.HasSuffix(tracesRaw, "/tempo"):
		return strings.TrimSuffix(tracesRaw, "/tempo") + "/otlp/v1/metrics"
	case strings.HasSuffix(tracesRaw, "/v1/traces"):
		return strings.TrimSuffix(tracesRaw, "/v1/traces") + "/v1/metrics"
	default:
		return tracesRaw + "/v1/metrics"
	}
}
