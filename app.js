const buildingsConfig = [
    { id: 'A', name: 'VPE I', floors: 5, roomsPerFloor: 7, baseRoomNum: 101 },
    { id: 'B', name: 'VPE II & III', floors: 4, roomsPerFloor: 6, baseRoomNum: 108 },
    { id: 'C', name: 'VPE IV', floors: 3, roomsPerFloor: 6, baseRoomNum: 114 },
    { id: 'D', name: 'VPE V (Front)', floors: 3, roomsPerFloor: 4, baseRoomNum: 120 },
    { id: 'E', name: 'VPE Connector', floors: 2, roomsPerFloor: 1, baseRoomNum: 130 },
    { id: 'F', name: 'SCE I', floors: 3, roomsPerFloor: 4, baseRoomNum: 125 },
    { id: 'G', name: 'DECS-DPWH', floors: 1, roomsPerFloor: 2, baseRoomNum: 131 }
];

const campusNodes = [
    { id: 'A', name: 'VPE I Exit', x: 100, y: 100 },
    { id: 'B', name: 'VPE II & III Exit', x: 300, y: 100 },
    { id: 'C', name: 'VPE IV Exit', x: 500, y: 200 },
    { id: 'D', name: 'VPE V Exit', x: 100, y: 300 },
    { id: 'E', name: 'VPE Connector Exit', x: 280, y: 220 },
    { id: 'F', name: 'SCE I Exit', x: 250, y: 40 },
    { id: 'G', name: 'DECS-DPWH Exit', x: 420, y: 380 },
    { id: 'H', name: 'Covered Court', x: 300, y: 300 },
    { id: 'I', name: 'Open Ground (Evac)', x: 260, y: 420 },
    { id: 'J', name: 'Main Gate', x: 80, y: 420 },
    { id: 'K', name: 'Back Gate', x: 480, y: 460 }
];

const campusEdges = [
    { u: 'A', v: 'B', w: 3 }, { u: 'A', v: 'D', w: 5 }, { u: 'A', v: 'E', w: 2 }, { u: 'A', v: 'F', w: 4 },
    { u: 'B', v: 'C', w: 4 }, { u: 'B', v: 'E', w: 1 }, { u: 'B', v: 'H', w: 3 },
    { u: 'C', v: 'E', w: 2 }, { u: 'C', v: 'G', w: 3 }, { u: 'C', v: 'I', w: 5 },
    { u: 'D', v: 'I', w: 2 }, { u: 'D', v: 'J', w: 1 },
    { u: 'E', v: 'H', w: 2 },
    { u: 'F', v: 'G', w: 2 }, { u: 'F', v: 'K', w: 3 },
    { u: 'G', v: 'I', w: 1 }, { u: 'G', v: 'K', w: 2 },
    { u: 'H', v: 'I', w: 1 },
    { u: 'I', v: 'J', w: 3 }, { u: 'I', v: 'K', w: 4 }
];

// Dynamically generate all 105 classrooms, corridors, staircases and unified edges
let allNodes = [];
let allEdges = [];
let roomToBuildingMap = {}; // Maps Room ID to { buildingId, floor, roomNum }

function generateUnifiedGraph() {
    allNodes = [];
    allEdges = [];
    roomToBuildingMap = {};

    // 1. Add campus nodes
    campusNodes.forEach(node => {
        allNodes.push({ id: node.id, name: node.name, type: 'campus' });
    });

    // 2. Add campus edges
    campusEdges.forEach(edge => {
        allEdges.push({ u: edge.u, v: edge.v, w: edge.w });
    });

    // 3. Generate rooms and corridors per building
    buildingsConfig.forEach(b => {
        for (let floor = 1; floor <= b.floors; floor++) {
            const corrId = `Corr_${b.id}${floor}`;
            const stairsId = `Stairs_${b.id}${floor}`;

            // Add Corridor and Staircase nodes
            allNodes.push({ id: corrId, name: `${b.name} Corridor Floor ${floor}`, type: 'corridor' });
            allNodes.push({ id: stairsId, name: `${b.name} Staircase Floor ${floor}`, type: 'staircase' });

            // Connect Corridor to Staircase
            allEdges.push({ u: corrId, v: stairsId, w: 1 });

            // Generate classrooms for this floor
            for (let r = 0; r < b.roomsPerFloor; r++) {
                const roomNum = (floor * 100) + (b.baseRoomNum % 100) + r;
                const roomId = `Room_${b.id}_${roomNum}`;
                
                allNodes.push({ id: roomId, name: `Classroom ${roomNum} (${b.name})`, type: 'room' });
                roomToBuildingMap[roomId] = { buildingId: b.id, floor, roomNum, roomId };

                // Connect classroom to Corridor
                allEdges.push({ u: roomId, v: corrId, w: 1 });
            }

            // Connect staircases vertically
            if (floor > 1) {
                const prevStairsId = `Stairs_${b.id}${floor - 1}`;
                allEdges.push({ u: stairsId, v: prevStairsId, w: 2 }); // staircase traversal weight
            } else {
                // Connect 1st Floor Staircase to Building exit node on campus
                allEdges.push({ u: stairsId, v: b.id, w: 1 });
            }
        }
    });
}

generateUnifiedGraph();

// App states
let sourceNode = 'Room_A_101';
let targetNode = 'CLOSEST';
let activeHazard = 'NONE';
let activeAlgorithm = 'DIJKSTRA';
let crowdLevel = 10;
let voiceEnabled = false;

let blockedEdges = new Set();
let blockedNodes = new Set();
let customWeights = {};
let simulationSteps = [];
let currentStepIdx = 0;
let isPlaying = false;
let playInterval = null;
let playSpeed = 100;
let historyLog = [];

