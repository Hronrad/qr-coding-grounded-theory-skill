const KNOWN_FILE_CANDIDATES = {
  progress_report: ["PROGRESS_REPORT.md"],
  final_report: ["FINAL_REPORT.md"],
  source_manifest: ["source/source_manifest.json"],
  slices: ["node_a/slices.json"],
  extracted_codes: ["node_b/extracted_codes.json"],
  open_codes_summary: ["node_b/open_codes_full.json"],
  axial_network_native: ["node_c_axial_network.json", "node_c/thematic_groups.json"],
  selective_native: ["node_e_selective_coding.json", "node_e/final_thematic_report.json"],
  memo_aggregation: ["node_d/memo_aggregation.json"],
};

const THEORY_ORDER = ["core", "L", "I", "V", "C"];
const DIMENSION_META = {
  L: { label: "L", name: "知识逻辑转化" },
  I: { label: "I", name: "身份认同转化" },
  V: { label: "V", name: "价值观念转化" },
  C: { label: "C", name: "情境条件" },
};

const state = {
  manifest: null,
  currentRun: null,
  currentData: null,
  selection: { type: "core", id: "core" },
  activeArtifactLabel: null,
};

document.addEventListener("DOMContentLoaded", () => {
  init();
});

function init() {
  document.getElementById("pick-folder-button").addEventListener("click", () => {
    document.getElementById("folder-input").click();
  });

  document.getElementById("folder-input").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    try {
      const manifest = buildManifestFromFiles(files);
      state.manifest = manifest;
      state.currentRun = null;
      state.currentData = null;
      state.activeArtifactLabel = null;
      state.selection = { type: "core", id: "core" };

      document.getElementById("run-count").textContent = manifest.run_count;
      document.getElementById("import-status").textContent =
        `已导入 ${manifest.run_count} 个 run，来源文件数 ${files.length}。`;
      renderRunList();

      if (manifest.runs.length) {
        const preferredRun =
          manifest.runs.find((run) => run.files.axial_network_native && run.files.selective_native) ||
          manifest.runs[0];
        await loadRun(preferredRun.id);
      } else {
        showEmptyState("未识别到任何 run 子目录", "请重新选择 `runs` 文件夹或整个 skill 文件夹。");
      }
    } catch (error) {
      console.error(error);
      showEmptyState("导入失败", String(error));
    }
  });

  showEmptyState("等待导入 runs 文件夹", "直接打开本页后，点击左侧按钮选择本地文件夹即可开始浏览。");
  renderRunList();
  renderSidebarSummary();
}

function showEmptyState(title, subtitle) {
  document.getElementById("hero-title").textContent = title;
  document.getElementById("hero-subtitle").textContent = subtitle;
  document.getElementById("hero-metrics").innerHTML = "";
  document.getElementById("source-list").innerHTML = "";
  document.getElementById("source-detail-title").textContent = "请选择一个来源文件";
  document.getElementById("source-detail-content").innerHTML = "";
  document.getElementById("sources-column").innerHTML = "";
  document.getElementById("evidence-column").innerHTML = "";
  document.getElementById("subcategory-column").innerHTML = "";
  document.getElementById("category-column").innerHTML = "";
  document.getElementById("theory-column").innerHTML = "";
  document.getElementById("selection-panel").innerHTML = "";
  document.getElementById("framework-dimensions").innerHTML = "";
  document.getElementById("phase-list").innerHTML = "";
  document.getElementById("loop-list").innerHTML = "";
  document.getElementById("pathway-list").innerHTML = "";
  document.getElementById("artifact-list").innerHTML = "";
  document.getElementById("artifact-title").textContent = "请选择一个文件";
  document.getElementById("artifact-content").textContent = "";
}

function buildManifestFromFiles(files) {
  const runBuckets = new Map();

  files.forEach((file) => {
    const relativePath = file.webkitRelativePath || file.name;
    const normalized = relativePath.replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);

    const runsIndex = parts.indexOf("runs");
    if (runsIndex >= 0 && parts[runsIndex + 1]) {
      const runId = parts[runsIndex + 1];
      const artifactPath = parts.slice(runsIndex + 2).join("/");
      pushRunFile(runBuckets, runId, artifactPath, file);
      return;
    }

    const directRunIndex = parts.findIndex((part) => /^run-\d{4}-\d{2}-\d{2}-\d+/.test(part));
    if (directRunIndex >= 0) {
      const runId = parts[directRunIndex];
      const artifactPath = parts.slice(directRunIndex + 1).join("/");
      pushRunFile(runBuckets, runId, artifactPath, file);
    }
  });

  const runs = Array.from(runBuckets.values()).sort((a, b) => b.id.localeCompare(a.id));
  runs.forEach((run) => {
    run.artifacts.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
    run.files = selectKnownFiles(run.artifacts);
  });

  return {
    run_count: runs.length,
    runs,
  };
}

function pushRunFile(runBuckets, runId, artifactPath, file) {
  if (!artifactPath) {
    return;
  }

  if (!runBuckets.has(runId)) {
    runBuckets.set(runId, {
      id: runId,
      label: runId,
      path: runId,
      artifacts: [],
      files: {},
    });
  }

  runBuckets.get(runId).artifacts.push({
    label: artifactPath,
    kind: classifyKind(artifactPath),
    file,
  });
}

function classifyKind(path) {
  if (path.endsWith(".json")) {
    return "json";
  }
  if (path.endsWith(".txt") || path.endsWith(".md") || path.endsWith(".log")) {
    return "text";
  }
  return "binary";
}

function selectKnownFiles(artifacts) {
  const byLabel = new Map(artifacts.map((artifact) => [artifact.label, artifact.file]));
  const files = {};

  Object.entries(KNOWN_FILE_CANDIDATES).forEach(([key, candidates]) => {
    for (const candidate of candidates) {
      if (byLabel.has(candidate)) {
        files[key] = byLabel.get(candidate);
        break;
      }
    }
  });

  return files;
}

async function loadRun(runId) {
  const run = state.manifest?.runs.find((entry) => entry.id === runId);
  if (!run) {
    return;
  }

  state.currentRun = run;
  state.selection = { type: "core", id: "core" };
  renderRunList();

  const data = await loadRunArtifacts(run);
  state.currentData = data;
  state.activeArtifactLabel = run.files.final_report
    ? findArtifactLabel(run, run.files.final_report)
    : run.artifacts?.[0]?.label || null;

  renderHero();
  renderSidebarSummary();
  renderSourceAtlas();
  renderCodingLadder();
  renderSelectionPanel();
  renderTheoryPanels();
  renderArtifactBrowser();
}

