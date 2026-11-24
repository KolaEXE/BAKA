export const UNIVERSES = [
  { id: 'one-piece', label: 'One Piece' },
  { id: 'naruto', label: 'Naruto' },
  { id: 'dragon-ball', label: 'Dragon Ball' },
  { id: 'bleach', label: 'Bleach' },
  { id: 'jujutsu-kaisen', label: 'Jujutsu Kaisen' },
  { id: 'hunter-x-hunter', label: 'Hunter x Hunter' },
  { id: 'mix', label: 'Mélange' }
];
export const universeLabel = id => UNIVERSES.find(u => u.id === id)?.label ?? id;
export const DEFAULTS = { cards: 10, budget: 500, maxPlayers: 2, timerSec: 30 };
export const GRACE_EMPTY_MS = 60_000; // délai avant suppression d'une room vide
export const HOST_GRACE_MS = 30_000; // hôte hors ligne avant transfert
export const ABSENT_MS = 60_000;     // joueur hors ligne avant retrait (room en attente)
