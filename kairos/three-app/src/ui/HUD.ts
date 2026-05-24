/**
 * HUD — Kairós-themed overlay (Cinzel display font, gold/silver chrome).
 *
 * Composition (left → right, top → bottom):
 *
 *   ┌─ Top header ──────────────────────────────────────────────────────────┐
 *   │ KAIRÓS · player chip (animated) · turn # · phase pill                 │
 *   │                                            mode toggle · camera · FPS │
 *   └───────────────────────────────────────────────────────────────────────┘
 *   ┌─ Left rail ──┐                              ┌─ Right rail ───────────┐
 *   │ Selected     │                              │ Material balance bar   │
 *   │ piece card   │                              │ Captures (gold/silver) │
 *   │ Phase coach  │                              │ Recent moves history   │
 *   └──────────────┘                              └────────────────────────┘
 *   ┌─ Bottom bar ──────────────────────────────────────────────────────────┐
 *   │ Action rail (phase-aware buttons)               Controls cheat-sheet  │
 *   └───────────────────────────────────────────────────────────────────────┘
 *
 *   Overlays:
 *     · Promotion modal (4 cards w/ description)
 *     · Game-over banner (winner / draw + restart)
 *     · Toasts (phase changes, player switches)
 *
 * The HUD is fully driven by `render(snapshot)` — it doesn't know about the
 * GameState class, just a typed projection of it.
 */
import type { Time } from '@core/Time';
import type {
  GameResult, MoveRecord, PieceType, Player, TurnPhase,
} from '@domain/index';
import { PIECE_ABBREV, PIECE_NAMES, PROMOTABLE_TYPES } from '@domain/index';

// ─── Snapshot interface ─────────────────────────────────────
export interface HudSnapshot {
  currentPlayer: Player;
  turnNumber: number;
  phase: TurnPhase;
  canPress: boolean;
  capturedByGold: PieceType[];
  capturedBySilver: PieceType[];
  selectedLabel: string;
  selectedTile: string | null;
  result: GameResult | null;
  lastMove: MoveRecord | null;
  moveHistory: MoveRecord[];
  localTwoPlayer: boolean;
  canFocusCamera: boolean;
}

export interface HUDOptions {
  root: HTMLElement;
  onPress: () => void;
  onEndTurn: () => void;
  onSkipCharge: () => void;
  onPromote: (type: PieceType) => void;
  onRestart: () => void;
  onResign: () => void;
  onToggleLocalTwoPlayer: (enabled: boolean) => void;
  onFocusCurrentPlayer: () => void;
}

// ─── Domain copy (kept here so HUD is self-contained) ───────
const PHASE_LABEL: Record<TurnPhase, string> = {
  mainMove: 'Movimento Principal',
  charge: 'Investida do Hippeus',
  promotion: 'Promoção',
  pressDecision: 'Pressionar?',
  pressMove: '2º Movimento (Press)',
  chargeAfterPress: 'Investida (Press)',
  promotionAfterPress: 'Promoção (Press)',
  gameOver: 'Fim de Partida',
};

const PHASE_HINT: Record<TurnPhase, string> = {
  mainMove: 'Selecione uma peça e mova-a para uma casa destacada.',
  charge: 'Seu Hippeus pode investir em uma casa âmbar — ou pular esta ação.',
  promotion: 'Seu Doríforo alcançou a última fileira. Escolha em quem promover.',
  pressDecision: 'Você pode Pressionar para mover uma segunda peça (não-Arconte).',
  pressMove: 'Selecione outra peça (não pode ser o Arconte ou a peça já movida).',
  chargeAfterPress: 'O Hippeus pressionado pode investir — ou pule esta ação.',
  promotionAfterPress: 'O Doríforo promove. Escolha a transformação.',
  gameOver: 'A partida acabou.',
};

const PIECE_DESCRIPTION: Record<PieceType, string> = {
  archon: 'O líder. Capturá-lo encerra a partida.',
  strategos: 'Desliza até 3 casas em qualquer direção.',
  hoplite: '2 casas ortogonais. Forma Muralha lado a lado.',
  toxotes: '2 casas diagonais. Pode atirar de longe (sem se mover).',
  hippeus: 'Salta em L (2+1 e 3+1). Pode Investir após capturar.',
  doryphoros: 'Avança 1 casa. Promove na última fileira.',
};

