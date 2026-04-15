import { useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Guardião de senha:
 * - segura a ação (navigate, excluir, salvar, etc.)
 * - só executa depois que a senha for validada
 */
export function useSenhaGuard({
  getSenhaDigitada,
  limparSenha,
  fecharModalSenha,
  marcarErroIndex, // opcional
  getIndexAlvo, // opcional
  setIndexAlvo, // opcional
  setSenhaContexto, // opcional
}) {
  const acaoPendenteRef = useRef(null);

  const pedirSenhaPara = (acao, ctx = "acesso") => {
    acaoPendenteRef.current = acao;
    if (setSenhaContexto) setSenhaContexto(ctx);
    // você abre o modal fora, ou aqui se quiser
  };

  const verificarSenhaEExecutar = async () => {
    const senhaDigitada = (getSenhaDigitada?.() || "").trim();
    const senhaSalva = (await AsyncStorage.getItem("senhaAcesso")) || "1234";

    const senhaOk = senhaDigitada === senhaSalva;

    // fecha e limpa sempre
    fecharModalSenha?.();
    limparSenha?.();

    if (!senhaOk) {
      const indexAlvo = getIndexAlvo?.();
      if (typeof indexAlvo === "number" && indexAlvo >= 0 && marcarErroIndex) {
        marcarErroIndex(indexAlvo, true);
      }
      if (setSenhaContexto) setSenhaContexto(null);
      if (setIndexAlvo) setIndexAlvo(null);
      return false;
    }

    const acao = acaoPendenteRef.current;
    acaoPendenteRef.current = null;

    if (setSenhaContexto) setSenhaContexto(null);
    if (setIndexAlvo) setIndexAlvo(null);

    if (acao) acao();
    return true;
  };

  return { pedirSenhaPara, verificarSenhaEExecutar };
}