async function loadRunArtifacts(run) {
  const knownEntries = await Promise.all(
    Object.entries(run.files || {}).map(async ([key, file]) => [key, await readArtifact(file)])
  );
  const fileData = Object.fromEntries(knownEntries);

  const progressReport = typeof fileData.progress_report === "string" ? fileData.progress_report : "";
  const finalReport = typeof fileData.final_report === "string" ? fileData.final_report : "";
  const sourceManifest = isRecord(fileData.source_manifest) ? fileData.source_manifest : {};
  const slices = Array.isArray(fileData.slices) ? fileData.slices : [];
  const extractedCodes = isRecord(fileData.extracted_codes) ? fileData.extracted_codes : {};
  const openSummary = isRecord(fileData.open_codes_summary) ? fileData.open_codes_summary : {};
  const axial = isRecord(fileData.axial_network_native) ? fileData.axial_network_native : {};
  const selective = isRecord(fileData.selective_native) ? fileData.selective_native : {};
  const memo = isRecord(fileData.memo_aggregation) ? fileData.memo_aggregation : {};

  const progressIndex = parseProgressReport(progressReport);
  const sourceDocArtifacts = (run.artifacts || []).filter(
    (artifact) => artifact.label.startsWith("source/") && /\.(docx|txt)$/i.test(artifact.label)
  );

  if (isThematicRunShape({ axial, selective, extractedCodes, openSummary })) {
    const thematic = buildThematicCodingObjects({
      run,
      sourceManifest,
      openSummary,
      axial,
      selective,
      memo,
      slices,
      extractedCodes,
      sourceDocArtifacts,
    });

    return {
      run,
      files: run.files,
      artifacts: run.artifacts,
      progressReport,
      finalReport,
      sourceManifest,
      slices,
      extractedCodes,
      openSummary,
      axial,
      selective,
      memo,
      progressIndex,
      ...thematic,
    };
  }

  const sources = buildSourceEntries(openSummary, sourceDocArtifacts, progressIndex);
  const sourceMap = new Map(sources.map((source) => [source.id, source]));

  const evidenceItems = [];
  const evidenceMap = new Map();
  const subcategoryEntries = [];
  const subcategoryMap = new Map();
  const categoryEntries = [];
  const categoryMap = new Map();
  const relations = Array.isArray(axial.category_relationships) ? axial.category_relationships : [];

  (axial.axial_categories || []).forEach((category) => {
    const dimensionId = normalizeDimensionId(category.dimension);
    const categoryEntry = {
      id: category.id,
      name: category.name || category.id,
      dimensionId,
      description: category.description || "",
      subcategoryIds: [],
      evidenceIds: [],
      sourceIds: [],
      relations: relations.filter((relation) => relation.source === category.id || relation.target === category.id),
    };

    const categorySourceIds = new Set();

    (category.sub_categories || []).forEach((subCategory, subIndex) => {
      const subId = subCategory.id || `${category.id}-sub-${subIndex + 1}`;
      const subEntry = {
        id: subId,
        name: subCategory.name || subId,
        categoryId: category.id,
        dimensionId,
        phenomenon: subCategory.paradigm?.phenomenon || "",
        paradigm: subCategory.paradigm || {},
        evidenceIds: [],
        sourceIds: [],
      };

      const subSourceIds = new Set();

      (subCategory.source_codes || []).forEach((rawEvidence, evidenceIndex) => {
        const parsed = parseEvidence(rawEvidence);
        const sourceId = matchSourceId(parsed.citation || rawEvidence, sources);
        const evidenceId = `${subId}::${String(evidenceIndex + 1).padStart(3, "0")}`;
        const evidence = {
          id: evidenceId,
          raw: rawEvidence,
          excerpt: parsed.excerpt,
          citation: parsed.citation,
          sourceId,
          subcategoryId: subId,
          categoryId: category.id,
          dimensionId,
        };

        evidenceItems.push(evidence);
        evidenceMap.set(evidenceId, evidence);
        subEntry.evidenceIds.push(evidenceId);
        categoryEntry.evidenceIds.push(evidenceId);

        if (sourceId && sourceMap.has(sourceId)) {
          subSourceIds.add(sourceId);
          categorySourceIds.add(sourceId);
          const source = sourceMap.get(sourceId);
          source.evidenceIds.add(evidenceId);
          source.subcategoryIds.add(subId);
          source.categoryIds.add(category.id);
          source.dimensionIds.add(dimensionId);
        }
      });

      subEntry.sourceIds = Array.from(subSourceIds).sort(compareNatural);
      subcategoryEntries.push(subEntry);
      subcategoryMap.set(subId, subEntry);
      categoryEntry.subcategoryIds.push(subId);
    });

    categoryEntry.sourceIds = Array.from(categorySourceIds).sort(compareNatural);
    categoryEntries.push(categoryEntry);
    categoryMap.set(category.id, categoryEntry);
  });

  const dimensions = buildDimensionEntries(selective, axial, categoryEntries, sourceMap, subcategoryMap, evidenceMap);
  const dimensionMap = new Map(dimensions.map((dimension) => [dimension.id, dimension]));

  const phases = buildPhaseEntries(selective);
  const phaseMap = new Map(phases.map((phase) => [phase.id, phase]));

  const loops = buildLoopEntries(selective, categoryMap);
  const loopMap = new Map(loops.map((loop) => [loop.id, loop]));

  const pathways = buildPathwayEntries(selective, sources);
  const pathwayMap = new Map(pathways.map((pathway) => [pathway.id, pathway]));

  const core = buildCoreEntry(selective, dimensions, phases, loops, pathways);

  sources.forEach((source) => {
    source.evidenceIds = Array.from(source.evidenceIds).sort(compareNatural);
    source.subcategoryIds = Array.from(source.subcategoryIds).sort(compareNatural);
    source.categoryIds = Array.from(source.categoryIds).sort(compareNatural);
    source.dimensionIds = Array.from(source.dimensionIds).sort(orderDimensionIds);
    source.pathwayIds = Array.from(source.pathwayIds).sort(compareNatural);
  });

  evidenceItems.sort((a, b) => {
    const sourceA = a.sourceId ? sourceMap.get(a.sourceId)?.sequence ?? 999 : 999;
    const sourceB = b.sourceId ? sourceMap.get(b.sourceId)?.sequence ?? 999 : 999;
    if (sourceA !== sourceB) {
      return sourceA - sourceB;
    }
    return a.id.localeCompare(b.id, "zh-Hans-CN");
  });

  subcategoryEntries.sort((a, b) => a.id.localeCompare(b.id, "zh-Hans-CN"));
  categoryEntries.sort((a, b) => a.id.localeCompare(b.id, "zh-Hans-CN"));
  sources.sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.label.localeCompare(b.label, "zh-Hans-CN");
  });

  return {
    run,
    files: run.files,
    artifacts: run.artifacts,
    progressReport,
    finalReport,
    sourceManifest,
    slices,
    extractedCodes,
    openSummary,
    axial,
    selective,
    memo,
    progressIndex,
    sources,
    sourceMap,
    evidenceItems,
    evidenceMap,
    subcategoryEntries,
    subcategoryMap,
    categoryEntries,
    categoryMap,
    dimensions,
    dimensionMap,
    phases,
    phaseMap,
    loops,
    loopMap,
    pathways,
    pathwayMap,
    core,
    relations,
  };
}

function isThematicRunShape({ axial, selective, extractedCodes, openSummary }) {
  return (
    isRecord(axial?.thematic_groups) &&
    Array.isArray(extractedCodes?.codes) &&
    Array.isArray(openSummary?.evidence) &&
    isRecord(selective)
  );
}

function buildThematicCodingObjects({
  run,
  sourceManifest,
  openSummary,
  axial,
  selective,
  memo,
  slices,
  extractedCodes,
  sourceDocArtifacts,
}) {
  const sources = buildSourceEntriesFromManifest(sourceManifest, sourceDocArtifacts, openSummary);
  const sourceMap = new Map(sources.map((source) => [source.id, source]));

  const codeEntries = Array.isArray(extractedCodes.codes) ? extractedCodes.codes : [];
  const codeMap = new Map(codeEntries.map((entry) => [entry.code_id, entry]));
  const rawSliceEvidence = Array.isArray(openSummary.evidence) ? openSummary.evidence : [];
  const sliceIndex = buildSliceEvidenceIndex(rawSliceEvidence);

  const evidenceItems = [];
  const evidenceMap = new Map();
  const subcategoryEntries = [];
  const subcategoryMap = new Map();
  const categoryEntries = [];
  const categoryMap = new Map();
  const relations = buildThematicRelations(selective);

  Object.entries(axial.thematic_groups || {}).forEach(([groupKey, group]) => {
    const dimensionId = normalizeDimensionId(groupKey);
    const categorySourceIds = new Set();

    (group.themes || []).forEach((theme) => {
      const categoryEntry = {
        id: theme.theme_id,
        name: theme.name || theme.theme_id,
        dimensionId,
        description: theme.description || group.group_description || "",
        subcategoryIds: [],
        evidenceIds: [],
        sourceIds: [],
        relations: relations.filter(
          (relation) => relation.source === theme.theme_id || relation.target === theme.theme_id
        ),
      };

      const subthemes = Array.isArray(theme.sub_themes) && theme.sub_themes.length
        ? theme.sub_themes
        : [{ id: `${theme.theme_id}.0`, name: `${theme.name || theme.theme_id} 证据簇` }];

      const subEntryMap = new Map();
      const subSourceMap = new Map();
      const themeEvidenceIds = [];

      (theme.evidence_refs || []).forEach((ref, evidenceIndex) => {
        const codeEntry = codeMap.get(ref.code_id);
        const matchedSlice = matchSliceEvidenceRef(ref, codeEntry, sliceIndex);
        const sourceId = ref.source_file_id || codeEntry?.source_file_id || matchedSlice?.source_file_id || "";
        const primaryRawTheme =
          pickPrimaryRawTheme(matchedSlice?.raw_themes || matchedSlice?.codes || [], dimensionId) ||
          subthemes[0]?.name ||
          theme.name ||
          theme.theme_id;
        const subcategoryId = `${theme.theme_id}::${primaryRawTheme}`;

        if (!subEntryMap.has(subcategoryId)) {
          const subEntry = {
            id: subcategoryId,
            name: primaryRawTheme,
            categoryId: theme.theme_id,
            dimensionId,
            phenomenon: group.group_description || theme.description || "",
            paradigm: {
              theme_id: theme.theme_id,
              theme_name: theme.name || theme.theme_id,
              declared_subthemes: subthemes.map((item) => item.name || item.id).filter(Boolean),
              evidence_strategy: "thematic_analysis_primary_raw_theme",
            },
            evidenceIds: [],
            sourceIds: [],
          };
          subEntryMap.set(subcategoryId, subEntry);
          subSourceMap.set(subcategoryId, new Set());
          subcategoryEntries.push(subEntry);
          subcategoryMap.set(subcategoryId, subEntry);
          categoryEntry.subcategoryIds.push(subcategoryId);
        }
        const evidenceId = `${theme.theme_id}::${ref.code_id || String(evidenceIndex + 1).padStart(3, "0")}`;
        const citationParts = [ref.source_file_id || "", ref.code_id || ""].filter(Boolean);

        const evidence = {
          id: evidenceId,
          raw: buildThematicEvidenceRaw(ref, codeEntry, matchedSlice),
          excerpt: ref.evidence || codeEntry?.evidence || matchedSlice?.quote_excerpt || "无摘录",
          citation: citationParts.join(" / "),
          sourceId: sourceId || null,
          subcategoryId,
          categoryId: theme.theme_id,
          dimensionId,
        };

        evidenceItems.push(evidence);
        evidenceMap.set(evidenceId, evidence);
        themeEvidenceIds.push(evidenceId);
        categoryEntry.evidenceIds.push(evidenceId);

        if (subcategoryId && subEntryMap.has(subcategoryId)) {
          const subEntry = subEntryMap.get(subcategoryId);
          subEntry.evidenceIds.push(evidenceId);
          if (sourceId) {
            subSourceMap.get(subcategoryId)?.add(sourceId);
          }
        }

        if (sourceId && sourceMap.has(sourceId)) {
          categorySourceIds.add(sourceId);
          const source = sourceMap.get(sourceId);
          source.evidenceIds.add(evidenceId);
          source.categoryIds.add(theme.theme_id);
          source.dimensionIds.add(dimensionId);
          if (subcategoryId) {
            source.subcategoryIds.add(subcategoryId);
          }
        }
      });

      subEntryMap.forEach((subEntry, subId) => {
        subEntry.sourceIds = Array.from(subSourceMap.get(subId) || []).sort(compareNatural);
      });

      categoryEntry.evidenceIds = themeEvidenceIds;
      categoryEntry.sourceIds = Array.from(categorySourceIds).sort(compareNatural);
      categoryEntries.push(categoryEntry);
      categoryMap.set(categoryEntry.id, categoryEntry);
    });
  });

  sources.forEach((source) => {
    source.evidenceIds = Array.from(source.evidenceIds).sort(compareNatural);
    source.subcategoryIds = Array.from(source.subcategoryIds).sort(compareNatural);
    source.categoryIds = Array.from(source.categoryIds).sort(compareNatural);
    source.dimensionIds = Array.from(source.dimensionIds).sort(orderDimensionIds);
    source.pathwayIds = Array.from(source.pathwayIds).sort(compareNatural);
  });

  subcategoryEntries.forEach((entry) => {
    entry.evidenceIds.sort(compareNatural);
    entry.sourceIds.sort(compareNatural);
  });

  evidenceItems.sort((a, b) => {
    const sourceA = a.sourceId ? sourceMap.get(a.sourceId)?.sequence ?? 999 : 999;
    const sourceB = b.sourceId ? sourceMap.get(b.sourceId)?.sequence ?? 999 : 999;
    if (sourceA !== sourceB) {
      return sourceA - sourceB;
    }
    return a.id.localeCompare(b.id, "zh-Hans-CN");
  });

  subcategoryEntries.sort((a, b) => a.id.localeCompare(b.id, "zh-Hans-CN"));
  categoryEntries.sort((a, b) => a.id.localeCompare(b.id, "zh-Hans-CN"));
  sources.sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.label.localeCompare(b.label, "zh-Hans-CN");
  });

  const dimensions = buildThematicDimensionEntries(sourceManifest, axial, categoryEntries, sourceMap, evidenceMap);
  const dimensionMap = new Map(dimensions.map((dimension) => [dimension.id, dimension]));
  const phases = buildThematicPhaseEntries(selective);
  const phaseMap = new Map(phases.map((phase) => [phase.id, phase]));
  const loops = buildThematicLoopEntries(selective, categoryMap);
  const loopMap = new Map(loops.map((loop) => [loop.id, loop]));
  const pathways = buildThematicPathwayEntries(memo, sources);
  const pathwayMap = new Map(pathways.map((pathway) => [pathway.id, pathway]));
  const core = buildThematicCoreEntry(selective, memo, dimensions, phases, loops, pathways, run, sourceManifest);

  return {
    sources,
    sourceMap,
    evidenceItems,
    evidenceMap,
    subcategoryEntries,
    subcategoryMap,
    categoryEntries,
    categoryMap,
    dimensions,
    dimensionMap,
    phases,
    phaseMap,
    loops,
    loopMap,
    pathways,
    pathwayMap,
    core,
    relations,
  };
}

