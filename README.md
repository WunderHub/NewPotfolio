# Portfólio Kauê Ribeiro

Site estático: `index.html` + `reel.mp4`. Sem etapa de build.

- 3D: Three.js (partículas em shader), GSAP + ScrollTrigger, Lenis para rolagem suave.
- Vídeo de abertura: HyperFrames (projeto em `hyperframes-intro/`).

## Publicar na Vercel
Importe este repositório em vercel.com/new. Framework: "Other". Sem comando de build. Diretório de saída: raiz.

## Página /gelo (experimental)
`gelo.html` + pasta `gelo/`: versão inspirada no design do igloo.inc, com código, modelos e texturas próprios (tudo gerado no navegador).

- `iglu.js`: iglu de blocos de neve numa montanha nevada, com névoa em camadas, neve caindo, brilho na neve e luz vazando pelas frestas. Na entrada a planta técnica aparece em linhas e os blocos caem no lugar; depois se afastam sob o cursor e explodem com a rolagem.
- `ring.js`: anel de gelo fosco em 10 blocos, com bolhas de ar, fraturas e aro de luz tremulando, membrana de veios de luz e um objeto congelado por projeto.
- `stage.js`: palco circular com partículas simuladas na GPU que formam KR, floco de neve, iglu e @ (setas ou teclado trocam a forma).
- `textures.js`: neve, blocos, rachaduras e veios gerados por ruído.
- `shaders.js` + `main.js`: bloom, voo de câmera e transições (estilhaços entre projetos; rastro colorido com névoa branca entre cenas).
- `sound.js`: sons sintetizados na hora (vento, sopro, estalo, sino), ligados depois do clique em Entrar; o botão Som/Mudo desliga.

Three.js 0.169 por import map, GSAP e Lenis. Abra `/gelo`; `/gelo?debug=8` acelera a simulação das partículas para testes e expõe `window.__gelo` para inspecionar as cenas.
