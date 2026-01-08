// State
let mapObjects = []; 
let guests = [];
let appState = { scale: 1, panX: 0, panY: 0, locked: false, viewMode: 'assign', currentStep: 2, toolMode: 'select', selectedIds: [], snapToGrid: false, isSpaceDown: false }; // 'assign' or 'layout'
let editingObjectId = null;
let historyStack = [];
let redoStack = [];

// Constants
const SIZES = {
    table: {
        assign: { w: 240, h: 240 }, // Standard Table (Large)
        seating: { w: 160, h: 160 }, // Seating Mode (Medium)
        layout: { w: 80, h: 80 }    // Standard Table (Small)
    },
    'main-table': {
        assign: { w: 300, h: 300 }, // Main Table (Extra Large)
        seating: { w: 300, h: 300 },
        layout: { w: 120, h: 120 }  // Main Table (Medium Circle)
    }
};
const ASSIGN_SCALE = 2.5; // Scale factor for Assign Mode
const SEATING_SCALE = 3.0; // Scale factor for Seating Mode (Needs more space)

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocal();
    setupCanvasEvents();
    
    // 修正：在此處為側邊欄加上監聽器
    const sidebar = document.getElementById('unseatedList');
    sidebar.addEventListener('dragover', e => e.preventDefault());
    sidebar.addEventListener('drop', e => dropGuest(e, null));
    
    const sidebarSeating = document.getElementById('seatingUnseatedList');
    if(sidebarSeating) sidebarSeating.addEventListener('dragover', e => e.preventDefault());
    if(sidebarSeating) sidebarSeating.addEventListener('drop', e => dropGuest(e, null));

    renderAll();
    updateStats();

    // Keyboard Shortcuts for Undo/Redo
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            redo();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (appState.selectedIds.length > 0) {
                e.preventDefault();
                deleteObject();
            }
        } else if (e.code === 'Space' && !e.repeat) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            appState.isSpaceDown = true;
            document.getElementById('floorCanvas').style.cursor = 'grab';
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            appState.isSpaceDown = false;
            const canvas = document.getElementById('floorCanvas');
            canvas.style.cursor = appState.toolMode === 'pan' ? 'grab' : 'default';
        }
    });
});

// --- History System ---
function recordState() {
    // Call this BEFORE making changes to mapObjects or guests
    const state = JSON.stringify({ mapObjects, guests });
    historyStack.push(state);
    if (historyStack.length > 50) historyStack.shift(); // Limit history
    redoStack = []; // Clear redo on new action
    updateHistoryButtons();
}

function undo() {
    if (historyStack.length === 0) return;
    const currentState = JSON.stringify({ mapObjects, guests });
    redoStack.push(currentState);
    
    const prevState = JSON.parse(historyStack.pop());
    mapObjects = prevState.mapObjects;
    guests = prevState.guests;
    
    renderAll(); updateStats(); saveToLocal(); updateHistoryButtons();
}

function redo() {
    if (redoStack.length === 0) return;
    const currentState = JSON.stringify({ mapObjects, guests });
    historyStack.push(currentState);
    
    const nextState = JSON.parse(redoStack.pop());
    mapObjects = nextState.mapObjects;
    guests = nextState.guests;
    
    renderAll(); updateStats(); saveToLocal(); updateHistoryButtons();
}

function updateHistoryButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    
    if (historyStack.length > 0) {
        btnUndo.disabled = false;
        btnUndo.classList.remove('text-gray-400', 'cursor-not-allowed');
        btnUndo.classList.add('text-gray-700', 'hover:bg-gray-200');
    } else {
        btnUndo.disabled = true;
        btnUndo.classList.add('text-gray-400', 'cursor-not-allowed');
        btnUndo.classList.remove('text-gray-700', 'hover:bg-gray-200');
    }

    if (redoStack.length > 0) {
        btnRedo.disabled = false;
        btnRedo.classList.remove('text-gray-400', 'cursor-not-allowed');
        btnRedo.classList.add('text-gray-700', 'hover:bg-gray-200');
    } else {
        btnRedo.disabled = true;
        btnRedo.classList.add('text-gray-400', 'cursor-not-allowed');
        btnRedo.classList.remove('text-gray-700', 'hover:bg-gray-200');
    }
}

// --- Tool Mode ---
function setTool(mode) {
    appState.toolMode = mode;
    const btnSelect = document.getElementById('btn-tool-select');
    const btnPan = document.getElementById('btn-tool-pan');
    if (mode === 'select') {
        btnSelect.classList.add('shadow', 'bg-white', 'text-blue-600'); btnSelect.classList.remove('text-gray-500', 'hover:bg-gray-200');
        btnPan.classList.remove('shadow', 'bg-white', 'text-blue-600'); btnPan.classList.add('text-gray-500', 'hover:bg-gray-200');
    } else {
        btnPan.classList.add('shadow', 'bg-white', 'text-blue-600'); btnPan.classList.remove('text-gray-500', 'hover:bg-gray-200');
        btnSelect.classList.remove('shadow', 'bg-white', 'text-blue-600'); btnSelect.classList.add('text-gray-500', 'hover:bg-gray-200');
    }
}