// Populate source select dropdown with 105 rooms
const srcSelect = document.getElementById('src-select');
const dstSelect = document.getElementById('dst-select');
const algoSelect = document.getElementById('algorithm-select');
const hazardSelect = document.getElementById('hazard-preset');
const crowdRange = document.getElementById('crowd-range');
const crowdVal = document.getElementById('crowd-val');
const speedRange = document.getElementById('speed-range');
const speedVal = document.getElementById('speed-val');
const btnSpeak = document.getElementById('btn-speak');
const edgeSelect = document.getElementById('edge-editor-select');
const edgeWeightSlider = document.getElementById('edge-weight-slider');
const edgeWeightVal = document.getElementById('edge-weight-val');

allNodes.filter(n => n.type === 'room').forEach(n => {
    const opt = new Option(n.name, n.id);
    srcSelect.add(opt);
});

// Setup target gate selector
srcSelect.value = sourceNode;
dstSelect.value = targetNode;

// Populate custom edge selector (only campus outdoor links for simplicity in editor)
campusEdges.forEach(edge => {
    const opt = new Option(`${edge.u} ➔ ${edge.v}`, `${edge.u}-${edge.v}`);
    edgeSelect.add(opt);
});

// Event listeners
srcSelect.addEventListener('change', (e) => { sourceNode = e.target.value; calculateRoute(); });
dstSelect.addEventListener('change', (e) => { targetNode = e.target.value; calculateRoute(); });
algoSelect.addEventListener('change', (e) => { activeAlgorithm = e.target.value; calculateRoute(); });
hazardSelect.addEventListener('change', (e) => { activeHazard = e.target.value; calculateRoute(); });

crowdRange.addEventListener('input', (e) => {
    crowdLevel = parseInt(e.target.value);
    crowdVal.textContent = crowdLevel <= 30 ? `Low (${crowdLevel}%)` : (crowdLevel <= 70 ? `Moderate (${crowdLevel}%)` : `High (${crowdLevel}%)`);
    calculateRoute();
});

speedRange.addEventListener('input', (e) => {
    playSpeed = parseInt(e.target.value);
    speedVal.textContent = `${(playSpeed / 1000).toFixed(1)}s`;
    if (isPlaying) { stopPlay(); startPlay(); }
});

btnSpeak.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    btnSpeak.textContent = voiceEnabled ? '🔊 Voice On' : '🔊 Voice Off';
    btnSpeak.className = voiceEnabled ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
});

// Edge editor listeners
edgeSelect.addEventListener('change', () => {
    const key = edgeSelect.value;
    const currentW = customWeights[key] || campusEdges.find(e => `${e.u}-${e.v}` === key || `${e.v}-${e.u}` === key).w;
    edgeWeightSlider.value = currentW;
    edgeWeightVal.textContent = currentW;
});

edgeWeightSlider.addEventListener('input', (e) => {
    const key = edgeSelect.value;
    const weight = parseInt(e.target.value);
    edgeWeightVal.textContent = weight;
    customWeights[key] = weight;
    const parts = key.split('-');
    customWeights[`${parts[1]}-${parts[0]}`] = weight;
    calculateRoute();
});

function simulateQRCode() {
    const rooms = allNodes.filter(n => n.type === 'room');
    const randomRoom = rooms[Math.floor(Math.random() * rooms.length)].id;
    sourceNode = randomRoom;
    srcSelect.value = randomRoom;
    calculateRoute();
    speak(`Mock QR Scan: Started at ${allNodes.find(r => r.id === randomRoom)?.name || randomRoom}`);
}

function speak(text) {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
}

// Heuristics mapping (for A* search)
function getHeuristic(nodeId, targetId) {
    if (targetId === 'CLOSEST') {
        return Math.min(getCampusDistance(nodeId, 'J'), getCampusDistance(nodeId, 'K'));
    }
    return getCampusDistance(nodeId, targetId);
}

function getCampusDistance(nodeId, targetId) {
    // If node is a classroom, use its parent exit building position as approximation
    let campusNodeId = nodeId;
    if (roomToBuildingMap[nodeId]) {
        campusNodeId = roomToBuildingMap[nodeId].buildingId;
    } else if (nodeId.startsWith('Corr_') || nodeId.startsWith('Stairs_')) {
        campusNodeId = nodeId.split('_')[1].substring(0, 1);
    }
    
    const n1 = campusNodes.find(n => n.id === campusNodeId);
    const n2 = campusNodes.find(n => n.id === targetId);
    if (!n1 || !n2) return 0;
    return parseFloat((Math.hypot(n1.x - n2.x, n1.y - n2.y) / 50).toFixed(1));
}

