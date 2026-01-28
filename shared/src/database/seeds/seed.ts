// // import "reflect-metadata";
// import { AppDataSource } from "../data-source";
// import { User } from "../entities/user.entity";
// import { Tenant } from "../entities/tenant.entity";
// import dotenv from "dotenv";

// dotenv.config();
// async function seed() {
//   try {
//     // Initialize DB connection
//     await AppDataSource.initialize();
//     console.log("Database connected for seeding...");

//     const tenantRepo = AppDataSource.getRepository(Tenant);
//     const userRepo = AppDataSource.getRepository(User);

//     // Check if tenant already exists
//     const existingTenant = await tenantRepo.findOneBy({
//       id: "67732e60-0856-4950-ac26-616a8c1a04c2",
//     });
//     if (!existingTenant) {
//       const tenant = tenantRepo.create({
//         id: "67732e60-0856-4950-ac26-616a8c1a04c2", // same as in JobsController
//         name: "Default Tenant",
//       });
//       await tenantRepo.save(tenant);
//       console.log("Tenant seeded:", tenant);
//     } else {
//       console.log("Tenant already exists:", existingTenant);
//     }

//     // Check if user already exists
//     const existingUser = await userRepo.findOneBy({
//       id: "2e08e347-5d83-4df1-8c6a-428cbda9ffd3",
//     });
//     if (!existingUser) {
//       const user = userRepo.create({
//         id: "2e08e347-5d83-4df1-8c6a-428cbda9ffd3", // same as in JobsController
//         name: "Default User",
//         email: "user@example.com",
//         tenant: { id: "67732e60-0856-4950-ac26-616a8c1a04c2" }, // link to tenant
//       });
//       await userRepo.save(user);
//       console.log("User seeded:", user);
//     } else {
//       console.log("User already exists:", existingUser);
//     }

//     console.log("Connecting to DB:", {
//       host: process.env.DB_HOST,
//       port: process.env.DB_PORT,
//       user: process.env.DB_USER,
//       database: process.env.DB_NAME,
//     });

//     console.log("Seeding completed!");
//     process.exit(0);
//   } catch (error) {
//     console.error("Error seeding data:", error);
//     process.exit(1);
//   }
// }

// seed();
