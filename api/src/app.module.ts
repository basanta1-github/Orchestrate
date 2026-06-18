import { Module, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import {
  JobsModule,
  DatabaseModule,
  AuthModule,
  JwtAuthGuard,
  RoleGuard,
  AutoScalerService,
  QueueMetricsCollector,
  WorkerHealthCollector,
  BandPromoterService,
  TenantCapService,
  TenantMetricsCollector,
  QueueModule,
} from '@jobque/shared';
import { WorkerModule } from '@jobque/workers';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { MetricsModule, HttpMetricsInterceptor } from '@jobque/shared';
import { APP_INTERCEPTOR } from '@nestjs/core';

/** Docker Compose / K8s: workers run in separate containers — API must not boot BullMQ consumers. */
const workerImports =
  process.env.RUN_WORKERS_IN_API === 'true' ? [WorkerModule] : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '../.env'),
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      database: process.env.DB_NAME || 'job_que',
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      // logging: true // this gives all the logging of database in console
      logging: ['error', 'warn'],
    }),
    DatabaseModule,
    QueueModule,
    JobsModule,
    AuthModule,
    MetricsModule,
    ...workerImports,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
    AppService,
    JwtAuthGuard,
    RoleGuard,
  ],
  controllers: [AppController, HealthController],
})
// export class AppModule {}
export class AppModule implements OnApplicationBootstrap {
  constructor(
    @Inject(AppService) private readonly appService: AppService,
    private readonly dataSource: DataSource,
    private readonly autoScaler: AutoScalerService,
    private readonly queueMetrics: QueueMetricsCollector,
    private readonly workerHealth: WorkerHealthCollector,
    private readonly bandPromoter: BandPromoterService,
    private readonly tenantCap: TenantCapService,
    private readonly tenantMetrics: TenantMetricsCollector,
  ) {}
  onApplicationBootstrap() {
    // wiring metrics into autoscaler so that all modules are ready

    // this.autoScaler.syncWorkerCountsFromRegistery();
    this.autoScaler.setMetricsCallbacks({
      recordScaleUp: (q) => this.queueMetrics.recordScaleUp(q),
      recordScaleDown: (q) => this.queueMetrics.recordScaleDown(q),
      onWorkerSpawned: (q) => this.workerHealth.onWorkerSpawned(q),
      onWorkerTerminated: (q) => this.workerHealth.onWorkerTerminated(q),
    });

    this.bandPromoter.setMetricsCallback((q) =>
      this.queueMetrics.recordBandPromotion(q),
    );

    this.tenantCap.setMetricsCallback((id) =>
      this.tenantMetrics.recordCapHit(id),
    );
    if (this.appService) {
      console.log('✅ AppService exists in AppModule:', this.appService);
    } else {
      console.error('❌ AppService is undefined in AppModule!');
    }
  }
  // constructor(private readonly mediaWorker: MediaWorker) {}
  // onApplicationBootstrap() {
  //   // Workers will start automatically on module init
  //   console.log('🔥 All workers are initialized');
  // }
}