// --- Step Logic (Wizard) ---
function setStep(step) {
    appState.currentStep = step;
    
    // Update UI Tabs
    document.querySelectorAll('.step-tab').forEach(b => {
        b.classList.remove('text-blue-600', 'border-blue-600', 'bg-white');
        b.classList.add('text-gray-500', 'border-transparent');
    });
    const activeTab = document.getElementById(`tab-step-${step}`);
    if(activeTab) {
        activeTab.classList.add('text-blue-600', 'border-blue-600', 'bg-white');
        activeTab.classList.remove('text-gray-500', 'border-transparent');
    }

    // Toggle Sidebar Panels based on Step
    ['panel-step-1', 'panel-step-2', 'panel-step-3'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    // Logic per step
    if (step === 1) {
        setViewMode('layout');
        document.getElementById('panel-step-1').classList.remove('hidden');
    } else if (step === 2) {
        setViewMode('assign');
        document.getElementById('panel-step-2').classList.remove('hidden');
    } else if (step === 3) {
        setViewMode('seating');
        document.getElementById('panel-step-3').classList.remove('hidden');
        renderSeatingPanel(); // Initial render
    }
}

// --- View Mode Logic ---
function setViewMode(mode, isRestoring = false) {
    if (!isRestoring && appState.viewMode === mode) return;

    let baseFocusX = 0, baseFocusY = 0;

    // 1. Revert current mode to Base (Layout) coordinates & Calculate Focus
    if (!isRestoring) {
        const currentScaleFactor = (appState.viewMode === 'assign') ? ASSIGN_SCALE : (appState.viewMode === 'seating' ? SEATING_SCALE : 1);
        
        // Calculate current center of view in Base Coords
        const viewCx = -appState.panX / appState.scale;
        const viewCy = -appState.panY / appState.scale;
        baseFocusX = viewCx / currentScaleFactor;
        baseFocusY = viewCy / currentScaleFactor;

        mapObjects.forEach(o => {
            // Restore from ox/oy if they exist, otherwise calculate back
            if (o.ox !== undefined) {
                o.x = o.ox; o.y = o.oy;
                delete o.ox; delete o.oy;
            } else {
                const cx = o.x + o.width / 2;
                const cy = o.y + o.height / 2;
                const baseCx = cx / currentScaleFactor;
                const baseCy = cy / currentScaleFactor;
                // Temporarily set size to layout for correct centering
                const baseW = SIZES[o.type] ? SIZES[o.type].layout.w : o.width;
                const baseH = SIZES[o.type] ? SIZES[o.type].layout.h : o.height;
                o.x = baseCx - baseW / 2;
                o.y = baseCy - baseH / 2;
            }
        });
    }

    // 2. Apply new mode scaling
    appState.viewMode = mode;
    const newScaleFactor = (mode === 'assign') ? ASSIGN_SCALE : (mode === 'seating' ? SEATING_SCALE : 1);

    mapObjects.forEach(o => {
        // Determine new size
        const oldBaseW = SIZES[o.type] ? SIZES[o.type].layout.w : o.width;
        const oldBaseH = SIZES[o.type] ? SIZES[o.type].layout.h : o.height;
        
        if (SIZES[o.type]) {
            o.width = SIZES[o.type][mode].w;
            o.height = SIZES[o.type][mode].h;
        }

        if (!isRestoring && newScaleFactor !== 1) {
            // Save Base
            o.ox = o.x; o.oy = o.y;
            
            // Calculate Scaled Center from Base Center
            const cx = o.x + oldBaseW / 2;
            const cy = o.y + oldBaseH / 2;
            const newCx = cx * newScaleFactor;
            const newCy = cy * newScaleFactor;
            
            o.x = newCx - o.width / 2;
            o.y = newCy - o.height / 2;
        }
    });

    // 3. Post-processing
    if (mode === 'layout') { // 佈置模式預設開啟吸附格點
        appState.snapToGrid = true;
        const cb = document.getElementById('snapGrid'); if(cb) cb.checked = true;
    }
    
    renderAll();
    if (!isRestoring) {
        // Restore Focus (Pan to new center) instead of autoFitZoom
        const newFocusX = baseFocusX * newScaleFactor;
        const newFocusY = baseFocusY * newScaleFactor;
        
        appState.panX = -newFocusX * appState.scale;
        appState.panY = -newFocusY * appState.scale;
        
        updateTransform();
        saveToLocal();
    }
}

// --- Seating Panel Logic (Step 3) ---
function renderSeatingPanel() {
    // Only run if we are in Step 3
    if (appState.currentStep !== 3) return;

    const title = document.getElementById('seatingTitle');
    const subtitle = document.getElementById('seatingSubtitle');
    const list = document.getElementById('seatingList');
    list.innerHTML = '';

    if (appState.selectedIds.length === 1) {
        const obj = mapObjects.find(o => o.id === appState.selectedIds[0]);
        if (obj && (obj.type === 'table' || obj.type === 'main-table')) {
            title.innerText = obj.name;
            subtitle.innerText = `座位數: ${obj.capacity || 10} | 已入座: ${guests.filter(g => g.tableId === obj.id && g.seatIndex !== undefined).length}`;
            
            const tableGuests = guests.filter(g => g.tableId === obj.id);
            if (tableGuests.length === 0) {
                list.innerHTML = '<div class="text-center text-gray-400 text-xs mt-4">此桌尚無貴賓</div>';
            } else {
                tableGuests.forEach(g => {
                    // Reuse createGuestElement but maybe style it differently if seated?
                    // For now, just show them. Dragging them works the same.
                    const el = createGuestElement(g, g.seatIndex !== undefined);
                    // Add visual indicator for seat number if seated
                    if (g.seatIndex !== undefined) {
                        const badge = document.createElement('span');
                        badge.className = 'ml-2 bg-blue-100 text-blue-800 text-[10px] px-1.5 rounded-full font-bold';
                        badge.innerText = `#${g.seatIndex + 1}`;
                        el.querySelector('.truncate').appendChild(badge);
                    }
                    list.appendChild(el);
                });
            }
            return;
        }
    }
    
    // Default state (no selection or multiple)
    title.innerText = "請選擇桌子";
    subtitle.innerText = "點擊地圖上的桌子以編輯座位";
    list.innerHTML = '<div class="text-center text-gray-300 text-4xl mt-10"><i class="fa-solid fa-arrow-pointer"></i></div>';
}

function saveToLocal() {
    localStorage.setItem('seatingMasterData', JSON.stringify({ mapObjects, guests, appState }));
    const s = document.getElementById('saveStatus');
    s.innerText = "已儲存 " + new Date().toLocaleTimeString();
    s.classList.add('text-green-600');
    setTimeout(() => s.classList.remove('text-green-600'), 1000);
}

function loadFromLocal() {
    const raw = localStorage.getItem('seatingMasterData');
    if (raw) {
        try {
            const data = JSON.parse(raw);
            mapObjects = data.mapObjects || [];
            guests = data.guests || [];
            mapObjects.forEach(o => { if(!o.capacity) o.capacity = 10; }); // Migration
            if(data.appState) {
                appState.scale = data.appState.scale || 1;
                appState.panX = data.appState.panX || 0;
                appState.panY = data.appState.panY || 0;
                
                // 修正：在設定步驟前先還原 viewMode，避免座標換算錯誤導致物件內縮
                if (data.appState.viewMode) appState.viewMode = data.appState.viewMode;
                
                // Restore Step based on saved viewMode or default to 2
                let step = 2;
                if (data.appState.currentStep && data.appState.currentStep <= 3) step = data.appState.currentStep;
                setStep(step);

                if(data.appState.toolMode) setTool(data.appState.toolMode);
                if(data.appState.snapToGrid !== undefined) {
                    appState.snapToGrid = data.appState.snapToGrid;
                    const cb = document.getElementById('snapGrid'); if(cb) cb.checked = appState.snapToGrid;
                }
                updateTransform();
            }
        } catch(e) { console.error(e); }
    } else {
        addMapObject('stage', -200, -100); // Center stage (width 400) at x=0
        generateGridTables();
        setStep(1); // Default to Layout for new project
    }
}

function resetData() {
    if(confirm('清空所有資料？')) {
        localStorage.removeItem('seatingMasterData');
        location.reload();
    }
}

// --- Core Logic ---
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

function addMapObject(type, x, y, isBatch = false) {
    if(!isBatch) recordState();
    if (x === undefined) {
        // Spawn at center of view (0,0 relative to layer origin + pan)
        x = -appState.panX / appState.scale;
        y = -appState.panY / appState.scale;
    }
    const id = genId();
    let newObj = { id, type, x, y, width: 180, height: 180, name: '', capacity: 10, vertical: false };

    if (SIZES[type]) {
        // Use size based on current mode
        const size = SIZES[type][appState.viewMode];
        newObj.width = size.w;
        newObj.height = size.h;
        if (type === 'table') newObj.name = `第 ${mapObjects.filter(o=>o.type==='table').length + 1} 桌`;
        else newObj.name = '主桌';
    } else if (type === 'stage') {
        newObj.name = '舞 台 STAGE'; newObj.width = 400; newObj.height = 60;
    } else if (type === 'label') {
        newObj.name = '入口處'; newObj.width = 120; newObj.height = 40;
    }
    mapObjects.push(newObj);
    
    if (appState.viewMode !== 'layout') {
        const scale = appState.viewMode === 'assign' ? ASSIGN_SCALE : SEATING_SCALE;
        const cx = newObj.x + newObj.width / 2;
        const cy = newObj.y + newObj.height / 2;
        const lw = SIZES[type] ? SIZES[type].layout.w : newObj.width;
        const lh = SIZES[type] ? SIZES[type].layout.h : newObj.height;
        newObj.ox = (cx / scale) - lw / 2;
        newObj.oy = (cy / scale) - lh / 2;
    }

    if(!isBatch) {
        renderAll();
        saveToLocal();
    }
    return newObj;
}

function generateGridTables() {
    recordState();
    const cols = parseInt(document.getElementById('colsInput').value) || 4;
    const rows = parseInt(document.getElementById('rowsInput').value) || 3;
    const gap = parseInt(document.getElementById('gapInput').value) || 120;
    
    let startY = 50;
    mapObjects.forEach(o => { if(o.y + o.height > startY) startY = o.y + o.height + 50; });
    let count = mapObjects.filter(o => o.type === 'table').length + 1;

    // Default to Layout mode when generating for better packing
    setViewMode('layout');

    for (let r = 0; r < rows; r++) {
        // Center the grid horizontally around 0
        const startX = -(cols * gap) / 2 + gap/2;
        for (let c = 0; c < cols; c++) {
            let obj = addMapObject('table', startX + c * gap, startY + r * gap, true);
            obj.name = `第 ${count++} 桌`;
        }
    }
    renderAll();
    autoFitZoom();
    saveToLocal();
}

function deleteObject(id) {
    if(!confirm('確定刪除？')) return;
    recordState();
    
    // Determine IDs to delete (handle batch delete via selection or single delete)
    const idsToDelete = (id && appState.selectedIds.includes(id)) ? appState.selectedIds : (id ? [id] : appState.selectedIds);
    if(idsToDelete.length === 0) return;

    guests.forEach(g => { if(idsToDelete.includes(g.tableId)) g.tableId = null; });
    mapObjects = mapObjects.filter(o => !idsToDelete.includes(o.id));
    appState.selectedIds = [];
    updateSelectionVisuals();
    renderAll(); updateStats();
}

function toggleRotate(id) {
    recordState();
    const obj = mapObjects.find(o => o.id === id);
    if(obj) {
        obj.vertical = !obj.vertical;
        const tmp = obj.width; obj.width = obj.height; obj.height = tmp;
        renderAll(); saveToLocal();
    }
}

// --- Rendering ---
function renderAll() { renderUnseatedList(); renderMap(); updateSelectionVisuals(); renderSeatingPanel(); }

function renderMap() {
    const container = document.getElementById('transformLayer');
    container.innerHTML = '';

    // --- Draw Grid & Axes ---
    container.innerHTML += `
        <div class="grid-background"></div>
        <div class="axis-line axis-x"></div>
        <div class="axis-line axis-y"></div>
        <div class="origin-label">0,0</div>
    `;

    mapObjects.forEach(obj => {
        const el = document.createElement('div');
        el.className = 'draggable-item';
        el.style.left = obj.x + 'px';
        el.style.top = obj.y + 'px';
        el.style.width = obj.width + 'px';
        el.style.height = obj.height + 'px';
        el.id = obj.id;

        if (!appState.locked) { addDragLogic(el, obj); el.style.cursor = 'move'; } 
        else { el.style.cursor = 'default'; }

        if (obj.type === 'table' || obj.type === 'main-table') {
            const isMain = obj.type === 'main-table';
            const isLayout = appState.viewMode === 'layout';
            const isSeating = appState.viewMode === 'seating';
            const seatedCount = guests.filter(g => g.tableId === obj.id).reduce((acc,g) => acc + (g.count||1), 0);

            // Class Handling
            el.className += ` table-node mode-${appState.viewMode} ${isMain ? 'type-main' : ''}`;
            
            // Content
            if(isLayout) {
                // Small Circle Content (Layout Mode)
                el.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-full pointer-events-none" onclick="openModal('${obj.id}')">
                        <span class="font-bold ${isMain ? 'text-red-800' : 'text-gray-700'} text-sm leading-none">${obj.name}</span>
                        <span class="text-[10px] ${isMain ? 'text-red-600 bg-red-100' : 'text-orange-600 bg-orange-100'} font-bold px-1 rounded mt-1">${seatedCount}人</span>
                    </div>
                    ${!appState.locked ? `<button onclick="deleteObject('${obj.id}')" class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] hover:scale-110 pointer-events-auto">×</button>`:''}
                `;
            } else if (isSeating) {
                // Seating Mode (Medium Circle + Satellites)
                const r = obj.width / 2;
                const seatR = 22; // Radius of seat circle
                const orbitR = r + 30; // Distance from center
                const capacity = obj.capacity || 10;
                
                let seatsHtml = '';
                for(let i=0; i<capacity; i++) {
                    const angle = (i * (360 / capacity)) - 90; // Start from top
                    const rad = angle * Math.PI / 180;
                    const sx = r + orbitR * Math.cos(rad) - seatR;
                    const sy = r + orbitR * Math.sin(rad) - seatR;
                    
                    // Find guest at this seat
                    const guestAtSeat = guests.find(g => g.tableId === obj.id && g.seatIndex === i);
                    // Move title to wrapper for better UX (since inner has pointer-events-none)
                    const seatTitle = guestAtSeat ? guestAtSeat.name : `座位 ${i+1}`;
                    const seatContent = guestAtSeat 
                        ? `<div class="w-full h-full rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center text-[10px] font-bold overflow-hidden text-center leading-none p-0.5 pointer-events-none">${guestAtSeat.name.substr(0,3)}</div>`
                        : `<div class="text-[10px] text-gray-300 pointer-events-none">${i+1}</div>`;

                    seatsHtml += `<div class="seat-spot absolute rounded-full border border-gray-300 bg-white flex items-center justify-center shadow-sm transition-colors" 
                        style="left:${sx}px; top:${sy}px; width:${seatR*2}px; height:${seatR*2}px;"
                        title="${seatTitle}"
                        ondrop="dropGuest(event, '${obj.id}', ${i})" 
                        ondragover="event.preventDefault(); event.stopPropagation()"
                        ondragenter="this.classList.add('drag-over'); event.stopPropagation()"
                        ondragleave="this.classList.remove('drag-over'); event.stopPropagation()">
                        ${seatContent}
                    </div>`;
                }

                // Center Content (Unassigned to specific seat)
                const centerGuests = guests.filter(g => g.tableId === obj.id && g.seatIndex === undefined);
                
                el.innerHTML = `
                    ${seatsHtml}
                    <div class="absolute inset-0 rounded-full flex flex-col items-center justify-center z-10 pointer-events-none">
                        <span class="font-bold ${isMain ? 'text-red-800' : 'text-gray-700'} text-sm pointer-events-auto cursor-pointer" onclick="openModal('${obj.id}')">${obj.name}</span>
                        ${centerGuests.length > 0 ? `<div class="text-[9px] text-red-500 font-bold bg-red-50 px-1 rounded mt-1 border border-red-200 pointer-events-auto" title="未排座位">${centerGuests.length}人未定座</div>` : ''}
                    </div>
                `;
            } else {
                // Large Rect or Main Table Content
                const header = document.createElement('div');
                header.className = isMain ? 'mt-4 mb-2 text-center' : 'bg-gray-100 p-2 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-200 transition group';
                
                if (isMain) {
                    header.innerHTML = `<span class="text-xl font-bold text-red-800 cursor-pointer" onclick="openModal('${obj.id}')">${obj.name} <i class="fa-solid fa-pen text-xs opacity-50"></i></span>`;
                    const del = document.createElement('button');
                    del.className = 'absolute top-0 right-0 p-2 text-red-400 hover:text-red-600';
                    if(!appState.locked) del.innerHTML = '<i class="fa-solid fa-times"></i>';
                    del.onclick = (e) => { e.stopPropagation(); deleteObject(obj.id); };
                    el.appendChild(del);
                } else {
                    header.innerHTML = `
                        <div class="flex items-center gap-1 overflow-hidden flex-1" onclick="openModal('${obj.id}')">
                            <i class="fa-solid fa-pen text-[10px] text-gray-400 group-hover:text-blue-500"></i>
                            <span class="font-bold text-gray-700 truncate">${obj.name}</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="bg-blue-100 text-blue-800 text-xs px-2 rounded-full">${seatedCount}</span>
                            ${!appState.locked ? `<button onclick="deleteObject('${obj.id}')" class="text-gray-300 hover:text-red-500 px-1"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                        </div>
                    `;
                }
                el.appendChild(header);

                const guestBox = document.createElement('div');
                guestBox.className = 'flex-1 w-full overflow-y-auto p-1 space-y-1 ' + (isMain ? 'px-4 pb-4' : 'bg-white');
                guestBox.addEventListener('wheel', e => e.stopPropagation(), {passive:false});

                const tableGuests = guests.filter(g => g.tableId === obj.id);
                tableGuests.forEach(g => {
                    guestBox.appendChild(createGuestElement(g, true));
                });
                el.appendChild(guestBox);
            }

            // Drop Events (Work in both modes, but logic easier in Assign mode)
            el.addEventListener('dragover', e => e.preventDefault());
            el.addEventListener('drop', e => { e.stopPropagation(); dropGuest(e, obj.id); }); // Stop propagation to prevent double drop
            el.addEventListener('dragenter', () => el.classList.add('drag-over'));
            el.addEventListener('dragleave', () => el.classList.remove('drag-over'));

        } else {
            // Stage / Label
            el.className += (obj.type === 'stage' ? ' obj-stage' : ' obj-label');
            if (obj.vertical) el.style.writingMode = 'vertical-rl';
            el.innerHTML = `<span onclick="openModal('${obj.id}')" class="cursor-pointer hover:underline decoration-dashed">${obj.name}</span>`;
            if (!appState.locked) {
                const del = document.createElement('div');
                del.className = 'absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs cursor-pointer shadow hover:scale-110 pointer-events-auto';
                del.innerHTML = '×';
                del.onclick = (e) => { e.stopPropagation(); deleteObject(obj.id); };
                el.appendChild(del);

                const rot = document.createElement('div');
                rot.className = 'absolute -top-2 -left-2 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs cursor-pointer shadow hover:scale-110 pointer-events-auto';
                rot.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
                rot.onclick = (e) => { e.stopPropagation(); toggleRotate(obj.id); };
                el.appendChild(rot);
            }
        }
        container.appendChild(el);
    });
}

function updateSelectionVisuals() {
    document.querySelectorAll('.draggable-item').forEach(el => el.classList.remove('selected-obj'));
    appState.selectedIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('selected-obj');
    });
    // Show/Hide Toolbar
    const tb = document.getElementById('alignToolbar');
    if(appState.selectedIds.length > 1) tb.classList.remove('hidden');
    else tb.classList.add('hidden');
    renderSeatingPanel(); // Update sidebar when selection changes
}

