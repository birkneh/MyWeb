/* =========================================================
   CONFIG
   ========================================================= */

const PUBMED_AUTHOR_QUERY =
  `(birkneh tilahun tadesse[Author] OR birkneh tilahun[Author] OR tadesse bt[Author])`;

const EXCLUDE_TITLE_ABSTRACT = [
  `"food safety"[Title/Abstract]`,
  `"foodborne"[Title/Abstract]`
];

const PUBMED_MAX = 250;
const LOCAL_PUBLICATIONS_JSON = "./publications.json";
const AUTO_FETCH_PUBMED_ON_LOAD = true;

// NCBI eUtils best-practice params (helps reliability)
const NCBI_TOOL = "birkneh-cv-site";
const NCBI_EMAIL = "birknehtilahun@gmail.com";

// Fetch guard
const FETCH_TIMEOUT_MS = 15000;

/* =========================================================
   STORAGE KEYS
   ========================================================= */

const PUB_REVIEW_STORAGE_KEY = "pub_review_v1";
const BLOG_ADMIN_SESSION_KEY = "blog_admin_session_v1";
const BLOG_DRAFTS_STORAGE_KEY = "blog_posts_local_v1";

/* =========================================================
   BASIC UTIL
   ========================================================= */

function esc(s){
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
  }[c]));
}

function setStatus(msg){
  const el = document.getElementById("pub-status");
  if(el) el.textContent = msg;
}

function withTimeout(fetchPromise, ms = FETCH_TIMEOUT_MS){
  const ctrl = new AbortController();
  const t = setTimeout(()=> ctrl.abort(), ms);
  return {
    signal: ctrl.signal,
    run: async () => {
      try{
        return await fetchPromise(ctrl.signal);
      } finally {
        clearTimeout(t);
      }
    }
  };
}

function formatDateTime(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString();
  }catch(e){
    return String(iso || "");
  }
}

