/**
 * A tiny, dependency-free confetti burst in chalk colours. Draws on a temporary full-screen canvas
 * that ignores the pointer and removes itself when the last piece has fallen. Does nothing for
 * people who ask the OS for reduced motion.
 */

const COLORS = ['#f5d76e', '#f29bb4', '#8ecdf2', '#9be3bf', '#f6a55b', '#c4a7f2', '#ffffff']

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  vr: number
  color: string
  shape: 0 | 1 | 2 // rectangle, dot, squiggle-ish strip
  life: number
}

export interface BurstOptions {
  /** Viewport coordinates of the burst origin. Defaults to the top centre (a shower). */
  x?: number
  y?: number
  count?: number
  /** Spread in radians around straight up. */
  spread?: number
  power?: number
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

let active = 0

export function burst(opts: BurstOptions = {}): void {
  if (typeof window === 'undefined' || reducedMotion()) return
  if (active > 3) return // a handful at once is plenty
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  active++

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: `${w}px`,
    height: `${h}px`,
    pointerEvents: 'none',
    zIndex: '100',
  })
  document.body.appendChild(canvas)
  ctx.scale(dpr, dpr)

  const shower = opts.x === undefined && opts.y === undefined
  const count = opts.count ?? (shower ? 140 : 60)
  const spread = opts.spread ?? (shower ? Math.PI * 2 : Math.PI / 1.6)
  const power = opts.power ?? (shower ? 4 : 9)
  const pieces: Piece[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread
    const speed = power * (0.45 + Math.random() * 0.75)
    return {
      x: shower ? Math.random() * w : (opts.x ?? w / 2),
      y: shower ? -20 - Math.random() * h * 0.3 : (opts.y ?? h / 2),
      vx: Math.cos(angle) * speed,
      vy: shower ? Math.random() * 2 : Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: Math.floor(Math.random() * 3) as Piece['shape'],
      life: 1,
    }
  })

  let last = performance.now()
  const started = last
  const frame = (now: number) => {
    const dt = Math.min(2, (now - last) / 16.67)
    last = now
    ctx.clearRect(0, 0, w, h)
    let alive = 0
    for (const p of pieces) {
      if (p.life <= 0) continue
      p.vy += 0.18 * dt
      p.vx *= 0.99
      p.x += p.vx * dt + Math.sin((now + p.size * 100) / 260) * 0.6
      p.y += p.vy * dt
      p.rot += p.vr * dt
      if (now - started > 1800) p.life -= 0.02 * dt
      if (p.y > h + 30) p.life = 0
      if (p.life <= 0) continue
      alive++
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      else if (p.shape === 1) {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2)
        ctx.fill()
      } else ctx.fillRect(-p.size / 6, -p.size / 1.4, p.size / 3, p.size * 1.4)
      ctx.restore()
    }
    if (alive > 0 && now - started < 6000) requestAnimationFrame(frame)
    else {
      canvas.remove()
      active--
    }
  }
  requestAnimationFrame(frame)
}

/** Burst from the middle of an element (a button that was just pressed, a heading). */
export function burstFrom(el: Element | null, opts: Omit<BurstOptions, 'x' | 'y'> = {}): void {
  if (!el) return burst(opts)
  const r = el.getBoundingClientRect()
  burst({ ...opts, x: r.left + r.width / 2, y: r.top + r.height / 2 })
}