// --- Interaction Logic ---
function addDragLogic(el, obj) {
    let isDragging = false;
    let startX, startY;
    let initialPos = {}; // Store initial positions for all selected objects
    let dragElements = {}; // Cache DOM elements for performance
    let preDragState = null; // Snapshot for undo

    el.addEventListener('mousedown', e => {
        if (e.target.closest('.guest-chip') || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        if (appState.isSpaceDown) return; // Allow bubble to canvas for panning
        e.stopPropagation();

        // Selection Logic
        if (appState.toolMode === 'select') {
            if (e.shiftKey) {
                // Toggle/Add
                if (!appState.selectedIds.includes(obj.id)) appState.selectedIds.push(obj.id);
            } else {
                // If clicking an unselected item, clear others. If clicking a selected item, keep selection (for drag)
                if (!appState.selectedIds.includes(obj.id)) {
                    appState.selectedIds = [obj.id];
                }
            }
            updateSelectionVisuals();
        }

        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        
        // Snapshot positions of ALL selected objects
        appState.selectedIds.forEach(id => {
            const o = mapObjects.find(i => i.id === id);
            if(o) initialPos[id] = { x: o.x, y: o.y };

            // Cache element and disable transition forcefully
            const elRef = document.getElementById(id);
            if(elRef) {
                dragElements[id] = elRef;
                elRef.style.setProperty('transition', 'none', 'important');
                elRef.style.zIndex = 100;
            }
        });
        
        preDragState = JSON.stringify({ mapObjects, guests }); // Capture state before move
    });

    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        e.preventDefault();
        let dx = (e.clientX - startX) / appState.scale;
        let dy = (e.clientY - startY) / appState.scale;
        
        if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;
            else dx = 0;
        }

        // Snap to Grid Logic (Based on the primary object being dragged)
        if (appState.snapToGrid && initialPos[obj.id]) {
            const grid = 40; // Match CSS grid size
            
            // Calculate target center
            const currentX = initialPos[obj.id].x + dx;
            const currentY = initialPos[obj.id].y + dy;
            const centerX = currentX + obj.width / 2;
            const centerY = currentY + obj.height / 2;

            // Snap center to grid intersection
            const snappedCenterX = Math.round(centerX / grid) * grid;
            const snappedCenterY = Math.round(centerY / grid) * grid;
            
            // Convert back to top-left and recalculate dx/dy
            dx = (snappedCenterX - obj.width / 2) - initialPos[obj.id].x;
            dy = (snappedCenterY - obj.height / 2) - initialPos[obj.id].y;
        }
        
        // Move ALL selected objects
        appState.selectedIds.forEach(id => {
            const o = mapObjects.find(i => i.id === id);
            const elRef = dragElements[id]; // Use cached element
            if (o && initialPos[id] && elRef) {
                o.x = initialPos[id].x + dx;
                o.y = initialPos[id].y + dy;
                elRef.style.left = o.x + 'px';
                elRef.style.top = o.y + 'px';
            }
        });
    });

    window.addEventListener('mouseup', (e) => { 
        if(isDragging) { 
            isDragging=false; 
            el.style.zIndex=''; 
            
            // Update ox/oy if moved in Assign Mode
            if (appState.viewMode !== 'layout') {
                 const scale = appState.viewMode === 'assign' ? ASSIGN_SCALE : SEATING_SCALE;
                 appState.selectedIds.forEach(id => {
                    const o = mapObjects.find(i => i.id === id);
                    if (o) { 
                        const cx = o.x + o.width / 2;
                        const cy = o.y + o.height / 2;
                        const lw = SIZES[o.type] ? SIZES[o.type].layout.w : o.width;
                        const lh = SIZES[o.type] ? SIZES[o.type].layout.h : o.height;
                        o.ox = (cx / scale) - lw / 2;
                        o.oy = (cy / scale) - lh / 2;
                    }
                 });
            }

            // Only record history if actually moved
            if (Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2) {
                historyStack.push(preDragState); // Push the PRE-DRAG state to undo stack
                if (historyStack.length > 50) historyStack.shift();
                redoStack = [];
                updateHistoryButtons();
                saveToLocal(); 
            }
        } 
    });
}

