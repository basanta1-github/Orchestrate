#!/usr/bin/env node
/**
 * Orchestrate M20 Phase 1 verification
 *
 * Checks:
 *   1. GET /health → 200
 *   2. GET /metrics/health → 200
 *   3. Register tenant → submit ml-jobs → poll until COMPLETED
 *
 * Usage:
 *   node scripts/verify-m1.js              # full check
 *   node scripts/verify-m1.js --health-only
 */

const http = require("http");

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const HEALTH_ONLY = process.argv.includes("--health-only");
const POLL_INTERVAL_MS = 2000;
const JOB_TIMEOUT_MS = 120_000;

function request(method, path, body, token) {
  const url = new URL(path, API_BASE);
  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed = data;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            /* keep raw string */
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: parsed });
          } else {
            const msg =
              parsed?.message ||
              (Array.isArray(parsed?.message)
                ? parsed.message.join(", ")
                : null) ||
              parsed?.error ||
              data ||
              res.statusMessage;
            reject(new Error(`${method} ${path} → ${res.statusCode}: ${msg}`));
          }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get = (path, token) => request("GET", path, null, token);
const post = (path, body, token) => request("POST", path, body, token);

async function checkHealth() {
  const checks = [
    { name: "API /health", run: () => get("/health") },
    { name: "API /metrics/health", run: () => get("/metrics/health") },
  ];

  let failed = 0;
  for (const check of checks) {
    try {
      const { data } = await check.run();
      console.log(`✅ ${check.name}:`, JSON.stringify(data));
    } catch (err) {
      console.error(`❌ ${check.name}:`, err.message);
      failed++;
    }
  }
  return failed;
}

async function checkJobLifecycle() {
  const stamp = Date.now();
  const tenantName = `verify-${stamp}`;
  const email = `verify-${stamp}@test.local`;
  const password = "Verify123!";

  console.log("\n── Job lifecycle test ──");

  // Register admin user + tenant
  const reg = await post("/auth/register", {
    name: "Verify Bot",
    tenantName,
    email,
    password,
  });
  const token = reg.data.accessToken;
  if (!token) throw new Error("Register did not return accessToken");
  console.log(`✅ Registered tenant "${tenantName}"`);

  // Submit ML job (no external files / SMTP required)
  const submitted = await post(
    "/jobs",
    {
      jobType: "ml-jobs",
      metadata: {
        taskType: "text_summarization",
        input:
          "Orchestrate Phase 1 verification job — please complete successfully.",
      },
      priorityLevel: "HIGH",
    },
    token,
  );

  const jobId =
    submitted.data?.job?.id || submitted.data?.jobId || submitted.data?.id;
  if (!jobId)
    throw new Error(
      `Unexpected POST /jobs response: ${JSON.stringify(submitted.data)}`,
    );
  console.log(`✅ Job enqueued: ${jobId}`);

  // Poll until COMPLETED or FAILED
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const detail = await get(`/jobs/${jobId}`, token);
    const status = detail.data?.status || detail.data?.job?.status;
    process.stdout.write(`   … status: ${status || "unknown"}\r`);
    if (status === "COMPLETED") {
      console.log(`\n✅ Job ${jobId} reached COMPLETED`);
      return 0;
    }
    if (status === "FAILED") {
      throw new Error(`Job ${jobId} FAILED: ${JSON.stringify(detail.data)}`);
    }
  }

  throw new Error(
    `Timed out after ${JOB_TIMEOUT_MS / 1000}s waiting for COMPLETED`,
  );
}

(async () => {
  console.log("🔍 Orchestrate M20 Phase 1 verification\n");
  console.log(`   API: ${API_BASE}\n`);

  let failed = await checkHealth();

  if (!HEALTH_ONLY && failed === 0) {
    try {
      await checkJobLifecycle();
    } catch (err) {
      console.error(`❌ Job lifecycle:`, err.message);
      failed++;
    }
  } else if (HEALTH_ONLY) {
    console.log("\n(skipping job lifecycle — --health-only)");
  }

  if (failed) {
    console.log("\n⚠️  Start the stack first: npm run docker:up");
    process.exit(1);
  }

  console.log("\n✅ All Phase 1 checks passed");
})();
