// torsm.js
//import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.35.0/+esm";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://supabase.dp-web.online";
//const SUPABASE_URL = "https://fhnprrlmlhleomfqqvpp.supabase.co";
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
    // ✅ เรียกโหลดข้อมูลพื้นฐาน 2 อย่างพร้อมกัน
    await Promise.all([
      loadAllMasterOptions(session),
      loadPresentationDates(session),
      loadLatestUpdateDate(session),
    ]);

    const rawData = await apiFetch("/api/tors", session);

    allTorsData = rawData.map((item) => ({
      ...item,
      tor_status_label: item.tor_status?.option_label || "N/A",
      tor_fixing_label: item.tor_fixing?.option_label || "",
    }));

    // ✅ แก้ไขการเรียงลำดับที่นี่ด้วย
    // allTorsData.sort((a, b) => {
    //   const moduleCompare = a.module_id.localeCompare(b.module_id);
    //   if (moduleCompare !== 0) return moduleCompare;
    //   return a.tor_id.localeCompare(b.tor_id);
    // });

    allTorsData.sort((a, b) => {
      // ✅ ป้องกัน Error กรณี module_id หรือ tor_id เป็นค่าว่าง (null)
      const moduleA = a.module_id || "";
      const moduleB = b.module_id || "";
      const torA = a.tor_id || "";
      const torB = b.tor_id || "";

      const moduleCompare = moduleA.localeCompare(moduleB);
      if (moduleCompare !== 0) return moduleCompare;
      return torA.localeCompare(torB);
    });

    populateFilters(allTorsData);
    applyFilters();
  } catch (error) {
    console.error("Failed to initialize page data:", error);
    document.getElementById(
      "tor-table-body"
    ).innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}</td></tr>`;
  }
}

async function loadPresentationDates(session) {
  const dateFilter = document.getElementById("presented-date-filter");
  if (!dateFilter) return;
  try {
    const dates = await apiFetch("/api/presentation/dates", session);
    dateFilter.innerHTML = '<option value="">-- เลือกวันที่ --</option>';
    dates.forEach((dateString) => {
      const date = new Date(dateString);
      const displayDate = date.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      dateFilter.innerHTML += `<option value="${dateString}">${displayDate}</option>`;
    });
  } catch (err) {
    console.error("❌ Load presentation dates failed:", err);
    dateFilter.innerHTML =
      '<option value="">-- ไม่สามารถโหลดวันที่ --</option>';
  }
}

//

async function loadLatestUpdateDate(session) {
  try {
    const data = await apiFetch("/api/presentation/last-updated", session);
    const updateBox = document.getElementById("last-updated");
    if (updateBox && data.latestDate) {
      const latestDate = new Date(data.latestDate);
      const formatted = latestDate.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      updateBox.textContent = `ข้อมูลอัปเดตล่าสุด: ${formatted}`;
    }
  } catch (err) {
    console.error("Error loading latest update date:", err);
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

// ใน torsm.js

// ✅ เพิ่ม 2 ฟังก์ชันนี้เข้าไป

async function toggleDetails(detailsRow, mainRow, torId) {
  const isOpen = detailsRow.classList.toggle("is-open");
  mainRow.classList.toggle("is-active");

  // ปิดแถวรายละเอียดอื่นๆ ที่เคยเปิดไว้
  document.querySelectorAll(".details-row").forEach((row) => {
    if (row !== detailsRow) {
      row.classList.remove("is-open");
      if (row.previousElementSibling)
        row.previousElementSibling.classList.remove("is-active");
    }
  });

  if (isOpen) {
    const detailCell = detailsRow.querySelector("td > div");
    detailCell.innerHTML = `<div class="bg-yellow-50/70 p-6">กำลังโหลด...</div>`;
    try {
      const {
        data: { session },
      } = await _supabase.auth.getSession();
      const details = await apiFetch(`/api/tors/${torId}`, session);
      detailCell.innerHTML = createDetailContent(details);
    } catch (e) {
      detailCell.innerHTML = `<div class="bg-red-100 text-red-800 p-4">เกิดข้อผิดพลาดในการโหลดรายละเอียด: ${e.message}</div>`;
    }
  }
}

// function createDetailContent(details) {
//   const detail =
//     details.TORDetail && details.TORDetail[0] ? details.TORDetail[0] : null;
//   if (!detail)
//     return '<div class="p-6 bg-gray-50">ไม่มีข้อมูลรายละเอียดเพิ่มเติม</div>';

//   const sectionTitleClass =
//     "text-sm font-bold text-gray-700 bg-yellow-200/80 px-3 py-1 rounded-full inline-block mb-2";
//   const contentClass = "prose prose-sm max-w-none text-gray-800";

//   return `
//     <div class="bg-yellow-50/70 border-l-4 border-yellow-400 p-6 space-y-5 text-base">
//         <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
//           <div>
//             <span class="${sectionTitleClass}">ทำได้:</span>
//             <div class="${contentClass} mt-2">${
//     detail.tord_posible?.option_label || "(ไม่มีข้อมูล)"
//   }</div>
//           </div>
//           <div>
//             <span class="${sectionTitleClass}">เล่มเอกสาร:</span>
//             <div class="${contentClass} mt-2">${
//     detail.tord_document || "(ไม่มีข้อมูล)"
//   }</div>
//           </div>
//         </div>
//         <div>
//           <span class="${sectionTitleClass}">หัวข้อที่นำเสนอ:</span>
//           <div class="${contentClass} mt-2">${
//     detail.tord_header || "(ไม่มีข้อมูล)"
//   }</div>
//         </div>
//         <div class="pt-2">
//           <span class="${sectionTitleClass}">รายละเอียดการแก้ไข:</span>
//           <ul class="pl-2 space-y-1">${
//             detail.PCSWorked && detail.PCSWorked.length > 0
//               ? detail.PCSWorked.map(
//                   (item) =>
//                     `<li><div class="prose prose-sm max-w-none">${item.worked_message}</div></li>`
//                 ).join("")
//               : "<li>ไม่มีข้อมูล</li>"
//           }</ul>
//         </div>
//     </div>
//   `;
// }

