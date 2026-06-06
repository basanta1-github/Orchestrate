import { Module, OnModuleInit } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { BandPromoterService } from "../scaling/band.promoter.service";
import { AutoScalerService } from "../scaling/autoScaler.service";
import { workerRegistryService } from "../scaling/workerRegistry.service";
import { TenantCapService } from "../scaling/tenant-cap.service";
import { QueueMetricsCollector, WorkerHealthCollector } from "../metrics";
// import { WorkerHealthCollector } from "../metrics/worker-health.collector";

/**
 * QueueModule
 *
 * wores together:
 * QueueService - enqueue, list/stop recurring
 * tenantCapService - per-tenant cap + staging area
 * brandPromoterService - 60s wait -> promote to high band
 * autoScalerService - queue depth -> add/remove workers
 * workerRegisteryService - owns actual bullMQ worker instances
 *
 * it is the single source of truth for all queue and scalling services
 *
 * imported by jobs module api side and worker module worker side
 *
 */
@Module({
  providers: [
    QueueService,
    TenantCapService,
    BandPromoterService,
    AutoScalerService,
    workerRegistryService,
  ],
  exports: [
    QueueService,
    TenantCapService, // needed by jobservice.submitJob()
    BandPromoterService,
    AutoScalerService,
    workerRegistryService, // needen by worker module to register processor
  ],
})
export class QueueModule implements OnModuleInit {
  constructor(
    private readonly queueService: QueueService,
    private readonly bandPromoter: BandPromoterService,
    private readonly autoScalar: AutoScalerService,
    private readonly workerRegistery: workerRegistryService,
    private readonly queueMetrics: QueueMetricsCollector,
    private readonly workerHealthCollector: WorkerHealthCollector,
  ) {}
  /**
   * After all providers are initialized, wire the queues into the services
   * that need them and connect the autoscaler to the worker registery
   * this runs once at application startup
   */
  onModuleInit(): void {
    // share the same queue instances (created inside QueueService) with the
    // promoter and autoscaler, we expose them via a getter added below

    const queues = this.queueService.getQueues();

    this.bandPromoter.registerQueues(queues);
    this.autoScalar.registerQueues(queues);
    this.queueMetrics.registerQueues(queues);

    this.autoScalar.setWorkerRegistery(this.workerRegistery);

    this.workerHealthCollector.setWorkerRegistryCallbacks({
      getAllWorkerCounts: () => this.workerRegistery.getAllWorkerCounts(),
      getWorkerCount: (queueName: string) =>
        this.workerRegistery.getWorkerCount(queueName),
    });
  }
}
