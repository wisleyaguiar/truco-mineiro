export type PersonalityId = 'equilibrado' | 'blefe' | 'desconfiado';

export interface Personality {
  id: PersonalityId;
  label: string;
  /** Chance mínima estimada de vencer a mão para pedir truco. */
  askThreshold: number;
  /** Chance mínima para aceitar ("mandar descer"). Abaixo disso, corre. */
  acceptThreshold: number;
  /** Chance mínima para retrucar (aumentar). */
  raiseThreshold: number;
  /** Probabilidade de blefar com mão fraca. */
  bluffRate: number;
  /** Esconde o Zap na 1ª rodada ("cama"). */
  cama: boolean;
  /** Só aumenta tendo manilha. */
  needsManilhaToRaise: boolean;
  /** Margem de risco na Mão de 10 (positivo = corre mais). */
  maoDe10Margin: number;
  /** Chance de jogar carta fraca coberta quando possível. */
  coverRate: number;
}

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  equilibrado: {
    id: 'equilibrado',
    label: 'Equilibrado',
    askThreshold: 0.72,
    acceptThreshold: 0.3,
    raiseThreshold: 0.8,
    bluffRate: 0.08,
    cama: false,
    needsManilhaToRaise: false,
    maoDe10Margin: 0,
    coverRate: 0.25,
  },
  blefe: {
    id: 'blefe',
    label: 'Zé do Blefe',
    askThreshold: 0.66,
    acceptThreshold: 0.24,
    raiseThreshold: 0.72,
    bluffRate: 0.3,
    cama: false,
    needsManilhaToRaise: false,
    maoDe10Margin: -0.5,
    coverRate: 0.5,
  },
  desconfiado: {
    id: 'desconfiado',
    label: 'Mineiro Desconfiado',
    askThreshold: 0.8,
    acceptThreshold: 0.36,
    raiseThreshold: 0.85,
    bluffRate: 0.02,
    cama: true,
    needsManilhaToRaise: true,
    maoDe10Margin: 0.5,
    coverRate: 0.15,
  },
};