/** Approximate material value used for the balance bar (NOT a rule). */
const PIECE_VALUE: Record<PieceType, number> = {
  archon: 0,
  strategos: 9,
  hoplite: 4,
  toxotes: 5,
  hippeus: 6,
  doryphoros: 1,
};

const GOLD = '#f0c040';
const SILVER = '#a8b8cc';
const AMBER = '#f39c12';
const CRIMSON = '#e74c3c';
const EMERALD = '#3fb27f';

// ─── HUD ────────────────────────────────────────────────────
export class HUD {
  private readonly root: HTMLElement;
  private readonly opts: HUDOptions;

  // header
  private playerChipEl!: HTMLElement;
  private turnDotEl!: HTMLElement;
  private turnLabelEl!: HTMLElement;
  private turnNumEl!: HTMLElement;
  private phasePillEl!: HTMLElement;
  private modeToggleEl!: HTMLButtonElement;
  private cameraBtnEl!: HTMLButtonElement;
  private fpsEl!: HTMLElement;

  // left rail
  private selectedCardEl!: HTMLElement;
  private selectedNameEl!: HTMLElement;
  private selectedTileEl!: HTMLElement;
  private selectedDescEl!: HTMLElement;
  private coachEl!: HTMLElement;

  // right rail
  private balanceBarGoldEl!: HTMLElement;
  private balanceBarSilverEl!: HTMLElement;
  private balanceLabelEl!: HTMLElement;
  private capGoldEl!: HTMLElement;
  private capSilverEl!: HTMLElement;
  private historyEl!: HTMLElement;

  // bottom
  private actionRailEl!: HTMLElement;

  // overlays
  private promoModalEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private bannerTextEl!: HTMLElement;
  private bannerSubEl!: HTMLElement;
  private restartBtnEl!: HTMLElement;
  private toastEl!: HTMLElement;

  private fpsTimer = 0;
  private lastPhase: TurnPhase | null = null;
  private lastPlayer: Player | null = null;
  private toastTimer = 0;

  constructor(opts: HUDOptions) {
    this.root = opts.root;
    this.opts = opts;
    this.mount();
  }

