import { _supabase } from "./supabaseClient.js";
import { API_BASE_URL } from "./config.js";

let allTorsData = [];
let currentUserRole = "viewer";
let quillEditor;

let masterOptions = {};

async function apiFetch(url, session, options = {}) {
  // const {
  //   data: { session },
  // } = await _supabase.auth.getSession();

  if (!session) {
    alert("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    window.location.href = "/login.html";
    throw new Error("User not authenticated");
  }

  const defaultHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  if (response.status === 401) {
    // ถ้าบัตรหมดอายุ (Unauthorized)
    alert("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    _supabase.auth.signOut(); // สั่ง Logout เพื่อเคลียร์ค่า
    window.location.href = "/login.html";
    throw new Error("Session expired");
  }

  if (!response.ok) {
    // สำหรับ Error อื่นๆ
    const errorData = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(
      errorData.error || `HTTP error! status: ${response.status}`
    );
  }

  return response.json();
}

// --- 1. CORE FUNCTIONS ---
async function loadAllMasterOptions(session) {
  try {
    masterOptions = await apiFetch(`${API_BASE_URL}/api/options/all`, session);
    console.log("✅ Successfully loaded all master options in one request.");
  } catch (err) {
    /* ... */
  }
}

function showLoadingOverlay() {
  document.getElementById("loading-overlay").classList.remove("hidden");
}

function hideLoadingOverlay() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

function restorePageState() {
  // 1. ดึงข้อมูลสถานะที่บันทึกไว้ออกมา
  const savedStateJSON = sessionStorage.getItem("torsPageState");

  // ตรวจสอบว่ามีข้อมูลที่บันทึกไว้หรือไม่
  if (savedStateJSON) {
    console.log("✅ Page state found, restoring...");
    const savedState = JSON.parse(savedStateJSON);

    // 2. กู้คืนค่า filter และ search ที่เคยเลือกไว้
    document.getElementById("module-filter").value = savedState.filters.module;
    document.getElementById("status-filter").value = savedState.filters.status;
    document.getElementById("presented-date-filter").value =
      savedState.filters.presentedDate;
    document.getElementById("search-box").value = savedState.searchTerm;

    // 3. สั่งให้ filter ข้อมูลอีกครั้งตามค่าที่กู้มา
    // ฟังก์ชัน applyFilters() ของคุณจะ re-render ตารางให้เอง
    applyFilters();

    // 4. กู้คืนตำแหน่ง Scroll ของหน้า
    // ใช้ setTimeout เพื่อให้แน่ใจว่า DOM แสดงผลเสร็จสมบูรณ์ก่อนจะเลื่อน
    setTimeout(() => {
      window.scrollTo(0, savedState.scrollTop);
    }, 100);

    // 5. ล้างข้อมูลที่บันทึกไว้ทิ้งไป เพื่อไม่ให้มีผลกับการรีเฟรชครั้งต่อไป
    sessionStorage.removeItem("torsPageState");
  }

  // 6. ตรวจสอบและไฮไลท์แถวที่เพิ่งแก้ไขจาก URL
  const urlParams = new URLSearchParams(window.location.search);
  const editedId = urlParams.get("editedId");

  if (editedId) {
    // เราใช้ data-tor-id ในการหาแถว
    const row = document.querySelector(`tr[data-tor-id="${editedId}"]`);
    if (row) {
      console.log(`Highlighting row for TOR ID: ${editedId}`);
      // ทำให้แถวที่แก้ไขเลื่อนมาอยู่ในสายตา
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      // เพิ่ม class เพื่อให้เกิด animation
      row.classList.add("highlight-fade");
      // ลบ class ออกหลังจาก animation จบ (เผื่อมีการไฮไลท์ซ้ำ)
      setTimeout(() => {
        row.classList.remove("highlight-fade");
      }, 2500);
    }

    // 7. ล้าง parameter ออกจาก URL เพื่อให้ URL สวยงามและไม่ไฮไลท์ซ้ำเมื่อผู้ใช้รีเฟรชเอง
    history.replaceState(null, "", window.location.pathname);
  }
}

async function initPage(session) {
  console.log("🚀 กำลังเริ่มต้นหน้าเว็บด้วย session ที่พร้อมใช้งาน...");
  showLoadingOverlay();
  try {
    // ตรวจสอบ User ID
    //console.log("✅ User ID ปัจจุบัน:", session.user.id);
    const apiStatus = document.querySelector("#api-status span");

    // --- ส่วนดึง User Role (ส่วนนี้ถูกต้องแล้ว) ---
    console.log("DEBUG: 1. พยายามดึงบทบาทของผู้ใช้ (มีระบบลองใหม่)...");
    let profile = null;
    let attempts = 0;
    const maxAttempts = 5;

    while (!profile && attempts < maxAttempts) {
      attempts++;
      console.log(` > ความพยายามครั้งที่ #${attempts}`);
      const { data, error } = await _supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      console.log(`   - ความพยายามครั้งที่ #${attempts} ข้อมูล:`, data);
      console.log(`   - ความพยายามครั้งที่ #${attempts} Error:`, error);
      if (data) {
        profile = data;
      } else if (error && error.code !== "PGRST116") {
        throw error;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!profile) {
      throw new Error("ไม่สามารถดึงข้อมูลโปรไฟล์ได้หลังจากการลองหลายครั้ง");
    }
    currentUserRole = profile.role || "viewer";
    document.querySelector(
      "#render-mode span"
    ).textContent = `User Role: ${currentUserRole}`;
    console.log("DEBUG: 1. สำเร็จ - บทบาทคือ:", currentUserRole);

    // --- โหลด Master Data ---
    console.log("DEBUG: 2. Attempting to load master data...");
    await Promise.all([
      // ✅ ส่ง session ต่อไปให้ฟังก์ชันลูก
      loadAllMasterOptions(session),
      loadPresentationDates(session),
      loadLatestUpdateDate(session),
    ]);
    console.log("DEBUG: 2. SUCCESS - Master data loaded.");

    console.log("DEBUG: 3. Attempting to fetch main TORs data...");
    // ✅ ส่ง session ต่อไปให้ apiFetch
    const rawData = await apiFetch(`${API_BASE_URL}/api/tors`, session);
    console.log("DEBUG: 3. SUCCESS - Fetched", rawData.length, "TORs.");

    allTorsData = rawData.map((item) => ({
      ...item,
      tor_status_label: item.tor_status?.option_label || "N/A",
      tor_fixing_label: item.tor_fixing?.option_label || "",
    }));

    allTorsData.sort((a, b) => {
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
    restorePageState();

    const userInfoPanel = document.getElementById("user-info-panel");
    userInfoPanel.classList.remove("hidden");
    document.getElementById("user-display").textContent = session.user.email;
    document.getElementById("logout-btn").onclick = async () =>
      await _supabase.auth.signOut();
  } catch (error) {
    console.error("Failed to initialize page data:", error);
    // ... (error handling) ...
  } finally {
    hideLoadingOverlay();
  }
}

async function initializeAuthenticatedPage() {
  const {
    data: { session },
    error,
  } = await _supabase.auth.getSession();

  if (error) {
    console.error("เกิดข้อผิดพลาดในการรับ session:", error);
    alert("เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์ผู้ใช้");
    return;
  }

  if (!session) {
    console.log("ไม่พบ session ที่ใช้งานอยู่ กำลังนำไปหน้า login");
    window.location.href = "/login.html";
  } else {
    // ถ้ามี session ให้เรียกฟังก์ชันหลักของหน้าเว็บ
    initPage(session);
  }
}

async function loadPresentationDates(session) {
  const dateFilter = document.getElementById("presented-date-filter");
  if (!dateFilter) return;

  try {
    // ✅ รับข้อมูล dates ที่พร้อมใช้งานได้เลย
    // const dates = await apiFetch(
    //   "https://pcsdata.onrender.com/api/presentation/dates"
    // );

    const dates = await apiFetch(
      `${API_BASE_URL}/api/presentation/dates`,
      session
    );

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
    console.log("✅ Successfully loaded presentation dates.");
  } catch (err) {
    console.error("❌ Load presentation dates failed:", err);
    dateFilter.innerHTML =
      '<option value="">-- ไม่สามารถโหลดวันที่ --</option>';
    throw err;
  }
}

async function loadLatestUpdateDate(session) {
  try {
    // หน่วงเวลาเล็กน้อย
    await new Promise((resolve) => setTimeout(resolve, 250));

    // ✅ รับข้อมูล data ที่พร้อมใช้งานจาก apiFetch ได้เลย
    // const data = await apiFetch(
    //   "https://pcsdata.onrender.com/api/presentation/last-updated"
    // );

    const data = await apiFetch(
      `${API_BASE_URL}/api/presentation/last-updated`,
      session
    );

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
  // const tableBody = document.getElementById("tor-table-body");
  // const isAdmin = currentUserRole === "admin";

  // tableBody.innerHTML = "";
  // if (data.length === 0) {
  //   tableBody.innerHTML = `<tr><td colspan="${
  //     isAdmin ? 5 : 4
  //   }" class="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>`;
  //   return;
  // }

  // const headerRow = document.querySelector("thead tr");
  // headerRow.innerHTML = `<th class="p-4 text-center text-base font-bold text-gray-600 w-16">ลำดับ</th><th class="p-4 text-left text-base font-bold text-gray-600 w-2/5">ข้อกำหนด(TOR)</th><th class="p-4 text-center text-base font-bold text-gray-600 w-32">สถานะ</th><th class="p-4 text-center text-base font-bold text-gray-600 w-48">การแก้ไข</th>`;
  // if (isAdmin) {
  //   const actionHeader = document.createElement("th");
  //   actionHeader.className =
  //     "p-4 text-left text-base font-bold text-gray-600 w-20";
  //   actionHeader.innerText = "จัดการ";
  //   headerRow.appendChild(actionHeader);
  // }

  // data.forEach((tor, index) => {
  //   const statusLabel = tor.tor_status_label;
  //   const statusColor =
  //     statusLabel === "ผ่าน"
  //       ? "bg-green-100 text-green-800"
  //       : "bg-red-100 text-red-800";

  //   const mainRow = document.createElement("tr");
  //   mainRow.className =
  //     "main-row hover:bg-yellow-50 transition-colors duration-150";
  //   mainRow.dataset.torId = tor.tor_id;

  //   let mainRowHTML = `
  //           <td class="p-4 text-center border-b border-gray-200">${
  //             index + 1
  //           }</td>
  //           <td class="p-4 border-b border-gray-200">
  //               <a class="tor-link cursor-pointer text-blue-600 hover:underline">${
  //                 tor.tor_name
  //               }</a>
  //           </td>
  //           <td class="p-4 border-b border-gray-200 text-center">
  //               <span class="px-3 py-1 text-sm font-semibold rounded-full ${statusColor}">${statusLabel}</span>
  //           </td>
  //           <td class="p-4 border-b border-gray-200 text-center text-gray-600">${
  //             tor.tor_fixing_label
  //           }</td>
  //       `;

  //   //if (isAdmin) {
  //   //  mainRowHTML += `<td class="p-4 border-b border-gray-200 text-center"><a href="/torsedit.html?id=${tor.tor_id}" class="text-indigo-600 hover:text-indigo-900 font-semibold">[Edit]</a></td>`;
  //   // }

  //   if (isAdmin) {
  //     // ✅ เพิ่ม class="... edit-link" เข้าไป
  //     mainRowHTML += `<td class="p-4 border-b border-gray-200 text-center"><a href="/torsedit.html?id=${tor.tor_id}" class="text-indigo-600 hover:text-indigo-900 font-semibold edit-link">[Edit]</a></td>`;
  //   }

  //   mainRow.innerHTML = mainRowHTML;
  //   tableBody.appendChild(mainRow);

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
    // ✅ โค้ดส่วนนี้ถูกต้องแล้ว
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
                  // ✅ แก้ไข: ใช้ tor_id ที่ถูกต้อง
                  tor.tor_id || "undefined"
                } - ${
      // ✅ แก้ไข: ใช้ tor_name ที่ถูกต้อง
      tor.tor_name || "undefined"
    }</a>
            </td>
            <td class="p-4 border-b border-gray-200 text-center">
                <span class="px-3 py-1 text-sm font-semibold rounded-full ${statusColor}">${statusLabel}</span>
            </td>
            <td class="p-4 border-b border-gray-200 text-center text-gray-600">${
              // ✅ แก้ไข: ใช้ tor_fixing_label ที่สร้างไว้แล้ว
              tor.tor_fixing_label || "undefined"
            }</td>
        `;

    // โค้ดสำหรับปุ่ม Edit
    if (isAdmin) {
      mainRowHTML += `<td class="p-4 border-b border-gray-200 text-center"><a href="/torsedit.html?id=${tor.tor_id}" class="text-indigo-600 hover:text-indigo-900 font-semibold edit-link">[Edit]</a></td>`;
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

// ในฟังก์ชัน toggleDetails
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
      // ✅ แก้ไขให้เรียกใช้ apiFetch และรับข้อมูล details ได้เลย
      // const details = await apiFetch(
      //   `https://pcsdata.onrender.com/api/tors/${torId}`
      // );

      const details = await apiFetch(`${API_BASE_URL}/api/tors/${torId}`);

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

    // let itemsToDisplay = isAdmin
    //   ? items
    //   : items.filter((item) => item.status === 1);

    let itemsToDisplay = isAdmin
      ? items
      : items.filter(
          (item) =>
            item.feedback_status_id === "REPORT" ||
            item.worked_status_id === "REPORT"
        );

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
        // const groupKey = type === "feedback" ? "status" : "fixing";
        const groupKey = "document";
        const statusId = item.feedback_status_id || item.worked_status_id;

        // ✅ แก้ไขให้ใช้ตัวแปร masterOptions และหาจาก statusId
        const statusObj = masterOptions[groupKey]?.find(
          (opt) => opt.option_id === statusId
        );
        const statusLabel = statusObj?.option_label || `(ID: ${statusId})`;

        // const statusColor =
        //   item.status === 1 ? "text-green-600" : "text-yellow-600";

        const statusColor =
          statusId === "REPORT" ? "text-green-600" : "text-yellow-600";

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
        <div class="pt-2">
          <span class="${sectionTitleClass}">การนำเสนอ TOR:</span>
          <div class="${contentClass} mt-2">
                ${presentationHtml}
                    ${
                      isAdmin
                        ? `
                        <div class="text-center mt-4">
                            <button class="presentation-btn bg-indigo-500 text-white py-1 px-3 rounded hover:bg-indigo-600 text-xs mr-2" data-tord-id="${detail.tord_id}" data-type="นำเสนอตามกำหนดปกติ">นำเสนอตามกำหนดปกติ</button>
                            <button class="presentation-btn bg-orange-500 text-white py-1 px-3 rounded hover:bg-orange-600 text-xs" data-tord-id="${detail.tord_id}" data-type="นำเสนอแก้ไขเพิ่มเติม">นำเสนอแก้ไขเพิ่มเติม</button>
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
    const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

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
    const response = await apiFetch(`${API_BASE_URL}${endpoint}`, {
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
    const response = await apiFetch("${API_BASE_URL}/api/presentation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    // if (!response.ok) throw new Error(result.error);

    alert("บันทึกข้อมูลสำเร็จ!");
    closePresentationModal();

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

// document.addEventListener("DOMContentLoaded", () => {
//   // Setup Quill Editor
//   quillEditor = new Quill("#editor-container", {
//     modules: { toolbar: true },
//     theme: "snow",
//   });

//   // Setup Filter Event Listeners
//   document
//     .getElementById("module-filter")
//     .addEventListener("change", applyFilters);
//   document
//     .getElementById("status-filter")
//     .addEventListener("change", applyFilters);
//   document
//     .getElementById("presented-date-filter")
//     .addEventListener("change", applyFilters);
//   document.getElementById("search-box").addEventListener("input", applyFilters);

//   // Setup Main Popup Listeners
//   document
//     .getElementById("close-popup-btn")
//     .addEventListener("click", closePopup);
//   document
//     .getElementById("cancel-popup-btn")
//     .addEventListener("click", closePopup);

//   // Setup Presentation Modal Listeners
//   populateTimeDropdowns();
//   //populatePresenterDropdown(); // ✅ --- เพิ่มการเรียกใช้ฟังก์ชันที่นี่ ---
//   document
//     .getElementById("closePresentationModalBtn")
//     ?.addEventListener("click", closePresentationModal);
//   document
//     .getElementById("cancelPresentationModalBtn")
//     ?.addEventListener("click", closePresentationModal);
//   document
//     .getElementById("savePresentationBtn")
//     ?.addEventListener("click", handlePresentationSubmit);

//   // Setup Table-level event listener for dynamic content
//   document
//     .getElementById("tor-table-body")
//     .addEventListener("click", function (event) {
//       if (event.target.classList.contains("presentation-btn")) {
//         const button = event.target;
//         openPresentationModal(button.dataset.tordId, button.dataset.type);
//       }
//       // ... (เพิ่ม event listener สำหรับปุ่มอื่นๆ ใน detail row ที่นี่) ...
//     });

//   document
//     .getElementById("tor-table-body")
//     .addEventListener("click", function (event) {
//       // เช็คว่าสิ่งที่ถูกคลิกคือลิงก์ Edit ของเราหรือไม่
//       if (event.target.classList.contains("edit-link")) {
//         // หยุดการเปลี่ยนหน้าเว็บทันที
//         event.preventDefault();

//         console.log("Edit link clicked, saving page state..."); // สำหรับ Debug

//         // --- นี่คือส่วนของ Step 1 ที่เราคุยกัน ---
//         // 1. รวบรวมสถานะปัจจุบันของหน้า
//         const currentState = {
//           scrollTop: window.scrollY,
//           filters: {
//             module: document.getElementById("module-filter").value,
//             status: document.getElementById("status-filter").value,
//             presentedDate: document.getElementById("presented-date-filter")
//               .value,
//           },
//           searchTerm: document.getElementById("search-box").value,
//         };

//         // 2. บันทึกสถานะลงใน sessionStorage
//         sessionStorage.setItem("torsPageState", JSON.stringify(currentState));

//         // 3. สั่งให้เปลี่ยนหน้าไปยังลิงก์ของปุ่ม Edit ด้วยตนเอง
//         window.location.href = event.target.href;
//       }
//     });

//   // // Main Auth Listener - The single source of truth for starting the app
//   // ✅ 1. สร้าง "ธง" (flag) ขึ้นมาที่ด้านนอกของ listener
//   // let isInitialized = false;

//   // // Main Auth Listener - The single source of truth for starting the app
//   // _supabase.auth.onAuthStateChange(async (event, session) => {
//   //   // ✅ 2. เพิ่มเงื่อนไขเพื่อเช็ค "ธง" เป็นอันดับแรก
//   //   // ถ้าเคยโหลดข้อมูลแล้ว และสถานะยังเป็นล็อกอินอยู่ (SIGNED_IN) ให้ออกจากฟังก์ชันทันที
//   //   if (isInitialized && event === "SIGNED_IN") {
//   //     return;
//   //   }

//   //   if (session) {
//   //     // โค้ดส่วนนี้จะทำงานแค่ครั้งแรกที่โหลดหน้าเว็บ
//   //     await initPage(session);

//   //     // ✅ 3. "ปักธง" ว่าได้โหลดข้อมูลเรียบร้อยแล้ว
//   //     isInitialized = true;
//   //   } else {
//   //     // ถ้าไม่มี session หรือ logout ให้ reset ธง และไปหน้า login
//   //     isInitialized = false;
//   //     window.location.href = "/login.html";
//   //   }
//   // });

//   // ใน tors.js (ท้ายไฟล์)

//   let isInitialized = false;

//   _supabase.auth.onAuthStateChange(async (event, session) => {
//     // ✅ ตรวจสอบธงก่อนเป็นอันดับแรกเสมอ
//     // เราจะสนใจแค่ event ครั้งแรกที่เจอ session เท่านั้น
//     if (isInitialized) {
//       return;
//     }

//     if (session) {
//       // ✅ ปักธงทันที! ก่อนที่จะเริ่มโหลดข้อมูล
//       isInitialized = true;

//       // เรียกใช้ initPage (ซึ่งจะใช้เวลาสักพัก)
//       await initPage(session);
//     } else {
//       // ถ้าไม่มี session หรือ logout ให้ reset ธง และไปหน้า login
//       isInitialized = false;
//       window.location.href = "/login.html";
//     }
//   });
// });

initializeAuthenticatedPage();
