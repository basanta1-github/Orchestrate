// import { Injectable } from '@nestjs/common';
// import { InjectDataSource } from '@nestjs/typeorm';
// import { DataSource, Repository } from 'typeorm';
// import { Job } from '@jobque/shared';

// @Injectable()
// export class JobRepository extends Repository<Job> {
//   constructor(@InjectDataSource() private dataSource: DataSource) {
//     super(Job, dataSource.createEntityManager());
//   }

//   async findByOwner(jobId: string, userId: string, tenantId: string) {
//     return this.findOne({
//       where: {
//         id: jobId,
//         user: { id: userId },
//         tenant: { id: tenantId },
//       },
//       relations: ['attempts', 'user', 'tenant'],
//     });
//   }
// }
