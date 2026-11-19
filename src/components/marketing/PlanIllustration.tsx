// A stylised floor plan with pinned devices, a cable run and the takeoff it produces. Inline SVG, no images.

type Pin = { x: number; y: number; label: string; kind: "cam" | "net" | "av" | "light" };
const PINS: Pin[] = [
  { x: 74, y: 62, label: "C1", kind: "cam" },
  { x: 486, y: 62, label: "C2", kind: "cam" },
  { x: 486, y: 330, label: "C3", kind: "cam" },
  { x: 74, y: 330, label: "C4", kind: "cam" },
  { x: 186, y: 168, label: "W1", kind: "net" },
  { x: 392, y: 254, label: "W2", kind: "net" },
  { x: 140, y: 262, label: "S1", kind: "av" },
  { x: 236, y: 262, label: "S2", kind: "av" },
  { x: 188, y: 318, label: "TV", kind: "av" },
  { x: 330, y: 104, label: "K1", kind: "light" },
  { x: 430, y: 150, label: "L1", kind: "light" },
];
const COLORS: Record<Pin["kind"], string> = { cam: "#c2410c", net: "#2563eb", av: "#7c3aed", light: "#b45309" };

export default function PlanIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 400" className={className} role="img" aria-label="A floor plan with cameras, Wi-Fi access points, speakers and keypads pinned on it, and cable runs back to the rack">
      <defs>
        <pattern id="pp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#e2ded7" strokeWidth="0.6" />
        </pattern>
        <filter id="pp-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#281e0f" floodOpacity="0.25" />
        </filter>
      </defs>
      <rect width="560" height="400" rx="14" fill="#fffdf9" />
      <rect x="10" y="10" width="540" height="380" rx="8" fill="url(#pp-grid)" />

      {/* Rooms */}
      <g fill="none" stroke="#2a2724" strokeLinecap="square">
        <rect x="40" y="30" width="480" height="330" strokeWidth="7" />
        <path d="M280 30V132M280 168V210M40 210H128M164 210H300M336 210H520M380 30V96M380 132V210M300 210V360M420 210V280M420 316V360" strokeWidth="4" />
      </g>
      {/* Door swings */}
      <g fill="none" stroke="#a19a90" strokeWidth="1.2">
        <path d="M128 210A36 36 0 0 1 164 174" />
        <path d="M300 210A36 36 0 0 0 336 246" />
        <path d="M280 132A36 36 0 0 1 316 168" />
        <path d="M380 96A36 36 0 0 1 416 132" />
        <path d="M420 280A36 36 0 0 1 456 316" />
      </g>
      <g fill="#a19a90" fontFamily="ui-monospace, monospace" fontSize="10" letterSpacing="1.2">
        <text x="56" y="196">LIVING</text>
        <text x="296" y="50">KITCHEN</text>
        <text x="396" y="50">OFFICE</text>
        <text x="56" y="350">MEDIA</text>
        <text x="316" y="350">GARAGE</text>
        <text x="436" y="350">RACK</text>
      </g>

      {/* Home runs back to the rack */}
      <g fill="none" stroke="#c2410c" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.75">
        <path d="M470 300H392V254" />
        <path d="M470 300V228H186V168" />
        <path d="M470 300V340H188V318" />
      </g>
      <rect x="458" y="290" width="24" height="20" rx="3" fill="#2a2724" />
      <path d="M462 296h16M462 300h16M462 304h16" stroke="#77706a" strokeWidth="1.2" />

      {/* Camera view cones */}
      <g fill="#c2410c" opacity="0.08">
        <path d="M74 62L150 40L130 120Z" />
        <path d="M486 62L410 40L430 120Z" />
        <path d="M486 330L410 352L430 270Z" />
        <path d="M74 330L150 352L130 270Z" />
      </g>

      {/* Device pins */}
      {PINS.map((p) => (
        <g key={p.label} transform={`translate(${p.x} ${p.y})`} filter="url(#pp-shadow)">
          <circle r="12" fill={COLORS[p.kind]} />
          <circle r="12" fill="none" stroke="#fff" strokeWidth="2" />
          <text y="3.5" textAnchor="middle" fill="#fff" fontFamily="ui-monospace, monospace" fontSize="9.5" fontWeight="700">
            {p.label}
          </text>
        </g>
      ))}

      {/* Scale bar */}
      <g transform="translate(40 378)" fontFamily="ui-monospace, monospace" fontSize="9" fill="#77706a">
        <path d="M0 0H80" stroke="#77706a" strokeWidth="1.5" />
        <path d="M0 -4V4M40 -3V3M80 -4V4" stroke="#77706a" strokeWidth="1.5" />
        <text x="88" y="3">10 ft</text>
      </g>
    </svg>
  );
}

/** The takeoff + estimate card that sits on top of the plan. */
export function TakeoffCard({ className = "" }: { className?: string }) {
  const rows: [string, string, string][] = [
    ["#c2410c", "Cameras", "4"],
    ["#2563eb", "Wi-Fi access points", "2"],
    ["#7c3aed", "Speakers + TV", "3"],
    ["#b45309", "Keypads & lighting", "2"],
    ["#57524c", "Cat6 (with slack)", "412 ft"],
  ];
  return (
    <div className={`w-56 rounded-xl bg-white/95 p-3 text-xs shadow-pop ring-1 ring-slate-200 backdrop-blur ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-slate-900">Floor 1 takeoff</span>
        <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Live</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map(([c, name, n]) => (
          <li key={name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c }} />
            <span className="flex-1 text-slate-600">{name}</span>
            <span className="font-mono font-medium text-slate-900 tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-2">
        <span className="text-slate-500">Estimate</span>
        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">$9,846.00</span>
      </div>
    </div>
  );
}
