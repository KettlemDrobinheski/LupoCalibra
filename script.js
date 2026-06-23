const firebaseConfig = {
    apiKey: "AIzaSyCZbbRds530UMEhWLq39O6vGbiNnNCoHVI",
    authDomain: "lupocalibra.firebaseapp.com",
    projectId: "lupocalibra",
    storageBucket: "lupocalibra.firebasestorage.app",
    messagingSenderId: "862852072128",
    appId: "1:862852072128:web:568e64c18ac919fdf22325",
    measurementId: "G-ZY4LWQ5TH1"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const sortingBins = {
    "BL_06_L": { side: "Esquerdo", minWeight: 160, maxWeight: 180, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_07_L": { side: "Esquerdo", minWeight: 181, maxWeight: 200, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_08_L": { side: "Esquerdo", minWeight: 201, maxWeight: 220, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_09_L": { side: "Esquerdo", minWeight: 221, maxWeight: 240, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_10_L": { side: "Esquerdo", minWeight: 241, maxWeight: 260, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_11_L": { side: "Esquerdo", minWeight: 261, maxWeight: 280, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_12_L": { side: "Esquerdo", minWeight: 281, maxWeight: 300, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_200UP_L": { side: "Esquerdo", minWeight: 301, maxWeight: 999, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },

    "BL_06_R": { side: "Direito", minWeight: 160, maxWeight: 180, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_07_R": { side: "Direito", minWeight: 181, maxWeight: 200, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_08_R": { side: "Direito", minWeight: 201, maxWeight: 220, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_09_R": { side: "Direito", minWeight: 221, maxWeight: 240, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_10_R": { side: "Direito", minWeight: 241, maxWeight: 260, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_11_R": { side: "Direito", minWeight: 261, maxWeight: 280, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_12_R": { side: "Direito", minWeight: 281, maxWeight: 300, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" },
    "BL_200UP_R": { side: "Direito", minWeight: 301, maxWeight: 999, errorTimestamps: [], totalProcessed: 0, lastWeight: 0, status: "Operacional" }
};

const MAX_ALLOWED_ERRORS = 5; 
let systemInterlockActive = false;
let machineJamActive = false;     
let downtimeSeconds = 0;          
let simulationInterval = null;
let downtimeInterval = null;      

const binsGrid = document.getElementById('binsGrid');
const systemStatusLabel = document.getElementById('systemStatusLabel');

function salvarProducaoNoFirestore() {
    db.collection("producao_diaria").doc("linha_export").set({
        ultimo_registro: firebase.firestore.FieldValue.serverTimestamp(),
        systemInterlockActive: systemInterlockActive,
        machineJamActive: machineJamActive,
        statusGeral: systemInterlockActive ? "BLOQUEADO" : (machineJamActive ? "JAMMED" : "OPERACIONAL")
    })
    .then(() => console.log("Status atualizado no Firestore."))
    .catch((error) => console.error("Erro no Firestore: ", error));
}

function registrarFalhaNoFirestore(tipoFalha, motivo) {
    db.collection("historico_paradas").add({
        horario: firebase.firestore.FieldValue.serverTimestamp(),
        tipo: tipoFalha, 
        motivo: motivo,
        duracao_segundos: downtimeSeconds
    })
    .then((docRef) => console.log("Falha salva na nuvem com ID: ", docRef.id))
    .catch((error) => console.error("Erro ao salvar histórico: ", error));
}

function buildDashboard() {
    if (!binsGrid) return;
    binsGrid.innerHTML = '';

    const leftSection = document.createElement('div');
    leftSection.innerHTML = '<h2 style="color: #00b37e; width: 100%; grid-column: 1/-1; text-align: center; border-bottom: 2px solid #29292e; padding-bottom: 10px; margin-top:10px;">LADO ESQUERDO (Calha A)</h2>';
    leftSection.style.display = 'contents';

    const rightSection = document.createElement('div');
    rightSection.innerHTML = '<h2 style="color: #4ea8de; width: 100%; grid-column: 1/-1; text-align: center; border-bottom: 2px solid #29292e; padding-bottom: 10px; margin-top: 30px;">LADO DIREITO (Calha B)</h2>';
    rightSection.style.display = 'contents';

    binsGrid.appendChild(leftSection);

    Object.keys(sortingBins).forEach(binKey => {
        const bin = sortingBins[binKey];
        
        if(binKey === "BL_06_R") {
            binsGrid.appendChild(rightSection);
        }

        const card = document.createElement('div');
        card.id = `card-${binKey}`;
        card.className = 'bin-card';

        const weightRange = binKey.includes("BL_200UP") ? "> 300g" : `${bin.minWeight}g - ${bin.maxWeight}g`;
        const borderColor = bin.side === "Esquerdo" ? "border-left: 5px solid #00b37e;" : "border-left: 5px solid #4ea8de;";

        card.innerHTML = `
    <div class="bin-header" style="${borderColor}">
        <div class="bin-header-left">
            <span class="bin-name">${binKey.replace('_L', '').replace('_R', '')}</span>
            <small style="display:block; color:#8d8d99;">Lado ${bin.side}</small>
        </div>
        <button class="btn-regular-cuba" onclick="abrirRegulagemCuba('${binKey}')">⚙️</button>
    </div>
    <div class="bin-body">
        <p><strong>Faixa Alvo:</strong> ${weightRange}</p>
        <p><strong>Último Peso:</strong> <span id="weight-${binKey}" class="weight-value">---</span></p>
        <p><strong>Contagem:</strong> <span id="count-${binKey}">0</span> un</p>
        <p><strong>Erros (Pistão):</strong> <span id="errors-${binKey}" class="error-count">0 / ${MAX_ALLOWED_ERRORS}</span></p>
        <p><strong>Status:</strong> <span id="status-${binKey}" class="status-text">${bin.status}</span></p>
    </div>
`;
        binsGrid.appendChild(card);
    });
}

function updateLiveValues() {
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
}

function simulateBelt() {
    if (systemInterlockActive || machineJamActive) return;

    if (Math.random() < 0.005) { 
        triggerMachineJam();
        return;
    }

    const simulatedWeight = Math.floor(Math.random() * (400 - 150 + 1)) + 150;
    const sideChosen = Math.random() < 0.5 ? "_L" : "_R";
    let targetBinKey = null;

    Object.keys(sortingBins).forEach(binKey => {
        const bin = sortingBins[binKey];
        if (simulatedWeight >= bin.minWeight && simulatedWeight <= bin.maxWeight && binKey.endsWith(sideChosen)) {
            targetBinKey = binKey;
        }
    });

    if (targetBinKey) {
        const bin = sortingBins[targetBinKey];
        const mechanicalFailure = Math.random() < 0.02; 

        if (mechanicalFailure) {
            bin.errorTimestamps.push(new Date().toLocaleTimeString());
            console.error(`FALHA NO LADO ${bin.side.toUpperCase()}: Pistão da ${targetBinKey} falhou!`);

            if (bin.errorTimestamps.length >= MAX_ALLOWED_ERRORS) {
                bin.status = "BLOQUEADO";
                triggerInterlock(`CRÍTICO: Linha parada! Falha no atuador do LADO ${bin.side.toUpperCase()} (${targetBinKey.replace('_L','').replace('_R','')})`);
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
    if (systemStatusLabel) {
        systemStatusLabel.textContent = "EMERGÊNCIA - LINHA BLOQUEADA";
        systemStatusLabel.className = "system-status status-stopped";
    }
    salvarProducaoNoFirestore();
    registrarFalhaNoFirestore("INTERLOCK", reason);
    alert(reason);
}

function triggerMachineJam() {
    machineJamActive = true;
    if (systemStatusLabel) {
        systemStatusLabel.className = "system-status status-jammed"; 
    }

    downtimeSeconds = 0;
    clearInterval(downtimeInterval); 
    downtimeInterval = setInterval(() => {
        downtimeSeconds++;
        if (systemStatusLabel) {
            systemStatusLabel.textContent = `ESTEIRA TRAVADA - TEMPO PARADO: ${downtimeSeconds}s`;
        }
    }, 1000);

    salvarProducaoNoFirestore();
    registrarFalhaNoFirestore("JAM", "Acúmulo de produto na calha principal detectado pelo sensor óptico.");
}

function resetSystem() {
    console.log("Comando de Reset executado.");

    clearInterval(downtimeInterval);
    downtimeSeconds = 0;

    systemInterlockActive = false;
    machineJamActive = false;

    Object.keys(sortingBins).forEach(binKey => {
        sortingBins[binKey].errorTimestamps = [];
        sortingBins[binKey].lastWeight = 0;
        sortingBins[binKey].status = "Operacional";
    });

    if (systemStatusLabel) {
        systemStatusLabel.textContent = "System OK";
        systemStatusLabel.className = "system-status status-running";
    }

    salvarProducaoNoFirestore();
    updateLiveValues();
}

window.onload = function() {
    buildDashboard();
    simulationInterval = setInterval(simulateBelt, 342); 
};

function abrirRegulagemCuba(idCuba) {
    localStorage.setItem('cubaSelecionada', idCuba);
    
    window.location.href = 'regulagem.html';
}