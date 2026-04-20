const KNOWN_FILE_CANDIDATES = {
  source_snapshot: ["source_snapshot.txt", "source/original_interview.txt"],
  final_output: ["final_output.json"],
  framework_integration: ["framework_integration.json"],
  node_a_atomic_units: ["node_a/atomic_units.json"],
  node_a_batch_plan: ["node_a/batch_plan.json"],
  node_a_slices: ["node_a/slices.json", "node_a/slices_full.json"],
  node_a_validation_report: [
    "node_a/node_a_validation_report.json",
    "verification/node_a_validation_report.json",
    "verification/coverage_report.json",
  ],
  node_b_open_codes: ["node_b/open_codes.json", "node_b/open_codes_full.json"],
  node_c_axial_network: ["node_c/axial_network.json"],
  node_d_memos: ["node_d/memos.json", "node_d/memo_aggregation.json"],
  node_e_selective_coding: ["node_e/selective_coding.json"],
};

const state = {
  manifest: null,
  currentRun: null,
  currentData: null,
  selection: { type: "core", id: "core" },
  activeArtifactLabel: null,
  activeAtomicUnitId: null,
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
      state.activeAtomicUnitId = null;
      state.selection = { type: "core", id: "core" };

      document.getElementById("run-count").textContent = manifest.run_count;
      document.getElementById("import-status").textContent =
        `已导入 ${manifest.run_count} 个 run，来源文件数 ${files.length}。`;
      renderRunList();

      if (manifest.runs.length) {
        await loadRun(manifest.runs[0].id);
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
  renderNodeSummary();
}

function showEmptyState(title, subtitle) {
  document.getElementById("hero-title").textContent = title;
  document.getElementById("hero-subtitle").textContent = subtitle;
  document.getElementById("hero-metrics").innerHTML = "";
  document.getElementById("segments-column").innerHTML = "";
  document.getElementById("codes-column").innerHTML = "";
  document.getElementById("categories-column").innerHTML = "";
  document.getElementById("selective-column").innerHTML = "";
  document.getElementById("selection-panel").innerHTML = "";
  document.getElementById("framework-dimensions").innerHTML = "";
  document.getElementById("relations-list").innerHTML = "";
  document.getElementById("memo-list").innerHTML = "";
  document.getElementById("atomic-list").innerHTML = "";
  document.getElementById("atomic-title").textContent = "请选择一个原子单元";
  document.getElementById("atomic-content").textContent = "";
  document.getElementById("artifact-list").innerHTML = "";
  document.getElementById("artifact-title").textContent = "请选择一个文件夹";
  document.getElementById("artifact-content").textContent = "";
}

function buildManifestFromFiles(files) {
  const runBuckets = new Map();

  files.forEach((file) => {
    const relativePath = file.webkitRelativePath || file.name;
    const normalized = relativePath.replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);

    let runIndex = parts.indexOf("runs");
    if (runIndex >= 0 && parts[runIndex + 1]) {
      const runId = parts[runIndex + 1];
      const artifactPath = parts.slice(runIndex + 2).join("/");
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

  const runs = Array.from(runBuckets.values()).sort((a, b) => a.id.localeCompare(b.id));
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
  if (!run) return;

  state.currentRun = run;
  state.selection = { type: "core", id: "core" };
  renderRunList();

  const data = await loadRunArtifacts(run);
  state.currentData = data;
  state.activeArtifactLabel = run.files.final_output
    ? findArtifactLabel(run, run.files.final_output)
    : run.artifacts?.[0]?.label || null;
  state.activeAtomicUnitId = data.atomicUnits[0]?.unit_id || null;

  renderHero();
  renderNodeSummary();
  renderHierarchy();
  renderSelectionPanel();
  renderAtomicUnits();
  renderFrameworkPanels();
  renderArtifactBrowser();
}

async function loadRunArtifacts(run) {
  const fileEntries = await Promise.all(
    Object.entries(run.files || {}).map(async ([key, file]) => [key, await readArtifact(file)])
  );

  const fileData = Object.fromEntries(fileEntries);
  const sourceText = typeof fileData.source_snapshot === "string" ? fileData.source_snapshot : "";
  const nodeA = fileData.node_a_slices?.slices || [];
  const atomicUnits = fileData.node_a_atomic_units?.atomic_units || [];
  const openLedger = fileData.node_b_open_codes?.open_coding_ledger || [];
  const fallbackAxial = parseAxialCodes(fileData.final_output?.axial_codes);
  const axialCategories = fileData.node_c_axial_network?.axial_categories || fallbackAxial.categories || {};
  const relations =
    fileData.node_c_axial_network?.cross_category_relations || fallbackAxial.cross_category_relations || [];
  const memos = fileData.node_d_memos?.memo_log || [];
  const rivalExplanations = fileData.node_d_memos?.rival_explanations || [];
  const tensions = fileData.node_d_memos?.key_tensions || [];
  const selective = fileData.node_e_selective_coding || {};
  const finalOutput = fileData.final_output || {};
  const framework = fileData.framework_integration || {};
  const coverage = finalOutput.coverage_report || fileData.node_a_validation_report || {};

  const segmentMap = new Map(nodeA.map((segment) => [segment.segment_id, segment]));
  const codeMap = new Map();
  const segmentToCodes = new Map();

  openLedger.forEach((entry) => {
    segmentToCodes.set(entry.segment_id, entry.initial_codes || []);
    (entry.initial_codes || []).forEach((code) => {
      if (!codeMap.has(code)) {
        codeMap.set(code, {
          code,
          segmentIds: new Set(),
          labels: new Set(),
          count: 0,
        });
      }
      const bucket = codeMap.get(code);
      bucket.segmentIds.add(entry.segment_id);
      bucket.labels.add(entry.label);
      bucket.count += 1;
    });
  });

  const categoryEntries = Object.entries(axialCategories).map(([id, value]) => ({
    id,
    ...value,
  }));
  const codeToCategories = new Map();
  const segmentToCategories = new Map();

  categoryEntries.forEach((category) => {
    (category.codes || []).forEach((code) => {
      if (!codeToCategories.has(code)) {
        codeToCategories.set(code, new Set());
      }
      codeToCategories.get(code).add(category.id);
    });
    (category.segment_ids || []).forEach((segmentId) => {
      if (!segmentToCategories.has(segmentId)) {
        segmentToCategories.set(segmentId, new Set());
      }
      segmentToCategories.get(segmentId).add(category.id);
    });
  });

  const categoryToDimensions = new Map();
  const dimensionToCategories = new Map();
  const atomicUnitMap = new Map(atomicUnits.map((unit) => [unit.unit_id, unit]));
  const atomicUnitToSegment = new Map();
  Object.entries(framework.axial_categories_mapping || {}).forEach(([categoryId, dimensionIds]) => {
    categoryToDimensions.set(categoryId, new Set(dimensionIds));
    dimensionIds.forEach((dimensionId) => {
      if (!dimensionToCategories.has(dimensionId)) {
        dimensionToCategories.set(dimensionId, new Set());
      }
      dimensionToCategories.get(dimensionId).add(categoryId);
    });
  });

  nodeA.forEach((segment) => {
    (segment.atomic_unit_ids || []).forEach((unitId) => {
      atomicUnitToSegment.set(unitId, segment.segment_id);
    });
  });

  return {
    run,
    files: run.files,
    sourceText,
    nodeA,
    atomicUnits,
    openLedger,
    codeItems: Array.from(codeMap.values())
      .map((item) => ({
        code: item.code,
        segmentIds: Array.from(item.segmentIds),
        labels: Array.from(item.labels),
        count: item.count,
      }))
      .sort((a, b) => a.code.localeCompare(b.code, "zh-Hans-CN")),
    categoryEntries,
    relations,
    memos,
    rivalExplanations,
    tensions,
    selective,
    finalOutput,
    framework,
    coverage,
    segmentMap,
    segmentToCodes,
    codeToCategories,
    segmentToCategories,
    categoryToDimensions,
    dimensionToCategories,
    atomicUnitMap,
    atomicUnitToSegment,
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
  const title = document.getElementById("hero-title");
  const subtitle = document.getElementById("hero-subtitle");
  const metrics = document.getElementById("hero-metrics");

  title.textContent = data.run.label;
  subtitle.textContent =
    data.selective.core_category_brief ||
    data.finalOutput.core_theory?.slice(0, 180) ||
    "当前 run 已加载，可浏览全部节点产物与编码关系。";

  const metricItems = [
    ["Node A 片段", data.nodeA.length],
    ["Node B 开放码", data.codeItems.length],
    ["Node C 轴心类属", data.categoryEntries.length],
    ["Node D 备忘录", data.memos.length],
    ["覆盖状态", data.coverage.node_a_coverage_status || "unknown"],
    ["框架维度", Object.keys(data.framework.framework_dimensions || {}).length],
  ];

  metrics.innerHTML = metricItems
    .map(
      ([label, value]) => `
        <div class="metric-card">
          <span class="metric-label">${escapeHtml(label)}</span>
          <span class="metric-value ${
            value === "pass" ? "status-pass" : ""
          }">${escapeHtml(String(value))}</span>
        </div>
      `
    )
    .join("");
}

function renderNodeSummary() {
  const data = state.currentData;
  const root = document.getElementById("node-summary");
  if (!data) {
    root.innerHTML = `
      <div class="node-card">
        <strong>等待导入</strong>
        <small>选择本地文件夹后显示节点统计</small>
      </div>
    `;
    return;
  }
  const summaryItems = [
    ["Node A", `${data.nodeA.length} 段 / ${data.atomicUnits.length} 原子单元`],
    ["Node B", `${data.openLedger.length} 条编码账本`],
    ["Node C", `${data.categoryEntries.length} 个轴心类属`],
    ["Node D", `${data.memos.length} 条 memo`],
    ["Node E", data.selective.core_category || "无"],
    ["Output", data.coverage.node_b_coverage_status || "unknown"],
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

function renderHierarchy() {
  const data = state.currentData;
  const links = buildActiveLinks();

  document.getElementById("segments-column").innerHTML = data.nodeA
    .map((segment) =>
      hierarchyItem({
        key: `segment:${segment.segment_id}`,
        title: `${segment.segment_id} ${segment.label || ""}`.trim(),
        meta: [`${segment.unit_count || segment.atomic_unit_ids?.length || 0} 个原子单元`],
        type: "segment",
        id: segment.segment_id,
        links,
      })
    )
    .join("");

  document.getElementById("codes-column").innerHTML = data.codeItems
    .map((codeItem) =>
      hierarchyItem({
        key: `code:${codeItem.code}`,
        title: codeItem.code,
        meta: [`${codeItem.segmentIds.length} 个片段`, `${codeItem.count} 次出现`],
        type: "code",
        id: codeItem.code,
        links,
      })
    )
    .join("");

  document.getElementById("categories-column").innerHTML = data.categoryEntries
    .map((category) =>
      hierarchyItem({
        key: `category:${category.id}`,
        title: category.id,
        meta: [
          `${(category.codes || []).length} 个代码`,
          `${(category.segment_ids || []).length} 个片段`,
        ],
        type: "category",
        id: category.id,
        links,
      })
    )
    .join("");

  const dimensions = Object.entries(data.framework.framework_dimensions || {});
  const selectiveCards = [
    hierarchyItem({
      key: "core:core",
      title: data.selective.core_category || "核心范畴",
      meta: [`${data.categoryEntries.length} 个类属被整合`],
      type: "core",
      id: "core",
      links,
    }),
    ...dimensions.map(([dimensionId, value]) =>
      hierarchyItem({
        key: `dimension:${dimensionId}`,
        title: `${dimensionId} ${value.name || ""}`.trim(),
        meta: [
          `${(data.dimensionToCategories.get(dimensionId) || new Set()).size} 个类属映射`,
        ],
        type: "dimension",
        id: dimensionId,
        links,
      })
    ),
  ];
  document.getElementById("selective-column").innerHTML = selectiveCards.join("");

  bindHierarchyEvents();
}

function hierarchyItem({ key, title, meta, type, id, links }) {
  const stateClass =
    links.active.has(key) ? " active" : links.connected.has(key) ? " connected" : links.faded.has(key) ? " faded" : "";

  return `
    <button class="hierarchy-item${stateClass}" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}">
      <span class="item-title">${escapeHtml(title)}</span>
      <span class="item-meta">
        ${(meta || [])
          .map((item) => `<span class="meta-chip">${escapeHtml(item)}</span>`)
          .join("")}
      </span>
    </button>
  `;
}

function bindHierarchyEvents() {
  document.querySelectorAll(".hierarchy-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.selection = {
        type: button.dataset.type,
        id: button.dataset.id,
      };
      renderHierarchy();
      renderSelectionPanel();
      syncAtomicUnitSelectionFromCurrentSelection();
      renderAtomicUnits();
      renderFrameworkPanels();
    });
  });
}

function renderSelectionPanel() {
  const data = state.currentData;
  const panel = document.getElementById("selection-panel");
  const selection = state.selection;

  let title = "核心范畴";
  let body = data.selective.theory_storyline || data.finalOutput.core_theory || "";
  let rightColumn = [
    detailCard(
      "理论张力",
      pillMarkup(data.tensions || [])
    ),
    detailCard(
      "边界条件",
      objectMarkup(data.selective.boundary_conditions || {})
    ),
    detailCard(
      "负例",
      listMarkup(data.selective.negative_cases || [])
    ),
  ];

  if (selection.type === "segment") {
    const segment = data.segmentMap.get(selection.id);
    title = `${segment.segment_id} ${segment.label || ""}`.trim();
    body = segment.source_text;
    rightColumn = [
      detailCard("开放编码", pillMarkup(data.segmentToCodes.get(segment.segment_id) || [])),
      detailCard(
        "轴心类属",
        pillMarkup(Array.from(data.segmentToCategories.get(segment.segment_id) || []))
      ),
      detailCard(
        "原子单元",
        atomicUnitPillMarkup(segment.atomic_unit_ids || [])
      ),
      detailCard(
        "跨度信息",
        `<p>${segment.source_span_start} - ${segment.source_span_end}</p>`
      ),
    ];
  } else if (selection.type === "code") {
    const code = selection.id;
    const codeEntry = data.codeItems.find((item) => item.code === code);
    title = `开放编码：${code}`;
    body = `该开放编码出现在 ${codeEntry.segmentIds.length} 个片段中，可直接跳回原始切片审计其语境。`;
    rightColumn = [
      detailCard("相关片段", pillMarkup(codeEntry.segmentIds)),
      detailCard(
        "归属轴心类属",
        pillMarkup(Array.from(data.codeToCategories.get(code) || []))
      ),
      detailCard("片段标签", pillMarkup(codeEntry.labels)),
    ];
  } else if (selection.type === "category") {
    const category = data.categoryEntries.find((item) => item.id === selection.id);
    title = `轴心类属：${category.id}`;
    body = [
      `条件：${category.conditions || "无"}`,
      `行动/互动：${category.actions || "无"}`,
      `后果：${category.consequences || "无"}`,
    ].join("\n\n");
    rightColumn = [
      detailCard("下属代码", pillMarkup(category.codes || [])),
      detailCard("相关片段", pillMarkup(category.segment_ids || [])),
      detailCard(
        "框架维度",
        pillMarkup(Array.from(data.categoryToDimensions.get(category.id) || []))
      ),
    ];
  } else if (selection.type === "dimension") {
    const dimension = data.framework.framework_dimensions?.[selection.id];
    const analysisKey = Object.keys(data.framework.dimension_analysis || {}).find((key) =>
      key.startsWith(`${selection.id}_`)
    );
    const analysis = analysisKey ? data.framework.dimension_analysis[analysisKey] : null;
    title = `${selection.id} ${dimension?.name || ""}`.trim();
    body = analysis?.description || dimension?.definition || "无额外说明";
    rightColumn = [
      detailCard(
        "映射轴心类属",
        pillMarkup(Array.from(data.dimensionToCategories.get(selection.id) || []))
      ),
      detailCard("支持片段", pillMarkup(analysis?.supporting_segments || [])),
      detailCard("支持代码", pillMarkup(analysis?.supporting_codes || [])),
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

  panel.querySelectorAll(".atomic-pill").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeAtomicUnitId = button.dataset.unitId;
      renderAtomicUnits();
    });
  });
}

