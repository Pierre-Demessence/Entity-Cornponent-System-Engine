/** A Life-like rule in B/S notation: neighbour counts that give birth, and that keep a cell alive. */
export interface Rule {
  name: string;
  birth: ReadonlySet<number>;
  notation: string;
  survive: ReadonlySet<number>;
}

/** Parses `B3/S23`-style notation. */
export function parseRule(name: string, notation: string): Rule {
  const match = /^B(\d*)\/S(\d*)$/i.exec(notation);
  if (!match)
    throw new Error(`Bad rule notation: ${notation}`);
  const digits = (s: string): Set<number> => new Set(Array.from(s, Number));
  return { name, birth: digits(match[1]!), notation, survive: digits(match[2]!) };
}

/** `T` cycles through these; Conway's own rule comes first. */
export const RULES: readonly Rule[] = [
  parseRule('Conway', 'B3/S23'),
  parseRule('HighLife', 'B36/S23'),
  parseRule('Day & Night', 'B3678/S34678'),
  parseRule('Seeds', 'B2/S'),
  parseRule('Life without Death', 'B3/S012345678'),
];