function renderRunList() {
  const root = document.getElementById("run-list");
  root.innerHTML = "";

  (state.manifest?.runs || []).forEach((run) => {
    const button = document.createElement("button");
    button.className = `run-item${state.currentRun?.id === run.id ? " active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(run.label)}</strong>
      <small>${escapeHtml(run.artifacts.length)} 个产物文件</small>
    `;
    button.addEventListener("click", () => loadRun(run.id));
    root.appendChild(button);
  });
}

function renderHero() {
  const data = state.currentData;
  document.getElementById("hero-title").textContent =
    data.selective.metadata?.research_topic ||
    data.sourceManifest?.research_topic ||
    data.axial.metadata?.research_topic ||
    data.run.label;
  document.getElementById("hero-subtitle").textContent =
    data.selective.integrated_model?.description ||
    data.selective.core_themes?.summary ||
    data.memo?.cross_dimension_integration ||
    data.selective.theoretical_storyline?.summary ||
    "当前 run 已加载，可浏览来源案例、证据摘录、轴心范畴与理论层对象。";

  const metrics = [
    ["来源文件", data.sources.length],
    ["证据摘录", data.evidenceItems.length],
    ["子类属", data.subcategoryEntries.length],
    ["轴心范畴", data.categoryEntries.length],
    ["理论阶段", data.phases.length],
    ["替代路径", data.pathways.length],
  ];

  document.getElementById("hero-metrics").innerHTML = metrics
    .map(
      ([label, value]) => `
        <div class="metric-card">
          <span class="metric-label">${escapeHtml(label)}</span>
          <span class="metric-value">${escapeHtml(String(value))}</span>
        </div>
      `
    )
    .join("");
}

function renderSidebarSummary() {
  const root = document.getElementById("node-summary");
  const data = state.currentData;
  if (!data) {
    root.innerHTML = `
      <div class="node-card">
        <strong>等待导入</strong>
        <small>加载新版 run 后显示原生对象统计</small>
      </div>
    `;
    return;
  }

  const summaryItems = [
    ["来源案例", `${data.sources.length} 份`],
    ["证据摘录", `${data.evidenceItems.length} 条`],
    ["子类属", `${data.subcategoryEntries.length} 个`],
    ["轴心范畴", `${data.categoryEntries.length} 个`],
    ["反馈回路", `${data.loops.length} 条`],
    ["替代路径", `${data.pathways.length} 条`],
  ];

  root.innerHTML = summaryItems
    .map(
      ([label, value]) => `
        <div class="node-card">
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(value)}</small>
        </div>
      `
    )
    .join("");
}

function renderSourceAtlas() {
  const data = state.currentData;
  const links = buildActiveLinks();
  const sourceList = document.getElementById("source-list");

  sourceList.innerHTML = data.sources
    .map((source) =>
      sourceCard({
        source,
        className: cardStateClass(`source:${source.id}`, links),
      })
    )
    .join("");

  bindSelectableCards(".source-card");

  const focusedSource = resolveFocusedSource(data);
  const title = document.getElementById("source-detail-title");
  const content = document.getElementById("source-detail-content");

  if (!focusedSource) {
    title.textContent = "请选择一个来源文件";
    content.innerHTML = "";
    return;
  }

  title.textContent = focusedSource.label;
  content.innerHTML = `
    <div class="detail-card">
      <h5>基本信息</h5>
      <div class="meta-row">
        ${pill(`开放编码文件：${focusedSource.openCodingFile}`)}
        ${focusedSource.docxFile ? pill(`原始文件：${focusedSource.docxFile}`) : ""}
        ${focusedSource.group ? pill(`分组：${focusedSource.group}`) : ""}
        ${focusedSource.year ? pill(`年级：${focusedSource.year}`) : ""}
        ${focusedSource.status ? pill(`状态：${focusedSource.status}`) : ""}
        ${focusedSource.lineCount ? pill(`行数：${focusedSource.lineCount}`) : ""}
      </div>
    </div>
    <div class="detail-card">
      <h5>进入理论链路</h5>
      <div class="meta-row">
        ${interactivePills(focusedSource.subcategoryIds, "subcategory", data.subcategoryMap)}
      </div>
      <div class="meta-row">
        ${interactivePills(focusedSource.categoryIds, "category", data.categoryMap)}
      </div>
      <div class="meta-row">
        ${interactiveTheoryPills(focusedSource.dimensionIds)}
      </div>
    </div>
    <div class="detail-card scroll-card">
      <h5>相关证据摘录 (${focusedSource.evidenceIds.length})</h5>
      ${evidenceListMarkup(focusedSource.evidenceIds.map((id) => data.evidenceMap.get(id)).filter(Boolean))}
    </div>
    <div class="detail-card">
      <h5>路径关联</h5>
      ${focusedSource.pathwayIds.length ? interactivePills(focusedSource.pathwayIds, "pathway", data.pathwayMap) : "<p>暂无直接匹配的代表性路径。</p>"}
    </div>
  `;

  bindSelectionTargets(content);
}

function sourceCard({ source, className }) {
  return `
    <button class="source-card${className}" data-type="source" data-id="${escapeHtml(source.id)}">
      <span class="item-title">${escapeHtml(source.label)}</span>
      <span class="item-meta">
        ${source.group ? `<span class="meta-chip">${escapeHtml(source.group)}</span>` : ""}
        ${source.year ? `<span class="meta-chip">${escapeHtml(source.year)}</span>` : ""}
        ${source.status ? `<span class="meta-chip">${escapeHtml(source.status)}</span>` : ""}
        ${source.lineCount ? `<span class="meta-chip">${escapeHtml(String(source.lineCount))} 行</span>` : ""}
      </span>
      <span class="item-copy">${escapeHtml(
        `${source.evidenceIds.length} 条证据 / ${source.subcategoryIds.length} 个子类属 / ${source.categoryIds.length} 个轴心范畴`
      )}</span>
    </button>
  `;
}

