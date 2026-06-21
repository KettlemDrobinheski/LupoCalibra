const sortingBins = {
    "BL_06": { minWeight: 160, maxWeight: 180, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_07": { minWeight: 181, maxWeight: 200, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_08": { minWeight: 201, maxWeight: 220, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_09": { minWeight: 221, maxWeight: 240, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_10": { minWeight: 241, maxWeight: 260, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_11": { minWeight: 261, maxWeight: 280, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_12": { minWeight: 281, maxWeight: 300, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_200UP": { minWeight: 160, maxWeight: 999, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" } // Acima de 300g cai tudo aqui
};

const MAX_ALLOWED_ERRORS = 5; 
let systemInterlockActive = false;
let downtimeSeconds = 0;
let simulationInterval = null;

const binsGrid = document.getElementById('binsGrid');
const systemStatusLabel = document.getElementById('systemStatusLabel');

function buildDashboard() {
    
    if (systemInterlockActive || machineJamActive) return; // Impede a esteira de rodar se estiver travada

    if (Math.random() < 0.03) { 
        triggerMachineJam();
        return;
    }

    binsGrid.innerHTML = '';
    
    Object.keys(sortingBins).forEach(binKey => {
        const bin = sortingBins[binKey];
        const card = document.createElement('div');
        
        let cardClass = 'bin-card';
        if (bin.status === "BLOQUEADO") cardClass += ' bin-error';
        
    
        const weightRange = binKey === "BL_200UP" ? "> 300g" : `${bin.minWeight}g - ${bin.maxWeight}g`;
        
        card.className = cardClass;
        card.innerHTML = `
            <div class="bin-header">
                <span class="bin-name">${binKey}</span>
            </div>
            <div class="bin-body">
                <p><strong>Faixa Alvo:</strong> ${weightRange}</p>
                <p><strong>Último Peso:</strong> <span class="weight-value">${bin.lastWeight > 0 ? bin.lastWeight + 'g' : '---'}</span></p>
                <p><strong>Contagem:</strong> ${bin.totalProcessed} un</p>
                <p><strong>Erros de Desvio:</strong> <span class="error-count">${bin.errorTimestamps.length} / ${MAX_ALLOWED_ERRORS}</span></p>
                <p><strong>Status:</strong> <span class="status-text">${bin.status}</span></p>
            </div>
        `;
        binsGrid.appendChild(card);
    });
}

function simulateBelt() {
    if (systemInterlockActive) return;

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
        
        const mechanicalFailure = Math.random() < 0.05;

        if (mechanicalFailure) {
            bin.errorTimestamps.push(new Date().toLocaleTimeString());
            console.error(`FALHA MECÂNICA: Pistão da ${targetBinKey} falhou ao desviar coxa de ${simulatedWeight}g!`);
            
            if (bin.errorTimestamps.length >= MAX_ALLOWED_ERRORS) {
                bin.status = "BLOQUEADO";
                triggerInterlock(`CRÍTICO: Linha parada por quebra de atuador na ${targetBinKey}!`);
            }
        } else {
            
            bin.totalProcessed++;
            bin.lastWeight = simulatedWeight;
        }
    }

    buildDashboard();
}

function triggerInterlock(reason) {
    systemInterlockActive = true;
    systemStatusLabel.textContent = "EMERGÊNCIA - LINHA BLOQUEADA";
    systemStatusLabel.className = "system-status status-stopped";
    alert(reason);
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
    
    buildDashboard();
    console.log("Linha reiniciada com sucesso!");
}

window.onload = function() {
    buildDashboard();
    simulationInterval = setInterval(simulateBelt, 342);
}

function triggerMachineJam() {
    machineJamActive = true;
    systemStatusLabel.textContent = "ALERTA: ESTEIRA TRAVADA / JAM DETECTED";
    systemStatusLabel.className = "system-status status-jammed"; 
    
    downtimeSeconds = 0;
    downtimeInterval = setInterval(() => {
        downtimeSeconds++;
        systemStatusLabel.textContent = `ESTEIRA TRAVADA - TEMPO PARADO: ${downtimeSeconds}s`;
    }, 1000);
};