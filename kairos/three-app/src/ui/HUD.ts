/**
 * HUD — Kairos-themed overlay (Cinzel display font, gold/silver chrome).
 *
 * Responsibilities:
 *   - Top bar: factions, turn number, current phase label, FPS
 *   - Bottom-left: selected piece + tile, last-move log
 *   - Bottom-right: captures by each player (small icons), controls help
 *   - Action rail (right side, only while interactive):
 *       · "Pressionar" / "Encerrar Turno" during pressDecision
 *       · "Pular Investida" during charge / chargeAfterPress
 *   - Modal: 4 promotion cards during promotion / promotionAfterPress
 *   - Banner: game-over (winner / draw reason) with "Reiniciar" button
 *
 * The HUD is fully driven by `render(snapshot)` — no internal game knowledge,
 * just a typed projection of GameState.
 */
import type { Time } from '@core/Time';
import type {
  GameResult, MoveRecord, PieceType, Player, TurnPhase,
} from '@domain/index';
import { PIECE_ABBREV, PIECE_NAMES, PROMOTABLE_TYPES } from '@domain/index';

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
}

export interface HUDOptions {
  root: HTMLElement;
  onPress: () => void;
  onEndTurn: () => void;
  onSkipCharge: () => void;
  onPromote: (type: PieceType) => void;
  onRestart: () => void;
  onResign: () => void;
}

const PHASE_LABEL: Record<TurnPhase, string> = {
  mainMove: 'Movimento Principal',
  charge: 'Investida do Hippeus',
  promotion: 'Promoção',
  pressDecision: 'Decisão — Pressionar?',
  pressMove: 'Pressionar — 2º Movimento',
  chargeAfterPress: 'Investida (após Pressionar)',
  promotionAfterPress: 'Promoção (após Pressionar)',
  gameOver: 'Fim de Partida',
};

export class HUD {
  private readonly root: HTMLElement;
  private readonly opts: HUDOptions;
  private fpsEl!: HTMLElement;
  private turnEl!: HTMLElement;
  private turnNumEl!: HTMLElement;
  private phaseEl!: HTMLElement;
  private selEl!: HTMLElement;
  private coordEl!: HTMLElement;
  private lastMoveEl!: HTMLElement;
  private capGoldEl!: HTMLElement;
  private capSilverEl!: HTMLElement;
  private actionRailEl!: HTMLElement;
  private promoModalEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private bannerTextEl!: HTMLElement;
  private bannerSubEl!: HTMLElement;
  private restartBtnEl!: HTMLElement;
  private fpsTimer = 0;

  constructor(opts: HUDOptions) {
    this.root = opts.root;
    this.opts = opts;
    this.mount();
  }

