const sortingBins = {
    "BL_06": { minWeight: 160, maxWeight: 180, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_07": { minWeight: 181, maxWeight: 200, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_08": { minWeight: 201, maxWeight: 220, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_09": { minWeight: 221, maxWeight: 240, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_10": { minWeight: 241, maxWeight: 260, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_11": { minWeight: 261, maxWeight: 280, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_12": { minWeight: 281, maxWeight: 300, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_200UP": { minWeight: 301, maxWeight: 999, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" } // Corrigido minWeight para 301 para não chocar com a BL_06
};

const MAX_ALLOWED_ERRORS = 5; 
let systemInterlockActive = false;
let machineJamActive = false;     // Declarado corretamente
let downtimeSeconds = 0;          // Declarado corretamente
let simulationInterval = null;
let downtimeInterval = null;      // Declarado corretamente

const binsGrid = document.getElementById('binsGrid');
const systemStatusLabel = document.getElementById('systemStatusLabel');

function buildDashboard() {
    binsGrid.innerHTML = '';

    Object.keys(sortingBins).forEach(binKey => {
        const bin = sortingBins[binKey];
        const card = document.createElement('div');
        card.id = `card-${binKey}`;
        card.className = 'bin-card';

        const weightRange = binKey === "BL_200UP" ? "> 300g" : `${bin.minWeight}g - ${bin.maxWeight}g`;

        card.innerHTML = `
            <div class="bin-header">
                <span class="bin-name">${binKey}</span>
            </div>
            <div class="bin-body">
                <p><strong>Faixa Alvo:</strong> ${weightRange}</p>
                <p><strong>Último Peso:</strong> <span id="weight-${binKey}" class="weight-value">---</span></p>
                <p><strong>Contagem:</strong> <span id="count-${binKey}">0</span> un</p>
                <p><strong>Erros de Desvio:</strong> <span id="errors-${binKey}" class="error-count">0 / ${MAX_ALLOWED_ERRORS}</span></p>
                <p><strong>Status:</strong> <span id="status-${binKey}" class="status-text">${bin.status}</span></p>
            </div>
        `;
        binsGrid.appendChild(card);
    });
}

    Object.keys(sortingBins).forEach(binKey => {
        const bin = sortingBins[binKey];
        const card = document.getElementById(`card-${binKey}`);
        
        if (card) {
            if (bin.status === "BLOQUEADO") {
                card.className = 'bin-card bin-error';
            } else {
                card.className = 'bin-card';
            }
            
            document.getElementById(`weight-${binKey}`).textContent = bin.lastWeight > 0 ? bin.lastWeight + 'g' : '---';
            document.getElementById(`count-${binKey}`).textContent = bin.totalProcessed;
            document.getElementById(`errors-${binKey}`).textContent = `${bin.errorTimestamps.length} / ${MAX_ALLOWED_ERRORS}`;
            document.getElementById(`status-${binKey}`).textContent = bin.status;
        }
    });

function simulateBelt() {

    if (systemInterlockActive || machineJamActive) return;

    if (Math.random() < 0.005) { 
        triggerMachineJam();
        return;
    }

    const simulatedWeight = Math.floor(Math.random() * (400 - 150 + 1)) + 150;
    let targetBinKey = null;

    Object.keys(sortingBins).forEach(binKey => {
        const bin = sortingBins[binKey];
        if (simulatedWeight >= bin.minWeight && simulatedWeight <= bin.maxWeight) {
            targetBinKey = binKey;
        }
    });

    if (targetBinKey) {
        const bin = sortingBins[targetBinKey];
        const mechanicalFailure = Math.random() < 0.02; // 2% de chance de erro no pistão pneumático

        if (mechanicalFailure) {
            bin.errorTimestamps.push(new Date().toLocaleTimeString());
            console.error(`FALHA MECÂNICA: Pistão da ${targetBinKey} falhou! Peso: ${simulatedWeight}g`);

            if (bin.errorTimestamps.length >= MAX_ALLOWED_ERRORS) {
                bin.status = "BLOQUEADO";
                triggerInterlock(`CRÍTICO: Linha parada por quebra de atuador na ${targetBinKey}!`);
            }
        } else {
            bin.totalProcessed++;
            bin.lastWeight = simulatedWeight;
        }
    }

    updateLiveValues();
}

function triggerInterlock(reason) {
    systemInterlockActive = true;
    systemStatusLabel.textContent = "EMERGÊNCIA - LINHA BLOQUEADA";
    systemStatusLabel.className = "system-status status-stopped";
    alert(reason);
}

function triggerMachineJam() {
    machineJamActive = true;
    systemStatusLabel.textContent = "ALERTA: ESTEIRA TRAVADA / JAM DETECTED";
    systemStatusLabel.className = "system-status status-jammed"; 

    downtimeSeconds = 0;
    clearInterval(downtimeInterval); 
    downtimeInterval = setInterval(() => {
        downtimeSeconds++;
        systemStatusLabel.textContent = `ESTEIRA TRAVADA - TEMPO PARADO: ${downtimeSeconds}s`;
    }, 1000);
}

function resetSystem() {
    console.log("Comando de Reset executado pelo operador.");

    clearInterval(downtimeInterval);
    downtimeSeconds = 0;

    systemInterlockActive = false;
    machineJamActive = false;

    Object.keys(sortingBins).forEach(binKey => {
        sortingBins[binKey].errorTimestamps = [];
        sortingBins[binKey].lastWeight = 0;
        sortingBins[binKey].status = "Operacional";
    });

    systemStatusLabel.textContent = "System OK";
    systemStatusLabel.className = "system-status status-running";

    updateLiveValues();
    console.log("Linha reiniciada com sucesso!");
}

window.onload = function() {
    buildDashboard();
    simulationInterval = setInterval(simulateBelt, 342); 
};