function renderCodingLadder() {
  const data = state.currentData;
  const links = buildActiveLinks();

  document.getElementById("sources-column").innerHTML = data.sources
    .map((source) =>
      ladderItem({
        key: `source:${source.id}`,
        title: source.label,
        copy: source.openCodingFile,
        meta: [source.group, source.year, source.status].filter(Boolean),
        type: "source",
        id: source.id,
        links,
      })
    )
    .join("");

  document.getElementById("evidence-column").innerHTML = data.evidenceItems
    .map((evidence) =>
      ladderItem({
        key: `evidence:${evidence.id}`,
        title: evidence.excerpt,
        copy: evidence.citation ? `[${evidence.citation}]` : "无显式引文标签",
        meta: [
          evidence.sourceId ? data.sourceMap.get(evidence.sourceId)?.label : "未匹配来源",
          evidence.subcategoryId,
        ].filter(Boolean),
        type: "evidence",
        id: evidence.id,
        links,
      })
    )
    .join("");

  document.getElementById("subcategory-column").innerHTML = data.subcategoryEntries
    .map((subcategory) =>
      ladderItem({
        key: `subcategory:${subcategory.id}`,
        title: `${subcategory.id} ${subcategory.name}`,
        copy: subcategory.phenomenon || "无现象描述",
        meta: [
          `${subcategory.evidenceIds.length} 条证据`,
          `${subcategory.sourceIds.length} 个来源`,
        ],
        type: "subcategory",
        id: subcategory.id,
        links,
      })
    )
    .join("");

  document.getElementById("category-column").innerHTML = data.categoryEntries
    .map((category) =>
      ladderItem({
        key: `category:${category.id}`,
        title: `${category.id} ${category.name}`,
        copy: category.description,
        meta: [
          `${category.subcategoryIds.length} 个子类属`,
          `${category.sourceIds.length} 个来源`,
          `${category.dimensionId} 维度`,
        ],
        type: "category",
        id: category.id,
        links,
      })
    )
    .join("");

  const theoryNodes = [
    {
      type: "core",
      id: "core",
      key: "theory:core",
      title: data.core.name || "核心范畴",
      copy: data.core.description || "",
      meta: ["核心范畴"],
    },
    ...data.dimensions.map((dimension) => ({
      type: "dimension",
      id: dimension.id,
      key: `theory:${dimension.id}`,
      title: `${dimension.id} ${dimension.name}`,
      copy: dimension.definition,
      meta: [
        `${dimension.categoryIds.length} 个轴心范畴`,
        `${dimension.sourceIds.length} 个来源`,
      ],
    })),
  ];

  document.getElementById("theory-column").innerHTML = theoryNodes
    .map((node) =>
      ladderItem({
        key: node.key,
        title: node.title,
        copy: node.copy,
        meta: node.meta,
        type: node.type,
        id: node.id,
        links,
      })
    )
    .join("");

  bindSelectableCards(".hierarchy-item");
}

function ladderItem({ key, title, copy, meta, type, id, links }) {
  return `
    <button class="hierarchy-item${cardStateClass(key, links)}" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}">
      <span class="item-title">${escapeHtml(title)}</span>
      ${copy ? `<span class="item-copy">${escapeHtml(copy)}</span>` : ""}
      <span class="item-meta">
        ${(meta || [])
          .map((item) => `<span class="meta-chip">${escapeHtml(String(item))}</span>`)
          .join("")}
      </span>
    </button>
  `;
}

function renderSelectionPanel() {
  const data = state.currentData;
  const panel = document.getElementById("selection-panel");
  const selection = state.selection || { type: "core", id: "core" };

  let title = data.core.name || "核心范畴";
  let body =
    data.selective.theoretical_storyline?.detailed_narrative ||
    data.memo?.cross_dimension_integration ||
    data.core.description ||
    "";
  let rightColumn = [
    detailCard("促进条件", listMarkup(data.core.facilitating)),
    detailCard("限制条件", listMarkup(data.core.constraining)),
    detailCard("后果", objectMarkup(data.core.consequences)),
  ];

  if (selection.type === "source") {
    const source = data.sourceMap.get(selection.id);
    title = `来源案例：${source.label}`;
    body = [
      `开放编码文件：${source.openCodingFile}`,
      source.docxFile ? `原始文件：${source.docxFile}` : "原始文件：未匹配",
      source.group ? `分组：${source.group}` : null,
      source.year ? `年级：${source.year}` : null,
      source.status ? `状态：${source.status}` : null,
      source.lineCount ? `开放编码行数：${source.lineCount}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    rightColumn = [
      detailCard("证据摘录", evidenceListMarkup(source.evidenceIds.map((id) => data.evidenceMap.get(id)).filter(Boolean))),
      detailCard("进入的子类属", interactivePills(source.subcategoryIds, "subcategory", data.subcategoryMap)),
      detailCard("进入的轴心范畴", interactivePills(source.categoryIds, "category", data.categoryMap)),
      detailCard("进入的理论维度", interactiveTheoryPills(source.dimensionIds)),
    ];
  } else if (selection.type === "evidence") {
    const evidence = data.evidenceMap.get(selection.id);
    title = "证据摘录";
    body = evidence.raw;
    rightColumn = [
      detailCard(
        "来源案例",
        evidence.sourceId ? interactivePills([evidence.sourceId], "source", data.sourceMap) : "<p>未匹配来源。</p>"
      ),
      detailCard("子类属", interactivePills([evidence.subcategoryId], "subcategory", data.subcategoryMap)),
      detailCard("轴心范畴", interactivePills([evidence.categoryId], "category", data.categoryMap)),
      detailCard("理论维度", interactiveTheoryPills([evidence.dimensionId])),
    ];
  } else if (selection.type === "subcategory") {
    const subcategory = data.subcategoryMap.get(selection.id);
    title = `${subcategory.id} ${subcategory.name}`;
    body = [
      `现象：${subcategory.phenomenon || "无"}`,
      formatParadigm(subcategory.paradigm),
    ]
      .filter(Boolean)
      .join("\n\n");

    rightColumn = [
      detailCard("所属轴心范畴", interactivePills([subcategory.categoryId], "category", data.categoryMap)),
      detailCard("来源案例", interactivePills(subcategory.sourceIds, "source", data.sourceMap)),
      detailCard(
        "证据摘录",
        evidenceListMarkup(subcategory.evidenceIds.map((id) => data.evidenceMap.get(id)).filter(Boolean))
      ),
    ];
  } else if (selection.type === "category") {
    const category = data.categoryMap.get(selection.id);
    title = `${category.id} ${category.name}`;
    body = category.description || "无额外说明";
    rightColumn = [
      detailCard("子类属", interactivePills(category.subcategoryIds, "subcategory", data.subcategoryMap)),
      detailCard("来源案例", interactivePills(category.sourceIds, "source", data.sourceMap)),
      detailCard("理论维度", interactiveTheoryPills([category.dimensionId])),
      detailCard("跨范畴关系", relationMarkup(category.relations)),
    ];
  } else if (selection.type === "dimension") {
    const dimension = data.dimensionMap.get(selection.id);
    title = `${dimension.id} ${dimension.name}`;
    body = dimension.definition || "无额外定义。";
    rightColumn = [
      detailCard("轴心范畴", interactivePills(dimension.categoryIds, "category", data.categoryMap)),
      detailCard("来源案例", interactivePills(dimension.sourceIds, "source", data.sourceMap)),
      detailCard("阶段叙述", phaseDimensionMarkup(data.phases, dimension.id)),
    ];
  } else if (selection.type === "phase") {
    const phase = data.phaseMap.get(selection.id);
    title = phase.name;
    body = [
      `时间范围：${phase.timeframe || "无"}`,
      `L：${phase.L || "无"}`,
      `I：${phase.I || "无"}`,
      `V：${phase.V || "无"}`,
    ].join("\n");
    rightColumn = [
      detailCard("关键事件", listMarkup(phase.keyEvents)),
      detailCard("典型学生", listMarkup(phase.typicalStudents)),
      detailCard("相关维度", interactiveTheoryPills(["L", "I", "V"])),
    ];
  } else if (selection.type === "loop") {
    const loop = data.loopMap.get(selection.id);
    title = loop.name;
    body = loop.description || "";
    rightColumn = [
      detailCard("方向", `<p>${escapeHtml(loop.direction || "未标注")}</p>`),
      detailCard("涉及范畴", interactivePills(loop.categoryIds, "category", data.categoryMap)),
      detailCard("涉及维度", interactiveTheoryPills(loop.dimensionIds)),
    ];
  } else if (selection.type === "pathway") {
    const pathway = data.pathwayMap.get(selection.id);
    title = pathway.name;
    body = pathway.description || "";
    rightColumn = [
      detailCard("指标", listMarkup(pathway.indicators)),
      detailCard("代表性案例", listMarkup(pathway.representativeCases)),
      detailCard("匹配来源", interactivePills(pathway.sourceIds, "source", data.sourceMap)),
    ];
  }

  panel.innerHTML = `
    <div class="selection-grid">
      <div>
        <h4>${escapeHtml(title)}</h4>
        <p class="selection-copy">${escapeHtml(body)}</p>
      </div>
      <div class="detail-stack">
        ${rightColumn.join("")}
      </div>
    </div>
  `;

  bindSelectionTargets(panel);
}

function detailCard(title, content) {
  return `
    <div class="detail-card">
      <h5>${escapeHtml(title)}</h5>
      ${content}
    </div>
  `;
}

function renderTheoryPanels() {
  const data = state.currentData;
  const links = buildActiveLinks();

  document.getElementById("framework-dimensions").innerHTML = data.dimensions
    .map(
      (dimension) => `
        <button class="dimension-item${cardStateClass(`theory:${dimension.id}`, links)}" data-type="dimension" data-id="${escapeHtml(
          dimension.id
        )}">
          <h5>${escapeHtml(`${dimension.id} ${dimension.name}`)}</h5>
          <p>${escapeHtml(dimension.definition || "")}</p>
        </button>
      `
    )
    .join("");

  document.getElementById("phase-list").innerHTML = data.phases
    .map(
      (phase) => `
        <button class="dimension-item${selectionClass("phase", phase.id)}" data-type="phase" data-id="${escapeHtml(
          phase.id
        )}">
          <h5>${escapeHtml(phase.name)}</h5>
          <p>${escapeHtml(phase.timeframe || "")}</p>
        </button>
      `
    )
    .join("");

  document.getElementById("loop-list").innerHTML = data.loops
    .map(
      (loop) => `
        <button class="relation-item${selectionClass("loop", loop.id)}" data-type="loop" data-id="${escapeHtml(loop.id)}">
          <h5>${escapeHtml(loop.name)}</h5>
          <p>${escapeHtml(loop.description || "")}</p>
        </button>
      `
    )
    .join("");

  document.getElementById("pathway-list").innerHTML = data.pathways
    .map(
      (pathway) => `
        <button class="memo-item${selectionClass("pathway", pathway.id)}" data-type="pathway" data-id="${escapeHtml(
          pathway.id
        )}">
          <h5>${escapeHtml(pathway.name)}</h5>
          <p>${escapeHtml(pathway.description || "")}</p>
        </button>
      `
    )
    .join("");

  bindSelectableCards(".dimension-item");
  bindSelectableCards(".relation-item");
  bindSelectableCards(".memo-item");
}

function renderArtifactBrowser() {
  const run = state.currentRun;
  const listRoot = document.getElementById("artifact-list");
  const titleRoot = document.getElementById("artifact-title");
  const contentRoot = document.getElementById("artifact-content");

  listRoot.innerHTML = (run.artifacts || [])
    .map((artifact) => {
      const isActive = artifact.label === state.activeArtifactLabel;
      return `
        <button class="artifact-item${isActive ? " active" : ""}" data-label="${escapeHtml(artifact.label)}">
          <strong>${escapeHtml(artifact.label)}</strong>
          <small>${escapeHtml(artifact.kind)}</small>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".artifact-item").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeArtifactLabel = button.dataset.label;
      renderArtifactBrowser();
      const artifact = run.artifacts.find((item) => item.label === button.dataset.label);
      const payload = await readArtifact(artifact.file);
      titleRoot.textContent = artifact.label;
      contentRoot.textContent =
        typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    });
  });

  const defaultArtifact =
    run.artifacts.find((item) => item.label === state.activeArtifactLabel) || run.artifacts?.[0];
  if (defaultArtifact) {
    titleRoot.textContent = defaultArtifact.label;
    readArtifact(defaultArtifact.file).then((payload) => {
      contentRoot.textContent =
        typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    });
  } else {
    titleRoot.textContent = "未找到产物";
    contentRoot.textContent = "";
  }
}

