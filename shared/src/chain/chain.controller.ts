import { Controller, Post, Logger, Body } from "@nestjs/common";
import { ChainService } from "./chain.service";
import { AuthUser } from "../auth/auth.user.decorator";

@Controller("jobs")
export class ChainController {
  private readonly logger = new Logger(ChainController.name);
  constructor(private readonly chainService: ChainService) {}
  // chain controller
  @Post("workflow")
  async createWorkflow(@Body() dto: any, @AuthUser() user: any) {
    return this.chainService.createWorkFlow(dto, user.id, user.tenantId);
  }
}
