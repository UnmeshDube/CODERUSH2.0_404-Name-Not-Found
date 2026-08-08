import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DATASET_DIR = "C:\\Users\\Admin\\Desktop\\YCCE3\\dataset";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.resolve(__dirname, "..", "categories.json");

const FILE_PATTERNS = {
  abandoned: /abandoned-vehicles?/i,
  alleyLights: /alley-lights?-out/i,
  garbage: /garbage-carts?/i,
  graffiti: /graffiti-removal/i,
  potholes: /pot-holes?-reported/i,
  rodents: /rodent-baiting/i,
  sanitation: /sanitation-code-complaints/i,
  streetLightsAll: /street-lights?-all-out/i,
  streetLightsOne: /street-lights?-one-out/i,
  treeDebris: /tree-debris/i,
  treeTrims: /tree-trims?/i,
  vacantBuildings: /vacant-and-abandoned-buildings?-reported/i,
};

function main() {
  const files = fs.readdirSync(DATASET_DIR).filter((file) => /^311-service-requests-.*\.csv$/i.test(file));
  const categories = files.map((file) => buildCategoryRecord(file)).sort((a, b) => a.title.localeCompare(b.title));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(categories, null, 2) + "\n", "utf8");
  console.log(`Wrote ${categories.length} categories to ${OUTPUT_FILE}`);
}

function buildCategoryRecord(sourceFile) {
  const baseName = sourceFile.replace(/^311-service-requests-/i, "").replace(/\.csv$/i, "");
  const metadataFile = path.join(DATASET_DIR, `socrata_metadata_311-service-requests-${baseName}.json`);
  const metadata = readJsonIfExists(metadataFile);
  const title = deriveTitle(baseName, metadata);
  return {
    id: slugify(title),
    title,
    sourceFile,
    department: "Nagpur Municipal Corporation",
    tooltip: buildTooltip(metadata, title),
    sourceTitle: metadata?.name || "",
  };
}

function deriveTitle(baseName, metadata) {
  if (FILE_PATTERNS.abandoned.test(baseName)) return "Abandoned Vehicles";
  if (FILE_PATTERNS.alleyLights.test(baseName)) return "Alley Lights Out";
  if (FILE_PATTERNS.garbage.test(baseName)) return "Garbage Carts";
  if (FILE_PATTERNS.graffiti.test(baseName)) return "Graffiti Removal";
  if (FILE_PATTERNS.potholes.test(baseName)) return "Potholes & Road Damage";
  if (FILE_PATTERNS.rodents.test(baseName)) return "Rodent Baiting";
  if (FILE_PATTERNS.sanitation.test(baseName)) return "Sanitation Code Complaints";
  if (FILE_PATTERNS.streetLightsAll.test(baseName)) return "Street Light All Out";
  if (FILE_PATTERNS.streetLightsOne.test(baseName)) return "Street Light One Out";
  if (FILE_PATTERNS.treeDebris.test(baseName)) return "Tree Debris";
  if (FILE_PATTERNS.treeTrims.test(baseName)) return "Tree Trims";
  if (FILE_PATTERNS.vacantBuildings.test(baseName)) return "Vacant & Abandoned Buildings";

  if (metadata?.name) {
    const cleaned = metadata.name
      .replace(/^311 Service Requests?\s*-\s*/i, "")
      .replace(/\s*-\s*Historical$/i, "")
      .replace(/\s*-\s*Historical\s*$/i, "")
      .trim();
    if (cleaned) {
      return cleaned
        .replace(/\bAll\/Out\b/i, "All Out")
        .replace(/\s+/g, " ")
        .replace(/ - /g, " ")
        .trim();
    }
  }

  return baseName
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bOf\b/g, "of");
}

function buildTooltip(metadata, title) {
  const description = metadata?.description ? String(metadata.description).trim() : "";
  const columnInfo = Array.isArray(metadata?.columns)
    ? metadata.columns.find((column) => /type of service request/i.test(column.name || "") || /description/i.test(column.name || ""))
    : null;
  const snippets = [];

  if (description) {
    snippets.push(description.split(/\n+/).find(Boolean) || description);
  }
  if (columnInfo?.description) {
    snippets.push(columnInfo.description);
  }

  const text = snippets.join(" ").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 240);
  return `${title} category sourced from the local dataset metadata.`;
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

main();
