import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { Request, Response } from "express";
import { MetricService } from "./metrics.service";
import { error } from "node:console";

/**
 * HttpMetricsInterceptor
 *
 * records request duration and status code for every HTTP call.
 * applied globally via APP_INTERCEPTOR in AppModuleskips /metrics and /metrics/health to avoid
 * self-referential noise
 *
 * enables these Grafana queries:
 *
 * request rate: rate(jobque_http_requests_total[5m])
 * Error rate: rate(jobque_http_requests_total{status_code=-"5.."}[5m])
 * l;atency p95: histogram_quantile(0.95, rate(jobque_http_request_duration_seconds_bucket[5m]))
 */

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly SKIP = new Set(["/metrics", "/metrics/health"]);

  constructor(private readonly metricsService: MetricService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    if (this.SKIP.has(req.path)) return next.handle();
    const route = (req.route?.path as string) ?? req.path;
    const method = req.method;
    const start = Date.now();

    const record = (statusCode: string) => {
      const duration = (Date.now() - start) / 1000;
      this.metricsService.httpRequestDuration.observe(
        { method, route, status_code: statusCode },
        duration,
      );
      this.metricsService.httpRequestsTotal.inc({
        method,
        route,
        status_code: statusCode,
      });
    };

    return next.handle().pipe(
      tap(() => record(String(res.statusCode))),
      catchError((error) => {
        record(error?.status ? String(error.status) : "500");
        return throwError(() => error);
      }),
    );
  }
}
