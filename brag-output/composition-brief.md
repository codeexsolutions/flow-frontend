# Hyperframes Composition Brief: CodEx Flow

## Objective
Anúncio narrado de ~1 minuto, em português do Brasil, que vende o CodEx Flow percorrendo o fluxo real do produto.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape 1920x1080, 30fps
- Duration: 62.8s (user override of the 15-25s default)

## Source Material
- Project root: codex-flow-frontend
- Files read: README.md, package.json, src/index.css (`.vitrine` tokens), tailwind.config.js, src/features/landing/pages/LandingPage.tsx, src/features/vendas/pages/PDVPage.tsx (labels)
- Verbatim copy used on screen: "Sua loja inteira na palma da mão.", "Pix com QR na nota", "Funciona sem internet" (from "Funciona sem internet e sai junto da nota"), "O saldo pendente fica visível até o último centavo.", "Escolha o plano", "Cadastre a empresa", "Pague via Pix", "Sem instalação, sem técnico", "Sem fidelidade", "Ver planos e preços", "Mais escolhido" (not used), module titles (Ponto de venda, Estoque, Clientes, Financeiro, Vendedores, Notificações da equipe, Funciona no celular).

## Creative Direction
See brag-plan.md. Preset app-store; sales-ad framing (dor → urgência → revelação → fluxo → risco zero → CTA).

## Visual Identity
Background #0C0B18, surface #16142A / #1E1B37, text #F0EDFF, mist #A6A1CA, accent #8D70FF / #B6A0FF / #D6C8FF, danger #F87171, warning #FBBF24, success #34D399. Sora (display), Inter (body), both shipped locally in assets/fonts. Logo assets/logo.png. Icons from the project's lucide-react set (assets/icons.js).

## Audio
- Voiceover: 9 clips assets/vo/s1–s9.wav (Kokoro pm_alex, --lang pt-br), each at its scene start + 0.3s.
- Music: assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3 at 0.13 (ducked under VO for whole runtime), fade-in 1s, fade-out 2.5s.
- Audio-reactive: assets/audio-data.js (bass energy per frame) drives ambient glow scale/opacity.
- SFX: selected files in assets/sfx/, 0.5-0.7 volume, aligned to motion starts.
- Beat lock: logo reveal 12.02s.
