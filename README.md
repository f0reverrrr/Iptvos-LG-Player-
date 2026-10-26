# IPTVOS (com.iptvos.app)

Cliente IPTV e VOD ultraleve desenvolvido sob medida para Smart TVs LG (webOS).

## 🚀 Características

- **Arquitetura Web Nativa**: Construído em HTML5, CSS e Vanilla JavaScript puro (sem frameworks pesados).
- **Player HLS**: Streaming adaptativo via `HLS.js` com aceleração gráfica nativa da TV.
- **Protocolo Xtream Codes**: Autenticação e sincronização completa de canais ao vivo, filmes, séries e episódios.
- **Navegação Hierárquica por Controle Remoto**:
  - D-Pad (Setas), Enter/OK e botões de atalho de cores (Vermelho, Amarelo, Azul).
  - Tecla **Voltar (Return / 461)** com recuo por zonas (Player -> Grade -> Categorias -> Home -> Confirmação de Saída).
- **Recursos**:
  - Busca instantânea de canais e conteúdos.
  - Carrossel "Continuar Assistindo" com salvamento de progresso no `localStorage`.
  - Sistema de Favoritos rápido.
  - Seleção de temporadas e episódios para séries.
  - Modal de segurança para evitar fechamento acidental na TV.

## 📁 Estrutura de Arquivos

```
├── appinfo.json      # Metadados e manifesto webOS
├── index.html        # Estrutura das telas e containers
├── script.js         # Lógica do app, Xtream API, player e navegação
├── style.css         # Estilização visual e estados de foco (Dark Theme)
├── icon.png          # Ícone do aplicativo
└── README.md
```

## 🛠️ Como Gerar o Pacote (.ipk) e Instalar na LG TV

Requisitos: [webOS TV CLI (`ares-*`)](https://webostv.developer.lge.com/develop/tools/cli-installation).

1. **Empacotar**:
   ```bash
   ares-package .
   ```

2. **Instalar na TV**:
   ```bash
   ares-install com.iptvos.app_1.0.0_all.ipk -d <NOME_DO_DISPOSITIVO>
   ```

3. **Executar**:
   ```bash
   ares-launch com.iptvos.app -d <NOME_DO_DISPOSITIVO>
   ```
