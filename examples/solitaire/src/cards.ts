/**
 * Card model + mapping to the Kenney `playingCards` atlas frame names.
 *
 * The atlas frames are named `card{Suit}{RankLabel}.png`, e.g.
 * `cardHeartsK.png`, `cardClubs10.png`, `cardSpadesA.png`.
 */

export type Suit = 'Clubs' | 'Diamonds' | 'Hearts' | 'Spades';
export type Color = 'black' | 'red';

export const SUITS: readonly Suit[] = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];

/** Ace = 1, Jack = 11, Queen = 12, King = 13. */
export const RANKS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function suitColor(suit: Suit): Color {
  return suit === 'Diamonds' || suit === 'Hearts' ? 'red' : 'black';
}

function rankLabel(rank: number): string {
  switch (rank) {
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return String(rank);
  }
}

/** Atlas frame name for a face-up card, e.g. `cardHeartsK.png`. */
export function cardFrame(suit: Suit, rank: number): string {
  return `card${suit}${rankLabel(rank)}.png`;
}

/** Frame name (in the separate backs atlas) used for face-down cards. */
export const CARD_BACK_FRAME = 'cardBack_blue1.png';
