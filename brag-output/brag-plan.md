# Brag Plan: CodEx Flow

## What is this app?
Sistema de gestão para pequeno comércio: PDV, Pix com QR na nota, estoque, clientes, financeiro e vendedores com login próprio, num app que abre no celular e funciona sem internet.

## The angle
Anúncio de vendas narrado, em português, para o dono de loja que ainda anota venda no caderno. Abre na dor (dinheiro sumindo), dá urgência ("cada dia assim é venda perdida"), revela o produto e percorre o fluxo real do sistema, da nota aberta ao caixa do dia. Termina tirando o risco: sem instalação, sem técnico, sem fidelidade.

## Hook (first 2-3 seconds)
"Quanto dinheiro sumiu da sua loja este mês?" em tipo grande, seguido por três cartões de dor que caem um a um: venda no caderno, fiado esquecido, estoque que acabou sem aviso.

## Key moments
- A nota do PDV se enchendo item a item, com pagamento parcial e o "saldo pendente" aceso.
- O QR do Pix aparecendo na própria nota, com o selo "Funciona sem internet".
- O alerta de estoque baixo virando âmbar, e a ficha do cliente com "ainda deve".
- Três vendedores com login próprio e o caixa do dia contando.
- Uma notificação "Venda fechada" chegando num celular.

## Outro / punchline
Os três passos reais (Escolha o plano · Cadastre a empresa · Pague via Pix), "Sem instalação · Sem técnico · Sem fidelidade", e o fechamento com a logo e "Sua loja inteira na palma da mão."

## User flow worth showing
Abrir a nota → lançar produtos e receber em partes → Pix na nota → estoque/cliente atualizados → dono acompanha vendedores e caixa → notificação no celular.

## Tone
- Preset: app-store
- Creative direction: anúncio de vendas brasileiro, narrado, gatilhos de dor → urgência → benefício → prova/risco zero no começo
- Interpretation: cartões de produto limpos e legíveis, cada um sincronizado com a frase da narração; energia vem do corte e da música, não de texto piscando.

## Format: landscape — 1920x1080
## Duration: 62.8s (pedido explícito do usuário: ~1 minuto; substitui a janela padrão de 15-25s)

## Visual identity (from the project — `.vitrine` em src/index.css)
- Background: rgb(12 11 24) #0C0B18; surface #16142A; raised #1E1B37
- Accent: rgb(141 112 255) #8D70FF; soft #B6A0FF; strong #D6C8FF
- Text: rgb(240 237 255) #F0EDFF; mist #A6A1CA
- Display font: Sora Variable; Body: Inter Variable
- Strongest visual: hero "Sua loja inteira / na palma da mão." com o gradiente de acento; cartões de módulo com ícone lucide em caixa de acento.

## Share copy (draft)
Ainda controlando a loja no caderno? O CodEx Flow junta PDV, Pix na nota, estoque, clientes e caixa num app que roda até sem internet.

## Audio direction
- Role: warm bed under a full-length voiceover
- Music: happy-beats-business-moves-vol-1 (120 BPM), ducked to ~0.13 under the voice, fade in/out
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`; beat grid ≈ 0.02 + n·0.5s. Strong lock: logo reveal at 12.02s.
- Audio-reactive treatment: subtle; bass energy drives the ambient accent glow only.
- SFX posture: moderate, motion-matched (card place for pain cards, drop for note lines, bell for logo/outro, click for notification).
- Restraint rule: SFX never cover a spoken word's onset at high volume; keep 0.5-0.7.

## Voiceover script (Kokoro pm_alex, pt-br) — one clip per scene
1. Quanto dinheiro sumiu da sua loja este mês? Venda anotada no caderno, fiado que ninguém lembra, e estoque que acaba sem aviso.
2. Cada dia assim é venda perdida. Chegou a hora de mudar. Este é o Códex Flôu: sua loja inteira, na palma da mão.
3. No ponto de venda, você abre a nota, lança os produtos e recebe, inclusive em partes. O saldo pendente fica visível até o último centavo.
4. O Pix sai com QR na própria nota, gerado com a sua chave. E funciona até sem internet.
5. O estoque avisa o que está acabando, antes de faltar. E cada cliente tem o histórico de compras e o que ainda deve.
6. Cada vendedor entra com login próprio. Você vê tudo: quem vendeu o quê, e o caixa do dia, sem planilha.
7. Instale no celular como aplicativo. Fechou venda? A notificação chega na hora.
8. Para começar, escolha o plano, cadastre a empresa e pague via Pix. Sem instalação, sem técnico, sem fidelidade.
9. Códex Flôu. Sua loja inteira, na palma da mão. Comece hoje.

("Códex Flôu" é grafia fonética para a voz; na tela aparece "CodEx Flow".)

## Storyboard (scene length = narration + ~0.6s; VO starts 0.3s into each scene)
1. Dor — 0.0–7.9 — headline + 3 pain cards one by one (card sounds)
2. Urgência → Revelação — 7.9–15.0 — "Cada dia assim é venda perdida." then logo + hero line (bell at 12.02)
3. PDV — 15.0–24.2 — nota com 3 itens entrando, "Recebido" parcial, "Saldo pendente" aceso
4. Pix — 24.2–30.3 — QR na nota, selo "Funciona sem internet"
5. Estoque + Clientes — 30.3–37.5 — alerta de estoque baixo; ficha de cliente com "ainda deve"
6. Vendedores + Caixa — 37.5–44.2 — 3 vendedores, caixa do dia contando
7. Celular — 44.2–49.5 — celular com notificação "Venda fechada"
8. Três passos — 49.5–57.0 — PASSOS 1-2-3 + "Sem instalação · Sem técnico · Sem fidelidade"
9. Outro — 57.0–62.8 — logo, hero line, CTA "Ver planos e preços"

Dados de tela (nomes, valores, produtos) são fictícios — nenhum dado real de cliente.