// 1. Standard / Capacity-Constrained Dijkstra
function runSolver(srcId, dstId) {
    const INF = Infinity;
    const gCost = {};
    const fCost = {};
    const prev = {};
    const visited = new Set();
    const steps = [];

    allNodes.forEach(n => {
        gCost[n.id] = INF;
        fCost[n.id] = INF;
        prev[n.id] = null;
    });

    if (!blockedNodes.has(srcId)) {
        gCost[srcId] = 0;
        fCost[srcId] = activeAlgorithm === 'ASTAR' ? getHeuristic(srcId, dstId) : 0;
    }

    steps.push({
        selected: null,
        explanation: `Initializing ${activeAlgorithm} solver on classroom node ${srcId}.`,
        table: allNodes.filter(n => n.type === 'room' || n.id === 'J' || n.id === 'K' || n.id === srcId).map(n => ({
            node: n.id,
            cost: gCost[n.id] === INF ? -1 : gCost[n.id],
            prev: " "
        })),
        queue: [{ node: srcId, cost: fCost[srcId] }]
    });

    let finalDst = null;

    // Build weight dynamic matrix
    const weights = {};
    allNodes.forEach(u => {
        weights[u.id] = {};
    });

    allEdges.forEach(edge => {
        const u = edge.u;
        const v = edge.v;
        
        let w = edge.w;
        const key = `${u}-${v}`;
        
        if (customWeights[key]) {
            w = customWeights[key];
        }

        // Apply Capacity-Constrained Bottleneck routing weights (Improvement 2)
        if (activeAlgorithm === 'CAPACITY') {
            const uStairs = u.includes('Stairs_') || v.includes('Stairs_');
            const uCorr = u.includes('Corr_') || v.includes('Corr_');
            // Staircases capacity = 8, hallways = 20, campus = 80
            const cap = uStairs ? 8 : (uCorr ? 20 : 80);
            w += Math.floor((crowdLevel / cap) * 10);
        } else if (crowdLevel > 30 && roomToBuildingMap[u]) {
            w += Math.floor(crowdLevel * 0.1);
        }

        if (activeHazard === 'EARTHQUAKE' && (u.includes('_A') || v.includes('_A') || u === 'A' || v === 'A')) {
            w += 10;
        } else if (activeHazard === 'FIRE' && (u.includes('Corr_') || v.includes('Corr_'))) {
            w += 8;
        }

        const isEdgeBlocked = blockedEdges.has(`${u}-${v}`) || 
                             blockedEdges.has(`${v}-${u}`) || 
                             blockedNodes.has(u) || 
                             blockedNodes.has(v);

        if (!isEdgeBlocked) {
            weights[u][v] = w;
            weights[v][u] = w;
        }
    });

    for (let count = 0; count < allNodes.length; count++) {
        let u = null;
        let minVal = INF;

        const pq = allNodes
            .filter(n => !visited.has(n.id) && gCost[n.id] !== INF)
            .map(n => ({ node: n.id, cost: activeAlgorithm === 'ASTAR' ? fCost[n.id] : gCost[n.id] }))
            .sort((a, b) => a.cost - b.cost);

        allNodes.forEach(n => {
            const costCheck = activeAlgorithm === 'ASTAR' ? fCost[n.id] : gCost[n.id];
            if (!visited.has(n.id) && costCheck < minVal) {
                minVal = costCheck;
                u = n.id;
            }
        });

        if (u === null || gCost[u] === INF) break;

        visited.add(u);

        steps.push({
            selected: u,
            explanation: `Visited vertex: ${u}. Cost: ${gCost[u].toFixed(1)}.`,
            table: allNodes.filter(n => n.type === 'room' || n.id === 'J' || n.id === 'K' || n.id === srcId).map(n => ({
                node: n.id,
                cost: gCost[n.id] === INF ? -1 : gCost[n.id],
                prev: prev[n.id] ? prev[n.id] : " "
            })),
            queue: pq.slice(0, 8)
        });

        if (dstId === 'CLOSEST') {
            if (u === 'J' || u === 'K') {
                finalDst = u;
                break;
            }
        } else if (u === dstId) {
            finalDst = u;
            break;
        }

        for (const v in weights[u]) {
            const w = weights[u][v];
            if (w > 0 && !visited.has(v)) {
                if (gCost[u] + w < gCost[v]) {
                    gCost[v] = gCost[u] + w;
                    const h = activeAlgorithm === 'ASTAR' ? getHeuristic(v, dstId) : 0;
                    fCost[v] = gCost[v] + h;
                    prev[v] = u;

                    steps.push({
                        selected: u,
                        relaxingEdge: { u, v },
                        explanation: `Inspecting connection ${u} ➔ ${v}. Updated cost to ${gCost[v].toFixed(1)}.`,
                        table: allNodes.filter(n => n.type === 'room' || n.id === 'J' || n.id === 'K' || n.id === srcId).map(n => ({
                            node: n.id,
                            cost: gCost[n.id] === INF ? -1 : gCost[n.id],
                            prev: prev[n.id] ? prev[n.id] : " "
                        })),
                        queue: pq.slice(0, 8)
                    });
                }
            }
        }
    }

    const path = [];
    const targetValue = finalDst || (dstId === 'CLOSEST' ? null : dstId);
    if (targetValue && gCost[targetValue] !== INF) {
        let curr = targetValue;
        while (curr !== null) {
            path.push(curr);
            curr = prev[curr];
        }
        path.reverse();
    }

    return {
        steps,
        path,
        totalCost: targetValue ? gCost[targetValue] : -1,
        finalDst: targetValue
    };
}

