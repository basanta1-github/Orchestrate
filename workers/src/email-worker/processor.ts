import { Injectable, Logger } from "@nestjs/common";
import { Job as BullJob } from "bullmq";
import { BaseProcessor } from "../base-worker/base.processor";
import { STMPProvider } from "./provider/stmp.provider";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import {
  ChainService,
  Notification,
  NotificationChanel,
  NotificationStatus,
} from "@jobque/shared";
import { v4 as uuidv4 } from "uuid";
import validator from "validator";
import { HunterService } from "./provider/hunter.service";

@Injectable()
export class EmailProcessor extends BaseProcessor {
  private provider = new STMPProvider();
  protected logger = new Logger(EmailProcessor.name);
  private hunter = new HunterService();

  constructor(
    @InjectDataSource()
    dataSource: DataSource,
    chainService: ChainService,
  ) {
    super(dataSource, chainService);
  }
  protected async process(job: BullJob): Promise<void> {
    const { metadata } = job.data;
    const { recipients, subject, content } = metadata;

    //auto generate/fetch id
    const jobId = job.id ?? uuidv4(); // unique id for this job
    const tenantId = "default-tenant-id"; // fetch from system/session
    const userId = "default-user-id"; // fetch from system/session
    const notificationRepo = this.dataSource.getRepository(Notification);

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      throw new Error("No recipients provided for email job");
    }

    let validEmailsSent = 0;

    // create DB row first
    for (const recipient of recipients) {
      let isValid = true;
      let faliureReason = "";

      // email syntax
      if (!validator.isEmail(recipient)) {
        isValid = false;
        faliureReason = "Invalid email";
      }

      // hunter verification
      if (isValid) {
        const isDeliverable = await this.hunter.verify(recipient);
        if (!isDeliverable) {
          isValid = false;
          faliureReason = "email not deliverable(hunter)";
        }
      }

      // generate reference id
      const referenceId = `${jobId}-${recipient}`;

      // fetch existing notification (idempotency)
      let notification = await notificationRepo.findOne({
        where: { referenceId },
      });
      if (!notification) {
        // only create notification if it dont exists
        notification = await notificationRepo.save({
          jobId,
          tenantId,
          userId,
          channel: NotificationChanel.EMAIL,
          recipient,
          subject,
          content,
          status: isValid
            ? NotificationStatus.PENDING
            : NotificationStatus.FAILED,
          faliureReason: isValid ? undefined : faliureReason,
          referenceId,
        });
      } else if (!isValid) {
        // Update existing notification if invalid
        await notificationRepo.update(
          { id: notification.id },
          { status: NotificationStatus.FAILED, faliureReason: faliureReason },
        );
        continue; // skip sending
      }
      if (!isValid) {
        this.logger.warn(
          `Skipping invalid recipient: ${recipient} (${faliureReason})`,
        );
        continue;
      }
      // Mark processing

      await notificationRepo.update(
        { id: notification.id },
        { status: NotificationStatus.PROCESSING },
      );

      try {
        const response = await this.provider.send({
          recipient,
          subject,
          content,
          referenceId: "",
        });
        if (!response.success) {
          throw new Error(
            response.errorMessage || "Email rejected by provider",
          );
        }
        // update notification -> sent

        await notificationRepo.update(
          { id: notification.id },
          {
            status: NotificationStatus.SENT,
            providerMessageId: response.providerMessageId,
            sentAt: new Date(),
          },
        );

        validEmailsSent++;
      } catch (error) {
        await notificationRepo.update(
          { id: notification.id },
          {
            status: NotificationStatus.FAILED,
            faliureReason:
              error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    if (validEmailsSent === 0) {
      throw new Error("no valid recipients. failed job");
    }
  }
}
