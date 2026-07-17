#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const [sourceArg, targetArg] = process.argv.slice(2);

if (!sourceArg) {
  console.error("Usage: apb-render-project-info <source-file-or-directory> [project-root]");
  process.exit(1);
}

const sourcePath = path.resolve(process.cwd(), sourceArg);
const projectRoot = path.resolve(process.cwd(), targetArg || ".");
const planningDir = path.join(projectRoot, ".agent", "planning");
const outputFile = path.join(planningDir, "02-project-summary.md");

if (!fs.existsSync(sourcePath)) {
  console.error(`Source not found: ${sourcePath}`);
  process.exit(1);
}

if (fs.existsSync(outputFile)) {
  console.error(`Output file already exists: ${outputFile}`);
  process.exit(1);
}

const sourceDocuments = collectSourceDocuments(sourcePath);

if (sourceDocuments.supported.length === 0) {
  console.error("No supported source documents found. Supported formats: .md, .txt, .docx");
  process.exit(1);
}

const source = combineSourceDocuments(sourceDocuments.supported);
const projectName = inferProjectNameFromDocuments(sourceDocuments.supported) || inferProjectName(source) || path.basename(projectRoot);
const sections = parseMarkdownSections(source);

fs.mkdirSync(planningDir, { recursive: true });
fs.writeFileSync(outputFile, renderProjectSummary(projectName, projectRoot, sourcePath, sourceDocuments, sections));

console.log(`Created project summary at ${outputFile}`);

function inferProjectName(markdown) {
  const heading = markdown.match(/^#\s+(.+)$/m);
  if (!heading) return "";
  return heading[1].trim();
}

function inferProjectNameFromDocuments(documents) {
  for (const document of documents) {
    const name = inferProjectName(document.content);
    if (name) return name;
  }
  return "";
}

function collectSourceDocuments(inputPath) {
  const files = fs.statSync(inputPath).isDirectory() ? walkFiles(inputPath) : [inputPath];
  const supported = [];
  const unsupported = [];

  for (const file of files.sort()) {
    const ext = path.extname(file).toLowerCase();
    try {
      if (ext === ".md" || ext === ".txt") {
        supported.push({
          file,
          name: path.basename(file),
          type: ext.slice(1),
          content: fs.readFileSync(file, "utf8"),
        });
      } else if (ext === ".docx") {
        supported.push({
          file,
          name: path.basename(file),
          type: "docx",
          content: extractDocxText(file),
        });
      } else {
        unsupported.push(file);
      }
    } catch (error) {
      unsupported.push(`${file} (${error.message})`);
    }
  }

  return { supported, unsupported };
}

function walkFiles(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory)) {
    if (entry === ".DS_Store") continue;
    const fullPath = path.join(directory, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function combineSourceDocuments(documents) {
  return documents
    .map((doc) => `## Source Document: ${doc.name}\n\n${doc.content}`)
    .join("\n\n---\n\n");
}

function extractDocxText(file) {
  const entries = readZipEntries(fs.readFileSync(file));
  const documentXml = entries.get("word/document.xml");
  if (!documentXml) {
    throw new Error("word/document.xml not found");
  }
  return docxXmlToText(documentXml.toString("utf8"));
}

function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;

  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = buffer.slice(nameStart, nameEnd).toString("utf8");
    const compressed = buffer.slice(dataStart, dataEnd);

    if (method === 0) {
      entries.set(name, compressed);
    } else if (method === 8) {
      entries.set(name, zlib.inflateRawSync(compressed));
    }

    offset = dataEnd;
  }

  return entries;
}

