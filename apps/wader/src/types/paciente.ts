/**
 * Tipos do Paciente.
 *
 * Espelha o schema usado pelo LEO web em `workspaces/{wsId}/pacientes/{id}`.
 * Convenção LEO: nome SEMPRE em UPPERCASE, CPF SEMPRE em dígitos puros.
 */

export type Sexo = 'M' | 'F' | '';

export interface Paciente {
  /** ID gerado pelo Firestore (auto). Igual ao doc.id. */
  id: string;
  /** Nome em UPPERCASE (convenção LEO). */
  nome: string;
  /** CPF em dígitos puros, sem formatação (11 chars). */
  cpf: string;
  /** ISO 8601 YYYY-MM-DD ou string vazia. */
  dtnasc?: string;
  sexo?: Sexo;
  telefone?: string;
  convenio?: string;
  /** Timestamp do Firestore (serializado como ISO ao retornar pra UI). */
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface CreatePacientePayload {
  nome: string;
  cpf: string;
  dtnasc?: string;
  sexo?: Sexo;
  telefone?: string;
  convenio?: string;
}