  // ─── DOM scaffold ─────────────────────────────────────────
  private mount(): void {
    this.root.innerHTML = `
      <div class="absolute inset-0 p-5 flex flex-col text-white">
        <header class="flex items-start justify-between pointer-events-auto">
          <div class="ui-panel px-5 py-3 flex items-center gap-5">
            <div class="text-2xl font-display tracking-[0.45em]" style="color:#f0c040">KAIRÓS</div>
            <div class="h-7 w-px bg-white/15"></div>
            <div>
              <div class="ui-label">Jogador</div>
              <div class="flex items-center gap-2 mt-0.5">
                <span data-hud="turn-dot" class="w-2.5 h-2.5 rounded-full"></span>
                <span data-hud="turn" class="ui-value font-display tracking-wider">Ouro</span>
                <span class="ui-label">·</span>
                <span data-hud="turnNumber" class="ui-value text-sm text-white/70">T1</span>
              </div>
            </div>
            <div class="h-7 w-px bg-white/15"></div>
            <div>
              <div class="ui-label">Fase</div>
              <div data-hud="phase" class="ui-value mt-0.5 text-sm">Movimento Principal</div>
            </div>
          </div>
          <div class="ui-panel px-3 py-2 flex items-center gap-2">
            <span class="ui-label">FPS</span>
            <span data-hud="fps" class="ui-value text-sm">60</span>
          </div>
        </header>

        <main class="flex-1 flex items-center justify-end pr-2 pointer-events-none">
          <div data-hud="action-rail" class="flex flex-col gap-2 pointer-events-auto"></div>
        </main>

        <footer class="flex items-end justify-between gap-3 pointer-events-auto">
          <div class="flex flex-col gap-2">
            <div class="ui-panel px-4 py-3 min-w-[240px]">
              <div class="ui-label">Selecionado</div>
              <div data-hud="selected" class="ui-value mt-1 font-display">—</div>
              <div class="mt-2 flex items-center gap-2">
                <span class="ui-chip"><span class="ui-label">Casa</span><span data-hud="coord" class="text-white">—</span></span>
              </div>
            </div>
            <div class="ui-panel px-4 py-2 max-w-[420px]">
              <div class="ui-label">Última Jogada</div>
              <div data-hud="lastMove" class="text-xs text-white/80 mt-0.5">—</div>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="ui-panel px-4 py-3">
              <div class="ui-label">Capturas</div>
              <div class="mt-1 flex gap-4">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] tracking-[0.3em] font-display" style="color:#f0c040">OURO</span>
                  <div data-hud="cap-gold" class="flex flex-wrap gap-1 min-w-[60px]"></div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] tracking-[0.3em] font-display" style="color:#a8b8cc">PRATA</span>
                  <div data-hud="cap-silver" class="flex flex-wrap gap-1 min-w-[60px]"></div>
                </div>
              </div>
            </div>
            <div class="ui-panel px-4 py-2 max-w-md">
              <div class="ui-label">Controles</div>
              <div class="text-xs text-white/70 mt-1 leading-relaxed">
                <span class="ui-chip"><b>LMB</b> selecionar / mover</span>
                <span class="ui-chip"><b>RMB</b> orbitar</span>
                <span class="ui-chip"><b>Scroll</b> zoom</span>
              </div>
            </div>
          </div>
        </footer>

        <div data-hud="promo-modal" class="fade-out absolute inset-0 flex items-center justify-center transition-opacity duration-300 bg-black/40">
          <div class="ui-panel px-8 py-6 pointer-events-auto text-center max-w-xl">
            <div class="ui-label">Promoção</div>
            <div class="text-2xl font-display tracking-[0.2em] mt-1" style="color:#f0c040">Escolha o tipo</div>
            <div data-hud="promo-cards" class="mt-5 grid grid-cols-4 gap-3"></div>
          </div>
        </div>

        <div data-hud="banner" class="fade-out absolute inset-0 flex items-center justify-center transition-opacity duration-500 bg-black/60">
          <div class="ui-panel px-12 py-8 text-center pointer-events-auto">
            <div class="ui-label">Fim de Partida</div>
            <div data-hud="banner-text" class="text-4xl font-display tracking-[0.2em] mt-2"></div>
            <div data-hud="banner-sub" class="text-sm text-white/70 mt-2"></div>
            <button data-hud="restart" class="mt-5 px-5 py-2 ui-panel font-display tracking-widest hover:brightness-125" style="color:#f0c040">REINICIAR</button>
          </div>
        </div>
      </div>
    `;
    this.fpsEl = this.q('[data-hud="fps"]');
    this.turnEl = this.q('[data-hud="turn"]');
    this.turnNumEl = this.q('[data-hud="turnNumber"]');
    this.phaseEl = this.q('[data-hud="phase"]');
    this.selEl = this.q('[data-hud="selected"]');
    this.coordEl = this.q('[data-hud="coord"]');
    this.lastMoveEl = this.q('[data-hud="lastMove"]');
    this.capGoldEl = this.q('[data-hud="cap-gold"]');
    this.capSilverEl = this.q('[data-hud="cap-silver"]');
    this.actionRailEl = this.q('[data-hud="action-rail"]');
    this.promoModalEl = this.q('[data-hud="promo-modal"]');
    this.bannerEl = this.q('[data-hud="banner"]');
    this.bannerTextEl = this.q('[data-hud="banner-text"]');
    this.bannerSubEl = this.q('[data-hud="banner-sub"]');
    this.restartBtnEl = this.q('[data-hud="restart"]');

    this.restartBtnEl.addEventListener('click', () => this.opts.onRestart());
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
      btn.className = 'ui-panel px-3 py-3 hover:brightness-125 transition flex flex-col items-center gap-1';
      btn.innerHTML = `
        <div class="text-3xl font-display" style="color:#f0c040">${PIECE_ABBREV[t]}</div>
        <div class="text-xs text-white/85 font-display tracking-wider">${PIECE_NAMES[t]}</div>
      `;
      btn.addEventListener('click', () => this.opts.onPromote(t));
      host.appendChild(btn);
    }
  }

  // ─── Render snapshot ──────────────────────────────────────
  render(s: HudSnapshot): void {
    // Header
    this.turnEl.textContent = s.currentPlayer === 'gold' ? 'Ouro' : 'Prata';
    this.turnNumEl.textContent = `T${s.turnNumber}`;
    this.phaseEl.textContent = PHASE_LABEL[s.phase];
    const dot = this.root.querySelector('[data-hud="turn-dot"]') as HTMLElement;
    if (dot) {
      dot.style.background = s.currentPlayer === 'gold' ? '#f0c040' : '#a8b8cc';
      dot.style.boxShadow = s.currentPlayer === 'gold'
        ? '0 0 10px rgba(240,192,64,0.7)'
        : '0 0 10px rgba(168,184,204,0.7)';
    }

    // Footer left
    this.selEl.textContent = s.selectedLabel;
    this.coordEl.textContent = s.selectedTile ?? '—';
    this.lastMoveEl.textContent = s.lastMove ? formatMove(s.lastMove) : '—';

    // Captures
    this.capGoldEl.innerHTML = s.capturedByGold.map(chip).join('') || '<span class="text-white/30 text-xs">—</span>';
    this.capSilverEl.innerHTML = s.capturedBySilver.map(chip).join('') || '<span class="text-white/30 text-xs">—</span>';

    // Action rail
    this.renderActionRail(s);

    // Promotion modal
    const isPromo = s.phase === 'promotion' || s.phase === 'promotionAfterPress';
    this.promoModalEl.classList.toggle('fade-out', !isPromo);

    // Banner
    if (s.result) {
      this.bannerEl.classList.remove('fade-out');
      this.bannerTextEl.textContent = s.result.isDraw
        ? 'EMPATE'
        : s.result.winner === 'gold' ? 'OURO VENCE' : 'PRATA VENCE';
      this.bannerSubEl.textContent = s.result.reason;
      this.bannerTextEl.style.color = s.result.isDraw
        ? '#cfd8ea'
        : (s.result.winner === 'gold' ? '#f0c040' : '#a8b8cc');
    } else {
      this.bannerEl.classList.add('fade-out');
    }
  }

  private renderActionRail(s: HudSnapshot): void {
    this.actionRailEl.innerHTML = '';
    const addBtn = (label: string, accent: string, cb: () => void, disabled = false) => {
      const b = document.createElement('button');
      b.className = `ui-panel px-5 py-2.5 font-display tracking-widest text-sm transition ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-125'}`;
      b.style.color = accent;
      b.textContent = label;
      if (!disabled) b.addEventListener('click', cb);
      this.actionRailEl.appendChild(b);
    };

    if (s.phase === 'pressDecision') {
      addBtn('PRESSIONAR', '#f39c12', () => this.opts.onPress(), !s.canPress);
      addBtn('ENCERRAR TURNO', '#cfd8ea', () => this.opts.onEndTurn());
    } else if (s.phase === 'charge' || s.phase === 'chargeAfterPress') {
      addBtn('PULAR INVESTIDA', '#cfd8ea', () => this.opts.onSkipCharge());
    } else if (s.phase === 'mainMove' || s.phase === 'pressMove') {
      addBtn('ABANDONAR', '#e74c3c', () => this.opts.onResign());
    }
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

function chip(t: PieceType): string {
  return `<span class="ui-chip text-[11px] font-display" title="${PIECE_NAMES[t]}">${PIECE_ABBREV[t]}</span>`;
}

function formatMove(m: MoveRecord): string {
  const from = posToLabel(m.from);
  const to = posToLabel(m.to);
  const sym = m.kind === 'rangedCapture' ? '⊕' : (m.kind === 'capture' ? '×' : '→');
  const press = m.isPress ? ' [P]' : '';
  const charge = m.chargeTo ? ` ⚡${posToLabel(m.chargeTo)}` : '';
  const promo = m.promotion ? `=${PIECE_ABBREV[m.promotion]}` : '';
  const owner = m.player === 'gold' ? 'Ouro' : 'Prata';
  return `${owner}: ${PIECE_ABBREV[m.pieceType]} ${from}${sym}${to}${promo}${charge}${press}`;
}

function posToLabel(p: { row: number; col: number }): string {
  return `${String.fromCharCode(97 + p.col)}${p.row + 1}`;
}