// ใน torsm.js (นำ 3 ฟังก์ชันนี้ไปวางแทนที่ createDetailContent เดิม)

function createDetailContent(details) {
  const detail =
    details.TORDetail && details.TORDetail[0] ? details.TORDetail[0] : null;
  if (!detail)
    return '<div class="p-6 bg-gray-50">ไม่มีข้อมูลรายละเอียดเพิ่มเติม</div>';

  const feedbackHtml = createItemList(detail.PATFeedback);
  const workedHtml = createItemList(detail.PCSWorked);
  const presentationHtml = createPresentationTable(detail.PresentationItems);

  const sectionTitleClass =
    "text-sm font-bold text-gray-700 bg-gray-200 px-3 py-1 rounded-full inline-block mb-3";

  return `
    <div class="bg-gray-50 border-l-4 border-gray-300 p-6 space-y-6 text-base">
      <div>
        <span class="${sectionTitleClass}">ข้อเสนอแนะคณะกรรมการ:</span>
        <ul class="pl-2 space-y-2 mt-2">${feedbackHtml}</ul>
      </div>
      <div class="pt-4 border-t border-gray-200">
        <span class="${sectionTitleClass}">รายละเอียดการแก้ไข:</span>
        <ul class="pl-2 space-y-2 mt-2">${workedHtml}</ul>
      </div>
      <div class="pt-4 border-t border-gray-200">
        <span class="${sectionTitleClass}">การนำเสนอ TOR:</span>
        <div class="mt-2">${presentationHtml}</div>
      </div>
    </div>
  `;
}

function createItemList(items) {
  if (!items || items.length === 0) return "<li>ไม่มีข้อมูล</li>";

  // ✅ 2.1 & 2.2: กรองเอาเฉพาะสถานะ 'REPORT'
  let itemsToDisplay = items.filter(
    (item) =>
      item.feedback_status_id === "REPORT" || item.worked_status_id === "REPORT"
  );

  if (itemsToDisplay.length === 0) return "<li>ไม่มีรายการสำหรับแสดงผล</li>";

  // เรียงตามวันที่ล่าสุดขึ้นก่อน
  itemsToDisplay.sort(
    (a, b) =>
      new Date(b.feedback_date || b.worked_date) -
      new Date(a.feedback_date || a.worked_date)
  );

  return itemsToDisplay
    .map((item) => {
      const message = item.feedback_message || item.worked_message;
      const date = new Date(item.feedback_date || item.worked_date);
      const formattedDate = date.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      // ✅ ไม่ต้องแสดง (เอกสารรายงาน)
      return `<li class="border-b border-gray-200 py-2">
                <div class="prose prose-sm max-w-none">${message}</div>
                <div class="text-xs text-gray-500 mt-1">วันที่: ${formattedDate}</div>
              </li>`;
    })
    .join("");
}