// 2. Bi-Directional Dijkstra (Forward & Backward concurrently - Improvement 3)
function runBiDirectionalSolver(srcId, dstId) {
    const INF = Infinity;
    const gF = {}; // Forward costs
    const gB = {}; // Backward costs
    const prevF = {};
    const prevB = {};
    const visitedF = new Set();
    const visitedB = new Set();
    const steps = [];

    allNodes.forEach(n => {
        gF[n.id] = INF;
        gB[n.id] = INF;
        prevF[n.id] = null;
        prevB[n.id] = null;
    });

    gF[srcId] = 0;
    
    // In closest target search, backward starts from both J and K exit gates!
    const targets = dstId === 'CLOSEST' ? ['J', 'K'] : [dstId];
    targets.forEach(t => {
        gB[t] = 0;
    });

    // Build static edge map
    const weights = {};
    allNodes.forEach(u => { weights[u.id] = {}; });
    allEdges.forEach(edge => {
        const u = edge.u; const v = edge.v; let w = edge.w;
        const key = `${u}-${v}`;
        if (customWeights[key]) w = customWeights[key];
        const isBlocked = blockedEdges.has(`${u}-${v}`) || blockedEdges.has(`${v}-${u}`) || blockedNodes.has(u) || blockedNodes.has(v);
        if (!isBlocked) { weights[u][v] = w; weights[v][u] = w; }
    });

    steps.push({
        selected: null,
        explanation: `Initializing Bi-Directional search. Forward queue starts at ${srcId}. Backward queue starts at ${targets.join('/')}.`,
        table: allNodes.filter(n => n.type === 'room' || n.id === 'J' || n.id === 'K' || n.id === srcId).map(n => ({
            node: n.id,
            cost: gF[n.id] === INF ? -1 : gF[n.id],
            prev: " "
        })),
        queue: [{ node: srcId, cost: 0 }]
    });

    let intersectNode = null;

    for (let count = 0; count < allNodes.length; count++) {
        // Step Forward
        let uF = null; let minF = INF;
        allNodes.forEach(n => {
            if (!visitedF.has(n.id) && gF[n.id] < minF) { minF = gF[n.id]; uF = n.id; }
        });

        if (uF !== null && gF[uF] !== INF) {
            visitedF.add(uF);
            steps.push({
                selected: uF,
                explanation: `Forward Search: Visited ${uF} (Cost: ${gF[uF].toFixed(1)}).`,
                table: allNodes.filter(n => n.type === 'room' || n.id === 'J' || n.id === 'K' || n.id === srcId).map(n => ({
                    node: n.id,
                    cost: gF[n.id] === INF ? -1 : gF[n.id],
                    prev: prevF[n.id] ? prevF[n.id] : " "
                })),
                queue: [{ node: uF, cost: gF[uF] }]
            });

            if (visitedB.has(uF)) {
                intersectNode = uF;
                break;
            }

            for (const v in weights[uF]) {
                const w = weights[uF][v];
                if (!visitedF.has(v) && gF[uF] + w < gF[v]) {
                    gF[v] = gF[uF] + w;
                    prevF[v] = uF;
                }
            }
        }

        // Step Backward
        let uB = null; let minB = INF;
        allNodes.forEach(n => {
            if (!visitedB.has(n.id) && gB[n.id] < minB) { minB = gB[n.id]; uB = n.id; }
        });

        if (uB !== null && gB[uB] !== INF) {
            visitedB.add(uB);
            steps.push({
                selected: uB,
                explanation: `Backward Search: Visited ${uB} (Cost: ${gB[uB].toFixed(1)}).`,
                table: allNodes.filter(n => n.type === 'room' || n.id === 'J' || n.id === 'K' || n.id === srcId).map(n => ({
                    node: n.id,
                    cost: gB[n.id] === INF ? -1 : gB[n.id],
                    prev: prevB[n.id] ? prevB[n.id] : " "
                })),
                queue: [{ node: uB, cost: gB[uB] }]
            });

            if (visitedF.has(uB)) {
                intersectNode = uB;
                break;
            }

            for (const v in weights[uB]) {
                const w = weights[uB][v];
                if (!visitedB.has(v) && gB[uB] + w < gB[v]) {
                    gB[v] = gB[uB] + w;
                    prevB[v] = uB;
                }
            }
        }

        if ((uF === null || gF[uF] === INF) && (uB === null || gB[uB] === INF)) break;
    }

    // Reconstruct Bi-Directional Path
    const path = [];
    let totalCost = -1;
    let finalDst = null;

    if (intersectNode) {
        // Forward trace
        let curr = intersectNode;
        while (curr !== null) {
            path.push(curr);
            curr = prevF[curr];
        }
        path.reverse();

        // Backward trace (append)
        curr = prevB[intersectNode];
        while (curr !== null) {
            path.push(curr);
            curr = prevB[curr];
        }

        totalCost = gF[intersectNode] + gB[intersectNode];
        finalDst = path[path.length - 1];
    }

    return { steps, path, totalCost, finalDst };
}

// 3. Yen's K-Shortest Paths (Calculates top 3 alternative paths - Improvement 1)
function runYenKShortestPaths(srcId, dstId) {
    const K = 3;
    const paths = [];
    const steps = [];

    // Find 1st shortest path
    const run1 = runSolver(srcId, dstId);
    if (run1.path.length === 0) {
        return { paths: [], steps: run1.steps, totalCost: -1, finalDst: null };
    }

    paths.push(run1.path);
    steps.push(...run1.steps);

    const candidates = [];

    for (let k = 1; k < K; k++) {
        const prevPath = paths[k - 1];
        
        for (let i = 0; i < prevPath.length - 1; i++) {
            const spurNode = prevPath[i];
            const rootPath = prevPath.slice(0, i + 1);

            const edgesRemoved = [];
            paths.forEach(p => {
                if (p.length > i && p.slice(0, i + 1).join('-') === rootPath.join('-')) {
                    const u = p[i];
                    const v = p[i + 1];
                    // Temporarily block edge
                    blockedEdges.add(`${u}-${v}`);
                    blockedEdges.add(`${v}-${u}`);
                    edgesRemoved.push({ u, v });
                }
            });

            // Temporarily block nodes in rootPath (except spurNode)
            const nodesRemoved = [];
            rootPath.slice(0, -1).forEach(node => {
                blockedNodes.add(node);
                nodesRemoved.push(node);
            });

            // Find spur path from spurNode to target exit
            const spurResult = runSolver(spurNode, dstId);
            if (spurResult.path.length > 0) {
                const totalPath = rootPath.slice(0, -1).concat(spurResult.path);
                candidates.push({ path: totalPath, cost: spurResult.totalCost });
            }

            // Restore blocked edges & nodes
            edgesRemoved.forEach(e => {
                blockedEdges.delete(`${e.u}-${e.v}`);
                blockedEdges.delete(`${e.v}-${e.u}`);
            });
            nodesRemoved.forEach(n => {
                blockedNodes.delete(n);
            });
        }

        if (candidates.length === 0) break;

        // Sort candidates by cost and pick lowest unique path
        candidates.sort((a, b) => a.cost - b.cost);
        let nextPath = null;
        for (let cand of candidates) {
            const pathStr = cand.path.join('-');
            if (!paths.some(p => p.join('-') === pathStr)) {
                nextPath = cand.path;
                break;
            }
        }

        if (nextPath) {
            paths.push(nextPath);
        } else {
            break;
        }
    }

    return {
        paths,
        steps,
        totalCost: run1.totalCost,
        finalDst: run1.finalDst
    };
}