function bindSelectableCards(selector) {
  document.querySelectorAll(selector).forEach((button) => {
    button.addEventListener("click", () => {
      state.selection = {
        type: button.dataset.type,
        id: button.dataset.id,
      };
      rerenderSelectionDrivenViews();
    });
  });
}

function bindSelectionTargets(root) {
  root.querySelectorAll("[data-select-type][data-select-id]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      state.selection = {
        type: element.dataset.selectType,
        id: element.dataset.selectId,
      };
      rerenderSelectionDrivenViews();
    });
  });
}

function rerenderSelectionDrivenViews() {
  renderSourceAtlas();
  renderCodingLadder();
  renderSelectionPanel();
  renderTheoryPanels();
}

function buildActiveLinks() {
  const data = state.currentData;
  const links = {
    active: new Set(),
    connected: new Set(),
    faded: new Set(),
  };

  if (!data || !state.selection) {
    return links;
  }

  const context = selectionContext(data, state.selection);

  context.active.forEach((key) => links.active.add(key));
  context.connected.forEach((key) => links.connected.add(key));

  const allKeys = [
    ...data.sources.map((source) => `source:${source.id}`),
    ...data.evidenceItems.map((evidence) => `evidence:${evidence.id}`),
    ...data.subcategoryEntries.map((subcategory) => `subcategory:${subcategory.id}`),
    ...data.categoryEntries.map((category) => `category:${category.id}`),
    "theory:core",
    ...data.dimensions.map((dimension) => `theory:${dimension.id}`),
  ];

  if (links.active.size || links.connected.size) {
    allKeys.forEach((key) => {
      if (!links.active.has(key) && !links.connected.has(key)) {
        links.faded.add(key);
      }
    });
  }

  return links;
}

function selectionContext(data, selection) {
  const active = new Set();
  const connected = new Set();
  const activate = (key) => active.add(key);
  const connect = (key) => connected.add(key);
  const connectCore = () => connect("theory:core");

  if (selection.type === "core") {
    activate("theory:core");
    return { active, connected };
  }

  if (selection.type === "source") {
    const source = data.sourceMap.get(selection.id);
    if (!source) return { active, connected };
    activate(`source:${source.id}`);
    source.evidenceIds.forEach((id) => connect(`evidence:${id}`));
    source.subcategoryIds.forEach((id) => connect(`subcategory:${id}`));
    source.categoryIds.forEach((id) => connect(`category:${id}`));
    source.dimensionIds.forEach((id) => connect(`theory:${id}`));
    connectCore();
    return { active, connected };
  }

  if (selection.type === "evidence") {
    const evidence = data.evidenceMap.get(selection.id);
    if (!evidence) return { active, connected };
    activate(`evidence:${evidence.id}`);
    if (evidence.sourceId) connect(`source:${evidence.sourceId}`);
    connect(`subcategory:${evidence.subcategoryId}`);
    connect(`category:${evidence.categoryId}`);
    connect(`theory:${evidence.dimensionId}`);
    connectCore();
    return { active, connected };
  }

  if (selection.type === "subcategory") {
    const subcategory = data.subcategoryMap.get(selection.id);
    if (!subcategory) return { active, connected };
    activate(`subcategory:${subcategory.id}`);
    subcategory.evidenceIds.forEach((id) => connect(`evidence:${id}`));
    subcategory.sourceIds.forEach((id) => connect(`source:${id}`));
    connect(`category:${subcategory.categoryId}`);
    connect(`theory:${subcategory.dimensionId}`);
    connectCore();
    return { active, connected };
  }

  if (selection.type === "category") {
    const category = data.categoryMap.get(selection.id);
    if (!category) return { active, connected };
    activate(`category:${category.id}`);
    category.subcategoryIds.forEach((id) => connect(`subcategory:${id}`));
    category.evidenceIds.forEach((id) => connect(`evidence:${id}`));
    category.sourceIds.forEach((id) => connect(`source:${id}`));
    connect(`theory:${category.dimensionId}`);
    connectCore();
    return { active, connected };
  }

  if (selection.type === "dimension") {
    const dimension = data.dimensionMap.get(selection.id);
    if (!dimension) return { active, connected };
    activate(`theory:${dimension.id}`);
    dimension.categoryIds.forEach((id) => connect(`category:${id}`));
    dimension.subcategoryIds.forEach((id) => connect(`subcategory:${id}`));
    dimension.evidenceIds.forEach((id) => connect(`evidence:${id}`));
    dimension.sourceIds.forEach((id) => connect(`source:${id}`));
    connectCore();
    return { active, connected };
  }

  if (selection.type === "phase") {
    activate(`phase:${selection.id}`);
    ["L", "I", "V"].forEach((id) => connect(`theory:${id}`));
    connectCore();
    return { active, connected };
  }

  if (selection.type === "loop") {
    const loop = data.loopMap.get(selection.id);
    if (!loop) return { active, connected };
    activate(`loop:${loop.id}`);
    loop.categoryIds.forEach((id) => connect(`category:${id}`));
    loop.dimensionIds.forEach((id) => connect(`theory:${id}`));
    loop.sourceIds.forEach((id) => connect(`source:${id}`));
    connectCore();
    return { active, connected };
  }

  if (selection.type === "pathway") {
    const pathway = data.pathwayMap.get(selection.id);
    if (!pathway) return { active, connected };
    activate(`pathway:${pathway.id}`);
    pathway.sourceIds.forEach((id) => connect(`source:${id}`));
    connectCore();
    return { active, connected };
  }

  return { active, connected };
}

