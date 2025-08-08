// torsm.js
//import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.35.0/+esm";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

//const SUPABASE_URL = "https://supabase.dp-web.online";
const SUPABASE_URL = "https://fhnprrlmlhleomfqqvpp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZobnBycmxtbGhsZW9tZnFxdnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MTAyMjIsImV4cCI6MjA2NjQ4NjIyMn0.WA-_yNFWxpFnJBA3oh5UlOtq89KBm5hqsb51oi04hMk";
const API_BASE_URL = "https://api.dp-web.online";

const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    revalidateOnFocus: false,
  },
});

let allTorsData = [];
let masterOptions = {};

// ✅ 1. แก้ไข apiFetch ให้รับ session เข้ามาโดยตรง
async function apiFetch(path, session, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  if (!session) {
    throw new Error("Cannot make API call without a session.");
  }

  const defaultHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };

  const config = {
    ...options,
    headers: { ...defaultHeaders, ...options.headers },
  };
  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(
      errorData.error || `HTTP error! status: ${response.status}`
    );
  }

  return response.status === 204 ? null : response.json();
}

// --- ฟังก์ชันหลัก --- //

async function startAnonymousSession() {
  showLoadingOverlay();
  try {
    let {
      data: { session },
    } = await _supabase.auth.getSession();

    if (!session) {
      console.log("No session, signing in anonymously...");
      const { data: anonData, error } =
        await _supabase.auth.signInAnonymously();
      if (error) throw error;
      session = anonData.session; // ใช้ session ของ guest ที่เพิ่งสร้าง
    }

    await initPage(session); // ✅ ส่ง session ที่มีอยู่แน่นอนไปให้ initPage
  } catch (error) {
    console.error("Critical error during session initialization:", error);
    document.body.innerHTML = `<h1>เกิดข้อผิดพลาดในการเข้าถึงข้อมูล: ${error.message}</h1>`;
  } finally {
    hideLoadingOverlay();
  }
}

