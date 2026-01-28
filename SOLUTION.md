# Solution for NestJS Dependency Injection Error

## Problem

The `JobRepository` cannot be instantiated because `DataSource` is not available in the `JobsModule` context. While `TypeOrmModule.forRoot()` in `AppModule` creates the `DataSource`, it is not automatically accessible to child modules that use `TypeOrmModule.forFeature()`.

## Root Cause

- `AppModule` uses `TypeOrmModule.forRoot()` which creates and provides `DataSource`
- `JobsModule` uses `TypeOrmModule.forFeature()` which does NOT provide access to `DataSource`
- NestJS cannot find `DataSource` when trying to instantiate `JobRepository`

## Solution

The cleanest solution is to use lazy initialization through `ModuleRef`, which is already implemented in the current code. The JobRepository now:

1. Takes `ModuleRef` as a constructor parameter (which is always available)
2. Implements `OnModuleInit` to resolve `DataSource` lazily after the module initializes
3. Uses lazy getRepo() to fetch repositories on-demand

## Files Modified

### 1. `shared/src/database/repositories/job.repository.ts`

- Changed constructor to accept `ModuleRef` instead of `DataSource`
- Implemented `OnModuleInit` lifecycle hook
- Added lazy resolution logic in `onModuleInit()` to fetch DataSource from ModuleRef

### 2. `shared/src/jobs/jobs.module.ts`

- Simplified providers to just `[JobsService, JobRepository]`
- Removed custom factory providers that were failing
- Let NestJS automatically inject dependencies

### 3. `api/src/app.module.ts`

- Added `exports: [TypeOrmModule]` to share TypeOrmModule with child modules

## How It Works

When the application starts:

1. `AppModule` initializes `TypeOrmModule.forRoot()` and creates `DataSource`
2. `JobsModule` loads and tries to instantiate `JobRepository`
3. NestJS injects `ModuleRef` (always available) into JobRepository
4. `JobRepository.onModuleInit()` is called by NestJS
5. In `onModuleInit()`, we use `ModuleRef.get(DataSource)` to retrieve the DataSource from the application container
6. All repository methods now work correctly

## Why This Approach Works

- **ModuleRef** is a built-in NestJS service that's always available
- **OnModuleInit** lifecycle hook ensures DataSource is resolved after all modules are initialized
- **Lazy initialization** in getRepo() ensures the repository is available when first needed
- **No token conflicts** - we're not trying to inject a token that might not exist

## Testing

To verify the fix works:

1. Rebuild the shared package: `npm run build` in `/shared`
2. Restart the API: `npm run start:dev` in `/api`
3. The application should now start without dependency resolution errors

The solution handles the case where `DataSource` might not be immediately available at injection time by resolving it lazily during module initialization.