function resolveFocusedSource(data) {
  if (!data.sources.length) {
    return null;
  }

  if (state.selection.type === "source") {
    return data.sourceMap.get(state.selection.id) || data.sources[0];
  }

  if (state.selection.type === "evidence") {
    const evidence = data.evidenceMap.get(state.selection.id);
    return evidence?.sourceId ? data.sourceMap.get(evidence.sourceId) : data.sources[0];
  }

  if (state.selection.type === "subcategory") {
    const subcategory = data.subcategoryMap.get(state.selection.id);
    return subcategory?.sourceIds?.[0] ? data.sourceMap.get(subcategory.sourceIds[0]) : data.sources[0];
  }

  if (state.selection.type === "category") {
    const category = data.categoryMap.get(state.selection.id);
    return category?.sourceIds?.[0] ? data.sourceMap.get(category.sourceIds[0]) : data.sources[0];
  }

  if (state.selection.type === "dimension") {
    const dimension = data.dimensionMap.get(state.selection.id);
    return dimension?.sourceIds?.[0] ? data.sourceMap.get(dimension.sourceIds[0]) : data.sources[0];
  }

  if (state.selection.type === "pathway") {
    const pathway = data.pathwayMap.get(state.selection.id);
    return pathway?.sourceIds?.[0] ? data.sourceMap.get(pathway.sourceIds[0]) : data.sources[0];
  }

  return data.sources[0];
}

function buildSourceEntries(openSummary, sourceDocArtifacts, progressIndex) {
  const docxPaths = sourceDocArtifacts.map((artifact) => artifact.label);
  const sourceFiles = Array.isArray(openSummary.source_files) ? openSummary.source_files : [];

  return sourceFiles.map((openCodingFile, index) => {
    const progressMeta = progressIndex.byFile.get(openCodingFile) || {};
    const baseLabel = stripOpenCodingSuffix(openCodingFile);
    const docxFile = bestDocxMatch(baseLabel, docxPaths);
    return {
      id: baseLabel,
      sequence: Number(progressMeta.sequence || index + 1),
      label: baseLabel,
      openCodingFile,
      docxFile,
      group: progressMeta.group || inferGroup(baseLabel),
      year: progressMeta.year || inferYear(baseLabel),
      status: progressMeta.status || inferStatus(baseLabel),
      lineCount: progressMeta.lineCount || null,
      searchText: [baseLabel, openCodingFile, docxFile || ""].join(" "),
      tokens: extractSearchTokens([baseLabel, openCodingFile, docxFile || ""].join(" ")),
      evidenceIds: new Set(),
      subcategoryIds: new Set(),
      categoryIds: new Set(),
      dimensionIds: new Set(),
      pathwayIds: new Set(),
    };
  });
}

function buildSourceEntriesFromManifest(sourceManifest, sourceDocArtifacts, openSummary) {
  const docxPaths = sourceDocArtifacts.map((artifact) => artifact.label);
  const openSourceFiles = Array.isArray(openSummary.source_files) ? openSummary.source_files : [];

  return (sourceManifest.source_files || []).map((sourceFile, index) => {
    const baseLabel = sourceFile.source_file_label || sourceFile.source_file_id || `source-${index + 1}`;
    const declaredPath = sourceFile.raw_source_path ? `source/${sourceFile.raw_source_path}` : "";
    const docxFile =
      docxPaths.find((path) => path.endsWith(sourceFile.raw_source_path || "")) ||
      bestDocxMatch(declaredPath || baseLabel, docxPaths);
    const openCodingFile =
      openSourceFiles.find((filename) => stripOpenCodingSuffix(filename) === baseLabel) ||
      `${baseLabel}_开放编码.md`;

    return {
      id: sourceFile.source_file_id || baseLabel,
      sequence: index + 1,
      label: baseLabel,
      openCodingFile,
      docxFile,
      group: sourceFile.plan || inferGroup(baseLabel),
      year: sourceFile.year || inferYear(baseLabel),
      status: sourceFile.status || inferStatus(baseLabel),
      lineCount: null,
      searchText: [
        sourceFile.source_file_id || "",
        baseLabel,
        sourceFile.raw_source_path || "",
        openCodingFile,
        docxFile || "",
      ].join(" "),
      tokens: extractSearchTokens(
        [
          sourceFile.source_file_id || "",
          baseLabel,
          sourceFile.raw_source_path || "",
          openCodingFile,
          docxFile || "",
        ].join(" ")
      ),
      evidenceIds: new Set(),
      subcategoryIds: new Set(),
      categoryIds: new Set(),
      dimensionIds: new Set(),
      pathwayIds: new Set(),
    };
  });
}

function buildSliceEvidenceIndex(evidenceItems) {
  const bySource = new Map();

  evidenceItems.forEach((item) => {
    const sourceId = item.source_file_id || "";
    if (!bySource.has(sourceId)) {
      bySource.set(sourceId, []);
    }
    bySource.get(sourceId).push({
      ...item,
      normalizedQuote: normalizeEvidenceText(item.quote_excerpt || ""),
    });
  });

  return bySource;
}

