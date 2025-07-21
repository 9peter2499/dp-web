// tors.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.35.0/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let allTorsData = [];
let currentUserRole = "viewer";
let quillEditor;

let masterOptions = {};

// --- 1. CORE FUNCTIONS ---

async function initPage(session) {
  console.log("🚀 Initializing page...");
  const apiStatus = document.querySelector("#api-status span");

  // Step 1: Fetch user role
  try {
    const { data: profile } = await _supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    currentUserRole = profile?.role || "viewer";
    document.querySelector(
      "#render-mode span"
    ).textContent = `User Role: ${currentUserRole}`;
  } catch (e) {
    console.error("Could not fetch user role", e);
  }

  // Step 2: Load all necessary master options
  // try {
  //   await Promise.all([
  //     loadMasterOptions("status"),
  //     loadMasterOptions("fixing"),
  //     loadMasterOptions("posible"),
  //     loadMasterOptions("document"),
  //     loadMasterOptions("presenter"),
  //     loadPresentationDates(),
  //   ]);
  // } catch (e) {
  //   console.error("Failed to load master options", e);
  // }

  // --- ✅ จุดที่แก้ไข: เปลี่ยนจากการโหลดพร้อมกันเป็นทีละรายการ ---
  try {
    console.log("Loading master data sequentially to avoid rate limits...");
    const masterOptionGroups = [
      "status",
      "fixing",
      "posible",
      "document",
      "presenter",
    ];
    for (const group of masterOptionGroups) {
      await loadMasterOptions(group);
    }
    await loadPresentationDates(); // โหลดข้อมูลวันที่ต่อ
    console.log("Master data loaded successfully.");
  } catch (e) {
    console.error("Failed to load master options", e);
  }

  // Step 3: Fetch main TOR data
  try {
    apiStatus.textContent = "Fetching from API...";
    apiStatus.className = "text-yellow-400";
    const response = await fetch("https://pcsdata.onrender.com/api/tors");
    if (!response.ok)
      throw new Error(`Network response was not ok (${response.status})`);

    const rawData = await response.json();

    // ✅ แก้ไขส่วนนี้: แปลงข้อมูลและเก็บ ID/Label ให้ครบถ้วน
    allTorsData = rawData.map((item) => ({
      ...item,
      tor_status_id: item.tor_status?.option_id,
      tor_fixing_id: item.tor_fixing?.option_id,
      tor_status_label: item.tor_status?.option_label || "N/A",
      tor_fixing_label: item.tor_fixing?.option_label || "",
    }));

    apiStatus.textContent = `Success - Fetched ${allTorsData.length} records.`;
    apiStatus.className = "text-green-400";

    // Step 4: Populate UI
    allTorsData.sort((a, b) => a.tor_id.localeCompare(b.tor_id));
    populateFilters(allTorsData);
    applyFilters();
    loadLatestUpdateDate();
    populatePresenterDropdown();
  } catch (error) {
    apiStatus.textContent = `Error: ${error.message}`;
    apiStatus.className = "text-red-400";
    document.getElementById(
      "tor-table-body"
    ).innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
  }

  // Step 5: Setup user panel
  const userInfoPanel = document.getElementById("user-info-panel");
  userInfoPanel.classList.remove("hidden");
  document.getElementById("user-display").textContent = session.user.email;
  document.getElementById("logout-btn").onclick = async () =>
    await _supabase.auth.signOut();
}