// ✅ 2. แก้ไข initPage ให้รับ session และส่งต่อไปยังฟังก์ชันลูก
async function initPage(session) {
  console.log("🚀 Initializing page for public view...");
  try {
    await loadAllMasterOptions(session); // ส่ง session ต่อไป
    const rawData = await apiFetch("/api/tors", session); // ส่ง session ต่อไป

    allTorsData = rawData.map((item) => ({
      ...item,
      tor_status_label: item.tor_status?.option_label || "N/A",
      tor_fixing_label: item.tor_fixing?.option_label || "",
    }));

    populateFilters(allTorsData);
    applyFilters();
  } catch (error) {
    console.error("Failed to initialize page data:", error);
    document.getElementById(
      "tor-table-body"
    ).innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}</td></tr>`;
  }
}

// ✅ 3. แก้ไข loadAllMasterOptions ให้รับ session
async function loadAllMasterOptions(session) {
  try {
    masterOptions = await apiFetch("/api/options/all", session); // ส่ง session ให้ apiFetch
    console.log("✅ Successfully loaded all master options.");
  } catch (err) {
    console.error("❌ Failed to load master options:", err);
    masterOptions = {};
    throw err;
  }
}
function renderTable(data) {
  const tableBody = document.getElementById("tor-table-body");
  tableBody.innerHTML = "";

  if (data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>`;
    return;
  }

  // ✅ ปรับ Header ให้ไม่มีคอลัมน์ "จัดการ"
  const headerRow = document.querySelector("thead tr");
  headerRow.innerHTML = `<th class="p-4 text-center text-base font-bold text-gray-600 w-16">ลำดับ</th><th class="p-4 text-left text-base font-bold text-gray-600 w-3/5">ข้อกำหนด(TOR)</th><th class="p-4 text-center text-base font-bold text-gray-600 w-32">สถานะ</th><th class="p-4 text-center text-base font-bold text-gray-600 w-48">การแก้ไข</th>`;

  data.forEach((tor, index) => {
    const statusLabel = tor.tor_status_label;
    const statusColor =
      statusLabel === "ผ่าน"
        ? "bg-green-100 text-green-800"
        : "bg-red-100 text-red-800";

    const mainRow = document.createElement("tr");
    mainRow.className = "main-row";
    mainRow.dataset.torId = tor.tor_id;

    // ✅ ลบปุ่ม [Edit] ออก เหลือแค่การแสดงผล
    mainRow.innerHTML = `
      <td class="p-4 text-center border-b border-gray-200">${index + 1}</td>
      <td class="p-4 border-b border-gray-200">${tor.tor_name}</td>
      <td class="p-4 border-b border-gray-200 text-center">
        <span class="px-3 py-1 text-sm font-semibold rounded-full ${statusColor}">${statusLabel}</span>
      </td>
      <td class="p-4 border-b border-gray-200 text-center text-gray-600">${
        tor.tor_fixing_label
      }</td>
    `;
    tableBody.appendChild(mainRow);
  });
}
function populateFilters(data) {
  const moduleFilter = document.getElementById("module-filter");
  const statusFilter = document.getElementById("status-filter");
  const dateFilter = document.getElementById("presented-date-filter");

  // Populate Modules
  const modules = [
    ...new Map(
      data
        .filter((item) => item.Modules?.module_id)
        .map((item) => [item.Modules.module_id, item.Modules.module_name])
    ).entries(),
  ];
  modules.sort((a, b) => a[0].localeCompare(b[0]));
  moduleFilter.innerHTML = '<option value="all">ระบบงานทั้งหมด</option>';
  modules.forEach(
    ([id, name]) =>
      (moduleFilter.innerHTML += `<option value="${id}">${name}</option>`)
  );

  // Populate Statuses
  statusFilter.innerHTML = '<option value="all">ทุกสถานะ</option>';
  (masterOptions["status"] || []).forEach((opt) => {
    statusFilter.innerHTML += `<option value="${opt.option_id}">${opt.option_label}</option>`;
  });
}

function applyFilters() {
  const moduleValue = document.getElementById("module-filter").value;
  const statusValue = document.getElementById("status-filter").value;
  const dateValue = document.getElementById("presented-date-filter").value;
  const searchValue = document
    .getElementById("search-box")
    .value.trim()
    .toLowerCase();

  let filteredData = allTorsData.filter((item) => {
    const moduleMatch =
      moduleValue === "all" || item.Modules?.module_id === moduleValue;
    const statusMatch =
      statusValue === "all" || item.tor_status_id === statusValue;

    // ✅ --- ส่วนที่แก้ไข ---
    // ตรรกะการกรองวันที่ที่ทำงานกับข้อมูลใหม่
    const dateMatch =
      !dateValue ||
      (item.TORDetail &&
        item.TORDetail.some(
          (detail) =>
            detail.PresentationItems &&
            detail.PresentationItems.some(
              (pi) => pi.Presentation && pi.Presentation.ptt_date === dateValue
            )
        ));

    // ในฟังก์ชัน applyFilters()

    const searchString = `${item.tor_id || ""} ${
      item.Modules?.module_name || ""
    } ${item.tor_name || ""} ${item.tor_status_label || ""} ${
      // ✅ ใช้ _label
      item.tor_fixing_label || "" // ✅ ใช้ _label
    }`.toLowerCase();

    //const searchMatch = !searchValue || searchString.includes(searchString);

    const searchMatch = !searchValue || searchString.includes(searchValue);

    return moduleMatch && statusMatch && searchMatch && dateMatch;
  });
  renderTable(filteredData);
}

function showLoadingOverlay() {
  document.getElementById("loading-overlay").classList.remove("hidden");
}

function hideLoadingOverlay() {
  document.getElementById("loading-overlay").classList.add("hidden");
}
// --- เริ่มการทำงาน ---
document.addEventListener("DOMContentLoaded", startAnonymousSession);
