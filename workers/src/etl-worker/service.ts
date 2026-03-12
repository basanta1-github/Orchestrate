import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { User } from "@jobque/shared";
import { InjectDataSource } from "@nestjs/typeorm";
import { ProcessedUser } from "@jobque/shared";

export interface ETLPayload {
  source: string; // eg user+table or external_api
  transformType: string; // eg uppercase_name or filter_age
  target: string; // eg processed_users_table
  data?: any; // optional pre fetched data
  dependsOn?: string[]; // job id this job depends on meaning the job id inside depends on must finish first
  nextJob?: ETLPayload[];
}

@Injectable()
export class ETLService {
  constructor(
    @InjectDataSource()
    protected readonly dataSource: DataSource,
  ) {}

  // extract data from the source
  async extract(metadata: ETLPayload): Promise<any[]> {
    if (metadata.source === "users_table") {
      return this.dataSource.getRepository(User).find();
    }

    if (metadata.source === "external_api" && metadata.data.url) {
      const response = await fetch(metadata.data.url);
      return response.json();
    }

    return [];
  }

  /// transform the data
  async transform(metadata: ETLPayload, data: any[]): Promise<any[]> {
    switch (metadata.transformType) {
      case "uppercase_name":
        return data.map((d) => ({ ...d, name: d.name.toUpperCase() }));
      case "filter_age":
        return data.filter((d) => d.age >= 18);
      default:
        return data;
    }
  }

  // load the data into target
  async load(metadata: ETLPayload, transformedData: any[]): Promise<void> {
    if (!transformedData.length) return;
    if (metadata.target === "processed_users_table") {
      const repo = this.dataSource.getRepository(ProcessedUser);

      // idempotent rule
      await repo.upsert(transformedData, ["id"]); // conflict column primary key
    }
    // Extendable: add ther DBs message queues, or cloud targets here
  }
}