// Render Campus SVG Map
function renderCampusGraph(activePath = [], activeNode = null, relaxingEdge = null) {
    const edgesGroup = document.getElementById('edges-group');
    const nodesGroup = document.getElementById('nodes-group');
    edgesGroup.innerHTML = '';
    nodesGroup.innerHTML = '';

    // Draw outdoor connections
    campusEdges.forEach(edge => {
        const uNode = campusNodes.find(n => n.id === edge.u);
        const vNode = campusNodes.find(n => n.id === edge.v);
        const isBlocked = blockedEdges.has(`${edge.u}-${edge.v}`) || 
                          blockedEdges.has(`${edge.v}-${edge.u}`) || 
                          blockedNodes.has(edge.u) || 
                          blockedNodes.has(edge.v);

        let isActive = false;
        let isPath2 = false;
        let isPath3 = false;

        // Check if multi-paths array is passed (Yen's algorithm)
        if (Array.isArray(activePath[0])) {
            const p1 = activePath[0] || [];
            const p2 = activePath[1] || [];
            const p3 = activePath[2] || [];

            for (let i = 0; i < p1.length - 1; i++) {
                if ((p1[i] === edge.u && p1[i+1] === edge.v) || (p1[i] === edge.v && p1[i+1] === edge.u)) isActive = true;
            }
            for (let i = 0; i < p2.length - 1; i++) {
                if ((p2[i] === edge.u && p2[i+1] === edge.v) || (p2[i] === edge.v && p2[i+1] === edge.u)) isPath2 = true;
            }
            for (let i = 0; i < p3.length - 1; i++) {
                if ((p3[i] === edge.u && p3[i+1] === edge.v) || (p3[i] === edge.v && p3[i+1] === edge.u)) isPath3 = true;
            }
        } else {
            for (let i = 0; i < activePath.length - 1; i++) {
                if ((activePath[i] === edge.u && activePath[i+1] === edge.v) ||
                    (activePath[i] === edge.v && activePath[i+1] === edge.u)) {
                    isActive = true;
                    break;
                }
            }
        }

        const isRelaxing = relaxingEdge && 
            ((relaxingEdge.u === edge.u && relaxingEdge.v === edge.v) || 
             (relaxingEdge.u === edge.v && relaxingEdge.v === edge.u));

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', uNode.x);
        line.setAttribute('y1', uNode.y);
        line.setAttribute('x2', vNode.x);
        line.setAttribute('y2', vNode.y);
        
        let pathClass = 'edge-line';
        if (isBlocked) pathClass += ' blocked';
        if (isActive) pathClass += ' active-path';
        if (isPath2) pathClass += ' active-path-2';
        if (isPath3) pathClass += ' active-path-3';
        if (isRelaxing) pathClass += ' relaxing';

        line.setAttribute('class', pathClass);
        line.onclick = () => toggleEdgeBlockage(edge.u, edge.v);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (uNode.x + vNode.x) / 2);
        text.setAttribute('y', (uNode.y + vNode.y) / 2 - 5);
        
        const key = `${edge.u}-${edge.v}`;
        const weightVal = customWeights[key] || edge.w;
        const isCustom = !!customWeights[key];
        
        text.setAttribute('class', `edge-weight ${isCustom ? 'custom-weight' : ''}`);
        text.textContent = weightVal;

        edgesGroup.appendChild(line);
        edgesGroup.appendChild(text);
    });

    // Draw exit doors & muster points
    campusNodes.forEach(node => {
        const activeRoomInfo = roomToBuildingMap[sourceNode];
        const isSource = activeRoomInfo && activeRoomInfo.buildingId === node.id;
        let isTarget = node.id === targetNode || (targetNode === 'CLOSEST' && (node.id === 'J' || node.id === 'K')) || node.id === computedFinalDst;
        
        const isBlocked = blockedNodes.has(node.id);
        let isHighlighted = activeNode === node.id;
        if (Array.isArray(activePath[0])) {
            isHighlighted = isHighlighted || activePath.some(p => p.includes(node.id));
        } else {
            isHighlighted = isHighlighted || activePath.includes(node.id);
        }

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', 16);
        circle.setAttribute('class', `node-circle ${isSource ? 'source' : ''} ${isTarget ? 'target' : ''} ${isBlocked ? 'blocked' : ''} ${isHighlighted ? 'highlighted-path' : ''}`);
        
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = node.name;
        circle.appendChild(title);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 5);
        text.setAttribute('class', `node-label ${isSource ? 'source' : (isTarget ? 'target' : (isBlocked ? 'blocked' : ''))}`);
        text.textContent = node.id;

        nodesGroup.appendChild(circle);
        nodesGroup.appendChild(text);
    });
}