// --- Guest Logic ---
function parseGuests() {
    recordState();
    const input = document.getElementById('guestInput').value;
    const defUnit = document.getElementById('defaultUnitInput').value.trim() || '貴賓';
    const mode = document.querySelector('input[name="inputMode"]:checked').value;
    
    if(!input.trim()) return;
    const lines = input.split('\n');
    
    lines.forEach(line => {
        // 統一全形符號與空白
        line = line.trim().replace(/：/g, ':').replace(/，/g, ',').replace(/　/g, ' ');
        if(!line) return;

        // 模式 1: "單位: 姓名1, 姓名2..." (批次名單)
        if (line.includes(':')) {
            const [unit, names] = line.split(':');
            names.split(/,| /).forEach(n => { if(n.trim()) addGuest(unit.trim(), n.trim()); });
            return;
        }

        // 分割欄位 (以空白分隔)
        const parts = line.split(/\s+/);
        let count = 1;

        // 檢查最後一欄是否為數字 (人數)
        if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
            count = parseInt(parts.pop()); // 取出並移除最後一個數字
        }

        if (parts.length >= 2) {
            // 剩餘兩欄以上：視為 "單位 姓名"
            addGuest(parts[0], parts.slice(1).join(' '), count);
        } else if (parts.length === 1) {
            // 剩餘一欄：依據輸入模式決定是 "單位" 還是 "姓名"
            if (mode === 'unit') {
                addGuest(parts[0], "保留席", count); // 模式為單位 -> 姓名預設為保留席
            } else {
                addGuest(defUnit, parts[0], count);  // 模式為姓名 -> 單位預設為貴賓
            }
        }
    });
    document.getElementById('guestInput').value = '';
    renderAll(); updateStats(); saveToLocal();
}

function addGuest(unit, name, count=1) { guests.push({ id: genId(), unit, name, count, tableId: null, seatIndex: undefined }); }

function renderUnseatedList() {
    const unseated = guests.filter(g => !g.tableId);
    
    // Render to Step 2 list
    const list2 = document.getElementById('unseatedList');
    if (list2) { list2.innerHTML = ''; unseated.forEach(g => list2.appendChild(createGuestElement(g, false))); }

    // Render to Step 3 list
    const list3 = document.getElementById('seatingUnseatedList');
    if (list3) { list3.innerHTML = ''; unseated.forEach(g => list3.appendChild(createGuestElement(g, false))); }
}

