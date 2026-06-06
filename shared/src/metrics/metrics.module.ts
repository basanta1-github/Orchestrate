import { Global, Module } from "@nestjs/common";
import { MetricService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";
import { QueueMetricsCollector } from "./queue-metrics.collector";
import { WorkerHealthCollector } from "./worker-health.collector";
import { TenantMetricsCollector } from "./tenant-metrics.collector";
import { HttpMetricsInterceptor } from "./http-metrics.interceptor";
import { QueueModule } from "../queue/queue.module";
import { QueueReconcileCollector } from "./queueReconcileCollector";

/**
 * Metrics Module
 *
 * @global() - all exported providers are available everywhere in the application
 * without rre-importing this module. this means baseProcessor and AutoScalerService
 * can inject QueueMetricsCOntroller without needing to import metrics module in worker module
 * or QueueModule expliciteluy
 *
 * Import order in AppModule: MetricsModule must come after queuemodule since queueMetrics
 * controller depends in queueservice
 */

@Global()
@Module({
  // imports: [QueueModule],
  controllers: [MetricsController],
  providers: [
    MetricService,
    QueueMetricsCollector,
    WorkerHealthCollector,
    TenantMetricsCollector,
    HttpMetricsInterceptor,
    QueueReconcileCollector,
  ],
  exports: [
    MetricService,
    QueueMetricsCollector,
    WorkerHealthCollector,
    TenantMetricsCollector,
    HttpMetricsInterceptor,
    QueueReconcileCollector,
  ],
})
export class MetricsModule {}