// Reset Simulator to clear states and custom parameters
function resetSimulator() {
    sourceNode = 'Room_A_101';
    targetNode = 'CLOSEST';
    activeHazard = 'NONE';
    activeAlgorithm = 'DIJKSTRA';
    crowdLevel = 10;
    playSpeed = 100; // default 0.1s

    srcSelect.value = sourceNode;
    dstSelect.value = targetNode;
    algoSelect.value = activeAlgorithm;
    hazardSelect.value = activeHazard;
    crowdRange.value = crowdLevel;
    crowdVal.textContent = 'Low (10%)';
    speedRange.value = 100;
    speedVal.textContent = '0.1s';

    clearBlockages();
}

// Dynamic Floor Plan Layout SVG renderer (Stacked whole building plan)
function renderFloorLayout(activePath = [], activeNode = null) {
    const floorEdgesGroup = document.getElementById('floor-edges-group');
    const floorNodesGroup = document.getElementById('floor-nodes-group');
    floorEdgesGroup.innerHTML = '';
    floorNodesGroup.innerHTML = '';

    const roomInfo = roomToBuildingMap[sourceNode];
    if (!roomInfo) return;

    const building = buildingsConfig.find(b => b.id === roomInfo.buildingId);
    document.getElementById('floor-card-title').textContent = `${building.name} (Whole Building Stacked Plan)`;

    const marginY = 50;
    const totalHeight = 400;
    const spaceY = building.floors > 1 ? totalHeight / (building.floors - 1) : 0;
    const startX = 120;
    const endX = 520;
    const staircaseX = 60;

    // Draw floors from top (highest floor) to bottom (1st floor)
    for (let f = building.floors; f >= 1; f--) {
        const floorY = marginY + (building.floors - f) * spaceY;

        // Draw Floor Label
        const floorLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        floorLabel.setAttribute('x', 560);
        floorLabel.setAttribute('y', floorY + 5);
        floorLabel.setAttribute('style', 'font-size: 12px; font-weight: 700; fill: var(--text-secondary);');
        floorLabel.textContent = `${f}F`;
        floorNodesGroup.appendChild(floorLabel);

        // Draw Corridor Hallway Line
        const corrLineId = `Corr_${building.id}${f}`;
        const isCorrActive = activePath.includes(corrLineId) || activeNode === corrLineId;
        
        const corridorLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        corridorLine.setAttribute('x1', startX);
        corridorLine.setAttribute('y1', floorY);
        corridorLine.setAttribute('x2', endX);
        corridorLine.setAttribute('y2', floorY);
        corridorLine.setAttribute('class', `edge-line ${isCorrActive ? 'active-path' : ''}`);
        floorEdgesGroup.appendChild(corridorLine);

        // Draw Corridor Hallway Node (Yellow dot in middle)
        const corrCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        corrCircle.setAttribute('cx', (startX + endX) / 2);
        corrCircle.setAttribute('cy', floorY);
        corrCircle.setAttribute('r', 8);
        corrCircle.setAttribute('class', `node-circle ${isCorrActive ? 'highlighted-path active-dot' : 'active-dot'}`);
        floorNodesGroup.appendChild(corrCircle);

        // Draw Staircase Node (Green dot at left end of corridor)
        const stairsId = `Stairs_${building.id}${f}`;
        const isStairsActive = activePath.includes(stairsId) || activeNode === stairsId;

        const staircaseCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        staircaseCircle.setAttribute('cx', staircaseX);
        staircaseCircle.setAttribute('cy', floorY);
        staircaseCircle.setAttribute('r', 12);
        staircaseCircle.setAttribute('class', `node-circle ${isStairsActive ? 'highlighted-path target' : 'target'}`);

        const stairsText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        stairsText.setAttribute('x', staircaseX);
        stairsText.setAttribute('y', floorY + 4);
        stairsText.setAttribute('class', 'node-label target');
        stairsText.textContent = 'ST';
        floorNodesGroup.appendChild(staircaseCircle);
        floorNodesGroup.appendChild(stairsText);

        // Connect Staircase to Corridor line
        const stairsLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        stairsLine.setAttribute('x1', staircaseX);
        stairsLine.setAttribute('y1', floorY);
        stairsLine.setAttribute('x2', startX);
        stairsLine.setAttribute('y2', floorY);
        stairsLine.setAttribute('class', `edge-line ${isStairsActive ? 'active-path' : ''}`);
        floorEdgesGroup.appendChild(stairsLine);

        // Draw rooms on this floor
        const spacingX = (endX - startX) / Math.max(1, building.roomsPerFloor - 1);
        for (let r = 0; r < building.roomsPerFloor; r++) {
            const roomNum = (f * 100) + (building.baseRoomNum % 100) + r;
            const roomId = `Room_${building.id}_${roomNum}`;
            const isCurrentRoom = roomId === sourceNode;
            const isPathRoom = activePath.includes(roomId) || activeNode === roomId;

            const rx = startX + (r * spacingX);
            const ry = r % 2 === 0 ? floorY - 20 : floorY + 20;

            // Connect room to Corridor line
            const roomLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            roomLine.setAttribute('x1', rx);
            roomLine.setAttribute('y1', ry);
            roomLine.setAttribute('x2', rx);
            roomLine.setAttribute('y2', floorY);
            roomLine.setAttribute('class', `edge-line ${isPathRoom ? 'active-path' : ''}`);
            floorEdgesGroup.appendChild(roomLine);

            // Room Circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', rx);
            circle.setAttribute('cy', ry);
            circle.setAttribute('r', 10);
            circle.setAttribute('class', `node-circle ${isCurrentRoom ? 'source' : (isPathRoom ? 'highlighted-path' : '')}`);
            circle.onclick = () => {
                sourceNode = roomId;
                srcSelect.value = roomId;
                calculateRoute();
            };

            // Touch target (larger click area)
            const touchC = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            touchC.setAttribute('cx', rx);
            touchC.setAttribute('cy', ry);
            touchC.setAttribute('r', 20);
            touchC.setAttribute('fill', 'transparent');
            touchC.setAttribute('style', 'cursor: pointer;');
            touchC.onclick = () => {
                sourceNode = roomId;
                srcSelect.value = roomId;
                calculateRoute();
            };

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', rx);
            text.setAttribute('y', ry + 3);
            text.setAttribute('class', `node-label ${isCurrentRoom ? 'source' : ''}`);
            text.setAttribute('style', 'font-size: 8px;');
            text.textContent = roomNum;

            floorNodesGroup.appendChild(circle);
            floorNodesGroup.appendChild(text);
            floorNodesGroup.appendChild(touchC);
        }

        // Draw vertical staircase lines down
        if (f > 1) {
            const nextFloorY = marginY + (building.floors - f + 1) * spaceY;
            const vertLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            vertLine.setAttribute('x1', staircaseX);
            vertLine.setAttribute('y1', floorY);
            vertLine.setAttribute('x2', staircaseX);
            vertLine.setAttribute('y2', nextFloorY);
            
            const nextStairsId = `Stairs_${building.id}${f - 1}`;
            const isVertActive = activePath.includes(stairsId) && activePath.includes(nextStairsId);
            vertLine.setAttribute('class', `edge-line ${isVertActive ? 'active-path' : ''}`);
            vertLine.setAttribute('style', 'stroke-dasharray: 4,4;');
            floorEdgesGroup.appendChild(vertLine);
        } else {
            // 1st Floor Exit arrow leading to campus grounds exit
            const exitLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            exitLine.setAttribute('x1', staircaseX);
            exitLine.setAttribute('y1', floorY);
            exitLine.setAttribute('x2', staircaseX);
            exitLine.setAttribute('y2', floorY + 40);
            
            const isExitActive = activePath.includes(stairsId) && activePath.includes(building.id);
            exitLine.setAttribute('class', `edge-line ${isExitActive ? 'active-path' : ''}`);
            floorEdgesGroup.appendChild(exitLine);
        }
    }
}