async function loadPresentationDates() {
  const dateFilter = document.getElementById("presented-date-filter");
  if (!dateFilter) return;

  try {
    const res = await fetch(
      "https://pcsdata.onrender.com/api/presentation/dates"
    );
    if (!res.ok) throw new Error("Failed to fetch presentation dates");

    const dates = await res.json();

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

async function loadMasterOptions(group) {
  const res = await fetch(
    `https://pcsdata.onrender.com/api/options?group=${group}`
  );
  if (!res.ok) {
    console.error(`Failed to load options for group: ${group}`);
    masterOptions[group] = [];
    return;
  }
  masterOptions[group] = await res.json();
}

async function loadLatestUpdateDate() {
  try {
    const res = await fetch(
      "https://pcsdata.onrender.com/api/presentation/last-updated"
    );
    if (!res.ok) throw new Error("Response not OK");
    const data = await res.json();
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

function populatePresenterDropdown() {
  const select = document.getElementById("presenterSelect");
  if (!select) return;

  const presenterOptions = masterOptions["presenter"] || [];
  select.innerHTML = '<option value="">-- กรุณาเลือก --</option>'; // Reset
  presenterOptions.forEach((opt) => {
    select.innerHTML += `<option value="${opt.option_id}">${opt.option_label}</option>`;
  });
}

// --- 2. FILTERING AND RENDERING ---

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

  //   // Populate Presentation Dates
  //   const presentationDates = new Set();
  //   data.forEach((tor) => {
  //     tor.TORDetail?.forEach((detail) => {
  //       detail.PresentationItems?.forEach((item) => {
  //         if (item.Presentation?.ptt_date) {
  //           presentationDates.add(item.Presentation.ptt_date);
  //         }
  //       });
  //     });
  //   });
  //   dateFilter.innerHTML = '<option value="">-- เลือกวันที่ --</option>';
  //   [...presentationDates].sort().forEach((date) => {
  //     dateFilter.innerHTML += `<option value="${date}">${new Date(
  //       date
  //     ).toLocaleDateString("th-TH")}</option>`;
  //   });
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

function renderTable(data) {
  const tableBody = document.getElementById("tor-table-body");
  const isAdmin = currentUserRole === "admin";

  tableBody.innerHTML = "";
  if (data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="${
      isAdmin ? 5 : 4
    }" class="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>`;
    return;
  }

  const headerRow = document.querySelector("thead tr");
  headerRow.innerHTML = `<th class="p-4 text-center text-base font-bold text-gray-600 w-16">ลำดับ</th><th class="p-4 text-left text-base font-bold text-gray-600 w-2/5">ข้อกำหนด(TOR)</th><th class="p-4 text-center text-base font-bold text-gray-600 w-32">สถานะ</th><th class="p-4 text-center text-base font-bold text-gray-600 w-48">การแก้ไข</th>`;
  if (isAdmin) {
    const actionHeader = document.createElement("th");
    actionHeader.className =
      "p-4 text-left text-base font-bold text-gray-600 w-20";
    actionHeader.innerText = "จัดการ";
    headerRow.appendChild(actionHeader);
  }

  data.forEach((tor, index) => {
    const statusLabel = tor.tor_status_label;
    const statusColor =
      statusLabel === "ผ่าน"
        ? "bg-green-100 text-green-800"
        : "bg-red-100 text-red-800";

    const mainRow = document.createElement("tr");
    mainRow.className =
      "main-row hover:bg-yellow-50 transition-colors duration-150";
    mainRow.dataset.torId = tor.tor_id;

    let mainRowHTML = `
            <td class="p-4 text-center border-b border-gray-200">${
              index + 1
            }</td>
            <td class="p-4 border-b border-gray-200">
                <a class="tor-link cursor-pointer text-blue-600 hover:underline">${
                  tor.tor_name
                }</a>
            </td>
            <td class="p-4 border-b border-gray-200 text-center">
                <span class="px-3 py-1 text-sm font-semibold rounded-full ${statusColor}">${statusLabel}</span>
            </td>
            <td class="p-4 border-b border-gray-200 text-center text-gray-600">${
              tor.tor_fixing_label
            }</td>
        `;

    if (isAdmin) {
      mainRowHTML += `<td class="p-4 border-b border-gray-200 text-center"><a href="/torsedit.html?id=${tor.tor_id}" class="text-indigo-600 hover:text-indigo-900 font-semibold">[Edit]</a></td>`;
    }
    mainRow.innerHTML = mainRowHTML;
    tableBody.appendChild(mainRow);

    const detailsRow = document.createElement("tr");
    detailsRow.className = "details-row";
    detailsRow.innerHTML = `<td colspan="${
      isAdmin ? 5 : 4
    }" class="p-0"><div class="bg-white p-4 text-sm">กำลังโหลดรายละเอียด...</div></td>`;
    tableBody.appendChild(detailsRow);

    mainRow.addEventListener("click", (event) => {
      if (
        event.target.tagName !== "A" ||
        event.target.classList.contains("tor-link")
      ) {
        event.preventDefault();
        toggleDetails(detailsRow, mainRow, tor.tor_id);
      }
    });
  });

  scrollToTorFromHash();
}

function scrollToTorFromHash() {
  const hash = window.location.hash;
  if (hash) {
    const torId = hash.substring(1); // ตัดเครื่องหมาย # ออก
    const targetRow = document.querySelector(`tr[data-tor-id="${torId}"]`);

    if (targetRow) {
      // เลื่อนหน้าจอไปที่แถวนั้น
      targetRow.scrollIntoView({ behavior: "smooth", block: "center" });

      // เพิ่ม Highlight ชั่วคราวเพื่อให้สังเกตง่าย
      targetRow.style.backgroundColor = "#fffde7"; // สีเหลืองอ่อน
      setTimeout(() => {
        targetRow.style.backgroundColor = ""; // เอากลับเป็นสีเดิม
      }, 2500); // ค้างไว้ 2.5 วินาที
    }
  }
}

// --- 3. DETAIL VIEW FUNCTIONS ---

async function toggleDetails(detailsRow, mainRow, torId) {
  const isOpen = detailsRow.classList.toggle("is-open");
  mainRow.classList.toggle("is-active");

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
      const res = await fetch(`https://pcsdata.onrender.com/api/tors/${torId}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      const details = await res.json();
      detailCell.innerHTML = `${createDetailContent(details)}`;
      addDetailEventListeners(details);
    } catch (e) {
      detailCell.innerHTML = `<div class="bg-red-100 text-red-800 p-4">เกิดข้อผิดพลาดในการโหลดรายละเอียด: ${e.message}</div>`;
    }
  }
}

function createDetailContent(details) {
  const detail =
    details.TORDetail && details.TORDetail[0] ? details.TORDetail[0] : null;
  if (!detail)
    return '<div class="p-6 bg-gray-50">ไม่มีข้อมูลรายละเอียดเพิ่มเติม</div>';

  const isAdmin = currentUserRole === "admin";

  // --- แก้ไขในฟังก์ชัน createDetailContent ---
  const createItemList = (items, type) => {
    if (!items || items.length === 0) return "<li>ไม่มีข้อมูล</li>";

    let itemsToDisplay = isAdmin
      ? items
      : items.filter((item) => item.status === 1);
    itemsToDisplay.sort(
      (a, b) =>
        new Date(b.feedback_date || b.worked_date) -
        new Date(a.feedback_date || a.worked_date)
    );
    if (itemsToDisplay.length === 0)
      return isAdmin
        ? "<li>ยังไม่มีข้อมูล, คลิกปุ่ม +เพิ่ม เพื่อสร้างรายการแรก</li>"
        : "<li>ไม่มีรายการสำหรับแสดงผล</li>";

    return itemsToDisplay
      .map((item) => {
        const message = item.feedback_message || item.worked_message;
        const date = new Date(item.feedback_date || item.worked_date);
        const formattedDate = date.toLocaleDateString("th-TH", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });

        // ✅ แก้ไข groupKey ให้ถูกต้อง
        const groupKey = type === "feedback" ? "status" : "fixing";
        const statusId = item.feedback_status_id || item.worked_status_id;

        // ✅ แก้ไขให้ใช้ตัวแปร masterOptions และหาจาก statusId
        const statusObj = masterOptions[groupKey]?.find(
          (opt) => opt.option_id === statusId
        );
        const statusLabel = statusObj?.option_label || `(ID: ${statusId})`;

        const statusColor =
          item.status === 1 ? "text-green-600" : "text-yellow-600";
        const recordId = item.feedback_id || item.worked_id;

        return `
            <li class="flex justify-between items-start py-3" data-record-id="${recordId}">
                <div class="flex-1 space-y-1">
                    <div class="prose prose-sm max-w-none">${message}</div>
                    <div class="text-xs text-gray-500">วันที่: ${formattedDate}</div>
                </div>
                <div class="flex items-center ml-4 flex-shrink-0">
                    ${
                      isAdmin
                        ? `
                        <div class="text-right"><span class="text-xs font-semibold mr-3 ${statusColor}">(${statusLabel})</span></div>
                        <div class="relative inline-block text-left dropdown ml-2">
                            <button class="text-gray-400 hover:text-black p-1 text-xs dropdown-toggle"><i class="fas fa-ellipsis-v"></i></button>
                            <div class="dropdown-menu hidden origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                                <div class="py-1" role="menu">
                                    <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-item-btn" data-type="${type}" data-record-id="${recordId}">แก้ไข</a>
                                    <a href="#" class="block px-4 py-2 text-sm text-red-700 hover:bg-gray-100 delete-item-btn" data-type="${type}" data-record-id="${recordId}">ลบ</a>
                                </div>
                            </div>
                        </div>
                    `
                        : ""
                    }
                </div>
            </li>
        `;
      })
      .join('<hr class="border-yellow-200/60 my-1">');
  };

  const createPresentationTable = (presentationItems) => {
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

        // --- ส่วนที่แก้ไข: ค้นหาชื่อผู้นำเสนอ ---
        const presenterId = p.ptt_presenter_id;
        const presenterOptions = masterOptions["presenter"] || [];
        const presenterObject = presenterOptions.find(
          (opt) => opt.option_id === presenterId
        );
        const presenterName = presenterObject
          ? presenterObject.option_label
          : "-"; // ถ้าหาไม่เจอให้แสดง "-"
        // --- สิ้นสุดส่วนที่แก้ไข ---

        return `
                <tr class="border-b">
                    <td class="p-2">${date}</td>
                    <td class="p-2">${p.ptt_type || "-"}</td>
                    <td class="p-2">${p.ptt_timerange || "-"}</td>
                    <td class="p-2">${p.ptt_remark || "-"}</td>
                    <td class="p-2">${presenterName}</td> 
                </tr>
            `;
      })
      .join("");

    return `
            <div class="overflow-x-auto">
                <table class="table-auto w-full text-sm mb-4 border border-gray-300 rounded">
                    <thead class="bg-yellow-100">
                        <tr>
                            <th class="p-2 text-left">วันที่นำเสนอ</th>
                            <th class="p-2 text-left">เงื่อนไข</th>
                            <th class="p-2 text-left">ช่วงเวลา</th>
                            <th class="p-2 text-left">หมายเหตุ</th>
                            <th class="p-2 text-left">ผู้นำเสนอ</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
  };

  const feedbackHtml = createItemList(detail.PATFeedback, "feedback");
  const workedHtml = createItemList(detail.PCSWorked, "worked");
  const presentationHtml = createPresentationTable(detail.PresentationItems);

  const sectionTitleClass =
    "text-sm font-bold text-gray-700 bg-yellow-200/80 px-3 py-1 rounded-full inline-block mb-2";
  const contentClass =
    "prose prose-sm max-w-none text-gray-800 [&_a]:text-blue-600 [&_a:hover]:underline";

  return `
        <div class="bg-yellow-50/70 border-l-4 border-yellow-400 p-6 space-y-5 text-base">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 pb-5 border-b">
              <div>
                <span class="${sectionTitleClass}">ทำได้:</span>
                <div class="${contentClass} mt-2">${
    detail.tord_posible?.option_label || "(ไม่มีข้อมูล)"
  }</div>
              </div>
              <div>
                <span class="${sectionTitleClass}">เล่มเอกสาร:</span>
                <div class="${contentClass} mt-2">${
    detail.tord_document || "(ไม่มีข้อมูล)"
  }</div>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 py-5 border-b">
              <div>
                <span class="${sectionTitleClass}">เอกสารอ้างอิง:</span>
                <div class="${contentClass} mt-2">${
    detail.tord_reference || "(ไม่มีข้อมูล)"
  }</div>
              </div>
            <div>
                <span class="${sectionTitleClass}">หัวข้อที่นำเสนอ:</span>
                <div class="${contentClass} mt-2">${
    detail.tord_header || "(ไม่มีข้อมูล)"
  }</div>
            </div>
        </div>
        <div class="py-5 border-b">
          <span class="${sectionTitleClass}">Prototype:</span>
          <div class="${contentClass} mt-2">${
    detail.tord_prototype || "(ไม่มีข้อมูล)"
  }</div>
        </div>
        <div class="pt-4 border-b">
          <div class="flex justify-between items-center mb-2">
            <span class="${sectionTitleClass}">ข้อเสนอแนะคณะกรรมการ:</span>
              ${
                isAdmin
                  ? `<button class="add-item-btn text-xs bg-green-500 text-white py-1 px-3 rounded-md hover:bg-green-600" data-type="feedback" data-tord-id="${detail.tord_id}"><i class="fas fa-plus mr-1"></i>เพิ่ม</button>`
                  : ""
              }
          </div>
          <ul class="pl-2 space-y-1">${feedbackHtml}</ul>
        </div>
        <div class="pt-2 border-b">
          <div class="flex justify-between items-center mb-2">
            <span class="${sectionTitleClass}">รายละเอียดการแก้ไข:</span>
              ${
                isAdmin
                  ? `<button class="add-item-btn text-xs bg-blue-500 text-white py-1 px-3 rounded-md hover:bg-blue-600" data-type="worked" data-tord-id="${detail.tord_id}"><i class="fas fa-plus mr-1"></i>เพิ่ม</button>`
                  : ""
              }
          </div>
          <ul class="pl-2 space-y-1">${workedHtml}</ul>
        </div>
        <div class="pt-2 border-b">
          <span class="${sectionTitleClass}">การนำเสนอ TOR:</span>
          <div class="${contentClass} mt-2">
                ${presentationHtml}
                    ${
                      isAdmin
                        ? `
                        <div class="text-center mt-4">
                            <button class="presentation-btn bg-indigo-500 text-white py-1 px-3 rounded hover:bg-indigo-600 text-xs mr-2" data-tord-id="${detail.tord_id}" data-type="นำเสนอตามกำหนดปกติ">นำเสนอตามกำหนดปกติ</button>
                            <button class="presentation-btn bg-orange-500 text-white py-1 px-3 rounded hover:bg-orange-600 text-xs" data-tord-id="${detail.tord_id}" data-type="นำเสนอแก้ไขเพิ่มเติม">นำเสนอแก้ไขเพิ่มเติม</button>
                          <br>
                        </div>
                    `
                        : ""
                    }
          </div>
        </div>
        </div>
    `;
}

function addDetailEventListeners(details) {
  const detailElement = document.querySelector(`.details-row.is-open`);
  if (!detailElement) return;

  detailElement.querySelectorAll(".add-item-btn").forEach((button) => {
    button.onclick = () =>
      openPopup(button.dataset.type, details.TORDetail[0].tord_id);
  });

  detailElement.querySelectorAll(".dropdown-toggle").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      document.querySelectorAll(".dropdown-menu").forEach((menu) => {
        if (menu !== button.nextElementSibling) menu.classList.add("hidden");
      });
      button.nextElementSibling.classList.toggle("hidden");
    });
  });

  detailElement.querySelectorAll(".edit-item-btn").forEach((button) => {
    const type = button.dataset.type;
    const recordId = button.dataset.recordId;
    const items =
      type === "feedback"
        ? details.TORDetail[0].PATFeedback
        : details.TORDetail[0].PCSWorked;
    const recordData = items.find(
      (item) => (item.feedback_id || item.worked_id) == recordId
    );
    button.onclick = (e) => {
      e.preventDefault();
      openPopup(type, details.TORDetail[0].tord_id, recordData);
    };
  });

  detailElement.querySelectorAll(".delete-item-btn").forEach((button) => {
    button.onclick = (e) => {
      e.preventDefault();
      if (
        confirm(
          "คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้? การกระทำนี้ไม่สามารถย้อนกลับได้"
        )
      ) {
        handleDelete(button.dataset.type, button.dataset.recordId);
      }
    };
  });
}

