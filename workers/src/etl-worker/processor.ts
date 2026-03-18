import { Injectable } from "@nestjs/common";
import { Job as BullJob } from "bullmq";
import { BaseProcessor } from "../base-worker/base.processor";
import { ETLService, ETLPayload } from "./service";
import { randomUUID } from "crypto";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ChainService, Job, JobStatus, QueueService } from "@jobque/shared";

@Injectable()
export class ETLProcessor extends BaseProcessor {
  constructor(
    @InjectDataSource()
    dataSource: DataSource,
    chainService: ChainService,
    private readonly etlService: ETLService,
    private readonly queueService: QueueService,
  ) {
    super(dataSource, chainService);

    console.log("etlService constructor =", this.etlService.constructor.name);
    // Should print "ETLService", not "DataSource"
    console.log(
      "ETLProcessor DI check: proto =",
      Object.getPrototypeOf(this.etlService),
    );
    console.log(
      "ETLProcessor DI check: own keys =",
      Object.keys(this.etlService),
    );
    console.log(
      "ETLProcessor DI check: has extract =",
      this.etlService && "extract" in Object.getPrototypeOf(this.etlService),
    );
  }

  protected async process(job: BullJob): Promise<void> {
    const metadata = job.data.metadata as ETLPayload;

    if (!metadata) {
      throw new Error("No ETL metadata provided");
    }
    const jobRepo = this.dataSource.getRepository(Job);
    // dependency validation
    if (metadata.dependsOn?.length) {
      for (const depId of metadata.dependsOn) {
        const depJob = await jobRepo.findOne({ where: { id: depId } });
        if (!depJob) throw new Error(`Dependency job ${depId} not found`);

        if (depJob.status !== JobStatus.COMPLETED)
          throw new Error(`Dependency job ${depId} not completed`);
      }
    }

    try {
      // execute etl pipeline
      if (!this.etlService?.extract) {
        throw new Error("ETLService.extract is undefined.");
      }
      const extractedData = await this.etlService.extract(metadata);
      const transformedData = await this.etlService.transform(
        metadata,
        extractedData,
      );
      await this.etlService.load(metadata, transformedData);
      // save processed data in job.result for logging / audit
      job.data.result = transformedData;
    } catch (error) {
      throw error;
    }
    if (metadata.nextJob) {
      const newJobId = randomUUID();
      // create a job record
      await jobRepo.save({
        id: newJobId,
        type: "etl-jobs",
        status: JobStatus.QUEUED,
        tenantId: job.data.tenantId,
        metadata: metadata.nextJob,
      });
      // send job to queue
      await this.queueService.enqueue({
        jobId: newJobId,
        jobType: "etl-jobs",
        metadata: metadata.nextJob,
        priorityLevel: job.data.priorityLevel ?? "MEDIUM",
        retries: job.opts.attempts ?? 5,
        tenantId: job.data.tenantId,
      });

      this.logger.log("Next ETL job automarically triggered");
    }
  }
}