// Calculate, trace and display updates
// Calculate, trace and display updates
let computedRoute = []; // Can be a single path array or an array of multiple path arrays

function calculateRoute() {
    stopPlay();
    let result;
    if (activeAlgorithm === 'BIDIRECTIONAL') {
        result = runBiDirectionalSolver(sourceNode, targetNode);
    } else if (activeAlgorithm === 'KSHORTEST') {
        result = runYenKShortestPaths(sourceNode, targetNode);
    } else {
        result = runSolver(sourceNode, targetNode);
    }

    simulationSteps = result.steps || [];
    computedRoute = activeAlgorithm === 'KSHORTEST' ? (result.paths || []) : (result.path || []);
    computedCost = result.totalCost;
    computedFinalDst = result.finalDst;
    currentStepIdx = simulationSteps.length - 1;
    updateSimulationUI(computedRoute, computedCost);
    updateAnalytics();
    logHistoryEntry();
}

function updateSimulationUI(finalPath = [], finalCost = -1) {
    if (!simulationSteps.length) {
        renderCampusGraph();
        return;
    }

    const step = simulationSteps[currentStepIdx];
    const isLastStep = currentStepIdx === simulationSteps.length - 1;
    const activePath = isLastStep ? finalPath : [];

    renderCampusGraph(activePath, step.selected, step.relaxingEdge);
    renderFloorLayout(activePath, step.selected);

    document.getElementById('step-explanation').textContent = step.explanation;

    // Dijkstra Table update
    const tbody = document.getElementById('dijkstra-tbody');
    tbody.innerHTML = '';

    step.table.forEach(row => {
        const tr = document.createElement('tr');
        if (row.node === step.selected) tr.classList.add('active-node');
        
        let labelText = row.node;
        if (row.node.startsWith('Room_')) {
            labelText = `Room ${row.node.split('_')[2]}`;
        } else if (row.node.startsWith('Corr_')) {
            labelText = `Corr ${row.node.split('_')[1]}`;
        } else if (row.node.startsWith('Stairs_')) {
            labelText = `Stairs ${row.node.split('_')[1]}`;
        }

        tr.innerHTML = `<td><strong>${labelText}</strong></td>
                        <td>${row.cost === -1 ? '∞' : row.cost.toFixed(1)}</td>
                        <td>${row.prev.trim() || '-'}</td>`;
        tbody.appendChild(tr);
    });

    // Queue update
    const queueState = document.getElementById('queue-state');
    queueState.innerHTML = '';
    if (step.queue && step.queue.length) {
        step.queue.forEach(item => {
            const badge = document.createElement('span');
            badge.className = `queue-badge ${item.node === step.selected ? 'current' : ''}`;
            let queueLabel = item.node;
            if (item.node.startsWith('Room_')) queueLabel = `R-${item.node.split('_')[2]}`;
            badge.textContent = `${queueLabel}: ${item.cost.toFixed(1)}`;
            queueState.appendChild(badge);
        });
    } else {
        queueState.innerHTML = '<span class="text-secondary" style="font-size:0.75rem">Queue Empty</span>';
    }

    document.getElementById('step-label').textContent = `Step ${currentStepIdx + 1} / ${simulationSteps.length}`;
    
    // Path result formatting
    let pathText = 'No Route Available';
    if (activeAlgorithm === 'KSHORTEST' && Array.isArray(finalPath[0])) {
        pathText = finalPath.map((p, idx) => {
            const shortStr = p.slice(0, 3).map(n => n.startsWith('Room_') ? `Room ${n.split('_')[2]}` : n).join('➔') + '...';
            return `[Route ${idx+1}]: ${shortStr}`;
        }).join(' | ');
    } else if (finalPath.length) {
        pathText = finalPath.map(p => {
            if (p.startsWith('Room_')) return `Room ${p.split('_')[2]}`;
            if (p.startsWith('Corr_')) return `Hall`;
            if (p.startsWith('Stairs_')) return `Stairs`;
            return p;
        }).join(' ➔ ');
    }
    
    document.getElementById('path-result').textContent = pathText;
    document.getElementById('cost-result').textContent = finalCost === -1 ? 'Blocked' : finalCost.toFixed(1);

    document.getElementById('btn-prev').disabled = currentStepIdx === 0;
    document.getElementById('btn-next').disabled = isLastStep;
}

