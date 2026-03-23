import { Controller, Post, Logger, Body } from "@nestjs/common";
import { ChainService } from "./chain.service";

@Controller("jobs")
export class ChainController {
  private readonly logger = new Logger(ChainController.name);
  constructor(private readonly chainService: ChainService) {}
  // chain controller
  @Post("workflow")
  async createWorkflow(@Body() dto: any) {
    return this.chainService.createWorkFlow(dto);
  }
}
