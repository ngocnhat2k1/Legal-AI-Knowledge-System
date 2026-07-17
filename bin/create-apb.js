#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectName = process.argv[2];

if (!projectName) {
  console.error("Usage: create-apb <project-name-or-path>");
  process.exit(1);
}

const templateDir = path.resolve(__dirname, "..", "templates");
const targetDir = path.resolve(process.cwd(), projectName);
const replacement = path.basename(targetDir);
const ignoredTemplateEntries = new Set([".DS_Store", "Thumbs.db"]);

if (!fs.existsSync(templateDir)) {
  console.error(`Template directory not found: ${templateDir}`);
  process.exit(1);
}

if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
  console.error(`Target directory is not empty: ${targetDir}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });

function copyTemplate(source, target) {
  if (ignoredTemplateEntries.has(path.basename(source))) {
    return;
  }

  const stat = fs.statSync(source);

  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyTemplate(path.join(source, entry), path.join(target, entry));
    }
    return;
  }

  const content = fs.readFileSync(source, "utf8");
  const output = content.replaceAll("{{PROJECT_NAME}}", replacement);
  fs.writeFileSync(target, output);
}

copyTemplate(templateDir, targetDir);

console.log(`Created APB project at ${targetDir}`);