  // ─── DOM scaffold ────────────────────────────────────────
  private mount(): void {
    this.root.innerHTML = /*html*/ `
      <div class="absolute inset-0 text-white select-none" style="font-family:'Inter',sans-serif;">

        <!-- ░ TOP HEADER ░ -->
        <header class="absolute top-0 left-0 right-0 px-5 pt-4 flex items-start justify-between gap-3 pointer-events-none">
          <div class="ui-panel ui-glow px-5 py-3 pointer-events-auto flex items-center gap-5">
            <div class="flex items-baseline gap-2">
              <div class="text-2xl font-display tracking-[0.45em]" style="color:${GOLD};text-shadow:0 0 18px rgba(240,192,64,0.45)">KAIRÓS</div>
              <div class="text-[10px] uppercase tracking-[0.3em] text-white/35 hidden sm:block">Combate Estratégico</div>
            </div>
            <div class="h-8 w-px bg-white/10"></div>
            <div data-hud="player-chip" class="flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all duration-500 border border-transparent">
              <span data-hud="turn-dot" class="w-3 h-3 rounded-full transition-all"></span>
              <div class="flex flex-col">
                <span class="text-[9px] uppercase tracking-[0.3em] text-white/40">Jogador atual</span>
                <span data-hud="turn" class="text-base font-display tracking-[0.2em]">Ouro</span>
              </div>
              <div class="h-7 w-px bg-white/10"></div>
              <div class="flex flex-col items-center">
                <span class="text-[9px] uppercase tracking-[0.3em] text-white/40">Turno</span>
                <span data-hud="turnNumber" class="text-base font-display tracking-wider">1</span>
              </div>
            </div>
            <div class="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 flex flex-col">
              <span class="text-[9px] uppercase tracking-[0.3em] text-white/40">Fase</span>
              <span data-hud="phase" class="text-sm font-display tracking-wider">Movimento</span>
            </div>
          </div>

          <div class="flex items-center gap-2 pointer-events-auto">
            <button data-hud="mode-toggle"
              title="Alternar entre Solo (vs IA) e Local 2 Jogadores"
              class="ui-panel px-3 py-2 flex items-center gap-2 hover:brightness-125 transition">
              <span data-hud="mode-icon" class="text-base">🤖</span>
              <span data-hud="mode-label" class="text-[11px] font-display tracking-widest">SOLO</span>
            </button>
            <button data-hud="camera-btn"
              title="Centralizar a câmera no jogador atual"
              class="ui-panel px-3 py-2 flex items-center gap-2 hover:brightness-125 transition">
              <span class="text-base">📷</span>
              <span class="text-[11px] font-display tracking-widest">FOCAR</span>
            </button>
            <div class="ui-panel px-3 py-2 flex items-center gap-2">
              <span class="text-[9px] uppercase tracking-[0.3em] text-white/40">FPS</span>
              <span data-hud="fps" class="text-sm font-display tracking-wider">60</span>
            </div>
          </div>
        </header>

        <!-- ░ LEFT RAIL ░ -->
        <aside class="absolute left-5 top-28 bottom-28 w-[260px] flex flex-col gap-3 pointer-events-none">
          <div data-hud="selected-card" class="ui-panel px-4 py-3 pointer-events-auto transition-all duration-300">
            <div class="ui-label">Peça selecionada</div>
            <div data-hud="selected-name" class="text-lg font-display tracking-wider mt-0.5">—</div>
            <div class="mt-2 flex items-center gap-2 text-xs">
              <span class="ui-chip"><span class="text-white/40">CASA</span><span data-hud="selected-tile" class="text-white font-display tracking-wider">—</span></span>
            </div>
            <div data-hud="selected-desc" class="mt-2 text-[11px] text-white/60 leading-relaxed"></div>
          </div>
          <div class="ui-panel px-4 py-3 pointer-events-auto border-l-2" style="border-left-color:${AMBER}99;">
            <div class="flex items-center gap-2">
              <span style="color:${AMBER}" class="text-sm">✦</span>
              <div class="ui-label">Próximo passo</div>
            </div>
            <div data-hud="coach-text" class="text-xs text-white/85 mt-1.5 leading-relaxed">
              Selecione uma peça e mova-a.
            </div>
          </div>
        </aside>

        <!-- ░ RIGHT RAIL ░ -->
        <aside class="absolute right-5 top-28 bottom-28 w-[280px] flex flex-col gap-3 pointer-events-none">
          <div class="ui-panel px-4 py-3 pointer-events-auto">
            <div class="ui-label">Balanço material</div>
            <div class="mt-2 h-2 w-full rounded-full bg-black/40 overflow-hidden flex">
              <div data-hud="bal-gold" class="h-full transition-all duration-500" style="background:linear-gradient(90deg,${GOLD},#f8dc8a);width:50%"></div>
              <div data-hud="bal-silver" class="h-full transition-all duration-500" style="background:linear-gradient(90deg,#c9d3e2,${SILVER});width:50%"></div>
            </div>
            <div data-hud="bal-label" class="text-[10px] text-white/50 mt-1 text-center font-display tracking-widest">EQUILIBRADO</div>

            <div class="ui-label mt-3">Capturas</div>
            <div class="mt-1 space-y-1.5">
              <div class="flex items-center gap-2">
                <span class="text-[10px] tracking-[0.3em] font-display w-12" style="color:${GOLD}">OURO</span>
                <div data-hud="cap-gold" class="flex flex-wrap gap-1 flex-1 min-h-[22px]"></div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] tracking-[0.3em] font-display w-12" style="color:${SILVER}">PRATA</span>
                <div data-hud="cap-silver" class="flex flex-wrap gap-1 flex-1 min-h-[22px]"></div>
              </div>
            </div>
          </div>

          <div class="ui-panel px-4 py-3 pointer-events-auto flex-1 flex flex-col overflow-hidden">
            <div class="ui-label">Histórico</div>
            <div data-hud="history" class="mt-1.5 flex-1 overflow-y-auto pr-1 space-y-1 text-[11px] font-mono leading-snug text-white/75"></div>
          </div>
        </aside>

        <!-- ░ BOTTOM BAR ░ -->
        <footer class="absolute left-5 right-5 bottom-4 flex items-end justify-between gap-3 pointer-events-none">
          <div data-hud="action-rail" class="flex flex-wrap gap-2 pointer-events-auto"></div>
          <div class="ui-panel px-3 py-2 pointer-events-auto">
            <div class="flex items-center gap-3 text-[10px] text-white/60">
              <span><b class="text-white/85">CLIQUE</b> mover</span>
              <span class="text-white/20">·</span>
              <span><b class="text-white/85">BOTÃO DIR.</b> orbitar</span>
              <span class="text-white/20">·</span>
              <span><b class="text-white/85">SCROLL</b> zoom</span>
            </div>
          </div>
        </footer>

        <!-- ░ TOAST ░ -->
        <div data-hud="toast" class="ui-toast"></div>

        <!-- ░ PROMOTION MODAL ░ -->
        <div data-hud="promo-modal" class="ui-overlay ui-fade-out absolute inset-0 flex items-center justify-center">
          <div class="ui-panel ui-glow px-10 py-7 text-center max-w-2xl">
            <div class="ui-label">Promoção</div>
            <div class="text-3xl font-display tracking-[0.25em] mt-1" style="color:${GOLD}">Escolha a transformação</div>
            <p class="text-xs text-white/60 mt-2 max-w-md mx-auto">O Doríforo alcançou a última fileira e deve assumir uma nova função em campo.</p>
            <div data-hud="promo-cards" class="mt-6 grid grid-cols-4 gap-3"></div>
          </div>
        </div>

        <!-- ░ GAME OVER BANNER ░ -->
        <div data-hud="banner" class="ui-overlay ui-fade-out absolute inset-0 flex items-center justify-center">
          <div class="ui-panel ui-glow px-14 py-10 text-center max-w-md">
            <div class="ui-label">Fim de Partida</div>
            <div data-hud="banner-text" class="text-5xl font-display tracking-[0.25em] mt-3"></div>
            <div data-hud="banner-sub" class="text-sm text-white/70 mt-3 leading-relaxed"></div>
            <button data-hud="restart" class="mt-6 px-6 py-3 ui-panel font-display tracking-[0.3em] hover:brightness-125 transition" style="color:${GOLD}">REINICIAR</button>
          </div>
        </div>
      </div>
    `;

    this.playerChipEl = this.q('[data-hud="player-chip"]');
    this.turnDotEl = this.q('[data-hud="turn-dot"]');
    this.turnLabelEl = this.q('[data-hud="turn"]');
    this.turnNumEl = this.q('[data-hud="turnNumber"]');
    this.phasePillEl = this.q('[data-hud="phase"]');
    this.modeToggleEl = this.q('[data-hud="mode-toggle"]') as HTMLButtonElement;
    this.cameraBtnEl = this.q('[data-hud="camera-btn"]') as HTMLButtonElement;
    this.fpsEl = this.q('[data-hud="fps"]');

    this.selectedCardEl = this.q('[data-hud="selected-card"]');
    this.selectedNameEl = this.q('[data-hud="selected-name"]');
    this.selectedTileEl = this.q('[data-hud="selected-tile"]');
    this.selectedDescEl = this.q('[data-hud="selected-desc"]');
    this.coachEl = this.q('[data-hud="coach-text"]');

    this.balanceBarGoldEl = this.q('[data-hud="bal-gold"]');
    this.balanceBarSilverEl = this.q('[data-hud="bal-silver"]');
    this.balanceLabelEl = this.q('[data-hud="bal-label"]');
    this.capGoldEl = this.q('[data-hud="cap-gold"]');
    this.capSilverEl = this.q('[data-hud="cap-silver"]');
    this.historyEl = this.q('[data-hud="history"]');

    this.actionRailEl = this.q('[data-hud="action-rail"]');
    this.promoModalEl = this.q('[data-hud="promo-modal"]');
    this.bannerEl = this.q('[data-hud="banner"]');
    this.bannerTextEl = this.q('[data-hud="banner-text"]');
    this.bannerSubEl = this.q('[data-hud="banner-sub"]');
    this.restartBtnEl = this.q('[data-hud="restart"]');
    this.toastEl = this.q('[data-hud="toast"]');

    this.restartBtnEl.addEventListener('click', () => this.opts.onRestart());
    this.modeToggleEl.addEventListener('click', () => {
      const enabled = !this.modeToggleEl.dataset['enabled'];
      this.opts.onToggleLocalTwoPlayer(enabled);
    });
    this.cameraBtnEl.addEventListener('click', () => this.opts.onFocusCurrentPlayer());

    this.buildPromoCards();
  }