function detailCard(title, content) {
  return `
    <div class="detail-card">
      <h5>${escapeHtml(title)}</h5>
      ${content}
    </div>
  `;
}

function pillMarkup(items) {
  if (!items?.length) {
    return `<p>无</p>`;
  }
  return `<div class="pill-list">${items
    .map((item) => `<span class="pill">${escapeHtml(String(item))}</span>`)
    .join("")}</div>`;
}

function atomicUnitPillMarkup(items) {
  if (!items?.length) {
    return `<p>无</p>`;
  }
  return `<div class="pill-list">${items
    .map(
      (item) =>
        `<button class="pill atomic-pill" type="button" data-unit-id="${escapeHtml(String(item))}">${escapeHtml(
          String(item)
        )}</button>`
    )
    .join("")}</div>`;
}

function listMarkup(items) {
  if (!items?.length) {
    return `<p>无</p>`;
  }
  return items.map((item) => `<p>${escapeHtml(String(item))}</p>`).join("");
}

function objectMarkup(record) {
  const entries = Object.entries(record || {});
  if (!entries.length) {
    return `<p>无</p>`;
  }
  return entries
    .map(
      ([key, value]) => `
        <p><strong>${escapeHtml(key)}</strong><br />${escapeHtml(String(value))}</p>
      `
    )
    .join("");
}