function matchSliceEvidenceRef(ref, codeEntry, sliceIndex) {
  const sourceId = ref.source_file_id || codeEntry?.source_file_id || "";
  const candidates = sliceIndex.get(sourceId) || [];
  const query = normalizeEvidenceText(ref.evidence || codeEntry?.evidence || "");
  if (!query) {
    return null;
  }

  let best = null;
  let bestScore = 0;

  candidates.forEach((candidate) => {
    const quote = candidate.normalizedQuote;
    if (!quote) {
      return;
    }

    let score = 0;
    if (quote === query) {
      score += 120;
    }
    if (quote.includes(query)) {
      score += 90 - Math.min(40, quote.length - query.length);
    }
    if (query.includes(quote)) {
      score += 30;
    }

    const queryTokens = extractSearchTokens(query);
    queryTokens.forEach((token) => {
      if (quote.includes(token)) {
        score += Math.min(8, token.length + 1);
      }
    });

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return bestScore > 0 ? best : null;
}

function normalizeEvidenceText(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/[，。、“”‘’；：？！,.!?\-—_()（）【】\[\]<>《》]/g, "")
    .toLowerCase();
}

function pickPrimaryRawTheme(rawThemes, dimensionId) {
  const items = (rawThemes || []).map((item) => String(item).trim()).filter(Boolean);
  const preferred = items.find((item) => item.startsWith(`${dimensionId}_`));
  return preferred || items[0] || "";
}

function buildThematicEvidenceRaw(ref, codeEntry, matchedSlice) {
  return [
    `code_id: ${ref.code_id || codeEntry?.code_id || "未标注"}`,
    `source_file_id: ${ref.source_file_id || codeEntry?.source_file_id || matchedSlice?.source_file_id || "未标注"}`,
    `source_file_label: ${ref.source_file_label || codeEntry?.source_file_label || matchedSlice?.source_file_label || "未标注"}`,
    `evidence: ${ref.evidence || codeEntry?.evidence || "无"}`,
    matchedSlice?.slice_id ? `slice_id: ${matchedSlice.slice_id}` : "",
    matchedSlice?.quote_excerpt ? `matched_slice: ${matchedSlice.quote_excerpt}` : "",
    matchedSlice?.raw_themes?.length ? `raw_themes: ${matchedSlice.raw_themes.join("；")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildThematicRelations(selective) {
  return (selective.axial_codes?.cross_dimensions || []).map((relation, index) => ({
    id: `rel-${index + 1}`,
    source: relation.from,
    target: relation.to,
    relationship: relation.type || "",
    description: relation.description || "",
  }));
}

function buildThematicDimensionEntries(sourceManifest, axial, categoryEntries, sourceMap, evidenceMap) {
  const manifestDimensions = sourceManifest.user_framework?.dimensions || {};

  return Object.entries(axial.thematic_groups || {})
    .map(([groupKey, group]) => {
      const id = normalizeDimensionId(groupKey);
      const manifestMeta = manifestDimensions[id] || {};
      const categoryIds = categoryEntries
        .filter((entry) => entry.dimensionId === id)
        .map((entry) => entry.id);
      const evidenceIds = categoryIds.flatMap((categoryId) =>
        categoryEntries.find((entry) => entry.id === categoryId)?.evidenceIds || []
      );
      const sourceIds = Array.from(
        new Set(
          evidenceIds
            .map((evidenceId) => evidenceMap.get(evidenceId)?.sourceId)
            .filter(Boolean)
        )
      ).sort(compareNatural);

      return {
        id,
        name: manifestMeta.name || group.group_name || DIMENSION_META[id]?.name || id,
        definition:
          manifestMeta.description || group.group_description || DIMENSION_META[id]?.name || "",
        categoryIds,
        subcategoryIds: [],
        evidenceIds,
        sourceIds,
      };
    })
    .sort((a, b) => orderDimensionIds(a.id, b.id));
}

function buildThematicPhaseEntries(selective) {
  return Object.entries(selective.transition_mechanism || {})
    .map(([phaseKey, phase], index) => {
      const indicators = phase.indicators || phase.key_triggers || [];
      return {
        id: `phase-${index + 1}`,
        name: phase.name || phaseKey,
        timeframe: "",
        phaseNumber: index + 1,
        L: indicators.filter((item) => String(item).startsWith("L")).join("；"),
        I: indicators.filter((item) => String(item).startsWith("I")).join("；"),
        V: indicators.filter((item) => String(item).startsWith("V")).join("；"),
        keyEvents: phase.key_triggers || phase.indicators || [],
        typicalStudents: [],
      };
    })
    .sort((a, b) => a.phaseNumber - b.phaseNumber);
}

function buildThematicLoopEntries(selective, categoryMap) {
  return (selective.axial_codes?.cross_dimensions || []).map((loop, index) => {
    const categoryIds = [loop.from, loop.to].filter((id) => categoryMap.has(id));
    const dimensionIds = Array.from(
      new Set(categoryIds.map((id) => categoryMap.get(id)?.dimensionId).filter(Boolean))
    ).sort(orderDimensionIds);
    const sourceIds = Array.from(
      new Set(
        categoryIds.flatMap((id) => categoryMap.get(id)?.sourceIds || [])
      )
    ).sort(compareNatural);

    return {
      id: `loop-${index + 1}`,
      name: `${loop.from} → ${loop.to}`,
      description: loop.description || "",
      direction: loop.type || "",
      categoryIds,
      dimensionIds,
      sourceIds,
    };
  });
}

function buildThematicPathwayEntries(memo, sources) {
  const pathways = [];

  if (memo.transfer_vs_exit_comparison?.transfer_patterns) {
    const sourceIds = sources.filter((source) => source.status === "转段").map((source) => source.id);
    sourceIds.forEach((sourceId) => {
      const source = sources.find((entry) => entry.id === sourceId);
      if (!source) {
        return;
      }
      if (source.pathwayIds instanceof Set) {
        source.pathwayIds.add("transfer");
      } else if (Array.isArray(source.pathwayIds) && !source.pathwayIds.includes("transfer")) {
        source.pathwayIds.push("transfer");
      }
    });
    pathways.push({
      id: "transfer",
      name: "转段路径",
      description: memo.transfer_vs_exit_comparison.transfer_patterns,
      indicators: [],
      representativeCases: sourceIds.map((id) => sources.find((source) => source.id === id)?.label).filter(Boolean),
      sourceIds,
    });
  }

  if (memo.transfer_vs_exit_comparison?.exit_patterns) {
    const sourceIds = sources.filter((source) => source.status === "退出").map((source) => source.id);
    sourceIds.forEach((sourceId) => {
      const source = sources.find((entry) => entry.id === sourceId);
      if (!source) {
        return;
      }
      if (source.pathwayIds instanceof Set) {
        source.pathwayIds.add("exit");
      } else if (Array.isArray(source.pathwayIds) && !source.pathwayIds.includes("exit")) {
        source.pathwayIds.push("exit");
      }
    });
    pathways.push({
      id: "exit",
      name: "退出路径",
      description: memo.transfer_vs_exit_comparison.exit_patterns,
      indicators: [],
      representativeCases: sourceIds.map((id) => sources.find((source) => source.id === id)?.label).filter(Boolean),
      sourceIds,
    });
  }

  return pathways;
}

function buildThematicCoreEntry(selective, memo, dimensions, phases, loops, pathways, run, sourceManifest) {
  return {
    name: sourceManifest.research_topic || run.label || "主题分析综合框架",
    description:
      selective.core_themes?.summary ||
      memo.cross_dimension_integration ||
      "当前 run 使用主题分析结构，已归一化接入通用 viewer。",
    facilitating: memo.mechanisms?.facilitating_conditions
      ? splitLongTextToList(memo.mechanisms.facilitating_conditions)
      : [],
    constraining: memo.mechanisms?.constraining_conditions
      ? splitLongTextToList(memo.mechanisms.constraining_conditions)
      : [],
    consequences: {
      key_findings: Array.isArray(selective.key_findings) ? selective.key_findings.join("；") : "",
      coverage_summary: selective.coverage_report?.coverage_summary || "",
    },
    dimensionIds: dimensions.map((dimension) => dimension.id),
    phaseIds: phases.map((phase) => phase.id),
    loopIds: loops.map((loop) => loop.id),
    pathwayIds: pathways.map((pathway) => pathway.id),
  };
}

function splitLongTextToList(text) {
  return String(text || "")
    .split(/\d+\)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDimensionEntries(selective, axial, categoryEntries, sourceMap, subcategoryMap, evidenceMap) {
  const rawFramework =
    selective.metadata?.theoretical_framework || axial.metadata?.theoretical_framework || {};

  const dimensionSeed = new Map();
  Object.entries(rawFramework).forEach(([rawId, description]) => {
    const id = normalizeDimensionId(rawId);
    const [name, definition] = splitFrameworkDescription(description, id);
    dimensionSeed.set(id, { id, name, definition });
  });

  if (categoryEntries.some((entry) => entry.dimensionId === "C") && !dimensionSeed.has("C")) {
    dimensionSeed.set("C", {
      id: "C",
      name: DIMENSION_META.C.name,
      definition: "制度、关系与情绪等情境条件对转化过程的促进与约束。",
    });
  }

  return Array.from(dimensionSeed.values())
    .map((dimension) => {
      const categoryIds = categoryEntries
        .filter((entry) => entry.dimensionId === dimension.id)
        .map((entry) => entry.id);
      const subcategoryIds = categoryIds.flatMap((id) => dataArray(subcategoryMap, "categoryId", id).map((item) => item.id));
      const evidenceIds = subcategoryIds.flatMap((id) => subcategoryMap.get(id)?.evidenceIds || []);
      const sourceIds = Array.from(
        new Set(
          evidenceIds
            .map((id) => evidenceMap.get(id)?.sourceId)
            .filter(Boolean)
        )
      ).sort(compareNatural);

      return {
        id: dimension.id,
        name: dimension.name,
        definition: dimension.definition,
        categoryIds,
        subcategoryIds,
        evidenceIds,
        sourceIds,
      };
    })
    .sort((a, b) => orderDimensionIds(a.id, b.id));
}

function buildPhaseEntries(selective) {
  return (selective.integrated_model?.phases || []).map((phase) => ({
    id: `phase-${phase.phase}`,
    name: phase.name || `阶段 ${phase.phase}`,
    timeframe: phase.timeframe || "",
    phaseNumber: phase.phase,
    L: phase.L || "",
    I: phase.I || "",
    V: phase.V || "",
    keyEvents: phase.key_events || [],
    typicalStudents: phase.typical_students || [],
  }));
}

function buildLoopEntries(selective, categoryMap) {
  return (selective.integrated_model?.feedback_loops || []).map((loop, index) => {
    const categoryIds = extractCategoryRefs(loop.description || "").filter((id) => categoryMap.has(id));
    const dimensionIds = Array.from(
      new Set(categoryIds.map((id) => categoryMap.get(id)?.dimensionId).filter(Boolean))
    ).sort(orderDimensionIds);
    const sourceIds = Array.from(
      new Set(
        categoryIds.flatMap((id) => categoryMap.get(id)?.sourceIds || [])
      )
    ).sort(compareNatural);
    return {
      id: `loop-${index + 1}`,
      name: loop.loop || `反馈回路 ${index + 1}`,
      description: loop.description || "",
      direction: loop.direction || "",
      categoryIds,
      dimensionIds,
      sourceIds,
    };
  });
}

function buildPathwayEntries(selective, sources) {
  return Object.entries(selective.alternative_pathways || {}).map(([id, pathway]) => {
    const caseTitles = pathway.representative_cases || [];
    const sourceIds = Array.from(
      new Set(
        caseTitles
          .map((title) => matchSourceId(title.split("：")[0], sources))
          .filter(Boolean)
      )
    ).sort(compareNatural);

    sourceIds.forEach((sourceId) => {
      const source = sources.find((entry) => entry.id === sourceId);
      if (source) {
        source.pathwayIds.add(id);
      }
    });

    return {
      id,
      name: pathway.name || id,
      description: pathway.description || "",
      indicators: pathway.indicators || [],
      representativeCases: caseTitles,
      sourceIds,
    };
  });
}

function buildCoreEntry(selective, dimensions, phases, loops, pathways) {
  return {
    name: selective.core_category?.name || "核心范畴",
    description: selective.core_category?.description || "",
    facilitating:
      selective.core_category?.paradigm?.intervening_conditions?.facilitating || [],
    constraining:
      selective.core_category?.paradigm?.intervening_conditions?.constraining || [],
    consequences: selective.core_category?.paradigm?.consequences || {},
    dimensionIds: dimensions.map((dimension) => dimension.id),
    phaseIds: phases.map((phase) => phase.id),
    loopIds: loops.map((loop) => loop.id),
    pathwayIds: pathways.map((pathway) => pathway.id),
  };
}

function parseProgressReport(text) {
  const byFile = new Map();
  const summary = {};
  let currentGroup = "";
  let inSummaryTable = false;

  text.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith("### 完成统计")) {
      inSummaryTable = true;
      return;
    }

    if (trimmed.startsWith("#### ")) {
      inSummaryTable = false;
      currentGroup = trimmed.replace(/^####\s*/, "").split(" ")[0];
      return;
    }

    if (!trimmed.startsWith("|") || trimmed.includes("---")) {
      return;
    }

    const cells = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);

    if (!cells.length) {
      return;
    }

    if (inSummaryTable && cells.length === 2) {
      summary[cells[0]] = cells[1];
      return;
    }

    if (!cells.some((cell) => cell.includes("_开放编码.md"))) {
      return;
    }

    if (cells.length === 3) {
      byFile.set(cells[1], {
        sequence: cells[0],
        group: currentGroup,
        lineCount: parseInt(cells[2], 10) || null,
      });
      return;
    }

    if (cells.length >= 5) {
      byFile.set(cells[1], {
        sequence: cells[0],
        group: currentGroup,
        year: cells[2],
        status: cells[3],
        lineCount: parseInt(cells[4], 10) || null,
      });
    }
  });

  return { byFile, summary };
}

function parseEvidence(rawValue) {
  const match = String(rawValue).match(/^(.*?)(?:\[([^[\]]+)\])?$/);
  return {
    excerpt: (match?.[1] || rawValue).trim(),
    citation: match?.[2] ? match[2].trim() : "",
  };
}

function matchSourceId(query, sources) {
  const queryTokens = extractSearchTokens(query);
  if (!queryTokens.length) {
    return null;
  }

  let bestSource = null;
  let bestScore = 0;

  sources.forEach((source) => {
    const score = scoreSourceMatch(queryTokens, source);
    if (score > bestScore) {
      bestScore = score;
      bestSource = source;
    }
  });

  return bestScore > 0 ? bestSource.id : null;
}

function scoreSourceMatch(queryTokens, source) {
  let score = 0;
  const searchText = source.searchText.toLowerCase();

  queryTokens.forEach((token) => {
    if (!token) {
      return;
    }
    if (source.tokens.includes(token)) {
      score += token.length >= 3 || /\d/.test(token) ? 5 : 3;
    }
    if (searchText.includes(token)) {
      score += token.length >= 4 || /\d/.test(token) ? 4 : 2;
    }
    source.tokens.forEach((sourceToken) => {
      if (sourceToken !== token && (sourceToken.includes(token) || token.includes(sourceToken))) {
        score += 1;
      }
    });
  });

  return score;
}

function bestDocxMatch(label, docxPaths) {
  const queryTokens = extractSearchTokens(label);
  let bestPath = null;
  let bestScore = 0;

  docxPaths.forEach((path) => {
    const pathTokens = extractSearchTokens(path);
    let score = 0;
    queryTokens.forEach((token) => {
      if (pathTokens.includes(token)) {
        score += token.length >= 3 || /\d/.test(token) ? 5 : 2;
      }
      if (path.toLowerCase().includes(token)) {
        score += 1;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      bestPath = path;
    }
  });

  return bestScore > 0 ? bestPath : null;
}

function normalizeDimensionId(rawId) {
  const upper = String(rawId || "").trim().toUpperCase();
  if (
    upper === "L" ||
    upper === "I" ||
    upper === "V" ||
    upper.startsWith("L_") ||
    upper.startsWith("I_") ||
    upper.startsWith("V_")
  ) {
    return upper.charAt(0);
  }
  if (upper === "C" || upper.startsWith("C_")) {
    return "C";
  }
  return "C";
}

function splitFrameworkDescription(description, fallbackId) {
  const text = String(description || "").trim();
  if (text.includes(" - ")) {
    const [name, definition] = text.split(" - ", 2);
    return [name.trim(), definition.trim()];
  }
  return [DIMENSION_META[fallbackId]?.name || fallbackId, text];
}

function extractCategoryRefs(text) {
  return Array.from(new Set(String(text).match(/\b[LICV]\d[a-z]?\b/g) || []));
}

function stripOpenCodingSuffix(filename) {
  return String(filename).replace(/_开放编码\.md$/i, "");
}

function extractSearchTokens(text) {
  const parts = String(text)
    .toLowerCase()
    .match(/[\u4e00-\u9fffA-Za-z0-9]+/g);

  const stopTokens = new Set(["md", "docx", "source", "开放编码", "南京大学", "访谈"]);
  return Array.from(new Set((parts || []).filter((part) => !stopTokens.has(part))));
}

function inferGroup(label) {
  return label.includes("匡院") || label.includes("李家琪") ? "拔尖计划" : "强基计划";
}

function inferYear(label) {
  const match = String(label).match(/(大一|大二|大三|大四|研一)/);
  return match ? match[1] : "";
}

function inferStatus(label) {
  const match = String(label).match(/(在读|转段|退出)/);
  return match ? match[1] : "";
}

function compareNatural(left, right) {
  return String(left).localeCompare(String(right), "zh-Hans-CN", { numeric: true });
}

function orderDimensionIds(left, right) {
  return THEORY_ORDER.indexOf(left) - THEORY_ORDER.indexOf(right);
}

function selectionClass(type, id) {
  return state.selection.type === type && state.selection.id === id ? " active" : "";
}

function cardStateClass(key, links) {
  if (links.active.has(key)) return " active";
  if (links.connected.has(key)) return " connected";
  if (links.faded.has(key)) return " faded";
  return "";
}

function pill(text) {
  return `<span class="pill">${escapeHtml(text)}</span>`;
}

function interactivePills(items, type, labelMap = null) {
  if (!items?.length) {
    return "<p>无</p>";
  }

  return `<div class="pill-list">${items
    .map((item) => {
      const mapped = labelMap?.get(item);
      const label = mapped?.label || mapped?.name || String(item);
      return `<button class="pill action-pill" type="button" data-select-type="${escapeHtml(type)}" data-select-id="${escapeHtml(
        String(item)
      )}">${escapeHtml(label)}</button>`;
    })
    .join("")}</div>`;
}

function interactiveTheoryPills(items) {
  if (!items?.length) {
    return "<p>无</p>";
  }
  return `<div class="pill-list">${items
    .map((item) => {
      const meta = DIMENSION_META[item] || { label: item, name: item };
      return `<button class="pill action-pill" type="button" data-select-type="dimension" data-select-id="${escapeHtml(
        item
      )}">${escapeHtml(`${meta.label} ${meta.name}`)}</button>`;
    })
    .join("")}</div>`;
}

function listMarkup(items) {
  if (!items?.length) {
    return "<p>无</p>";
  }
  return items.map((item) => `<p>${escapeHtml(String(item))}</p>`).join("");
}

function objectMarkup(record) {
  const entries = Object.entries(record || {});
  if (!entries.length) {
    return "<p>无</p>";
  }
  return entries
    .map(
      ([key, value]) => `
        <p><strong>${escapeHtml(key)}</strong><br />${escapeHtml(String(value))}</p>
      `
    )
    .join("");
}

function evidenceListMarkup(evidenceItems) {
  if (!evidenceItems?.length) {
    return "<p>无</p>";
  }
  return `<div class="evidence-stack">${evidenceItems
    .map(
      (evidence) => `
        <button class="mini-card" type="button" data-select-type="evidence" data-select-id="${escapeHtml(evidence.id)}">
          <strong>${escapeHtml(evidence.excerpt)}</strong>
          <small>${escapeHtml(evidence.citation ? `[${evidence.citation}]` : "无引文标签")}</small>
        </button>
      `
    )
    .join("")}</div>`;
}

function phaseDimensionMarkup(phases, dimensionId) {
  const texts = phases
    .map((phase) => phase[dimensionId])
    .filter(Boolean);
  if (!texts.length) {
    return "<p>无</p>";
  }
  return texts.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
}

function relationMarkup(relations) {
  if (!relations?.length) {
    return "<p>无</p>";
  }
  return relations
    .map(
      (relation) => `
        <p><strong>${escapeHtml(relation.source)} → ${escapeHtml(relation.target)}</strong><br />${escapeHtml(
          relation.relationship || relation.description || ""
        )}</p>
      `
    )
    .join("");
}

function formatParadigm(paradigm) {
  const blocks = [];
  if (paradigm.conditions) {
    blocks.push(`条件：${formatParadigmBlock(paradigm.conditions)}`);
  }
  if (paradigm.context) {
    blocks.push(`情境：${formatParadigmBlock(paradigm.context)}`);
  }
  if (paradigm.actions) {
    blocks.push(`行动/互动：${formatParadigmBlock(paradigm.actions)}`);
  }
  if (paradigm.consequences) {
    blocks.push(`后果：${formatParadigmBlock(paradigm.consequences)}`);
  }
  return blocks.join("\n\n");
}

function formatParadigmBlock(block) {
  if (!block) {
    return "无";
  }
  if (typeof block === "string") {
    return block;
  }
  return Object.entries(block)
    .map(([key, value]) => `${key}：${Array.isArray(value) ? value.join("；") : value}`)
    .join(" | ");
}

function dataArray(map, field, value) {
  return Array.from(map.values()).filter((item) => item[field] === value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

async function readArtifact(file) {
  if (/\.(docx|pdf|png|jpg|jpeg|gif|webp)$/i.test(file.name)) {
    return `该文件为二进制文件，当前页面不直接解析预览：${file.name}`;
  }

  const text = await file.text();
  if (file.name.endsWith(".json")) {
    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn(`Failed to parse JSON for ${file.name}:`, error);
      return text;
    }
  }
  return text;
}

function findArtifactLabel(run, targetFile) {
  const artifact = run.artifacts.find((item) => item.file === targetFile);
  return artifact?.label || null;
}
