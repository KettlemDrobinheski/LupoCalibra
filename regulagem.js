const firebaseConfig = {
    apiKey: "AIzaSyCZbbRds530UMEhWLq39O6vGbiNnNCoHVI",
    authDomain: "lupocalibra.firebaseapp.com",
    projectId: "lupocalibra",
    storageBucket: "lupocalibra.firebasestorage.app",
    messagingSenderId: "862852072128",
    appId: "1:862852072128:web:568e64c18ac919fdf22325",
    measurementId: "G-ZY4LWQ5TH1"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

const selectCuba = document.getElementById('selecaoCuba');
const campoSelecaoConjunta = document.getElementById('campoSelecaoConjunta') || document.getElementById('campoSelecaoGeral');
const textoIndividual = document.getElementById('textoVisualizacaoIndividual');
const tituloCuba = document.getElementById('tituloCuba');

let cubaEmEdicao = "";

window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const cubaInicial = urlParams.get('cuba');
    const modo = urlParams.get('modo');


    if (modo === 'conjunto') {
        campoSelecaoConjunta.style.display = 'block'; 
        textoIndividual.style.display = 'none';
        
        cubaEmEdicao = selectCuba.value;
    } 
    
    else if (cubaInicial) {
        campoSelecaoConjunta.style.display = 'none';
        textoIndividual.style.display = 'block';
        
        tituloCuba.innerText = cubaInicial.replace('cuba_', 'Cuba ').replace('_', ' ');
        cubaEmEdicao = cubaInicial; 
    }

    carregarDadosCuba(cubaEmEdicao);
});

selectCuba.addEventListener('change', (e) => {
    cubaEmEdicao = e.target.value;
    carregarDadosCuba(cubaEmEdicao);
});

function carregarDadosCuba(idCuba) {
    if (!idCuba) return;
    
    console.log(`Buscando dados da: ${idCuba}...`);
    
    db.collection("configuracoes_cubas").doc(`cuba_${idCuba}`).get()
    .then((doc) => {
        if (doc.exists) {
            const dados = doc.data();
            if (dados.pesoAlvo) {
                document.getElementById('pesoAlvoCuba').value = dados.pesoAlvo;
            }
            if (dados.toleranciaPorcentagem) {
                document.getElementById('toleranciaCuba').value = dados.toleranciaPorcentagem;
            }
        } else {
            console.log("Sem dados prévios no banco. Aplicando padrões de fábrica.");
            document.getElementById('pesoAlvoCuba').value = 150;
            document.getElementById('toleranciaCuba').value = 10;
        }
    })
    .catch((error) => {
        console.error("Erro ao carregar dados do Firebase: ", error);
    });
}

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

    let nomeExibicao = `Cuba ${cubaEmEdicao.replace('_', ' ')}`;
    if (campoSelecaoConjunta.style.display === 'block') {
        nomeExibicao = selectCuba.options[selectCuba.selectedIndex].text;
    }

    db.collection("configuracoes_cubas").doc(`cuba_${cubaEmEdicao}`).set({
        pesoAlvo: pesoAlvo,
        toleranciaPorcentagem: tolerancia,
        ultimaAtualizacao: new Date().toLocaleString()
    }, { merge: true })
    .then(() => {
        alert(`✅ Configurações da ${nomeExibicao} aplicadas com sucesso!`);
       
        if (campoSelecaoConjunta.style.display === 'none') {
            window.location.href = 'index.html';
        }
    })
    .catch((error) => {
        console.error("Erro ao salvar no Firebase: ", error);
        alert("❌ Erro ao conectar com a nuvem.");
    });
});