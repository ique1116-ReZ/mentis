#!/usr/bin/env node
// 一次性迁移脚本：清理 platform-state.json 里的 1112 条导入健身动作。
//
// 背景：storage.ts 的 hydrateFromDisk 对 actionLibrary 用 mergeSeedWins ——
// 种子(代码里的库) ∪ (磁盘上种子没有的条目)。Task 13 把这 1112 条从代码里删了，
// 但它们仍然躺在生产的 platform-state.json 里，重启后会被原样并回内存。
// 必须清一次数据文件，只删代码没用。
//
// 用法:
//   node scripts/purge-fitness-library.mjs <platform-state.json>            # dry-run，不改任何文件
//   node scripts/purge-fitness-library.mjs <platform-state.json> --apply    # 先自动备份，再写回
//
// 删除判据: tags 数组包含 "exercise-library"。这是当年生成脚本给每条导入动作
// 打的第一个 tag，1112 条无一例外。不用 source 字段判断——那批旧数据根本没有
// source 字段，用 source 当判据会导致误删或漏删。

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

function fail(message) {
  console.error(`[purge-fitness-library] ${message}`);
  process.exit(1);
}

const [, , dataPath, ...flags] = process.argv;
const apply = flags.includes("--apply");

if (!dataPath) {
  fail("用法: node scripts/purge-fitness-library.mjs <platform-state.json> [--apply]");
}

if (!existsSync(dataPath)) {
  fail(`文件不存在: ${dataPath}（检查路径有没有打错，别对着空文件跑）`);
}

let raw;
try {
  raw = readFileSync(dataPath, "utf-8");
} catch (error) {
  fail(`读取失败: ${dataPath}\n${error.message}`);
}

let state;
try {
  state = JSON.parse(raw);
} catch (error) {
  fail(`JSON 解析失败，文件可能已损坏或不是有效的 platform-state.json: ${dataPath}\n${error.message}`);
}

if (state === null || typeof state !== "object" || Array.isArray(state)) {
  fail(`文件内容不是一个 JSON 对象，看起来不是 platform-state.json: ${dataPath}`);
}

if (!Array.isArray(state.actionLibrary)) {
  fail(
    `文件里没有 actionLibrary 数组（拿到的是 ${typeof state.actionLibrary}），这不像 platform-state.json，拒绝执行以免静默改错文件: ${dataPath}`,
  );
}

const library = state.actionLibrary;

const isFitnessImport = (action) => Array.isArray(action.tags) && action.tags.includes("exercise-library");

const removed = library.filter(isFitnessImport);
const kept = library.filter((action) => !isFitnessImport(action));

console.log(`动作库总数: ${library.length}`);
console.log(`将删除(健身导入, tags 含 exercise-library): ${removed.length}`);
console.log(`将保留: ${kept.length}`);
console.log(`  其中 source=ai (模型生成，要留): ${kept.filter((action) => action.source === "ai").length}`);
console.log(`  其中 source=seed: ${kept.filter((action) => action.source === "seed").length}`);
console.log(`  其中无 source 标记: ${kept.filter((action) => !action.source).length}`);

if (!apply) {
  console.log("\n这是 dry-run，没有改动任何文件。确认数字合理后加 --apply 再跑一次。");
  process.exit(0);
}

const backupPath = `${dataPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(dataPath, backupPath);
console.log(`\n已备份到 ${backupPath}`);

state.actionLibrary = kept;
writeFileSync(dataPath, JSON.stringify(state), "utf-8");
console.log(`已写回 ${dataPath}，动作库剩 ${kept.length} 条。`);
console.log(`出问题就把 ${backupPath} 覆盖回 ${dataPath} 再重启服务。`);
