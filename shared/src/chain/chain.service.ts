import { DataSource } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { QueueService } from "../queue/queue.service";
import { JobDependency } from "../database";
import { Job } from "../database/entities/job.entity";
import { JobStatus } from "../jobs";

@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
  ) {}

  async triggerNextJobs(parentJobId: string) {
    const depRepo = this.dataSource.getRepository(JobDependency);
    const jobRepo = this.dataSource.getRepository(Job);

    const dependencies = await depRepo.find({
      where: { parentJobId },
    });

    for (const dep of dependencies) {
      const childId = dep.childJobId;

      // idempotency check
      if (dep.triggered) continue;

      const childJob = await jobRepo.findOne({
        where: { id: childId },
      });
      if (!childJob) continue;

      if (childJob.status !== JobStatus.PENDING) {
        continue;
      }

      // check if all the parent job are completed
      const remaining = await this.dataSource
        .createQueryBuilder()
        .select("COUNT(*)", "count")
        .from(JobDependency, "jd")
        .innerJoin(Job, "j", "jd.parentJobId = j.id")
        .where("jd.childJobId = :childId", { childId })
        .andWhere("j.status != :status", { status: JobStatus.COMPLETED })
        .getRawOne();

      if (parseInt(remaining.count) > 0) continue;

      const updateResult = await jobRepo.update(
        {
          id: childId,
          status: JobStatus.PENDING,
        },
        {
          status: JobStatus.QUEUED,
        },
      );
      if (!updateResult.affected) {
        continue;
      }

      // enqueue child
      await this.queueService.enqueue({
        jobId: childJob.id,
        jobType: childJob.type,
        tenantId: childJob.tenant?.id,
        priority: childJob.priority,
        retries: childJob.retries,
        metadata: childJob.metadata,
      });

      this.logger.log(
        `Triggered child job ${childJob.id} from parent ${parentJobId}`,
      );

      // await jobRepo.update(childId, {
      //   status: JobStatus.QUEUED,
      // });

      // //  ark trigerred idempotent
      // dep.triggered = true;
      // await depRepo.save(dep);
    }
  }

  async handleParentFailure(parentJobId: string) {
    const depRepo = this.dataSource.getRepository(JobDependency);
    const jobRepo = this.dataSource.getRepository(Job);

    const deps = await depRepo.find({ where: { parentJobId } });

    for (const dep of deps) {
      const child = await jobRepo.findOne({
        where: { id: dep.childJobId },
      });

      if (!child) continue;

      if (child.faliureStrategy === "STRICT") {
        await jobRepo.update(child.id, {
          status: JobStatus.SKIPPED,
        });
        Logger.warn(
          `Child job ${child.id} skipped due to STRICT failure strategy`,
        );
      } else {
        // LENIENT -> still trigger
        await this.triggerNextJobs(parentJobId);
      }
    }
  }
}
