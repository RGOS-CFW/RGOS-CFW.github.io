#!/usr/bin/env node
/**
 * Rebuilds the commit history in docs/changelog.html from the RGOS repo.
 *
 * Everything between <!-- COMMITS:START --> and <!-- COMMITS:END --> is
 * regenerated. The file is only written when the output actually changes,
 * so running this repeatedly never creates empty commits.
 *
 * Env (all optional):
 *   GITHUB_TOKEN   raises the API rate limit (set automatically in Actions)
 *   REPO           default "RGOS-CFW/RGOS"
 *   BRANCH         default: the repo's default branch
 *   TZ_NAME        IANA zone used to group commits by day, default "UTC"
 *   SKIP_MERGES    "true" (default) hides "Merge ..." commits
 *   SINCE          ISO date; only list commits after it (default: all history)
 *   COMMITS_FILE   path to a JSON file shaped like the GitHub commits API
 *                  (used for offline testing instead of calling GitHub)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "docs", "changelog.html");

const REPO = process.env.REPO || "RGOS-CFW/RGOS";
const BRANCH = process.env.BRANCH || "";
const TZ = process.env.TZ_NAME || "UTC";
const SKIP_MERGES = (process.env.SKIP_MERGES || "true") !== "false";
const SINCE = process.env.SINCE || "";
const MAX_PAGES = 100; // 100 commits per page

const START = "<!-- COMMITS:START -->";
const END = "<!-- COMMITS:END -->";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function fetchCommits() {
  if (process.env.COMMITS_FILE) {
    return JSON.parse(fs.readFileSync(process.env.COMMITS_FILE, "utf8"));
  }
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "rgos-website-changelog",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({ per_page: "100", page: String(page) });
    if (BRANCH) qs.set("sha", BRANCH);
    if (SINCE) qs.set("since", SINCE);
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits?${qs}`, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}: ${await res.text()}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });
const timeLabel = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

function render(raw) {
  // Normalise + filter
  const commits = raw
    .map((c) => ({
      sha: c.sha,
      title: (c.commit.message || "").split("\n")[0].trim(),
      date: new Date(c.commit.author?.date || c.commit.committer.date),
      author: c.commit.author?.name || c.author?.login || "",
      parents: (c.parents || []).length,
    }))
    .filter((c) => c.title && !(SKIP_MERGES && c.parents > 1));

  // Group by day (API returns newest first; keep that order)
  const days = new Map();
  for (const c of commits) {
    const key = dayKey.format(c.date);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(c);
  }
  if (!days.size) throw new Error("No commits returned; refusing to blank the changelog.");

  const linkRefs = (t) =>
    esc(t).replace(/\(#(\d+)\)/g, (_, n) => `(<a href="https://github.com/${REPO}/pull/${n}">#${n}</a>)`);

  let out = "";
  for (const [key, list] of days) {
    const label = dayLabel.format(list[0].date);
    out += `
            <section class="commit-day" data-date="${key}">
              <h3 class="commit-date">
                <time datetime="${key}">${label}</time>
                <span class="commit-count">${list.length} ${list.length === 1 ? "commit" : "commits"}</span>
              </h3>

              <ul class="commits">
${list
  .map((c) => {
    const short = c.sha.slice(0, 7);
    const tip = `${c.author ? c.author + " · " : ""}${timeLabel.format(c.date)} ${TZ}`;
    return `                <li title="${esc(tip)}"><span class="msg">${linkRefs(c.title)}</span><a class="sha" href="https://github.com/${REPO}/commit/${c.sha}">${short}</a></li>`;
  })
  .join("\n")}
              </ul>
            </section>
`;
  }

  const total = commits.length;
  const summary =
    `<p class="commit-summary"><b>${total}</b> ${total === 1 ? "commit" : "commits"} across ` +
    `<b>${days.size}</b> ${days.size === 1 ? "day" : "days"}. Latest: ` +
    `<time datetime="${commits[0].date.toISOString()}">${dayLabel.format(commits[0].date)}</time>. ` +
    `Generated automatically from <a href="https://github.com/${REPO}/commits">${REPO}</a>.</p>`;

  return { body: out, summary };
}

const html = fs.readFileSync(TARGET, "utf8");
const s = html.indexOf(START);
const e = html.indexOf(END);
if (s < 0 || e < 0 || e < s) throw new Error(`Markers ${START} / ${END} not found in ${TARGET}`);

const { body, summary } = render(await fetchCommits());
const next = html.slice(0, s + START.length) + "\n" + `            ${summary}\n` + body + "\n            " + html.slice(e);

if (next === html) {
  console.log("Changelog already up to date.");
} else {
  fs.writeFileSync(TARGET, next);
  console.log("Changelog updated.");
}
