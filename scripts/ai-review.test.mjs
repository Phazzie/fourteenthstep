import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clipDiff,
  commentDestination,
  isOriginCliMissing,
  originCliAvailable,
  publishReview,
  reviewDecision,
  reviewPrompt,
} from "./ai-review.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("ai review", () => {
  it("skips when the key is missing and reviews when it is set", () => {
    assert.equal(reviewDecision({}).action, "skip");
    assert.equal(reviewDecision({ XAI_API_KEY: "  " }).action, "skip");
    assert.equal(reviewDecision({ XAI_API_KEY: "xai-test" }).action, "review");
  });

  it("exits 0 when XAI_API_KEY is unset", () => {
    const result = spawnSync(process.execPath, ["scripts/ai-review.mjs"], {
      cwd: repoRoot,
      env: { PATH: process.env.PATH ?? "" },
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /AI review skipped: XAI_API_KEY is not set/);
  });

  it("clips a huge diff and keeps a short one", () => {
    assert.equal(clipDiff("small"), "small");
    const huge = "a".repeat(20_000);
    const clipped = clipDiff(huge);
    assert.equal(clipped.endsWith("[diff truncated]"), true);
    assert.equal(clipped.length < huge.length, true);
  });

  it("comments on Origin when a pull request number is present", () => {
    assert.equal(commentDestination({ PR_NUMBER: "8" }), "origin");
    assert.equal(commentDestination({}), "stdout");
    assert.equal(commentDestination({ GITHUB_TOKEN: "ghs", GITHUB_REPOSITORY: "Phazzie/fourteenthstep" }), "stdout");
  });

  it("treats a missing origin binary as a non-failure", async () => {
    const missing = Object.assign(new Error("spawn origin ENOENT"), { code: "ENOENT" });
    assert.equal(isOriginCliMissing(missing), true);
    assert.equal(isOriginCliMissing(new Error("origin: not found")), true);
    assert.equal(isOriginCliMissing(new Error("comment rejected")), false);
    assert.equal(originCliAvailable({ PATH: "/nonexistent" }), false);

    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        'import { publishReview } from "./scripts/ai-review.mjs"; await publishReview({ PR_NUMBER: "8", PATH: "/nonexistent" }, "review body");',
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /review body/);
    assert.match(result.stdout, /origin CLI is not available/);
  });

  it("asks for bugs rather than style notes", () => {
    const prompt = reviewPrompt("diff --git a/src/engine/03-autonomous-runner.ts");
    assert.match(prompt, /security|privacy|secret/i);
    assert.match(prompt, /diff --git a\/src\/engine\/03-autonomous-runner\.ts/);
  });
});
