import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Inject,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { User, UserRole } from "../database";
import { Tenant } from "../database";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
    private jwtService: JwtService,
  ) {}

  async register(dto: {
    name: string;
    email: string;
    password: string;
    tenantName?: string;
  }) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException("Email already in use");

    const existingTenant = await this.tenantRepo.findOne({
      where: { name: dto.tenantName },
    });
    if (existingTenant) throw new ConflictException("Company already exists");

    const hash = await bcrypt.hash(dto.password, 10);

    //simulate token generation to catch errors early
    try {
      this.jwtService.sign({ test: "test" });
    } catch (error) {
      throw error;
    }

    return await this.tenantRepo.manager.transaction(async (manager) => {
      // create tenant
      const tenant = manager.create(Tenant, { name: dto.tenantName });
      const savedTenant = await manager.save(tenant);

      // create tenant admin
      const admin = manager.create(User, {
        name: dto.name,
        email: dto.email,
        password: hash,
        role: UserRole.ADMIN,
        tenant: savedTenant,
      });

      const savedAdmin = await manager.save(User, admin);
      return this.issueToken(savedAdmin);
    });
  }
  async login(dto: { email: string; password: string; tenantName?: string }) {
    let user: User | null = null;

    if (dto.tenantName) {
      // tenant user/ admin login
      user = await this.userRepo.findOne({
        where: { email: dto.email },
        relations: ["tenant"], // tenant optional for super admin
      });

      if (!user || !user.tenant || user.tenant.name !== dto.tenantName) {
        throw new UnauthorizedException("invalid credentals");
      }
    } else {
      // super admin login
      user = await this.userRepo.findOne({
        where: { email: dto.email },
      });

      if (!user || user.role !== UserRole.SUPER_ADMIN) {
        throw new UnauthorizedException("invalid credentals");
      }
    }
    // passport check
    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) throw new UnauthorizedException("invalid credentals");

    return this.issueToken(user);
  }

  //   called from googlestrategy after profile is validated // oauth only for company admins
  //   async findOrCreate0AuthUser(profile: {
  //     oauthId: string;
  //     email: string;
  //     name: string;
  //     tenantName: string;
  //   }) {
  //     let user = await this.userRepo.findOne({
  //       where: { email: profile.email },
  //       relations: ["tenant"],
  //     });

  //     if (!user) {
  //       let tenant: Tenant | undefined;
  //       if (profile.tenantName) {
  //         const foundTenant = await this.tenantRepo.findOne({
  //           where: { id: profile.tenantName },
  //         });
  //         tenant = foundTenant ?? undefined;
  //       }
  //       user = await this.userRepo.save(
  //         this.userRepo.create({
  //           name: profile.name,
  //           email: profile.email,
  //           password: "", // no pass for 0auth users
  //           role: UserRole.USER,
  //           tenant,
  //         }),
  //       );
  //     }
  //     return this.issueToken(user);
  //   }
  private issueToken(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant?.id ?? null,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant?.id,
      },
    };
  }
}
