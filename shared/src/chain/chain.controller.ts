import { Controller, Post, Logger, Body, UseGuards } from "@nestjs/common";
import { ChainService } from "./chain.service";
import { AuthUser } from "../auth/auth.user.decorator";
// import { TenantResource } from "../cross_tenant/tenant.decorator";
// import { JwtTenant } from "../cross_tenant/tenant.decorator";
// import { TenantGuard } from "../cross_tenant/tenant_guard";

// @UseGuards(TenantGuard)
@Controller("jobs")
export class ChainController {
  private readonly logger = new Logger(ChainController.name);
  constructor(private readonly chainService: ChainService) {}
  // chain controller
  @Post("workflow")
  // @TenantResource("tenantId") // look for tenantid in body or params
  async createWorkflow(@Body() dto: any, @AuthUser() user: any) {
    return this.chainService.createWorkFlow(dto, user.userId, user.tenantId);
  }
}