function safeId(){
  return `id_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function jsonDownload(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================================================
   PUBLICATION REVIEW (ACCEPT/REJECT)
   ========================================================= */

let PUB_REVIEW = {}; // { key: "accepted" | "rejected" }

function loadPubReview(){
  try{ PUB_REVIEW = JSON.parse(localStorage.getItem(PUB_REVIEW_STORAGE_KEY) || "{}") || {}; }
  catch(e){ PUB_REVIEW = {}; }
}
function savePubReview(){
  localStorage.setItem(PUB_REVIEW_STORAGE_KEY, JSON.stringify(PUB_REVIEW));
}
function pubKey(p){
  if(p.doi){
    return `doi:${String(p.doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").trim()}`;
  }
  if(p.pmid) return `pmid:${String(p.pmid).trim()}`;
  return `t:${String(p.title||p.citation||"").toLowerCase().replace(/\s+/g," ").slice(0,160)}`;
}
function getReviewState(p){
  return PUB_REVIEW[pubKey(p)] || "unreviewed";
}
function setReviewState(p, state){
  const k = pubKey(p);
  if(state === "unreviewed") delete PUB_REVIEW[k];
  else PUB_REVIEW[k] = state;
  savePubReview();
}

/* =========================================================
   LINKS + FILTERS
   ========================================================= */

function scholarSearchLink(citationOrTitle){
  const q = encodeURIComponent(String(citationOrTitle || "").slice(0, 220));
  return `https://scholar.google.com/scholar?q=${q}`;
}
function pubmedSearchLink(citationOrTitle){
  const q = encodeURIComponent(String(citationOrTitle || "").slice(0, 220));
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${q}`;
}
function crossrefSearchLink(citationOrTitle){
  const q = encodeURIComponent(String(citationOrTitle || "").slice(0, 220));
  return `https://search.crossref.org/?q=${q}`;
}

function bestPrimaryLink(p){
  if (p.url && String(p.url).trim()) return String(p.url).trim();
  if (p.doi && String(p.doi).trim()){
    const doi = String(p.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
    return `https://doi.org/${doi}`;
  }
  if (p.pmid && String(p.pmid).trim()){
    return `https://pubmed.ncbi.nlm.nih.gov/${String(p.pmid).trim()}/`;
  }
  return scholarSearchLink(p.title || p.citation || "");
}

function sortPublications(list, mode){
  const arr = [...list];
  if(mode === "year_asc"){
    arr.sort((a,b)=> (a.year||0) - (b.year||0) || (a.title||"").localeCompare(b.title||""));
    return arr;
  }
  if(mode === "title_asc"){
    arr.sort((a,b)=> (a.title||"").localeCompare(b.title||""));
    return arr;
  }
  arr.sort((a,b)=> (b.year||0) - (a.year||0) || (a.title||"").localeCompare(b.title||""));
  return arr;
}

function filterPublications(list, q){
  const query = String(q||"").trim().toLowerCase();
  if(!query) return list;
  return list.filter(p=>{
    const blob = [
      p.title, p.journal, p.citation, p.authors, p.year, p.doi, p.pmid
    ].join(" ").toLowerCase();
    return blob.includes(query);
  });
}

/* =========================================================
   RENDER PUBLICATIONS
   ========================================================= */

let PUBS = [];

function renderPublications(){
  const listEl = document.getElementById("pub-list");
  if(!listEl) return;

  const search = document.getElementById("pub-search")?.value || "";
  const sortMode = document.getElementById("pub-sort")?.value || "year_desc";
  const reviewMode = document.getElementById("pub-filter")?.value || "all";

  const filtered = filterPublications(PUBS, search);
  const sortedAll = sortPublications(filtered, sortMode);

  const sorted = sortedAll.filter(p=>{
    const st = getReviewState(p);
    if(reviewMode === "accepted") return st === "accepted";
    if(reviewMode === "rejected") return st === "rejected";
    if(reviewMode === "unreviewed") return st === "unreviewed";
    return st !== "rejected"; // default: hide rejected
  });

  listEl.innerHTML = "";

  if(sorted.length === 0){
    listEl.innerHTML = `<div class="muted">No publications found.</div>`;
    setStatus("No publications found.");
    return;
  }

  let nAccepted = 0, nRejected = 0, nUnreviewed = 0;
  for(const p of sortedAll){
    const st = getReviewState(p);
    if(st === "accepted") nAccepted++;
    else if(st === "rejected") nRejected++;
    else nUnreviewed++;
  }

  for(const p of sorted){
    const year = p.year ? String(p.year) : "—";
    const title = p.title || p.citation || "Untitled";
    const journal = p.journal || p.source || "";
    const authors = p.authors || "";

    const wrapper = document.createElement("div");
    wrapper.className = "pub";

    const top = document.createElement("div");
    top.className = "pub-top";

    const left = document.createElement("div");
    left.style.flex = "1 1 auto";

    const h = document.createElement("div");
    h.className = "pub-title";
    h.innerHTML = esc(title);
    left.appendChild(h);

    const meta = document.createElement("div");
    meta.className = "pub-meta";
    meta.innerHTML = `${esc(authors)}${authors ? " • " : ""}${esc(journal)}${journal ? " • " : ""}${esc(year)}`;
    left.appendChild(meta);

    const open = document.createElement("a");
    open.className = "pub-open";
    open.href = bestPrimaryLink(p);
    open.target = "_blank";
    open.rel = "noreferrer";
    open.innerHTML = `<i class="fa-solid fa-up-right-from-square"></i> Open`;

    top.appendChild(left);
    top.appendChild(open);

    const links = document.createElement("div");
    links.className = "pub-links";

    if(p.doi){
      const a = document.createElement("a");
      a.className = "pub-link";
      a.href = `https://doi.org/${String(p.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim()}`;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.innerHTML = `<i class="fa-solid fa-link"></i> DOI`;
      links.appendChild(a);
    }

    if(p.pmid){
      const a = document.createElement("a");
      a.className = "pub-link";
      a.href = `https://pubmed.ncbi.nlm.nih.gov/${String(p.pmid).trim()}/`;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.innerHTML = `<i class="fa-solid fa-database"></i> PubMed`;
      links.appendChild(a);
    }

    if(p.url){
      const a = document.createElement("a");
      a.className = "pub-link";
      a.href = String(p.url).trim();
      a.target = "_blank";
      a.rel = "noreferrer";
      a.innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> Publisher`;
      links.appendChild(a);
    }

    const aScholar = document.createElement("a");
    aScholar.className = "pub-link";
    aScholar.href = scholarSearchLink(title);
    aScholar.target = "_blank";
    aScholar.rel = "noreferrer";
    aScholar.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Scholar`;
    links.appendChild(aScholar);

    const aPM = document.createElement("a");
    aPM.className = "pub-link";
    aPM.href = pubmedSearchLink(title);
    aPM.target = "_blank";
    aPM.rel = "noreferrer";
    aPM.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> PubMed search`;
    links.appendChild(aPM);

    const aCR = document.createElement("a");
    aCR.className = "pub-link";
    aCR.href = crossrefSearchLink(title);
    aCR.target = "_blank";
    aCR.rel = "noreferrer";
    aCR.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Crossref`;
    links.appendChild(aCR);

    // Review buttons
    const reviewBar = document.createElement("div");
    reviewBar.className = "pub-links";

    const state = getReviewState(p);

    const btnAccept = document.createElement("button");
    btnAccept.type = "button";
    btnAccept.className = "pub-link" + (state === "accepted" ? " accepted" : "");
    btnAccept.innerHTML = `<i class="fa-solid fa-check"></i> Accept`;
    btnAccept.addEventListener("click", ()=>{
      setReviewState(p, "accepted");
      renderPublications();
    });

    const btnReject = document.createElement("button");
    btnReject.type = "button";
    btnReject.className = "pub-link" + (state === "rejected" ? " rejected" : "");
    btnReject.innerHTML = `<i class="fa-solid fa-xmark"></i> Reject`;
    btnReject.addEventListener("click", ()=>{
      setReviewState(p, "rejected");
      renderPublications();
    });

    const btnUndo = document.createElement("button");
    btnUndo.type = "button";
    btnUndo.className = "pub-link";
    btnUndo.innerHTML = `<i class="fa-solid fa-rotate-left"></i> Undo`;
    btnUndo.addEventListener("click", ()=>{
      setReviewState(p, "unreviewed");
      renderPublications();
    });

    reviewBar.appendChild(btnAccept);
    reviewBar.appendChild(btnReject);
    reviewBar.appendChild(btnUndo);

    wrapper.appendChild(top);

    if(p.citation && String(p.citation).trim()){
      const c = document.createElement("div");
      c.className = "pub-meta";
      c.style.marginTop = "6px";
      c.innerHTML = esc(p.citation);
      wrapper.appendChild(c);
    }

    wrapper.appendChild(links);
    wrapper.appendChild(reviewBar);
    listEl.appendChild(wrapper);
  }

  setStatus(`Showing ${sorted.length}. Review: ${nAccepted} accepted • ${nUnreviewed} unreviewed • ${nRejected} rejected.`);
}

/* =========================================================
   LOADING PUBLICATIONS
   ========================================================= */

async function loadLocalPublications(){
  try{
    const url = `${LOCAL_PUBLICATIONS_JSON}?v=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error(`Local publications.json not found (${res.status})`);
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error("publications.json must be an array");
    return data;
  }catch(e){
    console.warn("Local publications load failed:", e);
    return [];
  }
}

function buildPubMedQuery(){
  const exclPart = EXCLUDE_TITLE_ABSTRACT.length
    ? ` NOT (${EXCLUDE_TITLE_ABSTRACT.join(" OR ")})`
    : "";
  return `${PUBMED_AUTHOR_QUERY}${exclPart}`.trim();
}

async function fetchJSON(url){
  const runner = withTimeout(async (signal) => {
    const res = await fetch(url, { cache: "no-store", signal });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  });
  return await runner.run();
}

async function fetchPubMed(){
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const term = encodeURIComponent(buildPubMedQuery());
  const common = `&tool=${encodeURIComponent(NCBI_TOOL)}&email=${encodeURIComponent(NCBI_EMAIL)}`;

  // 1) ESearch
  const esearchURL =
    `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=${PUBMED_MAX}&sort=date&term=${term}${common}`;

  const sJson = await fetchJSON(esearchURL);
  const ids = (sJson?.esearchresult?.idlist || []).slice(0, PUBMED_MAX);
  if(ids.length === 0) return [];

  // 2) ESummary (GET with comma-separated IDs)
  const idStr = ids.join(",");
  const esummaryURL =
    `${base}/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(idStr)}${common}`;

  const sumJson = await fetchJSON(esummaryURL);

  const result = sumJson?.result || {};
  const uids = result?.uids || [];

  const pubs = [];
  for(const pmid of uids){
    const it = result[pmid];
    if(!it) continue;

    const title = (it.title || "").replace(/\s+/g, " ").trim();
    const journal = (it.fulljournalname || it.source || "").trim();
    const pubdate = (it.pubdate || "").trim();
    const yearMatch = pubdate.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

    const authors = Array.isArray(it.authors)
      ? it.authors.map(a=>a.name).filter(Boolean).join(", ")
      : "";

    let doi = null;
    if(Array.isArray(it.articleids)){
      const doiObj = it.articleids.find(x => x.idtype === "doi" && x.value);
      if(doiObj) doi = doiObj.value;
    }

    pubs.push({
      pmid: String(pmid),
      title,
      authors,
      journal,
      year,
      doi,
      url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      citation: ""
    });
  }

  return pubs;
}

function dedupePubs(pubs){
  const seen = new Set();
  const out = [];
  for(const p of pubs){
    const key =
      p.doi ? `doi:${String(p.doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").trim()}` :
      p.pmid ? `pmid:${String(p.pmid).trim()}` :
      `t:${String(p.title||p.citation||"").toLowerCase().slice(0,160)}`;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function mergePreferLocal(online, local){
  const byKey = new Map();
  function keyOf(p){
    if(p.doi) return `doi:${String(p.doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").trim()}`;
    if(p.pmid) return `pmid:${String(p.pmid).trim()}`;
    return `t:${String(p.title||p.citation||"").toLowerCase().slice(0,160)}`;
  }

  for(const p of online) byKey.set(keyOf(p), { ...p });

  for(const lp of local){
    const k = keyOf(lp);
    if(byKey.has(k)){
      const merged = { ...byKey.get(k), ...lp };
      if(lp.citation) merged.citation = lp.citation;
      if(lp.url) merged.url = lp.url;
      byKey.set(k, merged);
    }else{
      byKey.set(k, { ...lp });
    }
  }
  return Array.from(byKey.values());
}

async function loadPublications({preferPubMed=true} = {}){
  setStatus("Loading publications…");
  const local = await loadLocalPublications();

  if(preferPubMed){
    try{
      setStatus("Fetching latest publications from PubMed…");
      const online = await fetchPubMed();
      const merged = mergePreferLocal(online, local);
      const final = dedupePubs(merged);
      setStatus(`Loaded ${final.length} publications (PubMed + local).`);
      return final;
    }catch(e){
      console.warn("PubMed fetch failed:", e);
      const final = dedupePubs(local);
      const msg =
        (e?.name === "AbortError")
          ? `PubMed timed out; loaded ${final.length} from local file.`
          : `PubMed fetch failed; loaded ${final.length} from local file.`;
      setStatus(msg);
      return final;
    }
  }

  const final = dedupePubs(local);
  setStatus(`Loaded ${final.length} publications from local file.`);
  return final;
}

/* =========================================================
   THEME + PHOTO
   ========================================================= */

function initTheme(){
  const btn = document.getElementById("btn-theme");
  if(!btn) return;

  const saved = localStorage.getItem("theme");
  if(saved === "dark") document.body.classList.add("dark");

  btn.addEventListener("click", ()=>{
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
}

function initPhoto(){
  const img = document.getElementById("profile-photo");
  const fallback = document.querySelector(".photo-fallback");
  if(!img || !fallback) return;

  img.addEventListener("error", ()=>{
    img.style.display = "none";
    fallback.style.display = "flex";
  });

  if(img.getAttribute("src") && img.getAttribute("src").trim()){
    img.style.display = "block";
    fallback.style.display = "none";
  } else {
    img.style.display = "none";
    fallback.style.display = "flex";
  }
}

/* =========================================================
   FEATURED LINKEDIN
   ========================================================= */

function initFeaturedLinkedIn(){
  const toggle = document.getElementById("btn-li-toggle");
  const body = document.getElementById("li-body");
  const copyBtn = document.getElementById("btn-li-copy");
  const status = document.getElementById("li-status");
  const card = document.getElementById("li-card");
  const jumpBtn = document.getElementById("btn-scroll-featured");

  if(toggle && body){
    toggle.addEventListener("click", ()=>{
      const isHidden = body.hasAttribute("hidden");
      if(isHidden){
        body.removeAttribute("hidden");
        toggle.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Collapse`;
      }else{
        body.setAttribute("hidden", "");
        toggle.innerHTML = `<i class="fa-solid fa-chevron-down"></i> Expand`;
      }
    });
  }

  if(card){
    card.style.cursor = "pointer";
    card.addEventListener("click", (e)=>{
      const t = e.target;
      const isInteractive =
        t?.closest?.("a") || t?.closest?.("button") || t?.closest?.("input") || t?.closest?.("select");
      if(isInteractive) return;
      const url = card.getAttribute("data-url") || "";
      if(url) window.open(url, "_blank", "noreferrer");
    });
  }

  if(copyBtn && card){
    copyBtn.addEventListener("click", async ()=>{
      const url = card.getAttribute("data-url") || "";
      try{
        await navigator.clipboard.writeText(url);
        if(status) status.textContent = "Copied.";
        setTimeout(()=>{ if(status) status.textContent = ""; }, 1200);
      }catch(e){
        if(status) status.textContent = "Copy failed (browser blocked).";
        setTimeout(()=>{ if(status) status.textContent = ""; }, 1800);
      }
    });
  }

  if(jumpBtn){
    jumpBtn.addEventListener("click", ()=>{
      const target = document.getElementById("li-card") || document.querySelector(".featured");
      if(target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

/* =========================================================
   BLOGS (public + admin)
   ========================================================= */

let BLOGS_PUBLIC = []; // from blogs.json (published)
let BLOGS_LOCAL = [];  // localStorage (drafts + published)

function loadLocalBlogs(){
  try{
    BLOGS_LOCAL = JSON.parse(localStorage.getItem(BLOG_DRAFTS_STORAGE_KEY) || "[]") || [];
    if(!Array.isArray(BLOGS_LOCAL)) BLOGS_LOCAL = [];
  }catch(e){
    BLOGS_LOCAL = [];
  }
}

function saveLocalBlogs(){
  localStorage.setItem(BLOG_DRAFTS_STORAGE_KEY, JSON.stringify(BLOGS_LOCAL));
}

async function loadPublicBlogs(){
  try{
    const res = await fetch(`./blogs.json?v=${Date.now()}`, { cache: "no-store" });
    if(!res.ok) return [];
    const data = await res.json();
    if(!Array.isArray(data)) return [];
    return data.filter(x => x && x.status === "published");
  }catch(e){
    return [];
  }
}

function getAdminEnabled(){
  const url = new URL(window.location.href);
  const hasParam = url.searchParams.get("admin") === "1";
  const hasSession = localStorage.getItem(BLOG_ADMIN_SESSION_KEY) === "1";
  return hasParam || hasSession;
}

function ensureAdminSession(){
  // If user opened ?admin=1, keep session in this browser
  const url = new URL(window.location.href);
  if(url.searchParams.get("admin") === "1"){
    localStorage.setItem(BLOG_ADMIN_SESSION_KEY, "1");
  }
}

function logoutAdmin(){
  localStorage.removeItem(BLOG_ADMIN_SESSION_KEY);
}

function combinedBlogsForDisplay(){
  // show published from repo + (if admin) drafts/published from local
  const isAdmin = getAdminEnabled();

  const publishedRepo = (BLOGS_PUBLIC || []).map(b => ({...b, source: "repo"}));

  const local = (BLOGS_LOCAL || []).map(b => ({...b, source: "local"}));

  let all = publishedRepo;

  if(isAdmin){
    // show drafts too (local only)
    all = [...publishedRepo, ...local];
  } else {
    // only local published if someone saved locally (optional)
    all = [...publishedRepo, ...local.filter(b => b.status === "published")];
  }

  // dedupe by id if same
  const byId = new Map();
  for(const b of all){
    if(!b || !b.id) continue;
    byId.set(b.id, b);
  }
  const out = Array.from(byId.values());

  // sort newest first
  out.sort((a,b)=> new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  return out;
}

function blogCardHTML(b){
  const when = formatDateTime(b.publishedAt || b.updatedAt || b.createdAt);
  const author = b.author || "—";
  const status = b.status || "draft";

  const excerpt = String(b.content || "").trim().slice(0, 260);
  const showTag = (status === "draft") ? `<span class="pill">Draft</span>` : `<span class="pill">Published</span>`;

  return `
    <div class="blog-card">
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <div class="blog-title">${esc(b.title || "Untitled")}</div>
          <div class="blog-meta muted">By <b>${esc(author)}</b> • ${esc(when)}</div>
        </div>
        ${showTag}
      </div>
      <div class="muted" style="margin-top:10px; line-height:1.55;">
        ${esc(excerpt)}${(String(b.content||"").length > excerpt.length) ? "…" : ""}
      </div>
      <div class="blog-actions">
        <button class="btn btn-primary btn-sm" type="button" data-blog-open="${esc(b.id)}">
          <i class="fa-solid fa-book-open"></i> Read
        </button>
      </div>
    </div>
  `;
}

function renderBlogs(){
  const heroTarget = document.getElementById("blog-posts");
  const sectionTarget = document.getElementById("blogs-section");
  const all = combinedBlogsForDisplay();

  // show latest 2 in hero (if any)
  if(heroTarget){
    const latest = all.filter(b => (getAdminEnabled() ? true : b.status === "published")).slice(0, 2);
    heroTarget.innerHTML = latest.length
      ? latest.map(blogCardHTML).join("")
      : `<div class="muted">No blog posts yet.</div>`;
  }

  if(sectionTarget){
    const visible = all.filter(b => (getAdminEnabled() ? true : b.status === "published"));
    sectionTarget.innerHTML = visible.length
      ? visible.map(blogCardHTML).join("")
      : `<div class="muted">No blog posts yet.</div>`;
  }

  // wire "Read"
  const wire = (root) => {
    root?.querySelectorAll?.("[data-blog-open]")?.forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-blog-open");
        const b = combinedBlogsForDisplay().find(x => x.id === id);
        if(!b) return;
        openBlogReader(b);
      });
    });
  };
  wire(heroTarget);
  wire(sectionTarget);
}

function openBlogReader(b){
  // simple reader modal using native alert-like overlay
  const wrap = document.createElement("div");
  wrap.className = "modal";
  wrap.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card" role="dialog" aria-modal="true" style="max-width: 880px;">
      <div class="modal-head">
        <h2 style="margin:0;">${esc(b.title || "Untitled")}</h2>
        <div class="modal-head-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-close="1">
            <i class="fa-solid fa-xmark"></i> Close
          </button>
        </div>
      </div>
      <div class="modal-body">
        <div class="muted" style="margin-bottom:12px;">
          By <b>${esc(b.author || "—")}</b> • ${esc(formatDateTime(b.publishedAt || b.updatedAt || b.createdAt))}
          ${b.status === "draft" ? " • Draft" : ""}
        </div>
        <div style="white-space: pre-wrap; line-height:1.7;">${esc(b.content || "")}</div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  const close = ()=> wrap.remove();
  wrap.querySelector("[data-close]")?.addEventListener("click", close);
  wrap.querySelector(".modal-backdrop")?.addEventListener("click", close);
  document.addEventListener("keydown", function escClose(e){
    if(e.key === "Escape"){ close(); document.removeEventListener("keydown", escClose); }
  });
}

/* --- Admin UI wiring --- */

function initAdmin(){
  const adminBtn = document.getElementById("btn-admin");
  const modal = document.getElementById("admin-modal");
  if(!adminBtn || !modal) return;

  ensureAdminSession();

  const enabled = getAdminEnabled();
  if(enabled){
    adminBtn.hidden = false;
  }

  const closeModal = ()=> modal.setAttribute("hidden", "");
  const openModal  = ()=> modal.removeAttribute("hidden");

  // open/close
  adminBtn.addEventListener("click", ()=>{
    openModal();
    renderAdminList();
  });

  modal.querySelector("[data-close]")?.addEventListener("click", closeModal);
  modal.querySelector("#btn-admin-close")?.addEventListener("click", closeModal);
  modal.querySelector(".modal-backdrop")?.addEventListener("click", closeModal);

  modal.querySelector("#btn-admin-logout")?.addEventListener("click", ()=>{
    logoutAdmin();
    adminBtn.hidden = true;
    closeModal();
    renderBlogs(); // hide drafts
  });

  // save
  modal.querySelector("#btn-blog-save")?.addEventListener("click", ()=>{
    const title = document.getElementById("blog-title")?.value?.trim() || "";
    const author = document.getElementById("blog-author")?.value?.trim() || "Birkneh T. Tadesse";
    const status = document.getElementById("blog-status")?.value || "draft";
    const content = document.getElementById("blog-content")?.value || "";

    const statusEl = document.getElementById("blog-admin-status");

    if(!title){
      if(statusEl) statusEl.textContent = "Title is required.";
      return;
    }
    if(!String(content).trim()){
      if(statusEl) statusEl.textContent = "Content is required.";
      return;
    }

    const now = new Date().toISOString();
    const post = {
      id: safeId(),
      title,
      author,
      status,
      content,
      createdAt: now,
      updatedAt: now,
      publishedAt: (status === "published") ? now : null
    };

    BLOGS_LOCAL.unshift(post);
    saveLocalBlogs();

    if(statusEl) statusEl.textContent = "Saved locally.";
    setTimeout(()=>{ if(statusEl) statusEl.textContent = ""; }, 1200);

    // clear editor
    document.getElementById("blog-title").value = "";
    document.getElementById("blog-content").value = "";
    document.getElementById("blog-status").value = "draft";

    renderAdminList();
    renderBlogs();
  });

  // download
  modal.querySelector("#btn-blog-download")?.addEventListener("click", ()=>{
    // Only published posts should go into blogs.json for the website
    const publishedLocal = (BLOGS_LOCAL || []).filter(p => p.status === "published");
    jsonDownload("blogs.json", publishedLocal);
  });
}

function renderAdminList(){
  const box = document.getElementById("blog-admin-list");
  if(!box) return;

  const items = (BLOGS_LOCAL || []);
  if(items.length === 0){
    box.innerHTML = `<div class="muted">No local posts yet.</div>`;
    return;
  }

  box.innerHTML = items.map(p=>{
    return `
      <div class="admin-row">
        <div>
          <div><b>${esc(p.title || "Untitled")}</b> ${p.status === "draft" ? `<span class="pill">Draft</span>` : `<span class="pill">Published</span>`}</div>
          <div class="meta">By ${esc(p.author || "—")} • ${esc(formatDateTime(p.updatedAt || p.createdAt))}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" type="button" data-admin-open="${esc(p.id)}">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn btn-ghost btn-sm" type="button" data-admin-del="${esc(p.id)}">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `;
  }).join("");

  box.querySelectorAll("[data-admin-del]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-admin-del");
      const ok = confirm("Delete this post (local only)?");
      if(!ok) return;
      BLOGS_LOCAL = BLOGS_LOCAL.filter(p => p.id !== id);
      saveLocalBlogs();
      renderAdminList();
      renderBlogs();
    });
  });

  box.querySelectorAll("[data-admin-open]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-admin-open");
      const p = BLOGS_LOCAL.find(x => x.id === id);
      if(!p) return;

      document.getElementById("blog-title").value = p.title || "";
      document.getElementById("blog-author").value = p.author || "Birkneh T. Tadesse";
      document.getElementById("blog-status").value = p.status || "draft";
      document.getElementById("blog-content").value = p.content || "";

      // overwrite save to "update" this post
      const saveBtn = document.getElementById("btn-blog-save");
      const statusEl = document.getElementById("blog-admin-status");
      const originalHandler = saveBtn.__handler;

      if(originalHandler){
        saveBtn.removeEventListener("click", originalHandler);
      }

      const handler = ()=>{
        const title = document.getElementById("blog-title")?.value?.trim() || "";
        const author = document.getElementById("blog-author")?.value?.trim() || "Birkneh T. Tadesse";
        const status = document.getElementById("blog-status")?.value || "draft";
        const content = document.getElementById("blog-content")?.value || "";

        if(!title){
          if(statusEl) statusEl.textContent = "Title is required.";
          return;
        }
        if(!String(content).trim()){
          if(statusEl) statusEl.textContent = "Content is required.";
          return;
        }

        const now = new Date().toISOString();
        p.title = title;
        p.author = author;
        p.status = status;
        p.content = content;
        p.updatedAt = now;
        if(status === "published" && !p.publishedAt) p.publishedAt = now;
        if(status === "draft") p.publishedAt = p.publishedAt || null;

        saveLocalBlogs();
        if(statusEl) statusEl.textContent = "Updated locally.";
        setTimeout(()=>{ if(statusEl) statusEl.textContent = ""; }, 1200);

        renderAdminList();
        renderBlogs();
      };

      saveBtn.__handler = handler;
      saveBtn.addEventListener("click", handler);

      if(statusEl) statusEl.textContent = "Loaded into editor (Save updates this post).";
      setTimeout(()=>{ if(statusEl) statusEl.textContent = ""; }, 1600);
    });
  });
}

/* =========================================================
   BOOT
   ========================================================= */

window.addEventListener("DOMContentLoaded", async ()=>{
  document.getElementById("year-now")?.textContent = new Date().getFullYear();
  document.getElementById("last-updated")?.textContent = new Date().toLocaleDateString();

  initTheme();
  initPhoto();
  initFeaturedLinkedIn();

  // Blogs
  loadLocalBlogs();
  BLOGS_PUBLIC = await loadPublicBlogs();
  initAdmin();
  renderBlogs();

  // Publications
  loadPubReview();

  PUBS = await loadPublications({ preferPubMed: AUTO_FETCH_PUBMED_ON_LOAD });
  renderPublications();

  document.getElementById("pub-search")?.addEventListener("input", renderPublications);
  document.getElementById("pub-sort")?.addEventListener("change", renderPublications);
  document.getElementById("pub-filter")?.addEventListener("change", renderPublications);

  document.getElementById("btn-refresh")?.addEventListener("click", async ()=>{
    setStatus("Refreshing from PubMed…");
    PUBS = await loadPublications({ preferPubMed: true });
    document.getElementById("last-updated")?.textContent = new Date().toLocaleString();
    renderPublications();
  });

  document.getElementById("btn-clear-review")?.addEventListener("click", ()=>{
    const ok = confirm("Clear all Accept/Reject decisions?");
    if(!ok) return;
    PUB_REVIEW = {};
    savePubReview();
    renderPublications();
  });
});
