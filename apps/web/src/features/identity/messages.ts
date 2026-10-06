import { ApiFailure } from "../../api-client.js";
import { HostBridgeError } from "./bridge.js";

const messages: Record<string, string> = {
  IDENTITY_NOT_CONFIGURED: "A identidade do IA-MNS ainda não está configurada.",
  IDENTITY_METHOD_UNAVAILABLE: "Este método de entrada não está disponível.",
  IDENTITY_INVALID_CREDENTIALS: "Usuário ou senha inválidos.",
  IDENTITY_INVALID_CODE:
    "Código inválido. Use o código atual do aplicativo ou um código de recuperação.",
  IDENTITY_FLOW_EXPIRED:
    "Esta etapa expirou ou já foi usada. Comece novamente.",
  IDENTITY_PROOF_REJECTED:
    "Não foi possível confirmar sua identidade no sistema de origem.",
  IDENTITY_PROVIDER_UNAVAILABLE:
    "O sistema de origem está indisponível. Tente novamente em instantes.",
  IDENTITY_ACCOUNT_DISABLED:
    "Este acesso está desativado. Fale com o administrador do IA-MNS.",
  IDENTITY_SESSION_EXPIRED: "Sua sessão terminou. Entre novamente.",
  IDENTITY_RECENT_AUTHENTICATION_REQUIRED:
    "Confirme sua identidade novamente para continuar.",
  IDENTITY_STRONG_AUTHENTICATION_REQUIRED:
    "Esta operação exige a verificação em duas etapas.",
  IDENTITY_ACCESS_DENIED: "Seu acesso não permite esta operação.",
  IDENTITY_PERSON_NOT_FOUND: "Pessoa não encontrada.",
  IDENTITY_LINK_NOT_FOUND: "Vínculo não encontrado.",
  IDENTITY_SESSION_NOT_FOUND: "Sessão não encontrada.",
  IDENTITY_LINK_CONFLICT:
    "Esta conta externa já pertence a outro perfil do IA-MNS. Se ambos são seus, peça ao administrador para unificá-los.",
  IDENTITY_PROVIDER_ALREADY_LINKED:
    "Já existe outra conta deste sistema vinculada ao seu perfil.",
  IDENTITY_LAST_METHOD: "Mantenha pelo menos uma forma de entrar.",
  IDENTITY_LAST_OWNER:
    "É preciso manter pelo menos um administrador principal ativo.",
  IDENTITY_LOGIN_TAKEN: "Este usuário não está disponível.",
  IDENTITY_ALREADY_ENROLLED: "Já existe uma senha local para este perfil.",
  IDENTITY_INVALID_LOGIN:
    "Use de 3 a 64 letras minúsculas, números, ponto, hífen ou sublinhado.",
  IDENTITY_INVALID_NAME: "Informe um nome com até 120 caracteres.",
  IDENTITY_WEAK_PASSWORD: "Use ao menos 12 caracteres e não inclua o usuário.",
  IDENTITY_UNKNOWN_PERMISSION: "Capacidade desconhecida.",
  IDENTITY_TOTP_REQUIRED: "Configure a verificação em duas etapas primeiro.",
  IDENTITY_LOCAL_CREDENTIAL_REQUIRED: "Crie uma senha local primeiro.",
  IDENTITY_DIRECTORY_UNAVAILABLE:
    "A consulta de usuários do Sankhya não está configurada neste ambiente.",
  IDENTITY_EXTERNAL_ACCOUNT_NOT_FOUND:
    "Esta conta não foi encontrada no sistema de origem.",
  IDENTITY_EXTERNAL_ACCOUNT_INACTIVE:
    "Esta conta não pode mais entrar no sistema de origem.",
  IDENTITY_MERGE_NOT_ALLOWED:
    "Estes perfis não podem ser unificados assim. Fale com o administrador do IA-MNS.",
  IDENTITY_POLICY_INVALID:
    "Algum valor está fora dos limites permitidos. Revise a política.",
  IDENTITY_POLICY_NOT_ALLOWED:
    "Em produção, a verificação em duas etapas dos administradores não pode ser desativada.",
  IDENTITY_POLICY_CONFIRMATION_REQUIRED:
    "Esta política reduz a segurança. Confirme que entende os riscos para salvar.",
  IDENTITY_MERGE_BUSY:
    "Há uma conversa em andamento. Aguarde a resposta e tente novamente.",
  RATE_LIMITED: "Muitas tentativas. Aguarde um minuto.",
  AUTHENTICATION_REQUIRED: "Entre para continuar.",
};

const hostMessages: Record<string, string> = {
  not_embedded:
    "Abra o IA-MNS pelo sistema hospedeiro ou use o endereço próprio.",
  timeout: "O sistema hospedeiro não respondeu. Recarregue a tela.",
  pdt_login_required: "Entre no PDT Connect e abra o IA-MNS novamente.",
  no_authenticated_user: "Entre no Sankhya e abra o IA-MNS novamente.",
};

export function identityMessage(error: unknown): string {
  if (error instanceof HostBridgeError)
    return (
      hostMessages[error.reason] ??
      "Não foi possível confirmar sua identidade com o sistema hospedeiro."
    );
  if (error instanceof ApiFailure)
    return messages[error.code] ?? "Não foi possível concluir a solicitação.";
  return "Não foi possível conectar ao serviço. Verifique a conexão e tente novamente.";
}

export function codeMessage(code: string | undefined | null): string | null {
  return code && /^[A-Z_]{3,60}$/.test(code)
    ? (messages[code] ?? "Não foi possível entrar. Tente novamente.")
    : null;
}

export function isFailure(error: unknown, code: string) {
  return error instanceof ApiFailure && error.code === code;
}
