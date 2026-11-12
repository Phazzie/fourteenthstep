#!/usr/bin/env node
/**
 * Pull-request review via the xAI chat API.
 * Skips cleanly when XAI_API_KEY is unset so CI stays green before the owner
 * adds the secret. Posts or updates one Origin comment when a PR number and
 * the origin CLI are present. Prints the review and exits 0 when the CLI is missing.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MARKER = "<!-- fourteenth-step-ai-review -->";
const DIFF_CAP = 14_000;

export function reviewDecision(env) {
  if (!env.XAI_API_KEY?.trim()) return { action: "skip", reason: "XAI_API_KEY is not set" };
  return { action: "review" };
}

export function clipDiff(diff) {
  const text = diff.trim();
  if (text.length <= DIFF_CAP) return text;
  return `${text.slice(0, DIFF_CAP)}\n\n[diff truncated]`;
}

export function reviewPrompt(diff) {
  return [
    "You are reviewing a pull request for The 14th Step, a server-authoritative recovery fellowship meeting simulator.",
    "Comment only on real bugs, security issues, meeting-state corruption, privacy leaks, or secret exposure.",
    "Skip style nits. Use short paragraphs. If nothing is wrong, say so in one sentence.",
    "",
    clipDiff(diff),
  ].join("\n");
}

export function isOriginCliMissing(error) {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "ENOENT") return true;
  const message = "message" in error ? String(error.message) : "";
  return /spawn origin ENOENT|origin: not found|command not found/i.test(message);
}

function pullRequestNumber(env) {
  if (env.PR_NUMBER) return String(env.PR_NUMBER);
  if (!env.GITHUB_EVENT_PATH) return "";
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    return event.pull_request?.number ? String(event.pull_request.number) : "";
  } catch {
    return "";
  }
}

function diffAgainstBase(env) {
  const base = env.GITHUB_BASE_REF || env.BASE_REF || "main";
  try {
    execFileSync("git", ["fetch", "origin", base, "--depth", "50"], { stdio: "ignore" });
  } catch {
    // The checkout may already contain the base.
  }
  try {
    return execFileSync("git", ["diff", `origin/${base}...HEAD`], { encoding: "utf8", maxBuffer: 8_000_000 });
  } catch {
    return execFileSync("git", ["diff", "HEAD~1"], { encoding: "utf8", maxBuffer: 8_000_000 });
  }
}

async function askGrok(apiKey, diff) {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      max_tokens: 500,
      messages: [
        { role: "system", content: "You review code diffs. Be specific and brief." },
        { role: "user", content: reviewPrompt(diff) },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`xAI review failed (${res.status})`);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("xAI review returned an empty note");
  return text;
}

export function commentDestination(env) {
  const number = pullRequestNumber(env);
  if (number) return "origin";
  return "stdout";
}

export function originCliAvailable(env = process.env) {
  try {
    execFileSync("origin", ["--version"], { stdio: "ignore", env });
    return true;
  } catch (error) {
    return !isOriginCliMissing(error);
  }
}

function publishOnOrigin(number, body) {
  const file = execFileSync("mktemp", { encoding: "utf8" }).trim();
  try {
    writeFileSync(file, body);
    execFileSync(
      "origin",
      ["pr", "comment", String(number), "--body-file", file, "--edit-last", "--create-if-none"],
      { stdio: "inherit" },
    );
  } finally {
    try {
      execFileSync("rm", ["-f", file]);
    } catch {
      /* the temp file is only the review text */
    }
  }
}

export function logUnpublishedReview(body, error) {
  console.log(body);
  if (isOriginCliMissing(error)) {
    console.log("AI review printed to the log. origin CLI is not available.");
    return;
  }
  console.error(error instanceof Error ? error.message : error);
  console.log("Origin comment failed. The review is in the log above.");
}

export async function publishReview(env, body) {
  const number = pullRequestNumber(env);
  const destination = commentDestination(env);
  if (destination === "stdout") {
    console.log(body);
    console.log("AI review printed locally. Set PR_NUMBER to comment on the Origin pull request.");
    return;
  }
  if (!originCliAvailable(env)) {
    logUnpublishedReview(body, Object.assign(new Error("spawn origin ENOENT"), { code: "ENOENT" }));
    return;
  }
  try {
    publishOnOrigin(number, body);
  } catch (error) {
    logUnpublishedReview(body, error);
  }
}

async function main() {
  const decision = reviewDecision(process.env);
  if (decision.action === "skip") {
    console.log(`AI review skipped: ${decision.reason}`);
    return;
  }
  const diff = diffAgainstBase(process.env);
  if (!diff.trim()) {
    console.log("AI review skipped: empty diff");
    return;
  }
  const note = await askGrok(process.env.XAI_API_KEY.trim(), diff);
  const body = `${MARKER}\n**Grok review**\n\n${note}`;
  await publishReview(process.env, body);
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
