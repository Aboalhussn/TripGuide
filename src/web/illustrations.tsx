// Small flat illustrations in the app's colors, used on the step-by-step "Post a trip" screens.
// They are decorative: the step title next to them carries the meaning.
import React from 'react';

const NAVY = '#053f5c';
const TEAL = '#429ebd';
const SKY = '#9fe7f5';
const SOFT = '#e4f8fc';
const GOLD = '#f7ad19';
const WHITE = '#ffffff';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg className="illo" viewBox="0 0 320 150" role="presentation" aria-hidden="true" focusable="false">
      <rect width="320" height="150" rx="22" fill={SOFT} />
      <circle cx="268" cy="34" r="20" fill={GOLD} opacity=".9" />
      {children}
    </svg>
  );
}

function Pin({ x, y, color = GOLD }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 -22c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14z" fill={color} />
      <circle cy="-8" r="5" fill={WHITE} />
    </g>
  );
}

/** Step 1: a map with a route between cities. */
export function IlloWhere() {
  return (
    <Frame>
      <path d="M0 118 C60 104 92 126 150 112 S250 96 320 110 V150 H0z" fill={SKY} opacity=".7" />
      <rect x="44" y="30" width="150" height="92" rx="12" fill={WHITE} stroke={TEAL} strokeOpacity=".35" />
      <path d="M44 62 L110 46 L194 70" stroke={SKY} strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M70 104 C94 80 116 98 134 78 S170 60 176 52" stroke={NAVY} strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" fill="none" />
      <Pin x={70} y={100} color={TEAL} />
      <Pin x={176} y={52} />
      {/* ziggurat and palm */}
      <path d="M222 120 h56 l-6 -10 h-44z M230 110 h40 l-6 -10 h-28z M238 100 h24 l-5 -9 h-14z" fill={NAVY} />
      <path d="M298 120 v-30" stroke={NAVY} strokeWidth="4" />
      <path d="M298 90 c-10 -8 -20 -6 -26 2 c8 -2 16 0 26 -2z M298 90 c10 -8 20 -6 26 2 c-8 -2 -16 0 -26 -2z M298 90 c-4 -10 -12 -14 -20 -12 c8 2 14 6 20 12z" fill={NAVY} />
    </Frame>
  );
}

/** Step 2: travellers and a calendar. */
export function IlloWho() {
  return (
    <Frame>
      <rect x="150" y="30" width="118" height="96" rx="14" fill={WHITE} stroke={TEAL} strokeOpacity=".35" />
      <rect x="150" y="30" width="118" height="24" rx="12" fill={NAVY} />
      <rect x="150" y="44" width="118" height="10" fill={NAVY} />
      <circle cx="174" cy="30" r="4" fill={GOLD} />
      <circle cx="244" cy="30" r="4" fill={GOLD} />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => {
          const on = r === 1 && c >= 1 && c <= 3;
          return <rect key={r + '-' + c} x={160 + c * 21} y={62 + r * 15} width="15" height="10" rx="3" fill={on ? TEAL : SOFT} />;
        }),
      )}
      {/* two travellers */}
      <g fill={NAVY}>
        <circle cx="72" cy="58" r="14" />
        <path d="M46 126 c0 -30 12 -46 26 -46 s26 16 26 46z" />
      </g>
      <g fill={TEAL}>
        <circle cx="112" cy="70" r="11" />
        <path d="M92 126 c0 -24 9 -36 20 -36 s20 12 20 36z" />
      </g>
      <rect x="40" y="112" width="40" height="18" rx="5" fill={GOLD} />
      <rect x="54" y="106" width="12" height="7" rx="2" fill="none" stroke={GOLD} strokeWidth="3" />
    </Frame>
  );
}

/** Step 3: a guide talking, and a day-by-day list. */
export function IlloPlan() {
  return (
    <Frame>
      <g fill={NAVY}>
        <circle cx="70" cy="64" r="15" />
        <path d="M42 130 c0 -32 13 -48 28 -48 s28 16 28 48z" />
      </g>
      <path d="M58 40 l12 -6 l12 6z" fill={GOLD} />
      <rect x="98" y="26" width="58" height="32" rx="12" fill={TEAL} />
      <path d="M106 56 l-6 12 l16 -10z" fill={TEAL} />
      <text x="127" y="48" textAnchor="middle" fontSize="16" fontWeight="700" fill={WHITE} fontFamily="sans-serif">A · ع</text>
      <rect x="178" y="40" width="100" height="90" rx="14" fill={WHITE} stroke={TEAL} strokeOpacity=".35" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(192 ${58 + i * 24})`}>
          <rect width="14" height="14" rx="4" fill={i < 2 ? TEAL : SOFT} />
          {i < 2 && <path d="M3.5 7.5 l3 3 l5 -6" stroke={WHITE} strokeWidth="2" fill="none" strokeLinecap="round" />}
          <rect x="22" y="2" width={i === 1 ? 44 : 56} height="4" rx="2" fill={NAVY} />
          <rect x="22" y="9" width="34" height="3" rx="1.5" fill={SKY} />
        </g>
      ))}
    </Frame>
  );
}

/** Step 4: a wallet with coins and a safety check. */
export function IlloBudget() {
  return (
    <Frame>
      <path d="M0 120 C70 108 120 128 180 116 S270 104 320 116 V150 H0z" fill={SKY} opacity=".7" />
      <rect x="82" y="44" width="130" height="84" rx="16" fill={NAVY} />
      <rect x="82" y="58" width="130" height="10" fill={TEAL} opacity=".6" />
      <rect x="168" y="78" width="54" height="30" rx="10" fill={TEAL} />
      <circle cx="184" cy="93" r="6" fill={GOLD} />
      <g>
        <ellipse cx="62" cy="122" rx="20" ry="7" fill={GOLD} />
        <rect x="42" y="108" width="40" height="14" fill={GOLD} />
        <ellipse cx="62" cy="108" rx="20" ry="7" fill="#ffc94d" />
        <text x="62" y="112" textAnchor="middle" fontSize="11" fontWeight="800" fill={NAVY} fontFamily="sans-serif">$</text>
      </g>
      <g transform="translate(244 92)">
        <path d="M0 -26 l22 8 v14 c0 16 -10 26 -22 32 c-12 -6 -22 -16 -22 -32 v-14z" fill={WHITE} stroke={TEAL} strokeWidth="3" />
        <path d="M-9 0 l6 6 l12 -13" stroke={TEAL} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Frame>
  );
}