  private q(sel: string): HTMLElement {
    const el = this.root.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`HUD: missing element ${sel}`);
    return el;
  }

  private buildPromoCards(): void {
    const host = this.q('[data-hud="promo-cards"]');
    host.innerHTML = '';
    for (const t of PROMOTABLE_TYPES) {
      const btn = document.createElement('button');
      btn.className = 'ui-panel ui-hover-lift px-3 py-4 transition flex flex-col items-center gap-1.5';
      btn.innerHTML = /*html*/ `
        <div class="text-4xl font-display" style="color:${GOLD}">${PIECE_ABBREV[t]}</div>
        <div class="text-sm font-display tracking-wider text-white">${PIECE_NAMES[t]}</div>
        <div class="text-[10px] text-white/55 leading-snug text-center">${PIECE_DESCRIPTION[t]}</div>
      `;
      btn.addEventListener('click', () => this.opts.onPromote(t));
      host.appendChild(btn);
    }
  }

  // ─── Render snapshot ─────────────────────────────────────
  render(s: HudSnapshot): void {
    this.renderHeader(s);
    this.renderSelected(s);
    this.renderCoach(s);
    this.renderBalance(s);
    this.renderCaptures(s);
    this.renderHistory(s);
    this.renderActionRail(s);
    this.renderOverlays(s);
    this.renderModeToggle(s);

    // Toasts on player change (local 2P) or key phase events
    if (this.lastPlayer && this.lastPlayer !== s.currentPlayer) {
      this.showToast(
        `Vez de ${s.currentPlayer === 'gold' ? 'OURO' : 'PRATA'}`,
        s.currentPlayer === 'gold' ? GOLD : SILVER,
      );
    } else if (this.lastPhase && this.lastPhase !== s.phase
      && s.phase !== 'gameOver' && this.lastPhase !== 'gameOver') {
      if (s.phase === 'charge' || s.phase === 'chargeAfterPress') {
        this.showToast('INVESTIDA disponível', AMBER);
      } else if (s.phase === 'promotion' || s.phase === 'promotionAfterPress') {
        this.showToast('PROMOÇÃO', GOLD);
      } else if (s.phase === 'pressDecision' && s.canPress) {
        this.showToast('PRESSIONAR disponível', AMBER);
      }
    }
    this.lastPhase = s.phase;
    this.lastPlayer = s.currentPlayer;
  }

  private renderHeader(s: HudSnapshot): void {
    const isGold = s.currentPlayer === 'gold';
    const color = isGold ? GOLD : SILVER;
    this.turnLabelEl.textContent = isGold ? 'Ouro' : 'Prata';
    this.turnLabelEl.style.color = color;
    this.turnNumEl.textContent = String(s.turnNumber);
    this.phasePillEl.textContent = PHASE_LABEL[s.phase];

    this.turnDotEl.style.background = color;
    this.turnDotEl.style.boxShadow = `0 0 14px ${color}cc, 0 0 4px ${color}`;
    this.playerChipEl.style.borderColor = `${color}55`;
    this.playerChipEl.style.boxShadow = `inset 0 0 0 1px ${color}22, 0 0 24px ${color}1a`;
    this.playerChipEl.style.background = `linear-gradient(135deg, ${color}10, transparent 60%)`;
  }

  private renderSelected(s: HudSnapshot): void {
    const has = !!s.selectedLabel && s.selectedLabel !== '—';
    this.selectedCardEl.classList.toggle('opacity-50', !has);
    this.selectedNameEl.textContent = s.selectedLabel || '—';
    this.selectedNameEl.style.color = has
      ? (s.currentPlayer === 'gold' ? GOLD : SILVER)
      : 'rgba(255,255,255,0.5)';
    this.selectedTileEl.textContent = s.selectedTile ?? '—';

    let desc = '';
    if (has) {
      for (const [k, name] of Object.entries(PIECE_NAMES)) {
        if (s.selectedLabel.endsWith(name)) {
          desc = PIECE_DESCRIPTION[k as PieceType];
          break;
        }
      }
    }
    this.selectedDescEl.textContent = desc;
  }

  private renderCoach(s: HudSnapshot): void {
    this.coachEl.textContent = PHASE_HINT[s.phase];
  }

  private renderBalance(s: HudSnapshot): void {
    const goldScore = sumValue(s.capturedByGold);
    const silverScore = sumValue(s.capturedBySilver);
    const total = goldScore + silverScore;
    if (total === 0) {
      this.balanceBarGoldEl.style.width = '50%';
      this.balanceBarSilverEl.style.width = '50%';
      this.balanceLabelEl.textContent = 'EQUILIBRADO';
      this.balanceLabelEl.style.color = 'rgba(255,255,255,0.5)';
      return;
    }
    this.balanceBarGoldEl.style.width = `${(goldScore / total) * 100}%`;
    this.balanceBarSilverEl.style.width = `${(silverScore / total) * 100}%`;

    const diff = goldScore - silverScore;
    if (diff === 0) {
      this.balanceLabelEl.textContent = `EMPATE ${goldScore}–${silverScore}`;
      this.balanceLabelEl.style.color = 'rgba(255,255,255,0.5)';
    } else if (diff > 0) {
      this.balanceLabelEl.textContent = `OURO +${diff}`;
      this.balanceLabelEl.style.color = GOLD;
    } else {
      this.balanceLabelEl.textContent = `PRATA +${-diff}`;
      this.balanceLabelEl.style.color = SILVER;
    }
  }

  private renderCaptures(s: HudSnapshot): void {
    this.capGoldEl.innerHTML = s.capturedByGold.length
      ? s.capturedByGold.map(chip).join('')
      : '<span class="text-white/25 text-[10px] italic">nenhuma</span>';
    this.capSilverEl.innerHTML = s.capturedBySilver.length
      ? s.capturedBySilver.map(chip).join('')
      : '<span class="text-white/25 text-[10px] italic">nenhuma</span>';
  }

  private renderHistory(s: HudSnapshot): void {
    if (s.moveHistory.length === 0) {
      this.historyEl.innerHTML = '<div class="text-white/30 italic">A partida começou.</div>';
      return;
    }
    const total = s.moveHistory.length;
    this.historyEl.innerHTML = s.moveHistory
      .map((m, i) => {
        const isLast = i === total - 1;
        const accent = m.player === 'gold' ? GOLD : SILVER;
        return /*html*/`
          <div class="flex items-baseline gap-2 ${isLast ? 'bg-white/5 rounded px-1 -mx-1' : ''}">
            <span class="w-1.5 h-1.5 rounded-full inline-block" style="background:${accent}"></span>
            <span class="flex-1">${formatMoveCompact(m)}</span>
          </div>
        `;
      })
      .join('');
    this.historyEl.scrollTop = this.historyEl.scrollHeight;
  }

  private renderActionRail(s: HudSnapshot): void {
    this.actionRailEl.innerHTML = '';
    const addBtn = (
      label: string,
      accent: string,
      cb: () => void,
      opts: { disabled?: boolean; primary?: boolean; icon?: string } = {},
    ) => {
      const b = document.createElement('button');
      b.className = `ui-panel px-5 py-2.5 font-display tracking-[0.2em] text-sm transition flex items-center gap-2 ${opts.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-125'}`;
      b.style.color = accent;
      if (opts.primary && !opts.disabled) {
        b.style.borderColor = `${accent}88`;
        b.style.boxShadow = `0 0 24px ${accent}33, inset 0 0 0 1px ${accent}33`;
      }
      b.innerHTML = (opts.icon ? `<span class="text-base">${opts.icon}</span>` : '') + `<span>${label}</span>`;
      if (!opts.disabled) b.addEventListener('click', cb);
      this.actionRailEl.appendChild(b);
    };

    if (s.phase === 'pressDecision') {
      addBtn('PRESSIONAR', AMBER, () => this.opts.onPress(), {
        disabled: !s.canPress, primary: true, icon: '⚡',
      });
      addBtn('ENCERRAR TURNO', '#cfd8ea', () => this.opts.onEndTurn(), { icon: '✓' });
    } else if (s.phase === 'charge' || s.phase === 'chargeAfterPress') {
      addBtn('PULAR INVESTIDA', '#cfd8ea', () => this.opts.onSkipCharge(), { icon: '↷' });
    } else if (s.phase === 'mainMove' || s.phase === 'pressMove') {
      addBtn('ABANDONAR', CRIMSON, () => this.opts.onResign(), { icon: '⚑' });
    }
  }

  private renderOverlays(s: HudSnapshot): void {
    const isPromo = s.phase === 'promotion' || s.phase === 'promotionAfterPress';
    this.promoModalEl.classList.toggle('ui-fade-out', !isPromo);

    if (s.result) {
      this.bannerEl.classList.remove('ui-fade-out');
      this.bannerTextEl.textContent = s.result.isDraw
        ? 'EMPATE'
        : s.result.winner === 'gold' ? 'OURO VENCE' : 'PRATA VENCE';
      this.bannerSubEl.textContent = s.result.reason;
      const c = s.result.isDraw ? '#cfd8ea' : (s.result.winner === 'gold' ? GOLD : SILVER);
      this.bannerTextEl.style.color = c;
      this.bannerTextEl.style.textShadow = `0 0 28px ${c}aa`;
    } else {
      this.bannerEl.classList.add('ui-fade-out');
    }
  }

  private renderModeToggle(s: HudSnapshot): void {
    const icon = this.modeToggleEl.querySelector('[data-hud="mode-icon"]') as HTMLElement;
    const label = this.modeToggleEl.querySelector('[data-hud="mode-label"]') as HTMLElement;
    if (s.localTwoPlayer) {
      this.modeToggleEl.dataset['enabled'] = '1';
      icon.textContent = '👥';
      label.textContent = 'LOCAL 2P';
      this.modeToggleEl.style.color = EMERALD;
      this.modeToggleEl.style.borderColor = `${EMERALD}55`;
    } else {
      delete this.modeToggleEl.dataset['enabled'];
      icon.textContent = '🤖';
      label.textContent = 'SOLO';
      this.modeToggleEl.style.color = '';
      this.modeToggleEl.style.borderColor = '';
    }
    this.cameraBtnEl.style.opacity = s.canFocusCamera ? '1' : '0.3';
    this.cameraBtnEl.disabled = !s.canFocusCamera;
  }

  private showToast(message: string, accent: string): void {
    this.toastEl.textContent = message;
    this.toastEl.style.color = accent;
    this.toastEl.style.borderColor = `${accent}77`;
    this.toastEl.style.boxShadow = `0 0 32px ${accent}44, inset 0 0 0 1px ${accent}33`;
    this.toastEl.classList.remove('ui-toast-out');
    this.toastEl.classList.add('ui-toast-in');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('ui-toast-in');
      this.toastEl.classList.add('ui-toast-out');
    }, 1600);
  }

  /** Called every frame from the engine loop. */
  tick(time: Time, dt: number): void {
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.25) {
      this.fpsEl.textContent = String(Math.round(time.fps));
      this.fpsTimer = 0;
    }
  }
}

// ─── Pure helpers ───────────────────────────────────────────
function chip(t: PieceType): string {
  return `<span class="ui-chip text-[10px] font-display !px-1.5 !py-0.5" title="${PIECE_NAMES[t]}">${PIECE_ABBREV[t]}</span>`;
}

function sumValue(arr: PieceType[]): number {
  return arr.reduce((s, t) => s + PIECE_VALUE[t], 0);
}

function formatMoveCompact(m: MoveRecord): string {
  const from = posToLabel(m.from);
  const to = posToLabel(m.to);
  const sym = m.kind === 'rangedCapture' ? '⊕' : (m.kind === 'capture' ? '×' : '→');
  const press = m.isPress ? '⚡' : '';
  const charge = m.chargeTo ? `▸${posToLabel(m.chargeTo)}` : '';
  const promo = m.promotion ? `=${PIECE_ABBREV[m.promotion]}` : '';
  return `${PIECE_ABBREV[m.pieceType]} ${from}${sym}${to}${promo}${charge}${press}`;
}

function posToLabel(p: { row: number; col: number }): string {
  return `${String.fromCharCode(97 + p.col)}${p.row + 1}`;
}
