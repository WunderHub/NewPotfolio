# Portfólio Kauê Ribeiro

Site estático: `index.html` + `reel.mp4`. Sem etapa de build.

- 3D: Three.js (partículas em shader), GSAP + ScrollTrigger, Lenis para rolagem suave.
- Vídeo de abertura: HyperFrames (projeto em `hyperframes-intro/`).

## Publicar na Vercel
Importe este repositório em vercel.com/new. Framework: "Other". Sem comando de build. Diretório de saída: raiz.

## Página /gelo (experimental)
`gelo.html` + pasta `gelo/`: versão inspirada na sensação do igloo.inc, com código próprio.
Blocos de gelo com objetos congelados (vidro físico com dispersão, rachaduras procedurais e gelo que derrete sob o cursor),
partículas simuladas na GPU (GPGPU com curl noise) e uma transição congelada entre cenas (estilhaços + aberração cromática).
Three.js 0.169 por import map, GSAP e Lenis. Abra `/gelo`; `/gelo?debug=8` acelera a simulação para testes.