function createGuestElement(g, seated) {
    const el = document.createElement('div');
    el.className = `guest-chip bg-white border rounded p-1 text-xs flex justify-between items-center group relative ${seated ? 'border-blue-200' : 'border-gray-200'}`;
    el.draggable = true;
    el.innerHTML = `
        <div class="pointer-events-none truncate pr-4">
            <span class="text-gray-400 text-[10px] mr-1">${g.unit}</span>
            <span class="font-bold text-gray-700">${g.name}</span>
            ${g.count > 1 ? `<span class="ml-1 bg-red-500 text-white rounded-full px-1 text-[9px]">x${g.count}</span>` : ''}
        </div>
        <button onclick="removeGuest('${g.id}')" class="absolute right-1 text-gray-300 hover:text-red-500"><i class="fa-solid fa-times"></i></button>
    `;
    el.addEventListener('dragstart', ev => { ev.dataTransfer.setData('gid', g.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
}

function dropGuest(ev, tableId, seatIndex = undefined) {
    ev.preventDefault();
    ev.stopPropagation(); // 關鍵修正：阻止事件冒泡到桌子，避免座位設定被覆蓋
    recordState();
    document.querySelectorAll('.drag-over').forEach(e => e.classList.remove('drag-over'));
    const gid = ev.dataTransfer.getData('gid');
    const guest = guests.find(g => g.id === gid);
    if (guest) { 
        // If dropping onto a seat that is already taken, swap? For now just overwrite/stack or do nothing?
        // Let's allow stacking or just set it.
        guest.tableId = tableId; 
        guest.seatIndex = seatIndex;
        renderAll(); updateStats(); saveToLocal(); 
    }
}

function removeGuest(id) {
    if(confirm('刪除?')) { recordState(); guests = guests.filter(g => g.id !== id); renderAll(); updateStats(); saveToLocal(); }
}

function updateStats() {
    const total = guests.reduce((sum, g) => sum + (g.count || 1), 0);
    const seated = guests.filter(g => g.tableId).reduce((sum, g) => sum + (g.count || 1), 0);
    document.getElementById('totalCount').innerText = total;
    document.getElementById('seatedCount').innerText = seated;
    document.getElementById('unseatedCount').innerText = total - seated;
}

// --- Canvas Events ---
function setupCanvasEvents() {
    const canvas = document.getElementById('floorCanvas');
    const marquee = document.getElementById('selectionMarquee');
    let isPanning = false, startX = 0, startY = 0;
    let initialPanX = 0, initialPanY = 0;
    let isSelecting = false, selStartX = 0, selStartY = 0;
    let canvasRect = null;

    canvas.addEventListener('mousedown', e => {
        if(e.target === canvas || e.target.id === 'transformLayer') {
            if (appState.toolMode === 'pan' || (appState.toolMode === 'select' && e.button === 1) || appState.isSpaceDown) {
                // Pan Mode
                isPanning = true; startX = e.clientX - appState.panX; startY = e.clientY - appState.panY;
                initialPanX = appState.panX; initialPanY = appState.panY;
                canvas.style.cursor = 'grabbing';
            } else if (appState.toolMode === 'select' && !appState.locked && !appState.isSpaceDown) {
                // Select Mode (Marquee)
                isSelecting = true;
                canvasRect = canvas.getBoundingClientRect();
                selStartX = e.clientX - canvasRect.left; 
                selStartY = e.clientY - canvasRect.top;
                
                marquee.style.display = 'block';
                marquee.style.left = selStartX + 'px'; marquee.style.top = selStartY + 'px';
                marquee.style.width = '0px'; marquee.style.height = '0px';
                
                // Clear selection if not holding shift
                if(!e.shiftKey) {
                    appState.selectedIds = [];
                    updateSelectionVisuals();
                }
            }
        }
    });
    window.addEventListener('mousemove', e => {
        if(isPanning) { appState.panX = e.clientX - startX; appState.panY = e.clientY - startY; updateTransform(); }
        if(isSelecting) {
            const currentX = e.clientX - canvasRect.left; 
            const currentY = e.clientY - canvasRect.top;
            const left = Math.min(selStartX, currentX);
            const top = Math.min(selStartY, currentY);
            const width = Math.abs(currentX - selStartX);
            const height = Math.abs(currentY - selStartY);
            marquee.style.left = left + 'px'; marquee.style.top = top + 'px';
            marquee.style.width = width + 'px'; marquee.style.height = height + 'px';
        }
    });
    window.addEventListener('mouseup', (e) => { 
        if(isPanning) { 
            isPanning = false; canvas.style.cursor = 'grab'; 
            if(appState.panX !== initialPanX || appState.panY !== initialPanY) saveToLocal();
        }
        if(isSelecting) {
            isSelecting = false; marquee.style.display = 'none';
            const currentX = e.clientX - canvasRect.left;
            const currentY = e.clientY - canvasRect.top;
            finishSelection(selStartX, selStartY, currentX, currentY, e.shiftKey);
            canvasRect = null;
        }
    });
    let zoomTimeout;
    canvas.addEventListener('wheel', e => {
        e.preventDefault(); 
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(5, appState.scale * delta));
        appState.panX = mx - (mx - appState.panX) * (newScale / appState.scale);
        appState.panY = my - (my - appState.panY) * (newScale / appState.scale);
        appState.scale = newScale;
        updateTransform();
        clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(saveToLocal, 500);
    });
}

function finishSelection(x1, y1, x2, y2, isShift) {
    // Convert screen rect to world rect
    const left = Math.min(x1, x2); const top = Math.min(y1, y2);
    const right = Math.max(x1, x2); const bottom = Math.max(y1, y2);
    
    // If click without drag (tiny movement), clear selection
    if (Math.abs(x2-x1) < 5 && Math.abs(y2-y1) < 5) {
        if(!isShift) appState.selectedIds = [];
        updateSelectionVisuals();
        return;
    }
    
    const canvas = document.getElementById('floorCanvas');
    const centerX = canvas.clientWidth / 2;
    const centerY = canvas.clientHeight / 2;

    mapObjects.forEach(o => {
        // Object screen coordinates
        const ox = centerX + appState.panX + o.x * appState.scale;
        const oy = centerY + appState.panY + o.y * appState.scale;
        const ow = o.width * appState.scale;
        const oh = o.height * appState.scale;

        // Check intersection
        if (ox < right && ox + ow > left && oy < bottom && oy + oh > top) {
            if (!appState.selectedIds.includes(o.id)) appState.selectedIds.push(o.id);
        }
    });
    updateSelectionVisuals();
}

// --- Alignment Functions ---
function alignSelected(type) {
    if (appState.selectedIds.length < 2) return;
    recordState();
    const selected = mapObjects.filter(o => appState.selectedIds.includes(o.id));
    
    if (type === 'left') {
        const minX = Math.min(...selected.map(o => o.x));
        selected.forEach(o => o.x = minX);
    } else if (type === 'center-h') {
        const minX = Math.min(...selected.map(o => o.x));
        const maxX = Math.max(...selected.map(o => o.x + o.width));
        const center = (minX + maxX) / 2;
        selected.forEach(o => o.x = center - o.width / 2);
    } else if (type === 'right') {
        const maxRight = Math.max(...selected.map(o => o.x + o.width));
        selected.forEach(o => o.x = maxRight - o.width);
    } else if (type === 'top') {
        const minY = Math.min(...selected.map(o => o.y));
        selected.forEach(o => o.y = minY);
    } else if (type === 'center-v') {
        const minY = Math.min(...selected.map(o => o.y));
        const maxY = Math.max(...selected.map(o => o.y + o.height));
        const center = (minY + maxY) / 2;
        selected.forEach(o => o.y = center - o.height / 2);
    } else if (type === 'bottom') {
        const maxBottom = Math.max(...selected.map(o => o.y + o.height));
        selected.forEach(o => o.y = maxBottom - o.height);
    }
    renderAll(); saveToLocal();
}

function distributeSelected(type) {
    if (appState.selectedIds.length < 3) return;
    recordState();
    const selected = mapObjects.filter(o => appState.selectedIds.includes(o.id));
    
    if (type === 'h') {
        selected.sort((a, b) => a.x - b.x);
        const minX = selected[0].x;
        const maxX = selected[selected.length - 1].x + selected[selected.length - 1].width;
        const totalWidth = maxX - minX;
        const sumObjectWidth = selected.reduce((sum, o) => sum + o.width, 0);
        const gap = (totalWidth - sumObjectWidth) / (selected.length - 1);
        
        let currentX = minX;
        selected.forEach(o => {
            o.x = currentX;
            currentX += o.width + gap;
        });
    } else if (type === 'v') {
        selected.sort((a, b) => a.y - b.y);
        const minY = selected[0].y;
        const maxY = selected[selected.length - 1].y + selected[selected.length - 1].height;
        const totalHeight = maxY - minY;
        const sumObjectHeight = selected.reduce((sum, o) => sum + o.height, 0);
        const gap = (totalHeight - sumObjectHeight) / (selected.length - 1);
        
        let currentY = minY;
        selected.forEach(o => {
            o.y = currentY;
            currentY += o.height + gap;
        });
    }
    renderAll(); saveToLocal();
}

function arrangeSelectedGrid() {
    if (appState.selectedIds.length < 2) return;
    recordState();
    const selected = mapObjects.filter(o => appState.selectedIds.includes(o.id));
    
    // 1. Sort spatially to determine logical order
    // Heuristic: Sort by Y first (grouping by row threshold), then by X.
    const avgH = selected.reduce((s,o)=>s+o.height,0) / selected.length;
    const threshold = avgH * 0.5;

    selected.sort((a,b) => a.y - b.y);
    
    const rows = [];
    let currentRow = [selected[0]];
    let currentRowY = selected[0].y;

    for(let i=1; i<selected.length; i++) {
        const obj = selected[i];
        if (Math.abs(obj.y - currentRowY) < threshold) {
            currentRow.push(obj);
        } else {
            rows.push(currentRow);
            currentRow = [obj];
            currentRowY = obj.y;
        }
    }
    rows.push(currentRow);
    rows.forEach(r => r.sort((a,b) => a.x - b.x));
    const sorted = rows.flat();

    // 2. Prompt Settings
    const defaultCols = Math.max(...rows.map(r => r.length));
    const colsStr = prompt(`排列成幾列 (Columns)?\n(選取了 ${selected.length} 個物件)`, defaultCols);
    if (!colsStr) return;
    const cols = parseInt(colsStr);
    if (isNaN(cols) || cols < 1) return;

    const gapStr = prompt("間距 (Gap)?", "120");
    const gap = parseInt(gapStr) || 120;

    // 3. Arrange
    const minX = Math.min(...selected.map(o => o.x));
    const minY = Math.min(...selected.map(o => o.y));

    sorted.forEach((obj, index) => {
        const c = index % cols;
        const r = Math.floor(index / cols);
        obj.x = minX + c * gap;
        obj.y = minY + r * gap;
    });

    renderAll(); saveToLocal();
}

function updateTransform() {
    document.getElementById('transformLayer').style.transform = `translate(${appState.panX}px, ${appState.panY}px) scale(${appState.scale})`;
    document.getElementById('zoomLevelDisplay').innerText = Math.round(appState.scale * 100) + '%';
}
function zoomIn() { zoomWithFocus(1.2); }
function zoomOut() { zoomWithFocus(0.8); }

function zoomWithFocus(factor) {
    let cx = 0, cy = 0; // Default to viewport center
    
    // If selection exists, zoom towards selection center
    if (appState.selectedIds.length > 0) {
        const selected = mapObjects.filter(o => appState.selectedIds.includes(o.id));
        if (selected.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            selected.forEach(o => {
                minX = Math.min(minX, o.x);
                maxX = Math.max(maxX, o.x + o.width);
                minY = Math.min(minY, o.y);
                maxY = Math.max(maxY, o.y + o.height);
            });
            const wx = (minX + maxX) / 2;
            const wy = (minY + maxY) / 2;
            cx = appState.panX + wx * appState.scale;
            cy = appState.panY + wy * appState.scale;
        }
    }
    const newScale = Math.max(0.1, Math.min(5, appState.scale * factor));
    appState.panX = cx - (cx - appState.panX) * (newScale / appState.scale);
    appState.panY = cy - (cy - appState.panY) * (newScale / appState.scale);
    appState.scale = newScale;
    updateTransform();
    saveToLocal();
}

function autoFitZoom() {
    if(mapObjects.length === 0) return;
    const xs = mapObjects.map(o => o.x); const ys = mapObjects.map(o => o.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + 180;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + 180;
    const cvs = document.getElementById('floorCanvas');
    const s = Math.min((cvs.clientWidth-100)/(maxX-minX), (cvs.clientHeight-100)/(maxY-minY), 1.5);
    appState.scale = Math.max(0.2, s);
    // Center the view on the center of the objects
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    appState.panX = -cx * appState.scale;
    appState.panY = -cy * appState.scale;
    updateTransform();
    saveToLocal();
}

// --- Modals ---
function toggleLock() {
    appState.locked = !appState.locked;
    document.getElementById('lockLayout').checked = appState.locked;
    document.getElementById('lockLabel').innerText = appState.locked ? "🔒 已鎖定" : "🔓 解鎖編輯";
    saveToLocal();
    renderMap();
}
function toggleSnap() {
    appState.snapToGrid = !appState.snapToGrid;
    document.getElementById('snapGrid').checked = appState.snapToGrid;
    saveToLocal();
}
function openModal(id) {
    editingObjectId = id;
    const obj = mapObjects.find(o => o.id === id);
    document.getElementById('modalInput').value = obj.name;
    
    const capDiv = document.getElementById('modalCapacityParams');
    if (obj.type === 'table' || obj.type === 'main-table') {
        capDiv.classList.remove('hidden');
        document.getElementById('modalCapacity').value = obj.capacity || 10;
    } else {
        capDiv.classList.add('hidden');
    }
    
    document.getElementById('modalOverlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('modalInput').focus(), 50);
}
function closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); }
function saveModal() {
    recordState();
    const name = document.getElementById('modalInput').value.trim();
    const cap = parseInt(document.getElementById('modalCapacity').value) || 10;
    if(name) { 
        const obj = mapObjects.find(o => o.id === editingObjectId);
        obj.name = name; 
        if(obj.type === 'table' || obj.type === 'main-table') obj.capacity = cap;
        renderMap(); saveToLocal(); 
    }
    closeModal();
}

// --- Menu & Project Management ---
function toggleMenu() {
    const menu = document.getElementById('mainMenu');
    menu.classList.toggle('hidden');
}

// Close menu when clicking outside
window.addEventListener('click', (e) => {
    const menu = document.getElementById('mainMenu');
    const btn = document.getElementById('btn-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

function exportProject() {
    const data = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        mapObjects,
        guests,
        appState: { ...appState, selectedIds: [], toolMode: 'select' }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `座位專案_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('mainMenu').classList.add('hidden');
}

function importProject(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data.mapObjects) && Array.isArray(data.guests)) {
                if(confirm('載入專案將會覆蓋目前的進度，確定嗎？')) {
                    recordState(); // Save history
                    mapObjects = data.mapObjects;
                    guests = data.guests;
                            if (data.appState && data.appState.currentStep) setStep(data.appState.currentStep);
                    renderAll(); updateStats(); autoFitZoom(); saveToLocal();
                    alert('專案載入成功！');
                }
            } else { alert('檔案格式錯誤：找不到必要的資料欄位'); }
        } catch (err) { console.error(err); alert('讀取失敗：' + err.message); }
        input.value = ''; // Reset input
        document.getElementById('mainMenu').classList.add('hidden');
    };
    reader.readAsText(file);
}

// --- Export Excel ---
function exportExcel() {
    if(guests.length === 0) return alert('無名單');
    const data = [];
    const seated = guests.filter(g=>g.tableId), unseated = guests.filter(g=>!g.tableId);
    seated.sort((a,b) => {
        const ta = mapObjects.find(o=>o.id===a.tableId), tb = mapObjects.find(o=>o.id===b.tableId);
        return (ta?parseInt(ta.name.replace(/\D/g,''))||0:999) - (tb?parseInt(tb.name.replace(/\D/g,''))||0:999);
    });
    seated.concat(unseated).forEach(g => {
        const t = mapObjects.find(o => o.id === g.tableId);
        data.push({ "桌號": t?t.name:"-", "單位": g.unit, "姓名": g.name, "人數": g.count, "座位號": (g.seatIndex !== undefined ? g.seatIndex + 1 : "-"), "狀態": t?"已入席":"未入席" });
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "名單");
    XLSX.writeFile(wb, "活動名單.xlsx");
}

// --- Export SVG (Vector) ---
function exportSVG() {
    if(mapObjects.length === 0) return alert('無物件');
    
    const xs = mapObjects.map(o => o.x); const ys = mapObjects.map(o => o.y);
    const padding = appState.viewMode === 'seating' ? 60 : 10;
    const minX = Math.min(...xs) - padding; const minY = Math.min(...ys) - padding;
    const maxX = Math.max(...xs.map((x, i) => x + mapObjects[i].width)) + padding;
    const maxY = Math.max(...ys.map((y, i) => y + mapObjects[i].height)) + padding;
    const w = maxX - minX; const h = maxY - minY;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`;
    svg += `<style>.txt { font-family: sans-serif; font-size: 12px; text-anchor: middle; dominant-baseline: middle; } .seat-txt { font-size: 9px; fill: #999; }</style>`;

    mapObjects.forEach(o => {
        const cx = o.x + o.width/2; const cy = o.y + o.height/2;
        if (o.type === 'stage') {
            const style = o.vertical ? 'style="writing-mode: vertical-rl;"' : '';
            svg += `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" fill="#e0f2fe" stroke="#3b82f6" /><text x="${cx}" y="${cy}" class="txt" fill="#1e40af" ${style}>${o.name}</text>`;
        } else if (o.type === 'label') {
            const style = o.vertical ? 'style="writing-mode: vertical-rl;"' : '';
            svg += `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="4" fill="#f3f4f6" stroke="#9ca3af" stroke-width="1" />`;
            svg += `<text x="${cx}" y="${cy}" class="txt" font-size="16" fill="#333" ${style}>${o.name}</text>`;
        } else {
            const isMain = o.type === 'main-table';
            const stroke = isMain ? '#ef4444' : '#9ca3af';
            const fill = isMain ? '#fef2f2' : '#ffffff';
            const txtFill = isMain ? '#991b1b' : '#374151';

            if (appState.viewMode === 'assign') {
                // 1. 卡片背景
                svg += `<rect x="${o.x}" y="${o.y}" width="${o.width}" height="${o.height}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
                
                // 2. 標題分隔線
                const headerH = 32;
                const lineStroke = isMain ? '#fecaca' : '#e5e7eb'; // 紅色淡線或灰色淡線
                svg += `<line x1="${o.x}" y1="${o.y+headerH}" x2="${o.x+o.width}" y2="${o.y+headerH}" stroke="${lineStroke}" stroke-width="1" />`;
                
                // 3. 桌號標題
                svg += `<text x="${cx}" y="${o.y + 20}" class="txt" font-weight="bold" font-size="14" fill="${txtFill}">${o.name}</text>`;

                // 4. 賓客名單 (雙欄排列)
                const tableGuests = guests.filter(g => g.tableId === o.id);
                const colW = o.width / 2;
                const startY = o.y + headerH + 16; // 標題下方起始位置
                const rowH = 18; // 行高

                tableGuests.forEach((g, i) => {
                    const col = i % 2; // 0:左欄, 1:右欄
                    const row = Math.floor(i / 2);
                    const gx = o.x + (col * colW) + (colW / 2); // 欄位中心 X
                    const gy = startY + (row * rowH); // 文字 Y
                    
                    // 簡單的邊界檢查，避免超出框框
                    if (gy < o.y + o.height - 5) {
                        const gName = g.name + (g.count > 1 ? ` x${g.count}` : '');
                        svg += `<text x="${gx}" y="${gy}" class="txt" font-size="11" fill="#374151">${gName}</text>`;
                    }
                });
            } else {
                svg += `<circle cx="${cx}" cy="${cy}" r="${o.width/2}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
                svg += `<text x="${cx}" y="${cy}" class="txt" font-weight="bold" fill="${txtFill}">${o.name}</text>`;
                if (appState.viewMode === 'seating') {
                    const r = o.width / 2; const seatR = 20; const orbitR = r + 25; const cap = o.capacity || 10;
                    for(let i=0; i<cap; i++) {
                        const angle = (i * (360/cap)) - 90; const rad = angle * Math.PI / 180;
                        const sx = cx + orbitR * Math.cos(rad); const sy = cy + orbitR * Math.sin(rad);
                        const g = guests.find(g => g.tableId === o.id && g.seatIndex === i);
                        const sFill = g ? '#dbeafe' : 'white'; const sStroke = g ? '#3b82f6' : '#ccc';
                        const sTxt = g ? g.name.substr(0,3) : (i+1);
                        svg += `<circle cx="${sx}" cy="${sy}" r="${seatR}" fill="${sFill}" stroke="${sStroke}" />`;
                        svg += `<text x="${sx}" y="${sy}" class="txt seat-txt" fill="${g?'#1e40af':'#ccc'}">${sTxt}</text>`;
                    }
                }
            }
        }
    });
    svg += `</svg>`;
    
    const blob = new Blob([svg], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `layout_${new Date().toISOString().split('T')[0]}.svg`;
    a.click(); URL.revokeObjectURL(url);
}

// --- Export PDF (Vector via System Print) ---
function exportPDF() {
    // 1. Setup Print Styles (Hide body, show print container, set landscape)
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            body > * { display: none !important; }
            #print-container { display: block !important; }
            @page { size: landscape; margin: 0; }
        }
    `;
    document.head.appendChild(style);
    
    // 2. Create Print Container
    const container = document.createElement('div');
    container.id = 'print-container';
    container.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:white; z-index:9999; overflow:hidden;';
    
    const content = document.createElement('div');
    content.style.cssText = 'position:absolute; top:50%; left:50%; transform-origin: center center;';
    container.appendChild(content);

    // 3. Calculate Bounds
    if (mapObjects.length === 0) { alert('無物件'); return; }
    const xs = mapObjects.map(o => o.x);
    const ys = mapObjects.map(o => o.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs.map((x, i) => x + mapObjects[i].width));
    const maxY = Math.max(...ys.map((y, i) => y + mapObjects[i].height));
    
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 40;
    
    content.style.width = contentW + 'px';
    content.style.height = contentH + 'px';
    
    // 4. Calculate Scale to fit A4 Landscape (approx 1100x780 safe area)
    const pageW = 1100; 
    const pageH = 780;
    const scale = Math.min((pageW - padding*2) / contentW, (pageH - padding*2) / contentH);
    content.style.transform = `translate(-50%, -50%) scale(${scale})`;

    mapObjects.forEach(obj => {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = (obj.x - minX) + 'px';
        el.style.top = (obj.y - minY) + 'px';
        el.style.width = obj.width + 'px';
        el.style.height = obj.height + 'px';
        
        // Render based on current View Mode
        if (appState.viewMode === 'assign' && (obj.type === 'table' || obj.type === 'main-table')) {
            // Assign Mode: Cards
            el.style.height = 'auto'; el.style.minHeight = obj.height + 'px';
            el.className = obj.type === 'main-table' ? 'bg-red-50 border-2 border-red-500 rounded-xl shadow-sm flex flex-col overflow-hidden text-red-800 text-xs' : 'bg-white border-2 border-gray-300 rounded-xl shadow-sm flex flex-col overflow-hidden text-xs';

            const header = document.createElement('div');
            header.className = obj.type === 'main-table' ? 'p-1 text-center font-bold border-b border-red-200 bg-red-100' : 'p-1 bg-gray-100 border-b border-gray-200 flex justify-between items-center font-bold px-2';
            header.innerText = obj.name;
            el.appendChild(header);

            const list = document.createElement('div');
            list.className = 'p-1 grid grid-cols-2 gap-1 content-start';
            guests.filter(g => g.tableId === obj.id).forEach(g => {
                const item = document.createElement('div');
                item.innerText = g.name + (g.count > 1 ? ` x${g.count}` : '');
                list.appendChild(item);
            });
            el.appendChild(list);

        } else if (appState.viewMode === 'seating' && (obj.type === 'table' || obj.type === 'main-table')) {
            // Seating Mode: Circles + Seats
            el.className = obj.type === 'main-table' ? 'rounded-full border-2 border-red-500 flex items-center justify-center font-bold text-red-800 bg-red-50' : 'rounded-full border-2 border-gray-400 flex items-center justify-center font-bold text-gray-700 bg-white';
            el.style.borderRadius = '50%'; // 修正：強制圓角，避免列印時背景變成矩形
            el.innerText = obj.name;
            
            const r = obj.width / 2; const seatR = 20; const orbitR = r + 25; const cap = obj.capacity || 10;
            for(let i=0; i<cap; i++) {
                const angle = (i * (360/cap)) - 90; const rad = angle * Math.PI / 180;
                const sx = r + orbitR * Math.cos(rad) - seatR; const sy = r + orbitR * Math.sin(rad) - seatR;
                const seat = document.createElement('div');
                seat.style.cssText = `position:absolute; left:${sx}px; top:${sy}px; width:${seatR*2}px; height:${seatR*2}px;`;
                seat.className = 'rounded-full border border-gray-300 bg-white flex items-center justify-center text-[10px]';
                const g = guests.find(g => g.tableId === obj.id && g.seatIndex === i);
                if(g) { seat.innerText = g.name.substr(0,3); seat.className += ' bg-blue-100 text-blue-800 font-bold border-blue-300'; }
                else { seat.innerText = i+1; seat.className += ' text-gray-300'; }
                el.appendChild(seat);
            }

        } else {
            // Layout Mode / Stage / Label
            el.className = 'flex items-center justify-center font-bold text-center border rounded';
            if(obj.vertical) el.style.writingMode = 'vertical-rl';
            if(obj.type === 'stage') el.className += ' bg-blue-200 border-blue-400 text-blue-800';
            else if(obj.type === 'label') el.className += ' bg-transparent border-none text-gray-600 text-xl';
            else { el.className += ' rounded-full bg-white border-gray-400 text-gray-700 text-xs'; if(obj.type==='main-table') el.className += ' border-red-400 text-red-800 bg-red-50'; }
            el.innerText = obj.name;
        }
        content.appendChild(el);
    });

    document.body.appendChild(container);
    window.print();
    document.body.removeChild(container);
    document.head.removeChild(style);
}

// --- Export Web Package (Small Circle Mode Forced) ---
async function exportWebPackage(mode = 'single') {
    if(mapObjects.length === 0) return alert('場地是空的');

    // Force prepare data as if we are in layout mode (small circles)
    // Even if user is currently in Assign mode, we use width=80 for export calculation
    const exportData = {
        date: new Date().toISOString().split('T')[0],
        objects: mapObjects.map(o => ({
            id: o.id, type: o.type,
            // If it's a table, we export it as a small circle (80px), using center point of current position
            // We assume current x,y is top-left. 
            // To keep visual center consistent if coming from Large mode:
            //   Center = x + w/2. New X = Center - NewW/2.
            // But to keep it simple, we trust the Layout Mode arrangement.
            // 如果處於縮放模式，匯出時優先使用原始座標 (ox > x)
            x: Math.round(o.ox !== undefined ? o.ox : o.x), 
            y: Math.round(o.oy !== undefined ? o.oy : o.y),
            w: (o.type==='table') ? 80 : (o.type==='main-table' ? 120 : o.width),
            h: (o.type==='table') ? 80 : (o.type==='main-table' ? 120 : o.height),
            capacity: o.capacity,
            name: o.name,
            vertical: o.vertical
        })),
        guests: guests.filter(g => g.tableId).map(g => ({ unit: g.unit, name: g.name, count: g.count, tableId: g.tableId, seatIndex: g.seatIndex }))
    };

    const xs = exportData.objects.map(o => o.x); const ys = exportData.objects.map(o => o.y);
    const minX = Math.min(...xs) - 50, maxX = Math.max(...xs) + 200;
    const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 200;
    const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;

    try {
        const response = await fetch('template/search_template.html');
        if (!response.ok) throw new Error('無法讀取範本檔案 (template/search_template.html)');
        let htmlContent = await response.text();

        if (mode === 'single') {
            // Mode 1: Single File (Embed Everything)
            htmlContent = htmlContent.replace('{{DATA_JSON}}', JSON.stringify(exportData));
            htmlContent = htmlContent.replace('{{VIEWBOX}}', viewBox);
            htmlContent = htmlContent.replace('{{UPDATE_DATE}}', exportData.date);

            const blob = new Blob([htmlContent], {type: 'text/html'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `座位查詢系統_${exportData.date}.html`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            // Mode 2: Split Package (HTML + JSON + CSV)
            if (typeof JSZip === 'undefined') throw new Error('JSZip library not loaded.');

            // 1. Generate CSV
            let csvContent = "\uFEFF桌號,單位,姓名,人數,座位號\n";
            exportData.guests.forEach(g => {
                const table = exportData.objects.find(o => o.id === g.tableId);
                const tableName = table ? table.name : "Unknown";
                const escape = (txt) => `"${(txt||'').toString().replace(/"/g, '""')}"`;
                const seatIdx = g.seatIndex !== undefined ? (g.seatIndex + 1) : '';
                csvContent += `${escape(tableName)},${escape(g.unit)},${escape(g.name)},${g.count},${seatIdx}\n`;
            });

            // 2. Generate Layout JSON
            const layoutData = { ...exportData, guests: [] };

            // 3. Generate HTML with Loader Script
            const loaderScript = `(function(){ try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', 'layout.json', false); xhr.send(null);
                if(xhr.status>=400) throw new Error('Load layout failed');
                var data = JSON.parse(xhr.responseText);
                xhr.open('GET', 'guests.csv', false); xhr.send(null);
                if(xhr.status>=400) throw new Error('Load csv failed');
                var lines = xhr.responseText.split(/\\r?\\n/);
                var guests = [];
                for(var i=1; i<lines.length; i++){
                    var line = lines[i].trim();
                    if(!line) continue;
                    var parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(function(s){ return s.replace(/^"|"$/g, '').trim(); });
                    if(parts.length>=3){
                        var tName = parts[0], unit = parts[1], name = parts[2], cnt = parseInt(parts[3])||1;
                        var sIdx = parts[4] ? parseInt(parts[4]) - 1 : undefined;
                        var table = data.objects.find(function(o){ return o.name === tName; });
                        if(table) guests.push({ unit: unit, name: name, count: cnt, tableId: table.id, seatIndex: isNaN(sIdx)?undefined:sIdx });
                    }
                }
                data.guests = guests;
                return data;
            } catch(e){ 
                if(window.location.protocol === 'file:') {
                    alert('【無法讀取資料】\\n\\n您正透過「檔案模式 (file://)」開啟此網頁，瀏覽器基於安全性禁止讀取外部資料檔 (layout.json/guests.csv)。\\n\\n解決方案：\\n1. 請將整包檔案部署至網站伺服器 (Web Server)。\\n2. 或使用 VS Code Live Server 等工具開啟。\\n3. 若無伺服器，請重新打包並選擇「單檔模式」。');
                } else {
                    alert('Data Load Error: '+e.message); 
                }
                return {objects:[], guests:[]}; } })()`;

            htmlContent = htmlContent.replace('{{DATA_JSON}}', loaderScript);
            htmlContent = htmlContent.replace('{{VIEWBOX}}', viewBox);
            htmlContent = htmlContent.replace('{{UPDATE_DATE}}', exportData.date);

            // 4. Zip It
            const zip = new JSZip();
            zip.file("index.html", htmlContent);
            zip.file("layout.json", JSON.stringify(layoutData, null, 2));
            zip.file("guests.csv", csvContent);

            const blob = await zip.generateAsync({type:"blob"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `座位系統包_${exportData.date}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        }
    } catch (err) {
        console.error(err);
        alert('匯出失敗：無法讀取範本檔案。\n請確保 template/search_template.html 存在，且透過 Web Server (http/https) 執行此網頁，而非直接開啟檔案 (file://)。');
    }
}

// --- Export CSV Only ---
function exportCSVOnly() {
    if(guests.length === 0) return alert('無名單');
    
    let csvContent = "\uFEFF桌號,單位,姓名,人數,座位號\n";
    guests.forEach(g => {
        const table = mapObjects.find(o => o.id === g.tableId);
        const tableName = table ? table.name : "Unknown";
        const escape = (txt) => `"${(txt||'').toString().replace(/"/g, '""')}"`;
        const seatIdx = g.seatIndex !== undefined ? (g.seatIndex + 1) : '';
        csvContent += `${escape(tableName)},${escape(g.unit)},${escape(g.name)},${g.count},${seatIdx}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `名單更新_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}