function renderFrameworkPanels() {
  const data = state.currentData;
  const links = buildActiveLinks();

  const dimensionRoot = document.getElementById("framework-dimensions");
  dimensionRoot.innerHTML = Object.entries(data.framework.framework_dimensions || {})
    .map(([id, dimension]) => {
      const key = `dimension:${id}`;
      const className =
        links.active.has(key) ? " active" : links.connected.has(key) ? " connected" : links.faded.has(key) ? " faded" : "";
      return `
        <button class="dimension-item${className}" data-type="dimension" data-id="${escapeHtml(id)}">
          <h5>${escapeHtml(id)} ${escapeHtml(dimension.name || "")}</h5>
          <p>${escapeHtml(dimension.definition || "")}</p>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".dimension-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.selection = { type: "dimension", id: button.dataset.id };
      renderHierarchy();
      renderSelectionPanel();
      syncAtomicUnitSelectionFromCurrentSelection();
      renderAtomicUnits();
      renderFrameworkPanels();
    });
  });

  const relationRoot = document.getElementById("relations-list");
  relationRoot.innerHTML = (data.relations || [])
    .map((relation) => {
      const key = `relation:${relation.from}:${relation.to}`;
      const connected =
        state.selection.type === "category" &&
        (state.selection.id === relation.from || state.selection.id === relation.to);
      return `
        <div class="relation-item${connected ? " connected" : ""}" data-key="${escapeHtml(key)}">
          <h5>${escapeHtml(relation.from)} → ${escapeHtml(relation.to)}</h5>
          <p>${escapeHtml(relation.relation || "")}</p>
        </div>
      `;
    })
    .join("");

  const memoRoot = document.getElementById("memo-list");
  const memoCards = [
    ...(data.memos || []).map((memo) => ({
      title: `${memo.memo_id} ${memo.category}`,
      copy: memo.content,
      connected: state.selection.type === "category" && memo.category === state.selection.id,
    })),
    ...(data.rivalExplanations || []).map((item) => ({
      title: item.explanation_id,
      copy: `${item.content}\n\n含义：${item.implication}`,
      connected: false,
    })),
  ];
  memoRoot.innerHTML = memoCards
    .map(
      (memo) => `
        <div class="memo-item${memo.connected ? " connected" : ""}">
          <h5>${escapeHtml(memo.title)}</h5>
          <p>${escapeHtml(memo.copy)}</p>
        </div>
      `
    )
    .join("");
}

function renderAtomicUnits() {
  const data = state.currentData;
  const listRoot = document.getElementById("atomic-list");
  const titleRoot = document.getElementById("atomic-title");
  const contentRoot = document.getElementById("atomic-content");

  if (!data) {
    listRoot.innerHTML = "";
    titleRoot.textContent = "请选择一个原子单元";
    contentRoot.textContent = "";
    return;
  }

  const highlightedSegmentId = state.selection.type === "segment" ? state.selection.id : null;

  listRoot.innerHTML = data.atomicUnits
    .map((unit) => {
      const segmentId = data.atomicUnitToSegment.get(unit.unit_id);
      const isActive = unit.unit_id === state.activeAtomicUnitId;
      const isConnected = highlightedSegmentId && segmentId === highlightedSegmentId;
      return `
        <button class="atomic-item${isActive ? " active" : isConnected ? " connected" : ""}" data-unit-id="${escapeHtml(
          unit.unit_id
        )}">
          <strong>${escapeHtml(unit.unit_id)}</strong>
          <div class="atomic-meta">
            <span class="meta-chip">${escapeHtml(segmentId || "未映射片段")}</span>
            <span class="meta-chip">${escapeHtml(String(unit.char_length || 0))} 字符</span>
            <span class="meta-chip">${escapeHtml(
              `${unit.source_span_start ?? "-"} - ${unit.source_span_end ?? "-"}`
            )}</span>
          </div>
        </button>
      `;
    })
    .join("");

  listRoot.querySelectorAll(".atomic-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeAtomicUnitId = button.dataset.unitId;
      const segmentId = data.atomicUnitToSegment.get(button.dataset.unitId);
      if (segmentId) {
        state.selection = { type: "segment", id: segmentId };
        renderHierarchy();
        renderSelectionPanel();
        renderFrameworkPanels();
      }
      renderAtomicUnits();
    });
  });

  const activeUnit = data.atomicUnitMap.get(state.activeAtomicUnitId) || data.atomicUnits[0] || null;
  if (!activeUnit) {
    titleRoot.textContent = "请选择一个原子单元";
    contentRoot.textContent = "";
    return;
  }

  if (!state.activeAtomicUnitId) {
    state.activeAtomicUnitId = activeUnit.unit_id;
  }

  const mappedSegmentId = data.atomicUnitToSegment.get(activeUnit.unit_id);
  titleRoot.textContent = `${activeUnit.unit_id}${mappedSegmentId ? ` -> ${mappedSegmentId}` : ""}`;
  contentRoot.innerHTML = `
    <p><strong>所属片段：</strong>${escapeHtml(mappedSegmentId || "未映射")}</p>
    <p><strong>原文跨度：</strong>${escapeHtml(
      `${activeUnit.source_span_start ?? "-"} - ${activeUnit.source_span_end ?? "-"}`
    )}</p>
    <p><strong>字符数：</strong>${escapeHtml(String(activeUnit.char_length || 0))}</p>
    <p><strong>原文内容：</strong></p>
    <p>${escapeHtml(activeUnit.source_text || "")}</p>
  `;
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
        <button class="artifact-item${isActive ? " active" : ""}" data-label="${escapeHtml(
        artifact.label
      )}">
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

function buildActiveLinks() {
  const data = state.currentData;
  const links = {
    active: new Set(),
    connected: new Set(),
    faded: new Set(),
  };

  const addActive = (type, id) => links.active.add(`${type}:${id}`);
  const addConnected = (type, id) => links.connected.add(`${type}:${id}`);

  if (!state.selection?.type) return links;

  if (state.selection.type === "core") {
    addActive("core", "core");
    data.categoryEntries.forEach((category) => addConnected("category", category.id));
    return links;
  }

  if (state.selection.type === "segment") {
    const segmentId = state.selection.id;
    addActive("segment", segmentId);
    (data.segmentToCodes.get(segmentId) || []).forEach((code) => {
      addConnected("code", code);
      (data.codeToCategories.get(code) || []).forEach((categoryId) => {
        addConnected("category", categoryId);
      });
    });
  }

  if (state.selection.type === "code") {
    const code = state.selection.id;
    addActive("code", code);
    (data.codeItems.find((item) => item.code === code)?.segmentIds || []).forEach((segmentId) => {
      addConnected("segment", segmentId);
    });
    (data.codeToCategories.get(code) || []).forEach((categoryId) => {
      addConnected("category", categoryId);
      (data.categoryToDimensions.get(categoryId) || []).forEach((dimensionId) => {
        addConnected("dimension", dimensionId);
      });
    });
  }

  if (state.selection.type === "category") {
    const categoryId = state.selection.id;
    addActive("category", categoryId);
    const category = data.categoryEntries.find((entry) => entry.id === categoryId);
    (category?.codes || []).forEach((code) => addConnected("code", code));
    (category?.segment_ids || []).forEach((segmentId) => addConnected("segment", segmentId));
    (data.categoryToDimensions.get(categoryId) || []).forEach((dimensionId) =>
      addConnected("dimension", dimensionId)
    );
    addConnected("core", "core");
  }

  if (state.selection.type === "dimension") {
    const dimensionId = state.selection.id;
    addActive("dimension", dimensionId);
    (data.dimensionToCategories.get(dimensionId) || []).forEach((categoryId) => {
      addConnected("category", categoryId);
      const category = data.categoryEntries.find((entry) => entry.id === categoryId);
      (category?.codes || []).forEach((code) => addConnected("code", code));
      (category?.segment_ids || []).forEach((segmentId) => addConnected("segment", segmentId));
    });
    addConnected("core", "core");
  }

  const allKeys = [];
  data.nodeA.forEach((segment) => allKeys.push(`segment:${segment.segment_id}`));
  data.codeItems.forEach((item) => allKeys.push(`code:${item.code}`));
  data.categoryEntries.forEach((item) => allKeys.push(`category:${item.id}`));
  Object.keys(data.framework.framework_dimensions || {}).forEach((id) =>
    allKeys.push(`dimension:${id}`)
  );
  allKeys.push("core:core");

  if (links.active.size || links.connected.size) {
    allKeys.forEach((key) => {
      if (!links.active.has(key) && !links.connected.has(key)) {
        links.faded.add(key);
      }
    });
  }

  return links;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseAxialCodes(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return {};
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn("Failed to parse final_output.axial_codes:", error);
    return {};
  }
}

async function readArtifact(file) {
  const text = await file.text();
  if (file.name.endsWith(".json")) {
    return JSON.parse(text);
  }
  return text;
}

function findArtifactLabel(run, targetFile) {
  const artifact = run.artifacts.find((item) => item.file === targetFile);
  return artifact?.label || null;
}

function syncAtomicUnitSelectionFromCurrentSelection() {
  const data = state.currentData;
  if (!data) return;

  if (state.selection.type === "segment") {
    const segment = data.segmentMap.get(state.selection.id);
    state.activeAtomicUnitId = segment?.atomic_unit_ids?.[0] || state.activeAtomicUnitId;
  }
}