function updateAnalytics() {
    const ratingEl = document.getElementById('stat-efficiency');
    const bottlenecksEl = document.getElementById('stat-bottlenecks');
    const congestedEl = document.getElementById('stat-congested-edges');
    const textEl = document.getElementById('stat-summary-text');

    let congestedCount = 0;
    allEdges.forEach(e => {
        const key = `${e.u}-${e.v}`;
        if (customWeights[key] && customWeights[key] > 5) congestedCount++;
    });

    const isPathBlocked = computedCost === -1;
    const rating = isPathBlocked ? 'Critical (0%)' : (computedCost < 12 ? 'Optimal (100%)' : 'Congested (65%)');
    
    ratingEl.textContent = rating;
    ratingEl.style.color = isPathBlocked ? 'var(--danger-color)' : (computedCost < 12 ? 'var(--success-color)' : 'var(--warning-color)');
    
    bottlenecksEl.textContent = blockedEdges.size / 2 + blockedNodes.size;
    congestedEl.textContent = congestedCount;

    if (isPathBlocked) {
        textEl.textContent = `CRITICAL ALERT: Target is unreachable due to route blocks. Clear debris.`;
    } else {
        const roomName = sourceNode.startsWith('Room_') ? `Classroom ${sourceNode.split('_')[2]}` : sourceNode;
        textEl.textContent = `Path from ${roomName} is clear. Routing steps calculated.`;
        speak(`Evacuation path calculated: exit via staircases to ${computedFinalDst}.`);
    }
}

// JSON Import/Export
function exportConfig() {
    const config = {
        blockedEdges: Array.from(blockedEdges),
        blockedNodes: Array.from(blockedNodes),
        customWeights,
        sourceNode,
        targetNode
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", "ehs_classroom_config.json");
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
}

function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const config = JSON.parse(e.target.result);
            blockedEdges = new Set(config.blockedEdges || []);
            blockedNodes = new Set(config.blockedNodes || []);
            customWeights = config.customWeights || {};
            sourceNode = config.sourceNode || 'Room_A_101';
            targetNode = config.targetNode || 'CLOSEST';
            srcSelect.value = sourceNode;
            dstSelect.value = targetNode;
            calculateRoute();
            speak("Configuration imported.");
        } catch (err) {
            alert("Error parsing JSON config file.");
        }
    };
    reader.readAsText(file);
}

function logHistoryEntry() {
    const historyContainer = document.getElementById('history-log');
    if (historyLog.length === 0) historyContainer.innerHTML = '';

    const label = targetNode === 'CLOSEST' ? `Closest Exit (${computedFinalDst})` : targetNode;
    const roomName = sourceNode.startsWith('Room_') ? `Room ${sourceNode.split('_')[2]}` : sourceNode;
    const entry = `${roomName} ➔ Exit: ${label} | Cost: ${computedCost === -1 ? '∞' : computedCost.toFixed(1)}`;

    if (historyLog[0] !== entry) {
        historyLog.unshift(entry);
        if (historyLog.length > 5) historyLog.pop();

        historyContainer.innerHTML = '';
        historyLog.forEach(l => {
            const d = document.createElement('div');
            d.className = 'log-entry';
            d.innerHTML = `<span>${l}</span>`;
            historyContainer.appendChild(d);
        });
    }
}

// Stepper control mappings
document.getElementById('btn-prev').onclick = () => {
    if (currentStepIdx > 0) {
        currentStepIdx--;
        updateSimulationUI(currentStepIdx === simulationSteps.length - 1 ? computedRoute : [], computedCost);
    }
};

document.getElementById('btn-next').onclick = () => {
    if (currentStepIdx < simulationSteps.length - 1) {
        currentStepIdx++;
        updateSimulationUI(currentStepIdx === simulationSteps.length - 1 ? computedRoute : [], computedCost);
    }
};

document.getElementById('btn-play').onclick = () => { isPlaying ? stopPlay() : startPlay(); };

function startPlay() {
    isPlaying = true;
    document.getElementById('btn-play').textContent = 'Pause';
    document.getElementById('btn-play').classList.replace('btn-primary', 'btn-secondary');
    if (currentStepIdx === simulationSteps.length - 1) currentStepIdx = 0;

    playInterval = setInterval(() => {
        if (currentStepIdx < simulationSteps.length - 1) {
            currentStepIdx++;
            updateSimulationUI(currentStepIdx === simulationSteps.length - 1 ? computedRoute : [], computedCost);
        } else {
            stopPlay();
        }
    }, playSpeed);
}

function stopPlay() {
    isPlaying = false;
    document.getElementById('btn-play').textContent = 'Play';
    document.getElementById('btn-play').classList.replace('btn-secondary', 'btn-primary');
    if (playInterval) { clearInterval(playInterval); playInterval = null; }
}

function toggleHelpModal() {
    const modal = document.getElementById('help-modal');
    modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
}

// Run Initial Solver
calculateRoute();
toggleHelpModal();