// --- 4. MODAL FUNCTIONS (Feedback, Worked, Presentation) ---

function openPopup(type, tordId, existingData = null) {
  const modal = document.getElementById("popup-modal");
  const title = document.getElementById("popup-title");

  if (!quillEditor) {
    quillEditor = new Quill("#editor-container", {
      modules: {
        toolbar: [
          ["bold", "italic", "underline"],
          [{ list: "bullet" }],
          ["link", "image"],
        ],
      },
      theme: "snow",
    });
  }

  const statusSelect = document.getElementById("popup-status");
  const groupKey = "document";

  // ✅ แก้ไขให้ใช้ตัวแปร masterOptions
  const options = masterOptions[groupKey] || [];
  statusSelect.innerHTML = options
    .map(
      (opt) => `<option value="${opt.option_id}">${opt.option_label}</option>`
    )
    .join("");

  if (existingData) {
    title.textContent =
      type === "feedback" ? "แก้ไขข้อเสนอแนะ" : "แก้ไขรายละเอียดการทำงาน";
    quillEditor.root.innerHTML =
      existingData.feedback_message || existingData.worked_message;
    const statusId =
      existingData.feedback_status_id || existingData.worked_status_id;
    statusSelect.value = statusId;
  } else {
    title.textContent =
      type === "feedback"
        ? "เพิ่มข้อเสนอแนะใหม่"
        : "เพิ่มรายละเอียดการทำงานใหม่";
    quillEditor.root.innerHTML = "";
    statusSelect.value = options[0]?.option_id || "";
  }

  modal.classList.remove("hidden");
  setTimeout(() => modal.classList.remove("opacity-0"), 10);
  modal.querySelector(".popup-content").classList.remove("scale-95");

  document.getElementById("save-popup-btn").onclick = () => {
    handleSave(type, tordId, existingData);
  };
}

