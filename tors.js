// tors.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.35.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// จากตรงนี้ลงไปคือโค้ดที่เตอร์แนบมาทั้งหมด
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let allTorsData = [];
let currentUserRole = 'viewer';
let quillEditor;

        // --- 2. FUNCTIONS (ประกาศทั้งหมดก่อนเรียกใช้) ---
        
    async function initPage(session) {
    const authStatus = document.querySelector('#auth-status span');
    const sessionStatus = document.querySelector('#session-status span');
    const apiStatus = document.querySelector('#api-status span');
    const renderMode = document.querySelector('#render-mode span');

    authStatus.textContent = 'Event: ' + session.event;
    authStatus.className = 'text-green-400';

    if (session) {
        sessionStatus.textContent = 'YES (User ID: ' + session.user.id.substring(0, 8) + '...)';
        sessionStatus.className = 'text-green-400';
    } else {
        sessionStatus.textContent = 'NO (Session is null)';
        sessionStatus.className = 'text-red-400';
        // ถ้าไม่มี session ก็ไม่ต้องทำอะไรต่อ
        return;
    }

    try {
        const { data: profile } = await _supabase.from('profiles').select('role').eq('id', session.user.id).single();
        if (profile) currentUserRole = profile.role;
        renderMode.textContent = `User Role: ${currentUserRole}`;
        renderMode.className = 'text-cyan-400';
    } catch (e) {
        console.error("Could not fetch user role", e);
        renderMode.textContent = 'Error fetching role';
        renderMode.className = 'text-red-400';
    }
    
    const userInfoPanel = document.getElementById('user-info-panel');
    userInfoPanel.classList.remove('hidden');
    document.getElementById('user-display').textContent = session.user.email;
    document.getElementById('logout-btn').onclick = async () => await _supabase.auth.signOut();

    try {
        apiStatus.textContent = 'Fetching from API...';
        apiStatus.className = 'text-yellow-400';
        const response = await fetch('https://pcsdata.onrender.com/api/tors');
        if (!response.ok) throw new Error('Network response was not ok');
        allTorsData = await response.json();
        
        apiStatus.textContent = `Success - Fetched ${allTorsData.length} records.`;
        apiStatus.className = 'text-green-400';

        allTorsData.sort((a, b) => a.tor_id.localeCompare(b.tor_id));
        populateFilters(allTorsData);
        applyFilters();

    } catch (error) {
        apiStatus.textContent = `Error: ${error.message}`;
        apiStatus.className = 'text-red-400';
        document.getElementById('tor-table-body').innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
    }

    console.log('📡 กำลัง fetch API...');
try {
  const response = await fetch('https://pcsdata.onrender.com/api/tors');
  console.log('✅ fetch success?', response.ok, response.status);
  const json = await response.json();
  console.log('📦 Data:', json.slice(0, 2)); // ตัวอย่าง
} catch (error) {
  console.error('❌ Fetch failed:', error);
}
}

        function populateFilters(data) {
            const moduleObjects = [...new Map(data.map(item => [item.Modules.module_id, item.Modules.module_name])).entries()];
            moduleObjects.sort((a, b) => a[0].localeCompare(b[0]));
            const statuses = [...new Set(data.map(item => item.tor_status).filter(s => s))].sort();
            
            const moduleFilter = document.getElementById('module-filter');
            moduleFilter.innerHTML = '<option value="all">ระบบงานทั้งหมด</option>';
            moduleObjects.forEach(([id, name]) => moduleFilter.innerHTML += `<option value="${name}">${name}</option>`);

            const statusFilter = document.getElementById('status-filter');
            statusFilter.innerHTML = '<option value="all">ทุกสถานะ</option>';
            statuses.forEach(s => statusFilter.innerHTML += `<option value="${s}">${s}</option>`);
        }
        
        function applyFilters() {
            const moduleValue = document.getElementById('module-filter').value;
            const statusValue = document.getElementById('status-filter').value;
            const searchValue = document.getElementById('search-box').value.trim().toLowerCase();

            let filteredData = allTorsData.filter(item => {
                const moduleMatch = (moduleValue === 'all') || (item.Modules?.module_name === moduleValue);
                const statusMatch = (statusValue === 'all') || (item.tor_status === statusValue);
                const searchString = `${item.tor_id || ''} ${item.Modules?.module_name || ''} ${item.tor_name || ''} ${item.tor_status || ''} ${item.tor_fixing || ''}`.toLowerCase();
                const searchMatch = !searchValue || searchString.includes(searchValue);
                return moduleMatch && statusMatch && searchMatch;
            });
            renderTable(filteredData);
        }

        function renderTable(data) {
            const tableBody = document.getElementById('tor-table-body');
            const isAdmin = currentUserRole === 'admin';
            let latestDate = null;
            
            tableBody.innerHTML = '';
            if (data.length === 0) {
                 tableBody.innerHTML = `<tr><td colspan="${isAdmin ? 5 : 4}" class="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>`;
                 return;
            }

            const headerRow = document.querySelector('thead tr');
            headerRow.innerHTML = `<th class="p-4 text-center text-base font-bold text-gray-600 w-16">ลำดับ</th><th class="p-4 text-left text-base font-bold text-gray-600 w-2/5">ข้อกำหนด(TOR)</th><th class="p-4 text-center text-base font-bold text-gray-600 w-32">สถานะ</th><th class="p-4 text-center text-base font-bold text-gray-600 w-48">การแก้ไข</th>`;
            if (isAdmin) {
                const actionHeader = document.createElement('th');
                actionHeader.className = 'p-4 text-left text-base font-bold text-gray-600 w-20';
                actionHeader.innerText = 'จัดการ';
                headerRow.appendChild(actionHeader);
            }

            data.forEach((tor, index) => {
                const torDate = new Date(tor.created_at);
                if (!latestDate || torDate > latestDate) latestDate = torDate;

                const mainRow = document.createElement('tr');
                mainRow.className = 'main-row';
                mainRow.dataset.torId = tor.tor_id;
                let mainRowHTML = `
                    <td class="p-4 text-center border-b border-gray-200">${index + 1}</td>
                    <td class="p-4 border-b border-gray-200"><a class="tor-link cursor-pointer">${tor.tor_name}</a></td>
                    <td class="p-4 border-b border-gray-200 text-center"><span class="px-3 py-1 text-sm font-semibold rounded-full ${tor.tor_status === 'ผ่าน' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${tor.tor_status || 'N/A'}</span></td>
                    <td class="p-4 border-b border-gray-200 text-center text-gray-600">${tor.tor_fixing || ''}</td>
                `;
                if(isAdmin) {
                    mainRowHTML += `<td class="p-4 border-b border-gray-200 text-center"><a href="/torsedit.html?id=${tor.tor_id}" class="text-indigo-600 hover:text-indigo-900 font-semibold">[Edit]</a></td>`;
                }
                mainRow.innerHTML = mainRowHTML;
                tableBody.appendChild(mainRow);
                
                const detailsRow = document.createElement('tr');
                detailsRow.className = 'details-row';
                detailsRow.innerHTML = `<td colspan="${isAdmin ? 5 : 4}" class="p-0"><div class="bg-white p-4 text-sm">กำลังโหลดรายละเอียด...</div></td>`;
                tableBody.appendChild(detailsRow);

                mainRow.addEventListener('click', (event) => {
                    if (event.target.tagName !== 'A' || event.target.classList.contains('tor-link')) {
                       event.preventDefault();
                       toggleDetails(detailsRow, mainRow, tor.tor_id);
                    }
                });
            });

            if (latestDate) {
                document.getElementById('last-updated').textContent = `ข้อมูลอัปเดตล่าสุด: ${latestDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`;
            }
            
            scrollToTorFromHash(); 
        }
        
        async function toggleDetails(detailsRow, mainRow, torId) {
            const isOpen = detailsRow.classList.toggle('is-open');
            mainRow.classList.toggle('is-active');

            document.querySelectorAll('.details-row').forEach(row => {
                if(row !== detailsRow) {
                    row.classList.remove('is-open');
                    if(row.previousElementSibling) row.previousElementSibling.classList.remove('is-active');
                }
            });
            
            if (isOpen) {
                const detailCell = detailsRow.querySelector('td > div');
                detailCell.innerHTML = `<div class="bg-yellow-50/70 p-6">กำลังโหลด...</div>`;
                try {
                    const res = await fetch(`https://pcsdata.onrender.com/api/tors/${torId}`);
                    const details = await res.json();
                    detailCell.innerHTML = createDetailContent(details); 
                    addDetailEventListeners(details);
                } catch(e) {
                    detailCell.innerHTML = `<div class="bg-red-100 text-red-800 p-4">เกิดข้อผิดพลาดในการโหลดรายละเอียด</div>`;
                }
            }
        }
        
        function createDetailContent(details) {
            const detail = details.TORDetail && details.TORDetail[0] ? details.TORDetail[0] : null;
            if (!detail) return '<div class="p-6 bg-gray-50">ไม่มีข้อมูลรายละเอียดเพิ่มเติม</div>';
            
            const isAdmin = currentUserRole === 'admin';
            
            // --- ส่วนแก้ไข: เพิ่มการเรียงข้อมูลในฟังก์ชันนี้ ---
            const createItemList = (items, type) => {
                if (!items || items.length === 0) {
                    return '<li>ไม่มีข้อมูล</li>';
                }
                let itemsToDisplay = isAdmin ? items : items.filter(item => item.status === 1);
                
                // --- เพิ่มส่วนนี้เพื่อเรียงข้อมูล ---
                itemsToDisplay.sort((a, b) => {
                    const dateA = new Date(a.feedback_date || a.worked_date);
                    const dateB = new Date(b.feedback_date || b.worked_date);
                    return dateB - dateA; // เรียงจากใหม่ไปเก่า (Descending)
                });
                // --- สิ้นสุดส่วนการเรียงข้อมูล ---

                if (itemsToDisplay.length === 0) {
                    return isAdmin ? '<li>ยังไม่มีข้อมูล, คลิกปุ่ม +เพิ่ม เพื่อสร้างรายการแรก</li>' : '<li>ไม่มีรายการสำหรับแสดงผล</li>';
                }

                return itemsToDisplay.map(item => {
                    const message = item.feedback_message || item.worked_message;
                    const date = new Date(item.feedback_date || item.worked_date);
                    const formattedDate = date.toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' });
                    const statusText = item.status === 1 ? 'แสดงในรายงาน' : 'ร่าง';
                    const statusColor = item.status === 1 ? 'text-green-600' : 'text-yellow-600';
                    const recordId = item.feedback_id || item.worked_id;

                    return `
                        <li class="flex justify-between items-start py-3" data-record-id="${recordId}">
                            <div class="flex-1 space-y-1">
                                <div class="prose prose-sm max-w-none">${message}</div>
                                <div class="text-xs text-gray-500">วันที่: ${formattedDate}</div>
                            </div>
                            <div class="flex items-center ml-4 flex-shrink-0">
                                ${isAdmin ? `
                                    <div class="text-right">
                                        <span class="text-xs font-semibold mr-3 ${statusColor}">(${statusText})</span>
                                    </div>
                                    <div class="relative inline-block text-left dropdown ml-2">
                                        <button class="text-gray-400 hover:text-black p-1 text-xs dropdown-toggle"> <i class="fas fa-ellipsis-v"></i> </button>
                                        <div class="dropdown-menu hidden origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                                            <div class="py-1" role="menu" aria-orientation="vertical">
                                                <a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 edit-item-btn" data-type="${type}" data-record-id="${recordId}">แก้ไขรายการ</a>
                                                <a href="#" class="block px-4 py-2 text-sm text-red-700 hover:bg-gray-100 delete-item-btn" data-type="${type}" data-record-id="${recordId}">ลบรายการนี้</a>
                                            </div>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        </li>
                    `;
                }).join('<hr class="border-yellow-200/60 my-1">');
            };

            const feedbackHtml = createItemList(detail.PATFeedback, 'feedback');
            const workedHtml = createItemList(detail.PCSWorked, 'worked');

            const sectionTitleClass = 'text-sm font-bold text-gray-700 bg-yellow-200/80 px-3 py-1 rounded-full inline-block mb-2';
            const contentClass = 'prose prose-sm max-w-none text-gray-800 [&_a]:text-blue-600 [&_a:hover]:underline';

            return `
                <div class="bg-yellow-50/70 border-l-4 border-yellow-400 p-6 space-y-5 text-base">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 pb-5 border-b border-yellow-200/60">
                        <div><span class="${sectionTitleClass}">ทำได้:</span><div class="${contentClass} mt-2">${detail.tord_posible || '(ไม่มีข้อมูล)'}</div></div>
                        <div><span class="${sectionTitleClass}">เล่มเอกสาร:</span><div class="${contentClass} mt-2">${detail.tord_document || '(ไม่มีข้อมูล)'}</div></div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 py-5 border-b border-yellow-200/60">
                         <div><span class="${sectionTitleClass}">เอกสารอ้างอิง:</span><div class="${contentClass} mt-2">${detail.tord_reference || '(ไม่มีข้อมูล)'}</div></div>
                        <div><span class="${sectionTitleClass}">หัวข้อที่นำเสนอ:</span><div class="${contentClass} mt-2">${detail.tord_header || '(ไม่มีข้อมูล)'}</div></div>
                    </div>
                    <div class="py-5 border-b border-yellow-200/60"><span class="${sectionTitleClass}">Prototype:</span><div class="${contentClass} mt-2">${detail.tord_prototype || '(ไม่มีข้อมูล)'}</div></div>
                    <div class="pt-4">
                        <div class="flex justify-between items-center mb-2">
                            <span class="${sectionTitleClass}">ข้อเสนอแนะคณะกรรมการ:</span>
                            ${isAdmin ? `<button class="add-item-btn text-xs bg-green-500 text-white py-1 px-3 rounded-md hover:bg-green-600" data-type="feedback" data-tord-id="${detail.tord_id}"><i class="fas fa-plus mr-1"></i>เพิ่ม</button>` : ''}
                        </div>
                        <ul class="pl-2 space-y-1">${feedbackHtml}</ul>
                    </div>
                    <div class="pt-2">
                        <div class="flex justify-between items-center mb-2">
                            <span class="${sectionTitleClass}">รายละเอียดการแก้ไข:</span>
                            ${isAdmin ? `<button class="add-item-btn text-xs bg-blue-500 text-white py-1 px-3 rounded-md hover:bg-blue-600" data-type="worked" data-tord-id="${detail.tord_id}"><i class="fas fa-plus mr-1"></i>เพิ่ม</button>` : ''}
                        </div>
                        <ul class="pl-2 space-y-1">${workedHtml}</ul>
                    </div>
                </div>
            `;
        }

        function addDetailEventListeners(details) {
            const detailElement = document.querySelector(`.details-row.is-open`);
            if (!detailElement) return;

            detailElement.querySelectorAll('.add-item-btn').forEach(button => {
                button.onclick = () => openPopup(button.dataset.type, button.dataset.tordId);
            });
            
            detailElement.querySelectorAll('.dropdown-toggle').forEach(button => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    document.querySelectorAll('.dropdown-menu').forEach(menu => {
                        if(menu !== button.nextElementSibling) menu.classList.add('hidden');
                    });
                    button.nextElementSibling.classList.toggle('hidden');
                });
            });

            detailElement.querySelectorAll('.edit-item-btn').forEach(button => {
                const type = button.dataset.type;
                const recordId = button.dataset.recordId;
                const items = type === 'feedback' ? details.TORDetail[0].PATFeedback : details.TORDetail[0].PCSWorked;
                const recordData = items.find(item => (item.feedback_id || item.worked_id) == recordId);
                button.onclick = (e) => {
                    e.preventDefault();
                    openPopup(type, details.TORDetail[0].tord_id, recordData);
                };
            });

            detailElement.querySelectorAll('.delete-item-btn').forEach(button => {
                 button.onclick = (e) => {
                    e.preventDefault();
                    if(confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
                        handleDelete(button.dataset.type, button.dataset.recordId);
                    }
                };
            });
        }
        
        function openPopup(type, tordId, existingData = null) {
            const modal = document.getElementById('popup-modal');
            const title = document.getElementById('popup-title');
            
            if (!quillEditor) {
                 quillEditor = new Quill('#editor-container', { 
                    modules: { toolbar: [[ 'bold', 'italic', 'underline' ], [{ 'list': 'bullet' }], ['link', 'image']] },
                    theme: 'snow' 
                });
            }
            
            if (existingData) {
                title.textContent = type === 'feedback' ? 'แก้ไขข้อเสนอแนะ' : 'แก้ไขรายละเอียดการทำงาน';
                quillEditor.root.innerHTML = existingData.feedback_message || existingData.worked_message;
                document.getElementById('popup-status').value = existingData.status;
            } else {
                title.textContent = type === 'feedback' ? 'เพิ่มข้อเสนอแนะใหม่' : 'เพิ่มรายละเอียดการทำงานใหม่';
                quillEditor.root.innerHTML = '';
                document.getElementById('popup-status').value = 0;
            }

            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.remove('opacity-0'), 10);
            modal.querySelector('.popup-content').classList.remove('scale-95');
            
            document.getElementById('save-popup-btn').onclick = () => {
                handleSave(type, tordId, existingData);
            };
        };
        
        function closePopup() {
            const modal = document.getElementById('popup-modal');
            modal.classList.add('opacity-0');
            modal.querySelector('.popup-content').classList.add('scale-95');
            setTimeout(() => modal.classList.add('hidden'), 300);
        }

        async function handleSave(type, tordId, existingData) {
            const content = quillEditor.root.innerHTML;
            const status = parseInt(document.getElementById('popup-status').value);
            const { data: { session } } = await _supabase.auth.getSession();

            let endpoint = '';
            let body = {};
            let method = '';
            const recordId = existingData ? (existingData.feedback_id || existingData.worked_id) : null;

            if (type === 'feedback') {
                endpoint = existingData ? `/api/feedback/${recordId}` : '/api/feedback';
                body = existingData ? { feedback_message: content, status } : { tord_id: tordId, feedback_message: content, status };
                method = existingData ? 'PUT' : 'POST';
            } else {
                endpoint = existingData ? `/api/worked/${recordId}` : '/api/worked';
                body = existingData ? { worked_message: content, status } : { tord_id: tordId, worked_message: content, status };
                method = existingData ? 'PUT' : 'POST';
            }
            
            try {
                const response = await fetch(`https://pcsdata.onrender.com${endpoint}`, {
                    method: method,
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to save data');
                }
                
                closePopup();
                const openDetailsRow = document.querySelector('.details-row.is-open');
                if (openDetailsRow) {
                    const mainRow = openDetailsRow.previousElementSibling;
                    const torId = mainRow.dataset.torId;
                    if(torId) {
                        toggleDetails(openDetailsRow, mainRow, torId); 
                        toggleDetails(openDetailsRow, mainRow, torId);
                    }
                }
                 alert('บันทึกข้อมูลสำเร็จ!');

            } catch (error) {
                console.error('Save failed:', error);
                alert(`เกิดข้อผิดพลาด: ${error.message}`);
            }
        }

        async function handleDelete(type, recordId) {
             const { data: { session } } = await _supabase.auth.getSession();
             const endpoint = `/api/${type}/${recordId}`;

             try {
                const response = await fetch(`https://pcsdata.onrender.com${endpoint}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to delete data');
                }
                alert('ลบข้อมูลสำเร็จ!');
                const openDetailsRow = document.querySelector('.details-row.is-open');
                if (openDetailsRow) {
                    const mainRow = openDetailsRow.previousElementSibling;
                    const torId = mainRow.dataset.torId;
                    if(torId) {
                         toggleDetails(openDetailsRow, mainRow, torId); 
                         toggleDetails(openDetailsRow, mainRow, torId); 
                    }
                }
             } catch(error) {
                console.error('Delete failed:', error);
                alert(`เกิดข้อผิดพลาด: ${error.message}`);
             }
        }
        
        function scrollToTorFromHash() {
            const hash = window.location.hash;
            if (hash) {
                const torId = hash.substring(1); // ตัดเครื่องหมาย # ออก
                const targetRow = document.querySelector(`tr[data-tor-id="${torId}"]`);
                
                if (targetRow) {
                    // เลื่อนหน้าจอไปที่แถวนั้น
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // เพิ่ม Highlight ชั่วคราวเพื่อให้สังเกตง่าย
                    targetRow.style.backgroundColor = '#fffde7'; // สีเหลืองอ่อน
                    setTimeout(() => {
                        targetRow.style.backgroundColor = ''; // เอากลับเป็นสีเดิม
                    }, 2500); // ค้างไว้ 2.5 วินาที
                }
            }
        }

        // --- Initialization and Event Listeners ---
        document.addEventListener('DOMContentLoaded', () => {
            quillEditor = new Quill('#editor-container', { 
                modules: { toolbar: true }, 
                theme: 'snow' 
            });
            
            document.getElementById('module-filter').addEventListener('change', applyFilters);
            document.getElementById('status-filter').addEventListener('change', applyFilters);
            document.getElementById('search-box').addEventListener('input', applyFilters);
            document.getElementById('close-popup-btn').addEventListener('click', closePopup);
            document.getElementById('cancel-popup-btn').addEventListener('click', closePopup);
            
            _supabase.auth.onAuthStateChange((_event, session) => {
                if (session) {
                    initPage(session);
                } else {
                    window.location.href = '/login.html';
                }
            });
        });

        document.body.addEventListener('click', function(event) {
            if (!event.target.closest('.dropdown')) {
                document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.add('hidden'));
            }
        });
    