function docxXmlToText(xml) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseMarkdownSections(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sectionsByHeading = {};
  let currentHeading = "source";
  let currentLines = [];

  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      sectionsByHeading[normalizeHeading(currentHeading)] = currentLines.join("\n").trim();
      currentHeading = match[1].trim();
      currentLines = [];
      continue;
    }
    const implicitHeading = inferImplicitHeading(line);
    if (implicitHeading) {
      sectionsByHeading[normalizeHeading(currentHeading)] = currentLines.join("\n").trim();
      currentHeading = implicitHeading;
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }

  sectionsByHeading[normalizeHeading(currentHeading)] = currentLines.join("\n").trim();

  return {
    overview: findSection(sectionsByHeading, ["overview", "summary", "description", "introduction", "gioi thieu", "giới thiệu", "mo ta", "mô tả"]),
    purpose: findSection(sectionsByHeading, ["purpose", "goal", "goals", "objective", "objectives", "muc tieu", "mục tiêu"]),
    stakeholders: findSection(sectionsByHeading, ["stakeholder", "stakeholders", "user", "users", "actor", "actors", "audience", "nguoi dung", "người dùng"]),
    scope: findSection(sectionsByHeading, ["scope", "in scope", "pham vi", "phạm vi"]),
    outOfScope: findSection(sectionsByHeading, ["out of scope", "ngoai pham vi", "ngoài phạm vi"]),
    requirements: findSection(sectionsByHeading, ["requirement", "requirements", "feature", "features", "function", "functions", "yeu cau", "yêu cầu", "chuc nang", "chức năng"]),
    constraints: findSection(sectionsByHeading, ["constraint", "constraints", "rule", "rules", "rang buoc", "ràng buộc"]),
    successCriteria: findSection(sectionsByHeading, ["success", "success criteria", "acceptance", "acceptance criteria", "criteria", "tieu chi", "tiêu chí"]),
  };
}

function inferImplicitHeading(line) {
  const trimmed = line.trim().replace(/:$/, "");
  if (!trimmed || trimmed.length > 60) return "";
  const normalized = normalizeHeading(trimmed);
  const knownHeadings = [
    "overview",
    "summary",
    "description",
    "purpose",
    "goal",
    "goals",
    "objective",
    "objectives",
    "stakeholders",
    "users",
    "actors",
    "audience",
    "scope",
    "in scope",
    "out of scope",
    "requirements",
    "features",
    "functions",
    "constraints",
    "rules",
    "success criteria",
    "acceptance criteria",
  ].map(normalizeHeading);

  return knownHeadings.includes(normalized) ? trimmed : "";
}

function normalizeHeading(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findSection(sectionsByHeading, candidates) {
  const normalizedCandidates = candidates.map(normalizeHeading);

  for (const [heading, content] of Object.entries(sectionsByHeading)) {
    if (!content) continue;
    if (normalizedCandidates.some((candidate) => heading.includes(candidate))) {
      return content;
    }
  }

  return "";
}

function renderProjectSummary(projectName, projectRootPath, sourcePathValue, sourceDocuments, extracted) {
  return `# Project Summary

## Project

\`${projectName}\`

## Sources

${renderSources(projectRootPath, sourcePathValue, sourceDocuments)}

## Overview

${valueOrFallback(extracted.overview)}

## Purpose

${valueOrFallback(extracted.purpose)}

## Stakeholders / Users

${valueOrFallback(extracted.stakeholders)}

## Scope

${valueOrFallback(extracted.scope)}

## Out of Scope

${valueOrFallback(extracted.outOfScope)}

## Requirements

${valueOrFallback(extracted.requirements)}

## Constraints

${valueOrFallback(extracted.constraints)}

## Success Criteria

${valueOrFallback(extracted.successCriteria)}

## Open Questions

${openQuestions(extracted)}

## Review Status

Status: Draft

## Next Action

Review this summary against the source BA description, fill any missing sections, and update \`.agent/planning/00-bootstrap.md\` if the project scope or constraints changed.
`;
}

function renderSources(projectRootPath, sourcePathValue, sourceDocuments) {
  const sourceType = fs.statSync(sourcePathValue).isDirectory() ? "Directory" : "File";
  const lines = [
    `Source type: ${sourceType}`,
    "",
    "Supported documents:",
    ...sourceDocuments.supported.map((doc) => `- \`${path.relative(projectRootPath, doc.file)}\` (${doc.type})`),
  ];

  if (sourceDocuments.unsupported.length > 0) {
    lines.push("", "Unsupported or skipped documents:");
    lines.push(...sourceDocuments.unsupported.map((file) => `- \`${path.relative(projectRootPath, String(file))}\``));
  }

  return lines.join("\n");
}

function valueOrFallback(value) {
  return value || "Not identified in source.";
}

function openQuestions(extracted) {
  const questions = [];
  if (!extracted.purpose) questions.push("- What is the primary project purpose?");
  if (!extracted.stakeholders) questions.push("- Who are the primary users or stakeholders?");
  if (!extracted.requirements) questions.push("- What requirements are required for the first useful version?");
  if (!extracted.constraints) questions.push("- What constraints must the project preserve?");
  if (!extracted.successCriteria) questions.push("- What success criteria should determine readiness?");

  return questions.length > 0 ? questions.join("\n") : "- No immediate open questions identified from the source structure.";
}
