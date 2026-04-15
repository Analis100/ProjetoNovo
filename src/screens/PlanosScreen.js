// screens/PlanosScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ❗Ative se tiver Firebase configurado
const USE_FIRESTORE = false;
// import firestore from "@react-native-firebase/firestore";

import { PING } from "./services/ping.js";
import { syncAdicionar } from "./services/sync.js"; // permanece caso use em outro fluxo
console.log("PING:", PING);

import {
  PLANOS,
  PRECO,
  setPlanoAtual,
  getPlanoAtual,
  iniciarTrialSeNecessario,
  trialAtivo,
  definirEmpresaEPerfil,
} from "./services/planos.js";
import { FORM_CARD } from "../styles/formCard";

/* -------- helpers -------- */
function gerarIdEmpresa() {
  // Gera 8 caracteres alfanuméricos (ex.: EMPRESA8C3F2A1B)
  const rand = Math.random()
    .toString(36)
    .replace(/[^a-z0-9]/gi, "")
    .slice(2, 10);
  return `EMPRESA${rand}`.toUpperCase();
}

async function registrarEmpresaNaNuvem(idEmpresa, proprietario = true) {
  if (!USE_FIRESTORE) return;
  try {
    // await firestore().collection("empresas").doc(idEmpresa).set(
    //   {
    //     criadoEm: new Date(),
    //     proprietario: !!proprietario,
    //   },
    //   { merge: true }
    // );
  } catch (e) {
    console.warn("Falha ao registrar no Firestore:", e?.message);
    Alert.alert("Aviso", "Não foi possível registrar na nuvem agora.");
  }
}