function createPresentationTable(presentationItems) {
  if (!presentationItems || presentationItems.length === 0)
    return "<div class='text-gray-500'>ไม่มีข้อมูลการนำเสนอ</div>";

  const rows = presentationItems
    .map((item) => {
      const p = item.Presentation;
      if (!p) return "";
      const date = new Date(p.ptt_date).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const presenterName = p.MasterOptions
        ? p.MasterOptions.option_label
        : "-";
      return `
        <tr class="border-b">
          <td class="p-2">${date}</td>
          <td class="p-2">${p.ptt_type || "-"}</td>
          <td class="p-2">${p.ptt_timerange || "-"}</td>
          <td class="p-2">${presenterName}</td> 
        </tr>
      `;
    })
    .join("");

  return `
    <div class="overflow-x-auto">
      <table class="table-auto w-full text-sm">
        <thead class="bg-gray-100">
          <tr>
            <th class="p-2 text-left font-semibold">วันที่นำเสนอ</th>
            <th class="p-2 text-left font-semibold">เงื่อนไข</th>
            <th class="p-2 text-left font-semibold">ช่วงเวลา</th>
            <th class="p-2 text-left font-semibold">ผู้นำเสนอ</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// ใน torsm.js
function renderTable(data) {
  const tableBody = document.getElementById("tor-table-body");
  tableBody.innerHTML = "";

  if (data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>`;
    return;
  }

  const headerRow = document.querySelector("thead tr");
  headerRow.innerHTML = `<th class="p-4 text-center text-base font-bold text-gray-600 w-16">ลำดับ</th><th class="p-4 text-left text-base font-bold text-gray-600 w-3/5">ข้อกำหนด(TOR)</th><th class="p-4 text-center text-base font-bold text-gray-600 w-32">สถานะ</th><th class="p-4 text-center text-base font-bold text-gray-600 w-48">การแก้ไข</th>`;

  data.forEach((tor, index) => {
    const statusLabel = tor.tor_status_label;
    const statusColor =
      statusLabel === "ผ่าน"
        ? "bg-green-100 text-green-800"
        : "bg-red-100 text-red-800";

    const mainRow = document.createElement("tr");
    // ✅ ทำให้แถวมี cursor เป็นรูปมือเมื่อลากผ่าน
    mainRow.className =
      "main-row hover:bg-yellow-50 transition-colors duration-150 cursor-pointer";
    mainRow.dataset.torId = tor.tor_id;

    mainRow.innerHTML = `
      <td class="p-4 text-center border-b border-gray-200">${index + 1}</td>
      <td class="p-4 border-b border-gray-200"><a class="text-blue-600 hover:underline">${
        tor.tor_name
      }</a></td>
      <td class="p-4 border-b border-gray-200 text-center">
        <span class="px-3 py-1 text-sm font-semibold rounded-full ${statusColor}">${statusLabel}</span>
      </td>
      <td class="p-4 border-b border-gray-200 text-center text-gray-600">${
        tor.tor_fixing_label
      }</td>
    `;
    tableBody.appendChild(mainRow);

    // ✅ สร้างแถวว่างสำหรับแสดงรายละเอียด
    const detailsRow = document.createElement("tr");
    detailsRow.className = "details-row";
    detailsRow.innerHTML = `<td colspan="4" class="p-0"><div class="details-content"></div></td>`;
    tableBody.appendChild(detailsRow);

    // ✅ เพิ่ม Event Listener ให้กับแถวหลัก
    mainRow.addEventListener("click", () => {
      toggleDetails(detailsRow, mainRow, tor.tor_id);
    });
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

// ใน torsm.js

// --- เริ่มการทำงาน ---
document.addEventListener("DOMContentLoaded", () => {
  // ✅ เพิ่ม Event Listeners สำหรับ Filters ทั้ง 4 ตัว
  document
    .getElementById("module-filter")
    .addEventListener("change", applyFilters);
  document
    .getElementById("status-filter")
    .addEventListener("change", applyFilters);
  document
    .getElementById("presented-date-filter")
    .addEventListener("change", applyFilters);
  document.getElementById("search-box").addEventListener("input", applyFilters);

  // เรียกใช้ฟังก์ชันหลักเพื่อเริ่มโหลดข้อมูล
  startAnonymousSession();
});
