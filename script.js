const sortingBins = {
    "BL_06": { minWeight: 160, maxWeight: 180, errorTimestamps: [], totalProcessed: 0, lastWeight: 0 }
};

const MAX_ALLOWED_ERRORS = 100;
const binsGrid = document.getElementById('binsGrid');

function buildDashboard() {
    binsGrid.innerHTML = '';
    Object.keys(sortingBins).forEach(binKey => {
        const card = document.createElement('div');
        card.className = 'bin-card';
        card.innerHTML = `
            <div class="bin-header">
                <span class="bin-name">${binKey}</span>
            </div>
            <p>Testing script connection...</p>
        `;
        binsGrid.appendChild(card);
    });
}

window.onload = function() {
    buildDashboard();
    console.log("Test build successful!");
};