export default function PlanosScreen({ navigation }) {
  const [planoEscolhido, setPlanoEscolhido] = useState(null);
  const [trialOK, setTrialOK] = useState(false);
  const [mostrarConfigCloud, setMostrarConfigCloud] = useState(false);
  const [empresaId, setEmpresaId] = useState("");
  const [papel, setPapel] = useState("proprietario"); // "proprietario" | "colaborador"

  // estado do modal manual
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState("");

  // carrega preferências se já existirem
  useEffect(() => {
    (async () => {
      await iniciarTrialSeNecessario();
      setTrialOK(await trialAtivo());

      // Se já tem um plano escolhido anteriormente, pula direto
      const atual = await getPlanoAtual();
      if (atual) {
        navigation.replace("TelaInicial");
        return;
      }

      // Recupera rascunhos do usuário (se houver)
      try {
        const idSalvo = await AsyncStorage.getItem("idEmpresa");
        const perfilSalvo = await AsyncStorage.getItem("perfil");
        if (idSalvo) setEmpresaId(idSalvo);
        if (perfilSalvo) setPapel(perfilSalvo);
      } catch {}
    })();
  }, [navigation]);

  // Persistência rápida local (sem bloquear a UI)
  const salvarRascunhoLocal = async (id, pf) => {
    try {
      if (id) await AsyncStorage.setItem("idEmpresa", id);
      if (pf) await AsyncStorage.setItem("perfil", pf);
    } catch {}
  };

  const selecionarIndividual = async () => {
    setPlanoEscolhido(PLANOS.INDIVIDUAL);
    await setPlanoAtual(PLANOS.INDIVIDUAL);
    await definirEmpresaEPerfil("local-only", "proprietario");
    // guarda também localmente (opcional, para consistência entre camadas)
    await AsyncStorage.multiSet([
      ["planoAtual", PLANOS.INDIVIDUAL],
      ["idEmpresa", "local-only"],
      ["perfil", "proprietario"],
    ]);
    Alert.alert("Plano selecionado", "Uso Individual ativado.");
    navigation.replace("TelaInicial");
  };

  const selecionarColaboradores = () => {
    setPlanoEscolhido(PLANOS.COLABORADORES);
    setMostrarConfigCloud(true);
  };

  const confirmarColaboradores = async () => {
    const id = (empresaId || "").trim().toUpperCase();

    // ✅ validação: apenas letras e números, min 3
    if (!/^[A-Z0-9]{3,}$/.test(id)) {
      Alert.alert(
        "ID inválido",
        "O ID deve ter apenas letras e números, sem espaços ou símbolos, e pelo menos 3 caracteres.",
      );
      return;
    }

    if (!papel) {
      Alert.alert(
        "Dados faltando",
        "Selecione o papel (Proprietário/Colaborador).",
      );
      return;
    }

    // salva local primeiro (para o app já saber o contexto)
    await AsyncStorage.multiSet([
      ["idEmpresa", id],
      ["perfil", papel],
      ["planoAtual", PLANOS.COLABORADORES],
    ]);

    // registra/ajusta camada de serviço
    await setPlanoAtual(PLANOS.COLABORADORES);
    await definirEmpresaEPerfil(id, papel);

    // registra na nuvem (opcional)
    await registrarEmpresaNaNuvem(id, papel === "proprietario");

    Alert.alert("Plano selecionado", "Plano Colaboradores ativado.");
    navigation.replace("TelaInicial");
  };

  /* -------- prompt: automático ou manual -------- */
  const abrirPromptEscolhaId = () => {
    Alert.alert(
      "ID da Empresa",
      "Como você quer definir o ID?",
      [
        {
          text: "Gerar automático",
          onPress: async () => {
            const novo = gerarIdEmpresa();
            setEmpresaId(novo);
            await salvarRascunhoLocal(novo, papel);
            Alert.alert("ID gerado", `Usando: ${novo}`);
          },
        },
        {
          text: "Criar manualmente",
          onPress: () => {
            setManualId(empresaId || "");
            setManualOpen(true);
          },
        },
        { text: "Cancelar", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  // ✅ validação também ao confirmar manual
  const confirmarManual = async () => {
    const id = (manualId || "").trim().toUpperCase();

    if (!/^[A-Z0-9]{3,}$/.test(id)) {
      Alert.alert(
        "ID inválido",
        "O ID deve ter apenas letras e números, sem espaços ou símbolos, e pelo menos 3 caracteres.",
      );
      return;
    }

    setManualOpen(false);
    setEmpresaId(id);
    await salvarRascunhoLocal(id, papel);
    Alert.alert("ID definido", `Usando: ${id}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Escolha seu plano</Text>

      <View style={styles.card}>
        <Text style={styles.nomePlano}>
          Uso Individual (Offline no celular)
        </Text>
        <Text style={styles.preco}>{PRECO.INDIVIDUAL}</Text>
        <Text style={styles.desc}>
          • Salva tudo no dispositivo{"\n"}• Funciona sem internet{"\n"}• Ideal
          para uso sozinho
        </Text>
        <TouchableOpacity style={styles.btn} onPress={selecionarIndividual}>
          <Text style={styles.btnTxt}>Escolher Individual</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.nomePlano}>Colaboradores (Nuvem + Offline)</Text>
        <Text style={styles.preco}>{PRECO.COLABORADORES}</Text>
        <Text style={styles.desc}>
          • Cada colaborador trabalha offline{"\n"}• Sincroniza com a nuvem
          quando online{"\n"}• Proprietário vê tudo em tempo real
        </Text>
        <TouchableOpacity
          style={[styles.btn, styles.btnSec]}
          onPress={selecionarColaboradores}
        >
          <Text style={styles.btnTxt}>Escolher Colaboradores</Text>
        </TouchableOpacity>
      </View>

      {trialOK ? (
        <Text style={styles.trialInfo}>⏳ Teste grátis ativo (3 dias)</Text>
      ) : (
        <Text style={styles.trialInfo}>
          Teste grátis expirado — é preciso escolher um plano
        </Text>
      )}

      {mostrarConfigCloud && (
        <View style={styles.modalCard}>
          <Text style={styles.modalTitulo}>Configurar Nuvem</Text>
          <Text style={styles.lbl}>
            ID da Empresa (fornecido pelo proprietário)
          </Text>

          {/* Campo de ID com limpeza para letras/números */}
          <TextInput
            placeholder="ex.: MINHAEMPRESA123"
            value={empresaId}
            onChangeText={(t) => {
              const limpo = (t || "")
                .replace(/[^a-zA-Z0-9]/g, "")
                .toUpperCase();
              setEmpresaId(limpo);
              salvarRascunhoLocal(limpo, papel);
            }}
            autoCapitalize="characters"
            style={styles.input}
          />

          {/* Botão que abre o prompt: Automático ou Manual */}
          <TouchableOpacity
            style={styles.btnOutline}
            onPress={abrirPromptEscolhaId}
          >
            <Text style={styles.btnOutlineTxt}>
              Escolher ID (Automático ou Manual)
            </Text>
          </TouchableOpacity>

          {/* Seleção de papel */}
          <View style={styles.row}>
            <TouchableOpacity
              style={[
                styles.papelBtn,
                papel === "proprietario" && styles.papelBtnAtivo,
              ]}
              onPress={async () => {
                setPapel("proprietario");
                await salvarRascunhoLocal(empresaId, "proprietario");
              }}
            >
              <Text style={styles.papelTxt}>Proprietário</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.papelBtn,
                papel === "colaborador" && styles.papelBtnAtivo,
              ]}
              onPress={async () => {
                setPapel("colaborador");
                await salvarRascunhoLocal(empresaId, "colaborador");
              }}
            >
              <Text style={styles.papelTxt}>Colaborador</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.btn} onPress={confirmarColaboradores}>
            <Text style={styles.btnTxt}>Confirmar e Continuar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal para entrada manual do ID */}
      <Modal visible={manualOpen} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Criar ID manualmente</Text>
            <Text style={styles.modalHint}>Ex.: MINHAEMPRESA123</Text>
            <TextInput
              value={manualId}
              onChangeText={(t) => {
                // Só letras e números; converte para maiúsculas
                const limpo = (t || "")
                  .replace(/[^a-zA-Z0-9]/g, "")
                  .toUpperCase();
                setManualId(limpo);
              }}
              placeholder="Digite o ID (apenas letras e números)"
              autoCapitalize="characters"
              style={styles.manualInput}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.smallBtn, styles.smallBtnCancel]}
                onPress={() => setManualOpen(false)}
              >
                <Text style={styles.smallBtnTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, styles.smallBtnOk]}
                onPress={confirmarManual}
              >
                <Text style={[styles.smallBtnTxt, { color: "#fff" }]}>
                  Confirmar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  card: {
    ...FORM_CARD,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  nomePlano: { fontSize: 18, fontWeight: "700" },
  preco: { fontSize: 16, marginTop: 4, marginBottom: 8, color: "#0a7" },
  desc: { color: "#444", marginBottom: 10 },
  btn: {
    backgroundColor: "#bfa140",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSec: { backgroundColor: "#3b82f6" },
  btnTxt: { color: "#fff", fontWeight: "700" },
  trialInfo: { textAlign: "center", marginTop: 8, color: "#555" },

  modalCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  modalTitulo: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  lbl: { fontSize: 13, color: "#555", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },

  // botão para abrir o prompt
  btnOutline: {
    borderWidth: 1,
    borderColor: "#bfa140",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  btnOutlineTxt: { color: "#bfa140", fontWeight: "700" },

  row: { flexDirection: "row", gap: 8, marginBottom: 10 },
  papelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  papelBtnAtivo: { borderColor: "#bfa140", backgroundColor: "#fff9e6" },
  papelTxt: { fontWeight: "600" },

  // modal manual
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalBox: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  modalHint: { fontSize: 12, color: "#666", marginBottom: 10 },
  manualInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  modalRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    justifyContent: "flex-end",
  },
  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  smallBtnCancel: { backgroundColor: "#eee" },
  smallBtnOk: { backgroundColor: "#bfa140" },
  smallBtnTxt: { color: "#000", fontWeight: "600" },
});