function closePopup() {
  const modal = document.getElementById("popup-modal");
  modal.classList.add("opacity-0");
  modal.querySelector(".popup-content").classList.add("scale-95");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

async function handleSave(type, tordId, existingData) {
  const content = quillEditor.root.innerHTML;
  const statusId = document.getElementById("popup-status").value;
  const {
    data: { session },
  } = await _supabase.auth.getSession();

  let endpoint = "";
  let body = {};
  const recordId = existingData
    ? existingData.feedback_id || existingData.worked_id
    : null;
  const method = existingData ? "PUT" : "POST";

  if (type === "feedback") {
    endpoint = existingData ? `/api/feedback/${recordId}` : "/api/feedback";
    body = { feedback_message: content, feedback_status_id: statusId };
    if (!existingData) body.tord_id = tordId;
  } else {
    endpoint = existingData ? `/api/worked/${recordId}` : "/api/worked";
    body = { worked_message: content, worked_status_id: statusId };
    if (!existingData) body.tord_id = tordId;
  }

  try {
    const response = await fetch(`https://pcsdata.onrender.com${endpoint}`, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to save data");
    }

    closePopup();
    const openDetailsRow = document.querySelector(".details-row.is-open");
    if (openDetailsRow) {
      const mainRow = openDetailsRow.previousElementSibling;
      const torId = mainRow.dataset.torId;
      if (torId) {
        toggleDetails(openDetailsRow, mainRow, torId); // Close
        toggleDetails(openDetailsRow, mainRow, torId); // Re-open to refresh
      }
    }
    alert("บันทึกข้อมูลสำเร็จ!");
  } catch (error) {
    console.error("Save failed:", error);
    alert(`เกิดข้อผิดพลาด: ${error.message}`);
  }
}

async function handleDelete(type, recordId) {
  const {
    data: { session },
  } = await _supabase.auth.getSession();
  const endpoint = `/api/${type}/${recordId}`;

  try {
    const response = await fetch(`https://pcsdata.onrender.com${endpoint}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to delete data");
    }
    alert("ลบข้อมูลสำเร็จ!");
    const openDetailsRow = document.querySelector(".details-row.is-open");
    if (openDetailsRow) {
      const mainRow = openDetailsRow.previousElementSibling;
      const torId = mainRow.dataset.torId;
      if (torId) {
        toggleDetails(openDetailsRow, mainRow, torId); // Close
        toggleDetails(openDetailsRow, mainRow, torId); // Re-open
      }
    }
  } catch (error) {
    console.error("Delete failed:", error);
    alert(`เกิดข้อผิดพลาด: ${error.message}`);
  }
}

function openPresentationModal(tord_id, ptt_type) {
  const modal = document.getElementById("presentationModal");
  const modalTitle = document.getElementById("presentationModalTitle");
  const torData = allTorsData.find((tor) => tor.tor_id === tord_id);
  const topicIdentifier = torData ? torData.tor_name.split(" ")[0] : tord_id;

  modalTitle.textContent = `บันทึกข้อมูลการนำเสนอ : TOR หัวข้อ : ${topicIdentifier}`;
  document.getElementById("presentationDate").value = new Date()
    .toISOString()
    .split("T")[0];
  modal.querySelector("#modal_tord_id").value = tord_id;
  modal.querySelector("#modal_display_type").textContent = ptt_type;
  modal.querySelector("#presentationRemark").value = "";
  document.getElementById("startTime").value = "09:00";
  document.getElementById("endTime").value = "16:00";

  modal.classList.remove("hidden");
  setTimeout(() => modal.classList.remove("opacity-0"), 10);
  modal.querySelector(".popup-content").classList.remove("scale-95");
}

function closePresentationModal() {
  const modal = document.getElementById("presentationModal");
  modal.classList.add("opacity-0");
  modal.querySelector(".popup-content").classList.add("scale-95");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

async function handlePresentationSubmit() {
  const modal = document.getElementById("presentationModal");
  const payload = {
    ptt_type: modal.querySelector("#modal_display_type").textContent,
    ptt_date: document.getElementById("presentationDate").value,
    ptt_timerange: `${modal.querySelector("#startTime").value} - ${
      modal.querySelector("#endTime").value
    }`,
    ptt_presenter_id: document.getElementById("presenterSelect").value, // ✅ เพิ่มบรรทัดนี้
    ptt_remark: modal.querySelector("#presentationRemark").value,
    selected_tors: [modal.querySelector("#modal_tord_id").value],
  };

  // ตรวจสอบว่าผู้ใช้เลือกผู้นำเสนอหรือไม่
  if (!payload.ptt_presenter_id) {
    alert("กรุณาเลือกผู้นำเสนอ");
    return;
  }

  try {
    const {
      data: { session },
    } = await _supabase.auth.getSession();
    const response = await fetch(
      "https://pcsdata.onrender.com/api/presentation",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    alert("บันทึกข้อมูลสำเร็จ!");
    closePresentationModal();

    // const openDetailsRow = document.querySelector(".details-row.is-open");
    // if (openDetailsRow) {
    //   const mainRow = openDetailsRow.previousElementSibling;
    //   const tord_id = payload.selected_tors[0];
    //   toggleDetails(openDetailsRow, mainRow, tord_id); // Close
    //   toggleDetails(openDetailsRow, mainRow, tord_id); // Re-open
    // }

    // ค้นหา tor_id ที่ถูกต้องจาก tord_id เพื่อใช้รีเฟรช
    const tord_id = payload.selected_tors[0];
    const parentTor = allTorsData.find(
      (tor) =>
        tor.TORDetail &&
        tor.TORDetail.some((detail) => detail.tord_id === tord_id)
    );

    if (parentTor) {
      const torIdToRefresh = parentTor.tor_id;
      const openDetailsRow = document.querySelector(
        `.main-row[data-tor-id="${torIdToRefresh}"] + .details-row`
      );
      const mainRow = document.querySelector(
        `.main-row[data-tor-id="${torIdToRefresh}"]`
      );

      if (openDetailsRow && mainRow) {
        // บังคับให้โหลดใหม่โดยการปิดและเปิดอีกครั้ง
        toggleDetails(openDetailsRow, mainRow, torIdToRefresh); // Close
        setTimeout(() => {
          toggleDetails(openDetailsRow, mainRow, torIdToRefresh); // Re-open
        }, 100); // หน่วงเวลาเล็กน้อยเพื่อให้แน่ใจว่าปิดสนิทก่อนเปิด
      }
    } else {
      // ถ้าหาไม่เจอ ให้โหลดหน้าใหม่ทั้งหมดเป็น fallback
      console.warn("Could not find parent TOR to refresh, reloading page.");
      location.reload();
    }
  } catch (error) {
    alert(`เกิดขึ้นข้อผิดพลาด: ${error.message}`);
  }
}

function populateTimeDropdowns() {
  const startTimeSelect = document.getElementById("startTime");
  const endTimeSelect = document.getElementById("endTime");
  if (!startTimeSelect || !endTimeSelect) return;

  startTimeSelect.innerHTML = "";
  endTimeSelect.innerHTML = "";

  for (let i = 8; i <= 17; i++) {
    const hour = i.toString().padStart(2, "0");
    ["00", "30"].forEach((minute) => {
      const time = `${hour}:${minute}`;
      const option = `<option value="${time}">${time}</option>`;
      startTimeSelect.innerHTML += option;
      endTimeSelect.innerHTML += option;
    });
  }
}

// --- 5. INITIALIZATION AND EVENT LISTENERS ---

document.addEventListener("DOMContentLoaded", () => {
  // Setup Quill Editor
  quillEditor = new Quill("#editor-container", {
    modules: { toolbar: true },
    theme: "snow",
  });

  // Setup Filter Event Listeners
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

  // Setup Main Popup Listeners
  document
    .getElementById("close-popup-btn")
    .addEventListener("click", closePopup);
  document
    .getElementById("cancel-popup-btn")
    .addEventListener("click", closePopup);

  // Setup Presentation Modal Listeners
  populateTimeDropdowns();
  //populatePresenterDropdown(); // ✅ --- เพิ่มการเรียกใช้ฟังก์ชันที่นี่ ---
  document
    .getElementById("closePresentationModalBtn")
    ?.addEventListener("click", closePresentationModal);
  document
    .getElementById("cancelPresentationModalBtn")
    ?.addEventListener("click", closePresentationModal);
  document
    .getElementById("savePresentationBtn")
    ?.addEventListener("click", handlePresentationSubmit);

  // Setup Table-level event listener for dynamic content
  document
    .getElementById("tor-table-body")
    .addEventListener("click", function (event) {
      if (event.target.classList.contains("presentation-btn")) {
        const button = event.target;
        openPresentationModal(button.dataset.tordId, button.dataset.type);
      }
      // ... (เพิ่ม event listener สำหรับปุ่มอื่นๆ ใน detail row ที่นี่) ...
    });

  // Main Auth Listener - The single source of truth for starting the app
  _supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      initPage(session);
    } else {
      window.location.href = "/login.html";
    }
  });
});
