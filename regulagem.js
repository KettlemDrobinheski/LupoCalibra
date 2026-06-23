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

const selectCuba = document.getElementById('selecaoCuba');

window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const cubaIncial = urlParams.get('cuba');

    if (cubaIncial) {
        
        selectCuba.value = cubaIncial;
    }
    carregarDadosCuba(selectCuba.value);
});

db.collection("configuracoes_cubas").doc(`cuba_${cubaEmEdicao}`).get()
.then((doc) => {
    if (doc.exists) {
        const dados = doc.data();
        // Se já existir configuração na nuvem, preenche os inputs com os valores reais
        if (dados.pesoAlvo) {
            document.getElementById('pesoAlvoCuba').value = dados.pesoAlvo;
        }
        if (dados.toleranciaPorcentagem) {
            document.getElementById('toleranciaCuba').value = dados.toleranciaPorcentagem;
        }
    }
})
.catch((error) => {
    console.error("Erro ao carregar dados iniciais: ", error);
});

document.getElementById('btnSalvarConfigCuba').addEventListener('click', () => {
    const pesoAlvo = parseInt(document.getElementById('pesoAlvoCuba').value, 10);
    const tolerancia = parseInt(document.getElementById('toleranciaCuba').value, 10);

    if (isNaN(pesoAlvo) || pesoAlvo <= 0) {
        alert("Por favor, insira um peso válido!");
        return;
    }

    if (isNaN(tolerancia) || tolerancia < 0 || tolerancia > 100) {
        alert("Por favor, insira uma tolerância válida entre 0 e 100!");
        return;
    }

    db.collection("configuracoes_cubas").doc(`cuba_${cubaEmEdicao}`).set({
        pesoAlvo: pesoAlvo,
        toleranciaPorcentagem: tolerancia,
        ultimaAtualizacao: new Date().toLocaleString()
    }, { merge: true })
    .then(() => {
        alert(`Configurações da Cuba ${cubaEmEdicao} aplicadas com sucesso!`);
        window.location.href = 'index.html';
    })
    .catch((error) => {
        console.error("Erro ao salvar no Firebase: ", error);
        alert("Erro ao conectar com a nuvem.");
    });
});