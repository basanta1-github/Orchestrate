import { Injectable, Optional } from "@nestjs/common";
import { Job } from "../entities/job.entity";
import { DataSource, Repository } from "typeorm";

@Injectable()
export class JobRepository {
  private repo!: Repository<Job>;

  constructor(@Optional() private dataSource?: DataSource) {
    if (this.dataSource) {
      this.repo = this.dataSource.getRepository(Job);
    }
  }

  setDataSource(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repo = dataSource.getRepository(Job);
  }

  private getRepo(): Repository<Job> {
    if (!this.repo) {
      throw new Error("DataSource not initialized in JobRepository");
    }
    return this.repo;
  }

  create(data: Partial<Job>) {
    return this.getRepo().create(data);
  }

  save(job: Job) {
    return this.getRepo().save(job);
  }

  findOne(options: any) {
    return this.getRepo().findOne(options);
  }

  createQueryBuilder(alias: string) {
    return this.getRepo().createQueryBuilder(alias);
  }

  async findByOwner(jobId: string, userId: string, tenantId: string) {
    return this.getRepo().findOne({
      where: {
        id: jobId,
        user: { id: userId },
        tenant: { id: tenantId },
      },
      relations: ["attempts", "user", "tenant"],
    });
  }
}
