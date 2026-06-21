// Production Line Configuration for Export Pouches (BL Series)
const sortingBins = {
    "BL_06": { minWeight: 160, maxWeight: 180, errorTimestamps: [] },
    "BL_07": { minWeight: 180, maxWeight: 200, errorTimestamps: [] },
    "BL_08": { minWeight: 200, maxWeight: 220, errorTimestamps: [] },
    "BL_09": { minWeight: 220, maxWeight: 240, errorTimestamps: [] },
    "BL_10": { minWeight: 240, maxWeight: 260, errorTimestamps: [] },
    "BL_11": { minWeight: 260, maxWeight: 280, errorTimestamps: [] },
    "BL_12": { minWeight: 280, maxWeight: 300, errorTimestamps: [] },
    "200_UP": { minWeight: 300, maxWeight: 999, errorTimestamps: [] }
};

const MAX_ALLOWED_ERRORS = 100;
const TIME_WINDOW_MS = 120 * 1000; // 2 minutes rolling window
let isLineRunning = true;
let lineSimulatorInterval;

/**
 * Validates the item weight against the target bin threshold
 * @param {string} targetBin - The designated bin for the item (e.g., "BL_06")
 * @param {number} actualWeight - The weight registered by the checkweigher
 */
function processItemDiverter(targetBin, actualWeight) {
    const currentTime = Date.now();
    const bin = sortingBins[targetBin];

    // 1. Check if the item weight is Out of Specification (OOS) for this bin
    if (actualWeight < bin.minWeight || actualWeight > bin.maxWeight) {
        bin.errorTimestamps.push(currentTime);
    }

    // 2. Clear expired errors (older than 2 minutes) to maintain the rolling window
    bin.errorTimestamps = bin.errorTimestamps.filter(
        errorTime => (currentTime - errorTime) <= TIME_WINDOW_MS
    );

    const recentErrorCount = bin.errorTimestamps.length;

    console.log(`[MONITOR] Bin: ${targetBin} | Weight: ${actualWeight}g | Recent Faults: ${recentErrorCount}/${MAX_ALLOWED_ERRORS}`);

    // 3. Interlock Trigger Condition (Failsafe)
    if (recentErrorCount >= MAX_ALLOWED_ERRORS) {
        triggerLineInterlock(targetBin, recentErrorCount);
    }
}

/**
 * Sends a shutdown signal to the conveyor belt plc and triggers alarms
 */
function triggerLineInterlock(failedBin, faultCount) {
    clearInterval(lineSimulatorInterval);
    isLineRunning = false;

    console.log(`\n🚨🚨🚨 [CRITICAL INTERLOCK ACTIVATED] 🚨🚨🚨`);
    console.log(`EMERGENCY SHUTDOWN SIGNAL SENT TO MAIN FEEDER CONVEYOR.`);
    console.log(`Reason: Bin [${failedBin}] exceeded fault tolerance with ${faultCount} misclassified items within 2 min.`);
    console.log(`Action Required: Clear the physical sorting gate, inspect for mechanical timing lag, and press RESET on HMI.\n`);
}

// --- HIGH-SPEED PRODUCTION LINE SIMULATOR ---
console.log("System initialized. Monitoring checkweigher data stream...");

const binKeys = Object.keys(sortingBins);

// Simulating high-speed flow (approx. 175 items/min -> ~1 item every 340ms)
lineSimulatorInterval = setInterval(() => {
    const randomBin = binKeys[Math.floor(Math.random() * binKeys.length)];
    let simulatedWeight;

    // Simulating 90% accuracy, 10% sorting hardware malfunction
    if (Math.random() > 0.10) {
        const range = sortingBins[randomBin].maxWeight - sortingBins[randomBin].minWeight;
        simulatedWeight = Math.floor(Math.random() * range) + sortingBins[randomBin].minWeight;
    } else {
        simulatedWeight = 145; // Faulty weight dropped into the wrong bin
    }

    processItemDiverter(randomBin, simulatedWeight);
}, 340);